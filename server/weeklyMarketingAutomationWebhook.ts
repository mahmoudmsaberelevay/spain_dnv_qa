import { createHash, createVerify } from "node:crypto";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { marketingProviderWebhookEvents } from "../drizzle/schema";
import { applyWeeklyAutomationManusWebhook } from "./weeklyMarketingAutomationService";

let cachedPublicKey: { value: string; expiresAt: number } | null = null;
const MARKETING_MANUS_CALLBACK_URL = process.env.MANUS_MARKETING_WEBHOOK_URL || "https://elevay.vip/api/webhooks/marketing/manus";

async function manusPublicKey() {
  if (cachedPublicKey && cachedPublicKey.expiresAt > Date.now()) return cachedPublicKey.value;
  if (!ENV.manusApiKey) throw new Error("Manus API credential unavailable.");
  const response = await fetch("https://api.manus.ai/v2/webhook.publicKey", { headers: { "x-manus-api-key": ENV.manusApiKey } });
  if (!response.ok) throw new Error("Unable to obtain Manus callback verification key.");
  const payload = await response.json() as { public_key?: string };
  if (!payload.public_key) throw new Error("Manus callback verification key was absent.");
  cachedPublicKey = { value: payload.public_key, expiresAt: Date.now() + 60 * 60 * 1000 };
  return cachedPublicKey.value;
}

async function validSignature(req: Request, rawBody: Buffer) {
  const signature = req.header("x-webhook-signature");
  const timestamp = req.header("x-webhook-timestamp");
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${timestamp}.${MARKETING_MANUS_CALLBACK_URL}.${createHash("sha256").update(rawBody).digest("hex")}`);
  verifier.end();
  return verifier.verify(await manusPublicKey(), signature, "base64");
}

export async function handleWeeklyMarketingAutomationManusWebhook(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  try {
    if (!(await validSignature(req, rawBody))) return res.status(401).json({ error: "unauthorized" });
    const payload = JSON.parse(rawBody.toString("utf8")) as { event_id?: string; event_type?: string };
    if (!payload.event_id || !payload.event_type) return res.status(400).json({ error: "invalid_event" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database_unavailable" });
    const [existing] = await db.select({ id: marketingProviderWebhookEvents.id }).from(marketingProviderWebhookEvents)
      .where(and(eq(marketingProviderWebhookEvents.providerAlias, "manus-orchestrator"), eq(marketingProviderWebhookEvents.providerEventId, payload.event_id))).limit(1);
    if (existing) return res.status(200).json({ ok: true, duplicate: true });
    const now = Date.now();
    await db.insert(marketingProviderWebhookEvents).values({ providerAlias: "manus-orchestrator", providerEventId: payload.event_id, eventType: payload.event_type, payloadHash: createHash("sha256").update(rawBody).digest("hex"), status: "accepted", errorClass: null, receivedAt: now, processedAt: null });
    res.status(200).json({ ok: true });
    try {
      await applyWeeklyAutomationManusWebhook(payload);
      await db.update(marketingProviderWebhookEvents).set({ status: "processed", processedAt: Date.now() }).where(and(eq(marketingProviderWebhookEvents.providerAlias, "manus-orchestrator"), eq(marketingProviderWebhookEvents.providerEventId, payload.event_id)));
    } catch (error) {
      await db.update(marketingProviderWebhookEvents).set({ status: "failed", errorClass: error instanceof Error ? error.name.slice(0, 120) : "processing_error", processedAt: Date.now() }).where(and(eq(marketingProviderWebhookEvents.providerAlias, "manus-orchestrator"), eq(marketingProviderWebhookEvents.providerEventId, payload.event_id)));
    }
  } catch {
    if (!res.headersSent) return res.status(400).json({ error: "invalid_callback" });
  }
}
