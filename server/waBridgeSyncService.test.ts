import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseWaBridgeTimestampMs, verifyWaBridgeSecret, waBridgePayloadSchema } from "./waBridgeSyncService";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const originalSecret = process.env.WA_BRIDGE_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.WA_BRIDGE_SECRET;
  else process.env.WA_BRIDGE_SECRET = originalSecret;
});

describe("WhatsApp Web bridge synchronization", () => {
  it("normalizes Unix seconds, Unix milliseconds, ISO timestamps, and invalid values to milliseconds", () => {
    expect(parseWaBridgeTimestampMs(1_789_000_000)).toBe(1_789_000_000_000);
    expect(parseWaBridgeTimestampMs("1789000000")).toBe(1_789_000_000_000);
    expect(parseWaBridgeTimestampMs(1_789_000_000_123)).toBe(1_789_000_000_123);
    expect(parseWaBridgeTimestampMs("2026-09-10T10:00:00.000Z")).toBe(Date.parse("2026-09-10T10:00:00.000Z"));
    expect(parseWaBridgeTimestampMs("invalid", 123456)).toBe(123456);
  });

  it("validates the configured bridge secret without exposing it", () => {
    process.env.WA_BRIDGE_SECRET = "synthetic-test-secret";
    expect(verifyWaBridgeSecret("synthetic-test-secret")).toBe(true);
    expect(verifyWaBridgeSecret("wrong-secret")).toBe(false);
    expect(verifyWaBridgeSecret(undefined)).toBe(false);
  });

  it("requires stable message and conversation identifiers while accepting text, media, and system events", () => {
    expect(waBridgePayloadSchema.safeParse({ messageId: "m1", groupId: "g1", messageType: "text", textContent: "hello" }).success).toBe(true);
    expect(waBridgePayloadSchema.safeParse({ messageId: "m2", groupId: "g1", messageType: "image", mediaBase64: "AA==", mediaMimeType: "image/png" }).success).toBe(true);
    expect(waBridgePayloadSchema.safeParse({ messageId: "m3", groupId: "g1", messageType: "system" }).success).toBe(true);
    expect(waBridgePayloadSchema.safeParse({ groupId: "g1" }).success).toBe(false);
    expect(waBridgePayloadSchema.safeParse({ messageId: "m1" }).success).toBe(false);
  });

  it("uses durable ingestion before acknowledgement and records duplicates and media outcomes", () => {
    const index = read("server/_core/index.ts");
    const route = index.slice(index.indexOf('app.post("/api/webhook/baileys"'), index.indexOf("// Website / Landing Page Lead Webhook"));
    expect(route).toContain("verifyWaBridgeSecret");
    expect(route).toContain("await ingestWaBridgePayload(req.body)");
    expect(route.indexOf("await ingestWaBridgePayload(req.body)")).toBeLessThan(route.indexOf("res.status(200)"));
    expect(route).not.toContain('secret !== "elevay-bridge-2024"');
    expect(route).not.toContain("JSON.stringify(body)");

    const service = read("server/waBridgeSyncService.ts");
    expect(service).toContain('eventType: "duplicate"');
    expect(service).toContain('downloadStatus: "pending"');
    expect(service).toContain('eventType: "media_stored"');
    expect(service).toContain('eventType: "media_failed"');
    expect(service).toContain("MEDIA_TOO_LARGE");
  });

  it("persists system messages and enriches voice notes with faithful Arabic and English transcripts", () => {
    const service = read("server/waBridgeSyncService.ts");
    const schema = read("drizzle/schema.ts");
    const conversation = read("client/src/pages/waQc/WaQcConversations.tsx");
    const backup = read("server/waBackupHandler.ts");
    expect(service).toContain('"system", "unknown"');
    expect(service).not.toContain('skipped: "system"');
    expect(service).toContain('model: "gpt-5-mini"');
    expect(service).toContain("whatsapp_bilingual_transcript");
    expect(service).toContain("Do not summarize or add information");
    expect(schema).toContain('transcriptArabic: text("transcriptArabic")');
    expect(schema).toContain('transcriptEnglish: text("transcriptEnglish")');
    expect(conversation).toContain("msg.transcriptArabic");
    expect(conversation).toContain("msg.transcriptEnglish");
    expect(backup).toContain("transcriptArabic: waMessages.transcriptArabic");
    expect(backup).toContain("transcriptEnglish: waMessages.transcriptEnglish");
  });

  it("provides an administrator-only retry path for stored audio and document enrichment backlogs", () => {
    const service = read("server/waBridgeSyncService.ts");
    const router = read("server/waQcRouter.ts");
    const dashboard = read("client/src/pages/waQc/WaQcDashboard.tsx");
    expect(service).toContain("export async function enrichStoredWaMessage");
    expect(service).toContain("downloadStoredMedia(message.mediaUrl)");
    expect(service).toContain('eventType: "media_stored"');
    expect(router).toContain("const waQcAdminProcedure");
    expect(router).toContain("retryEnrichmentBacklog: waQcAdminProcedure");
    expect(router).toContain("limit: z.number().int().min(1).max(25).default(10)");
    expect(dashboard).toContain("Retry media processing");
  });

  it("refreshes current conversations, chats, groups, media, and bridge health without a manual reload", () => {
    const conversations = read("client/src/pages/waQc/WaQcConversations.tsx");
    const chats = read("client/src/pages/waQc/WaQcChats.tsx");
    const groups = read("client/src/pages/waQc/WaQcGroups.tsx");
    const media = read("client/src/pages/waQc/WaQcMedia.tsx");
    const dashboard = read("client/src/pages/waQc/WaQcDashboard.tsx");
    expect(conversations).toContain("const AUTO_REFRESH_INTERVAL = 15");
    expect(chats).toContain("refetchInterval: page === 0 ? 15000 : false");
    expect(groups).toContain("refetchInterval: 15000");
    expect(media).toContain("refetchInterval: page === 0 ? 30000 : false");
    expect(dashboard).toContain("refetchInterval: 30000");
  });

  it("exposes live bridge health and never labels the dashboard active without probing the bridge", () => {
    const router = read("server/waQcRouter.ts");
    const dashboard = read("client/src/pages/waQc/WaQcDashboard.tsx");
    expect(router).toContain("bridgeHealth: waQcProcedure.query");
    expect(router).toContain("getWaBridgeSyncHealth()");
    expect(router).toContain("getWaBridgeRuntimeConfig()");
    expect(dashboard).toContain("trpc.waQc.bridgeHealth.useQuery");
    expect(dashboard).toContain("Bridge disconnected");
    expect(dashboard).toContain("Media backlog");
    expect(dashboard).toContain("Open QR login");
    expect(dashboard).not.toContain("Webhook Active");
  });

  it("sorts chats and groups by client or group name and keeps WhatsApp independent of Leads", () => {
    const db = read("server/db.ts");
    const router = read("server/waQcRouter.ts");
    expect(db).toContain("LOWER(COALESCE");
    expect(db).toContain("a.name.localeCompare(b.name");
    expect(router).not.toContain("leadId");
    expect(router).not.toContain("createLead");
  });

  it("keeps migration 0075 additive and normalizes only second-scale historical timestamps", () => {
    const migration = read("drizzle/0075_whatsapp_bridge_monitoring.sql");
    expect(migration).toContain("CREATE TABLE `wa_bridge_events`");
    expect(migration).toContain("CREATE UNIQUE INDEX `wa_media_files_message_unique`");
    expect(migration).toContain("`whatsappTimestamp` * 1000");
    expect(migration).toContain("`whatsappTimestamp` < 1000000000000");
    expect(migration).toContain("'system','unknown'");
    expect(migration).toContain("ADD COLUMN `transcriptArabic`");
    expect(migration).toContain("ADD COLUMN `transcriptEnglish`");
    expect(migration).not.toMatch(/\bDROP\b/i);
    expect(migration).not.toMatch(/\bDELETE\b/i);
  });
});
