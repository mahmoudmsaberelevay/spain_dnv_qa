import { createHash, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { waBridgeEvents, waMediaFiles, waMessages, whatsappGroups } from "../drizzle/schema";
import { getDb, insertWaMediaFile, insertWaMessage, recordWaBridgeEvent, updateGroupStats, updateWaMediaFile, updateWaMessageMedia, upsertGroup } from "./db";
import { storagePut } from "./storage";

export const DEFAULT_WA_BRIDGE_URL = "http://35.231.217.0:3001";
const LEGACY_WA_BRIDGE_SECRET = "elevay-bridge-2024";
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const ALLOWED_MESSAGE_TYPES = ["text", "image", "video", "audio", "document", "sticker", "location", "reaction", "contacts", "system", "unknown"] as const;

export const waBridgePayloadSchema = z.object({
  messageId: z.string().trim().min(1).max(256),
  groupId: z.string().trim().min(1).max(128),
  groupName: z.string().trim().max(256).nullable().optional(),
  senderPhone: z.string().trim().max(64).optional(),
  senderName: z.string().trim().max(256).nullable().optional(),
  fromMe: z.boolean().optional().default(false),
  isGroup: z.boolean().optional(),
  textContent: z.string().max(200000).nullable().optional(),
  messageType: z.string().trim().max(32).optional().default("unknown"),
  timestamp: z.union([z.string(), z.number()]).optional(),
  mediaBase64: z.string().optional(),
  mediaMimeType: z.string().trim().max(128).optional(),
  mediaSize: z.number().int().nonnegative().optional(),
  fileName: z.string().trim().max(512).optional(),
});

export type WaBridgePayload = z.infer<typeof waBridgePayloadSchema>;

export function getWaBridgeRuntimeConfig() {
  const baseUrl = (process.env.WA_BRIDGE_URL || DEFAULT_WA_BRIDGE_URL).replace(/\/+$/, "");
  const configuredSecret = process.env.WA_BRIDGE_SECRET?.trim();
  return {
    baseUrl,
    secret: configuredSecret || LEGACY_WA_BRIDGE_SECRET,
    usesLegacySecret: !configuredSecret,
  };
}

export function verifyWaBridgeSecret(received: unknown) {
  if (typeof received !== "string") return false;
  const expected = getWaBridgeRuntimeConfig().secret;
  const expectedDigest = createHash("sha256").update(expected).digest();
  const receivedDigest = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedDigest, receivedDigest);
}

export function parseWaBridgeTimestampMs(value: string | number | undefined, now = Date.now()) {
  if (value === undefined || value === null || value === "") return now;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return now;
    return value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value);
  }
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return parseWaBridgeTimestampMs(Number(trimmed), now);
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : now;
}

function safeErrorCode(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.name : fallback;
  return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || fallback;
}

function normalizeMessageType(value: string) {
  return (ALLOWED_MESSAGE_TYPES as readonly string[]).includes(value) ? value as typeof ALLOWED_MESSAGE_TYPES[number] : "unknown";
}

function decodeMedia(payload: WaBridgePayload) {
  if (!payload.mediaBase64 || !payload.mediaMimeType) return null;
  const normalized = payload.mediaBase64.includes(",") ? payload.mediaBase64.slice(payload.mediaBase64.indexOf(",") + 1) : payload.mediaBase64;
  const buffer = Buffer.from(normalized, "base64");
  if (!buffer.length) throw new Error("EMPTY_MEDIA");
  if (buffer.length > MAX_MEDIA_BYTES || (payload.mediaSize && payload.mediaSize > MAX_MEDIA_BYTES)) throw new Error("MEDIA_TOO_LARGE");
  return { buffer, mimeType: payload.mediaMimeType.split(";")[0].toLowerCase() };
}

function extensionForMime(mimeType: string) {
  const subtype = mimeType.split("/")[1]?.replace(/[^a-z0-9.+-]/gi, "") || "bin";
  if (subtype === "opus" || subtype === "ogg;codecs=opus") return "ogg";
  if (subtype.includes("jpeg")) return "jpg";
  if (subtype.includes("msword")) return "doc";
  if (subtype.includes("wordprocessingml")) return "docx";
  return subtype.slice(0, 12) || "bin";
}

