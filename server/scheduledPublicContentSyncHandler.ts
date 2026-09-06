import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { publicContentSyncSettings } from "../drizzle/schema";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { runPublicContentSync } from "./publicContentService";

export async function scheduledPublicContentSyncHandler(req: Request, res: Response) {
  let identity: { isCron?: boolean; taskUid?: string };
  try {
    identity = await sdk.authenticateRequest(req) as { isCron?: boolean; taskUid?: string };
  } catch {
    return res.status(401).json({ error: "authentication_required" });
  }
  if (!identity.isCron || !identity.taskUid) return res.status(403).json({ error: "cron_only" });
  const db = await getDb();
  if (!db) return res.status(503).json({ error: "database_unavailable" });
  const [settings] = await db.select().from(publicContentSyncSettings).where(eq(publicContentSyncSettings.id, 1)).limit(1);
  if (settings?.scheduleCronTaskUid && settings.scheduleCronTaskUid !== identity.taskUid) return res.json({ ok: true, skipped: "orphan_schedule" });
  if (!settings) {
    await db.insert(publicContentSyncSettings).values({ id: 1, scheduleCronTaskUid: identity.taskUid });
  } else if (!settings.scheduleCronTaskUid) {
    await db.update(publicContentSyncSettings).set({ scheduleCronTaskUid: identity.taskUid }).where(eq(publicContentSyncSettings.id, 1));
  }
  try {
    const result = await runPublicContentSync("scheduled");
    return res.json({ ok: true, taskUid: identity.taskUid, ...result });
  } catch (error) {
    console.error("[PublicContentSync] Scheduled sync failed:", error instanceof Error ? error.message : String(error));
    return res.status(500).json({ error: "public_content_sync_failed" });
  }
}
