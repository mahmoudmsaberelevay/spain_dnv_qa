/**
 * Meta Lead Ads webhook transport.
 *
 * Security and reliability contract:
 * - GET validates the configured verify token.
 * - POST validates X-Hub-Signature-256 against the untouched raw body.
 * - Valid leadgen notifications are stored durably before HTTP 200.
 * - Full lead retrieval and CRM writes happen from the durable inbox processor.
 */
import type { Request, Response } from "express";
import {
  getMetaWebhookVerifyToken,
  processMetaWebhookInboxBatch,
  storeMetaWebhookNotifications,
  type MetaWebhookPayload,
  verifyMetaWebhookSignature,
} from "./metaLeadsService";

export async function verifyMetaWebhook(req: Request, res: Response) {
  const configuredToken = await getMetaWebhookVerifyToken();
  const mode = typeof req.query["hub.mode"] === "string" ? req.query["hub.mode"] : "";
  const token = typeof req.query["hub.verify_token"] === "string" ? req.query["hub.verify_token"] : "";
  const challenge = typeof req.query["hub.challenge"] === "string" ? req.query["hub.challenge"] : "";

  if (!configuredToken) {
    console.error("[MetaWebhook] Verification token is not configured");
    return res.status(503).send("Meta webhook is not configured");
  }
  if (mode === "subscribe" && token === configuredToken && challenge) {
    return res.status(200).type("text/plain").send(challenge);
  }
  return res.status(403).send("Forbidden");
}

export async function processMetaLeadEvent(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
  const signature = typeof req.headers["x-hub-signature-256"] === "string"
    ? req.headers["x-hub-signature-256"]
    : undefined;

  if (!rawBody || !verifyMetaWebhookSignature(rawBody, signature)) {
    console.warn("[MetaWebhook] Rejected POST with missing or invalid signature");
    return res.status(401).send("Invalid signature");
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as MetaWebhookPayload;
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  try {
    const stored = await storeMetaWebhookNotifications(payload);
    res.status(200).json({ received: true, accepted: stored.accepted, ignored: stored.ignored });

    // Best-effort low-latency processing. The inbox row is durable, so the
    // scheduled reconciliation handler can safely complete it after restarts.
    setImmediate(() => {
      void processMetaWebhookInboxBatch(10).catch(error => {
        console.error("[MetaWebhook] Deferred inbox processing failed:", error instanceof Error ? error.message : error);
      });
    });
  } catch (error) {
    console.error("[MetaWebhook] Durable inbox write failed:", error instanceof Error ? error.message : error);
    return res.status(500).send("Webhook persistence failed");
  }
}