export async function ingestWaBridgePayload(raw: unknown) {
  const parsed = waBridgePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    await recordWaBridgeEvent({ eventType: "invalid", outcome: "rejected", errorCode: "INVALID_PAYLOAD" });
    return { accepted: false as const, code: "INVALID_PAYLOAD" };
  }
  const payload = parsed.data;
  const messageType = normalizeMessageType(payload.messageType);
  const timestampMs = parseWaBridgeTimestampMs(payload.timestamp);
  try {
    await upsertGroup({
      groupId: payload.groupId,
      name: payload.groupName || payload.senderName || payload.senderPhone || payload.groupId,
      phoneNumberId: null,
      isActive: true,
      messageCount: 0,
      lastMessageAt: new Date(timestampMs),
      metadata: { isGroup: payload.isGroup ?? payload.groupId.includes("@g.us"), lastSender: payload.fromMe ? "ELEVAY" : (payload.senderName || payload.senderPhone || null) },
    });
    const inserted = await insertWaMessage({
      messageId: payload.messageId,
      groupId: payload.groupId,
      senderId: payload.senderPhone || (payload.fromMe ? "me" : "unknown"),
      senderPhone: payload.senderPhone || null,
      senderName: payload.senderName || null,
      textContent: payload.textContent || null,
      messageType,
      fromMe: payload.fromMe,
      whatsappTimestamp: timestampMs,
      createdAt: new Date(timestampMs),
    });
    if (!inserted) {
      await recordWaBridgeEvent({ eventType: "duplicate", outcome: "duplicate", messageId: payload.messageId, groupId: payload.groupId });
      return { accepted: true as const, inserted: false, duplicate: true as const };
    }
    const media = decodeMedia(payload);
    if (media) {
      const mediaRecordId = await insertWaMediaFile({
        messageId: payload.messageId,
        storageKey: null,
        storageUrl: null,
        mimeType: media.mimeType,
        fileName: payload.fileName || null,
        fileSize: media.buffer.length,
        downloadStatus: "pending",
      });
      try {
        const fileKey = `wa-media/${encodeURIComponent(payload.groupId)}/${encodeURIComponent(payload.messageId)}.${extensionForMime(media.mimeType)}`;
        const stored = await storagePut(fileKey, media.buffer, media.mimeType);
        await updateWaMessageMedia(payload.messageId, stored.url, media.mimeType, null, null);
        if (mediaRecordId) await updateWaMediaFile(mediaRecordId, { storageKey: stored.key, storageUrl: stored.url, downloadStatus: "downloaded", downloadedAt: new Date(), downloadError: null });
        await recordWaBridgeEvent({ eventType: "media_stored", outcome: "accepted", messageId: payload.messageId, groupId: payload.groupId });
      } catch (error) {
        if (mediaRecordId) await updateWaMediaFile(mediaRecordId, { downloadStatus: "failed", downloadError: safeErrorCode(error, "MEDIA_STORE_FAILED") });
        await recordWaBridgeEvent({ eventType: "media_failed", outcome: "failed", messageId: payload.messageId, groupId: payload.groupId, errorCode: safeErrorCode(error, "MEDIA_STORE_FAILED") });
        throw error;
      }
    }
    await updateGroupStats(payload.groupId);
    await recordWaBridgeEvent({ eventType: "message", outcome: "accepted", messageId: payload.messageId, groupId: payload.groupId });
    return { accepted: true as const, inserted: true as const, messageId: payload.messageId, groupId: payload.groupId, hasMedia: Boolean(media) };
  } catch (error) {
    await recordWaBridgeEvent({ eventType: "error", outcome: "failed", messageId: payload.messageId, groupId: payload.groupId, errorCode: safeErrorCode(error, "INGEST_FAILED") }).catch(() => undefined);
    throw error;
  }
}

