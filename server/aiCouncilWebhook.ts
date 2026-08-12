import { createHash, createVerify } from "crypto";
import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import { applyManusCouncilWebhook } from "./aiCouncilService";

let cachedPublicKey: { value: string; expiresAt: number } | null = null;

async function getManusWebhookPublicKey() {
  if (cachedPublicKey && cachedPublicKey.expiresAt > Date.now()) return cachedPublicKey.value;
  const response = await fetch("https://api.manus.ai/v2/webhook.publicKey", { headers: { "x-manus-api-key": ENV.manusApiKey } });
  if (!response.ok) throw new Error("Unable to retrieve the Manus webhook verification key.");
  const body = await response.json() as { public_key?: string };
  if (!body.public_key) throw new Error("Manus did not provide a webhook verification key.");
  cachedPublicKey = { value: body.public_key, expiresAt: Date.now() + 60 * 60 * 1000 };
  return cachedPublicKey.value;
}

async function isVerifiedManusWebhook(req: Request, rawBody: Buffer) {
  const signature = req.header("x-webhook-signature");
  const timestamp = req.header("x-webhook-timestamp");
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const expectedUrl = process.env.MANUS_COUNCIL_WEBHOOK_URL || `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${timestamp}.${expectedUrl}.${bodyHash}`);
  verifier.end();
  return verifier.verify(await getManusWebhookPublicKey(), signature, "base64");
}

export async function handleManusCouncilWebhook(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  try {
    if (!(await isVerifiedManusWebhook(req, rawBody))) return res.status(401).json({ error: "Unauthorized" });
    const payload = JSON.parse(rawBody.toString("utf8"));
    res.status(200).json({ ok: true });
    await applyManusCouncilWebhook(payload);
  } catch (error) {
    console.error("[AI Council] Manus webhook processing failed:", error instanceof Error ? error.message : "Unknown error");
    if (!res.headersSent) return res.status(400).json({ error: "Invalid webhook payload" });
  }
}
