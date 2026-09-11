import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { newsDigestSettings } from "../drizzle/schema";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { runNewsDigestImport } from "./newsDigestService";

export function isCairoNewsDigestTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  // Heartbeat delivery is at-least-once and may start a few minutes after the
  // nominal 09:30 trigger. The alternate DST cron slot is in the 08:00 or
  // 10:00 Cairo hour, so accepting the 09:00 hour is both resilient and safe.
  // Importing is idempotent per Gmail message and canonical article URL.
  return hour === 9;
}

export async function scheduledNewsDigestHandler(req: Request, res: Response) {
  let identity: { isCron?: boolean; taskUid?: string };
  try {
    identity = await sdk.authenticateRequest(req) as { isCron?: boolean; taskUid?: string };
  } catch {
    return res.status(401).json({ error: "authentication_required" });
  }
  if (!identity.isCron || !identity.taskUid) return res.status(403).json({ error: "cron_only" });
  const db = await getDb();
  if (!db) return res.status(503).json({ error: "database_unavailable" });
  const [settings] = await db.select().from(newsDigestSettings).where(eq(newsDigestSettings.id, 1)).limit(1);
  if (settings?.scheduleCronTaskUid && settings.scheduleCronTaskUid !== identity.taskUid) {
    return res.json({ ok: true, skipped: "orphan_schedule" });
  }
  if (!settings) {
    return res.status(409).json({ error: "news_not_configured" });
  }
  if (!settings.scheduleCronTaskUid) {
    await db.update(newsDigestSettings).set({ scheduleCronTaskUid: identity.taskUid }).where(eq(newsDigestSettings.id, 1));
  }
  if (!isCairoNewsDigestTime()) {
    return res.json({ ok: true, skipped: "outside_cairo_0930_window" });
  }
  if (!settings.gmailRefreshTokenEncrypted) {
    return res.status(409).json({ error: "gmail_connection_required" });
  }
  try {
    const result = await runNewsDigestImport();
    return res.json({ ok: true, taskUid: identity.taskUid, ...result });
  } catch (error) {
    console.error("[NewsDigest] Scheduled import failed:", error instanceof Error ? error.message : String(error));
    return res.status(500).json({ error: "news_digest_import_failed" });
  }
}