export async function enrichWaBridgeMedia(payload: WaBridgePayload) {
  if (!payload.mediaBase64 || !payload.mediaMimeType) return;
  await enrichStoredWaMessage(payload.messageId);
}

async function downloadStoredMedia(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error("MEDIA_FETCH_FAILED");
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > MAX_MEDIA_BYTES) throw new Error("MEDIA_TOO_LARGE");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error("EMPTY_MEDIA");
    if (buffer.length > MAX_MEDIA_BYTES) throw new Error("MEDIA_TOO_LARGE");
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

export async function enrichStoredWaMessage(messageId: string) {
  const db = await getDb();
  if (!db) return { status: "failed" as const, code: "DATABASE_UNAVAILABLE" };
  const [message] = await db.select().from(waMessages).where(eq(waMessages.messageId, messageId)).limit(1);
  if (!message?.mediaUrl) return { status: "skipped" as const, code: "MEDIA_URL_MISSING" };
  if (message.messageType !== "audio" && message.messageType !== "document") return { status: "skipped" as const, code: "UNSUPPORTED_MEDIA_TYPE" };
  let transcript: string | null = null;
  let transcriptLang: string | null = null;
  let transcriptArabic: string | null = null;
  let transcriptEnglish: string | null = null;
  let docText: string | null = null;
  try {
    if (message.messageType === "audio") {
      const { transcribeAudio } = await import("./_core/voiceTranscription");
      const result = await transcribeAudio({ audioUrl: message.mediaUrl, prompt: "WhatsApp voice note. Transcribe accurately in the original language." });
      if (!("error" in result)) {
        transcript = result.text || null;
        transcriptLang = result.language || null;
        if (transcript) {
          const translated = await translateWaTranscript(transcript);
          transcriptArabic = translated.arabic;
          transcriptEnglish = translated.english;
        }
      }
    } else if (message.messageType === "document") {
      const fileName = (message.fileName || "").toLowerCase();
      const mimeType = (message.mediaMimeType || "").toLowerCase();
      const buffer = await downloadStoredMedia(message.mediaUrl);
      if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
        const pdfParseModule: any = await import("pdf-parse");
        const pdfParse = pdfParseModule.default || pdfParseModule;
        docText = (await pdfParse(buffer)).text?.trim() || null;
      } else if (mimeType.includes("wordprocessingml") || mimeType === "application/msword" || fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
        const mammoth = await import("mammoth");
        docText = (await mammoth.extractRawText({ buffer })).value?.trim() || null;
      }
    }
    await updateWaMessageMedia(message.messageId, message.mediaUrl, message.mediaMimeType || "application/octet-stream", transcript, transcriptLang, docText, transcriptArabic, transcriptEnglish);
    await recordWaBridgeEvent({ eventType: "media_stored", outcome: "accepted", messageId: message.messageId, groupId: message.groupId });
    return { status: "processed" as const };
  } catch (error) {
    await recordWaBridgeEvent({ eventType: "media_failed", outcome: "failed", messageId: message.messageId, groupId: message.groupId, errorCode: safeErrorCode(error, "MEDIA_ENRICH_FAILED") }).catch(() => undefined);
    return { status: "failed" as const, code: safeErrorCode(error, "MEDIA_ENRICH_FAILED") };
  }
}

