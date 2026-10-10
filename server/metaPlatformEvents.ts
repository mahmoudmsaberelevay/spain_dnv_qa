import crypto from "crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  metaDataDeletionRequests,
  metaPlatformWebhookEvents,
} from "../drizzle/schema";
import { getDb } from "./db";

export type MetaPlatformWebhookPayload = {
  object?: string;
  entry?: Array<Record<string, unknown>>;
};

type SafeEvent = {
  eventKey: string;
  payloadHash: string;
  objectType: string;
  resourceId: string | null;
  field: string;
  eventType: string;
  eventTimestamp: number | null;
  actorHash: string | null;
  signatureValidated: boolean;
  receivedAt: number;
};

const MAX_EVENTS_PER_DELIVERY = 200;

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeString(value: unknown, limit = 120): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, limit) : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function unixMs(value: unknown): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
  return numberValue < 10_000_000_000 ? Math.floor(numberValue * 1000) : Math.floor(numberValue);
}

function actorHash(...candidates: unknown[]): string | null {
  const value = candidates.map(candidate => safeString(candidate, 255)).find(Boolean);
  return value ? sha256(`meta-actor:${value}`) : null;
}

function eventKey(parts: Array<string | number | null | undefined>): string {
  return sha256(parts.map(part => part ?? "").join("|"));
}

function buildChangeEvents(objectType: string, entry: Record<string, unknown>, receivedAt: number, signatureValidated: boolean): SafeEvent[] {
  const entryId = safeString(entry.id, 100);
  const entryTime = unixMs(entry.time);
  const changes = Array.isArray(entry.changes) ? entry.changes.slice(0, MAX_EVENTS_PER_DELIVERY) : [];
  return changes.map((rawChange, index) => {
    const change = asObject(rawChange);
    const value = asObject(change.value);
    const field = safeString(change.field, 100) || "unknown";
    const stableId = safeString(value.comment_id, 150)
      || safeString(value.post_id, 150)
      || safeString(value.media_id, 150)
      || safeString(value.leadgen_id, 150)
      || safeString(value.id, 150)
      || `${entryId || "entry"}:${entryTime || receivedAt}:${index}`;
    const eventType = safeString(value.verb, 80)
      || safeString(value.item, 80)
      || field;
    const rawSummary = JSON.stringify({
      objectType,
      entryId,
      field,
      stableId,
      eventType,
      eventTimestamp: unixMs(value.created_time) || entryTime,
    });
    return {
      eventKey: eventKey([objectType, entryId, field, stableId, eventType]),
      payloadHash: sha256(rawSummary),
      objectType,
      resourceId: entryId,
      field,
      eventType,
      eventTimestamp: unixMs(value.created_time) || entryTime,
      actorHash: actorHash(asObject(value.from).id, asObject(value.sender).id),
      signatureValidated,
      receivedAt,
    };
  });
}

function buildMessagingEvents(objectType: string, entry: Record<string, unknown>, receivedAt: number, signatureValidated: boolean): SafeEvent[] {
  const entryId = safeString(entry.id, 100);
  const entries = Array.isArray(entry.messaging) ? entry.messaging.slice(0, MAX_EVENTS_PER_DELIVERY) : [];
  return entries.map((rawMessage, index) => {
    const message = asObject(rawMessage);
    const messageBody = asObject(message.message);
    const delivery = asObject(message.delivery);
    const read = asObject(message.read);
    const sender = asObject(message.sender);
    const messageId = safeString(messageBody.mid, 150)
      || safeString(delivery.mids, 150)
      || safeString(read.mid, 150)
      || `${entryId || "entry"}:${unixMs(message.timestamp) || receivedAt}:${index}`;
    const eventType = messageBody.mid ? "message" : delivery.mids ? "delivery" : read.watermark ? "read" : "messaging";
    const rawSummary = JSON.stringify({ objectType, entryId, eventType, messageId, eventTimestamp: unixMs(message.timestamp) });
    return {
      eventKey: eventKey([objectType, entryId, "messaging", messageId, eventType]),
      payloadHash: sha256(rawSummary),
      objectType,
      resourceId: entryId,
      field: "messaging",
      eventType,
      eventTimestamp: unixMs(message.timestamp),
      actorHash: actorHash(sender.id),
      signatureValidated,
      receivedAt,
    };
  });
}

export function buildSafeEvents(payload: MetaPlatformWebhookPayload, signatureValidated: boolean): SafeEvent[] {
  const objectType = safeString(payload.object, 40) || "unknown";
  const receivedAt = Date.now();
  const entries = Array.isArray(payload.entry) ? payload.entry.slice(0, MAX_EVENTS_PER_DELIVERY) : [];
  return entries.flatMap((rawEntry) => {
    const entry = asObject(rawEntry);
    return [
      ...buildChangeEvents(objectType, entry, receivedAt, signatureValidated),
      ...buildMessagingEvents(objectType, entry, receivedAt, signatureValidated),
    ];
  }).slice(0, MAX_EVENTS_PER_DELIVERY);
}

/**
 * Stores only hashable, operational metadata. Comment text, message text, profile
 * names and other callback PII are intentionally never persisted in this table.
 */
export async function storeMetaPlatformWebhookEvents(payload: MetaPlatformWebhookPayload, signatureValidated = false) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const events = buildSafeEvents(payload, signatureValidated);
  const receivedAt = Date.now();
  let accepted = 0;
  for (const event of events) {
    await db.insert(metaPlatformWebhookEvents).values({
      ...event,
      status: "received",
      receivedAt,
      updatedAt: receivedAt,
    }).onDuplicateKeyUpdate({
      set: { updatedAt: receivedAt, signatureValidated: signatureValidated || sql`${metaPlatformWebhookEvents.signatureValidated}` },
    });
    accepted += 1;
  }
  return { accepted, ignored: Math.max(0, (payload.entry?.length || 0) - events.length), events: events.map(event => ({ field: event.field, eventType: event.eventType })) };
}

export async function markMetaPlatformWebhookEventsProcessed(payload: MetaPlatformWebhookPayload) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const eventKeys = buildSafeEvents(payload, true).map(event => event.eventKey);
  if (!eventKeys.length) return 0;
  const now = Date.now();
  for (const key of eventKeys) {
    await db.update(metaPlatformWebhookEvents).set({ status: "processed", processedAt: now, updatedAt: now })
      .where(eq(metaPlatformWebhookEvents.eventKey, key));
  }
  return eventKeys.length;
}

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized + "=".repeat((4 - normalized.length % 4) % 4), "base64");
}

export function verifyMetaSignedRequest(signedRequest: string): { userIdHash: string; issuedAt: number | null } | null {
  const [signaturePart, payloadPart] = String(signedRequest || "").split(".");
  const appSecret = process.env.META_APP_SECRET || "";
  if (!signaturePart || !payloadPart || !appSecret) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart).toString("utf8"));
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", appSecret).update(payloadPart).digest();
  const received = base64UrlDecode(signaturePart);
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
  const userId = safeString(payload.user_id, 255);
  if (!userId) return null;
  return {
    userIdHash: sha256(`meta-user:${userId}`),
    issuedAt: unixMs(payload.issued_at),
  };
}

export async function registerMetaDataDeletionRequest(signedRequest: string) {
  const verified = verifyMetaSignedRequest(signedRequest);
  if (!verified) throw new Error("Invalid signed request");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const receivedAt = Date.now();
  const confirmationCode = `elevay-${crypto.randomBytes(18).toString("hex")}`;
  await db.insert(metaDataDeletionRequests).values({
    confirmationCode,
    metaUserHash: verified.userIdHash,
    issuedAt: verified.issuedAt,
    status: "received",
    receivedAt,
    updatedAt: receivedAt,
  }).onDuplicateKeyUpdate({ set: { updatedAt: receivedAt } });
  return { confirmationCode, statusUrl: `https://elevay.vip/data-deletion?confirmation_code=${encodeURIComponent(confirmationCode)}` };
}

export async function getMetaDataDeletionRequestStatus(confirmationCode: string) {
  const db = await getDb();
  if (!db) return null;
  const [request] = await db.select({
    confirmationCode: metaDataDeletionRequests.confirmationCode,
    status: metaDataDeletionRequests.status,
    receivedAt: metaDataDeletionRequests.receivedAt,
    completedAt: metaDataDeletionRequests.completedAt,
  }).from(metaDataDeletionRequests).where(eq(metaDataDeletionRequests.confirmationCode, confirmationCode)).limit(1);
  return request || null;
}

export async function getMetaPlatformWebhookHealth() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const since = Date.now() - 7 * 24 * 60 * 60_000;
  const [counts, latest, deletionPending] = await Promise.all([
    db.select({
      objectType: metaPlatformWebhookEvents.objectType,
      field: metaPlatformWebhookEvents.field,
      status: metaPlatformWebhookEvents.status,
      total: sql<number>`COUNT(*)`,
    }).from(metaPlatformWebhookEvents).where(gte(metaPlatformWebhookEvents.receivedAt, since))
      .groupBy(metaPlatformWebhookEvents.objectType, metaPlatformWebhookEvents.field, metaPlatformWebhookEvents.status),
    db.select({ receivedAt: metaPlatformWebhookEvents.receivedAt, field: metaPlatformWebhookEvents.field, eventType: metaPlatformWebhookEvents.eventType })
      .from(metaPlatformWebhookEvents).orderBy(desc(metaPlatformWebhookEvents.receivedAt)).limit(1),
    db.select({ total: sql<number>`COUNT(*)` }).from(metaDataDeletionRequests)
      .where(and(eq(metaDataDeletionRequests.status, "received"))),
  ]);
  return {
    windowDays: 7,
    counts: counts.map(row => ({ ...row, total: Number(row.total || 0) })),
    latest: latest[0] || null,
    pendingDeletionRequests: Number(deletionPending[0]?.total || 0),
  };
}