export async function translateWaTranscript(transcript: string) {
  const { invokeLLM } = await import("./_core/llm");
  const response = await invokeLLM({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: "Translate a WhatsApp voice-note transcript faithfully. Preserve names, numbers, dates, and uncertainty. Do not summarize or add information." },
      { role: "user", content: transcript },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "whatsapp_bilingual_transcript",
        strict: true,
        schema: {
          type: "object",
          properties: { arabic: { type: "string" }, english: { type: "string" } },
          required: ["arabic", "english"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string") throw new Error("TRANSCRIPT_TRANSLATION_EMPTY");
  const parsed = JSON.parse(content) as { arabic?: unknown; english?: unknown };
  if (typeof parsed.arabic !== "string" || typeof parsed.english !== "string") throw new Error("TRANSCRIPT_TRANSLATION_INVALID");
  return { arabic: parsed.arabic, english: parsed.english };
}

export async function probeWaBridgeHealth(timeoutMs = 5000) {
  const { baseUrl, usesLegacySecret } = getWaBridgeRuntimeConfig();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    const status = typeof payload.status === "string" ? payload.status.toLowerCase() : response.ok ? "unknown" : "unreachable";
    return { reachable: response.ok, connected: status === "connected" || status === "open", status, qrReady: payload.qrReady === true, usesLegacySecret };
  } catch {
    return { reachable: false, connected: false, status: "unreachable", qrReady: false, usesLegacySecret };
  }
}

export async function getWaBridgeSyncHealth() {
  const db = await getDb();
  const bridge = await probeWaBridgeHealth();
  if (!db) return { bridge, databaseAvailable: false, state: "database_unavailable" as const };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [lastMessage, lastInbound, lastOutbound, eventTotals, mediaTotals, transcriptBacklog, documentBacklog] = await Promise.all([
    db.select({ at: waMessages.createdAt }).from(waMessages).orderBy(desc(waMessages.createdAt)).limit(1),
    db.select({ at: waMessages.createdAt }).from(waMessages).where(eq(waMessages.fromMe, false)).orderBy(desc(waMessages.createdAt)).limit(1),
    db.select({ at: waMessages.createdAt }).from(waMessages).where(eq(waMessages.fromMe, true)).orderBy(desc(waMessages.createdAt)).limit(1),
    db.select({ accepted: sql<number>`SUM(CASE WHEN ${waBridgeEvents.outcome} = 'accepted' THEN 1 ELSE 0 END)`, duplicates: sql<number>`SUM(CASE WHEN ${waBridgeEvents.outcome} = 'duplicate' THEN 1 ELSE 0 END)`, failed: sql<number>`SUM(CASE WHEN ${waBridgeEvents.outcome} IN ('failed','rejected') THEN 1 ELSE 0 END)` }).from(waBridgeEvents).where(gte(waBridgeEvents.occurredAt, since)),
    db.select({ pending: sql<number>`SUM(CASE WHEN ${waMediaFiles.downloadStatus} = 'pending' THEN 1 ELSE 0 END)`, failed: sql<number>`SUM(CASE WHEN ${waMediaFiles.downloadStatus} = 'failed' THEN 1 ELSE 0 END)` }).from(waMediaFiles),
    db.select({ count: sql<number>`COUNT(*)` }).from(waMessages).where(and(eq(waMessages.messageType, "audio"), isNotNull(waMessages.mediaUrl), isNull(waMessages.transcript))),
    db.select({ count: sql<number>`COUNT(*)` }).from(waMessages).where(and(eq(waMessages.messageType, "document"), isNotNull(waMessages.mediaUrl), isNull(waMessages.docText))),
  ]);
  const lastMessageAt = lastMessage[0]?.at ?? null;
  const ageMinutes = lastMessageAt ? Math.max(0, Math.round((Date.now() - new Date(lastMessageAt).getTime()) / 60000)) : null;
  const state = !bridge.reachable ? "unreachable" : !bridge.connected ? "disconnected" : ageMinutes !== null && ageMinutes > 24 * 60 ? "connected_stale" : "connected";
  return {
    bridge,
    databaseAvailable: true,
    state,
    lastMessageAt,
    lastInboundAt: lastInbound[0]?.at ?? null,
    lastOutboundAt: lastOutbound[0]?.at ?? null,
    lastMessageAgeMinutes: ageMinutes,
    last24Hours: { accepted: Number(eventTotals[0]?.accepted ?? 0), duplicates: Number(eventTotals[0]?.duplicates ?? 0), failed: Number(eventTotals[0]?.failed ?? 0) },
    media: { pending: Number(mediaTotals[0]?.pending ?? 0), failed: Number(mediaTotals[0]?.failed ?? 0), audioWithoutTranscript: Number(transcriptBacklog[0]?.count ?? 0), documentsWithoutText: Number(documentBacklog[0]?.count ?? 0) },
  };
}
