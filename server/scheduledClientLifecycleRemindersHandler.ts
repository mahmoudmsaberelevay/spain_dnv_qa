import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { clientReminderSettings } from "../drizzle/schema";
import { sdk } from "./_core/sdk";
import { runClientLifecycleReminders } from "./clientLifecycleNotificationService";
import { getDb } from "./db";

export async function scheduledClientLifecycleRemindersHandler(req: Request, res: Response) {
  let identity: { isCron?: boolean; taskUid?: string };
  try {
    identity = await sdk.authenticateRequest(req) as { isCron?: boolean; taskUid?: string };
  } catch {
    return res.status(401).json({ error: "authentication_required" });
  }
  if (!identity.isCron || !identity.taskUid) return res.status(403).json({ error: "cron_only" });
  const db = await getDb();
  if (!db) return res.status(503).json({ error: "database_unavailable" });
  const [settings] = await db.select().from(clientReminderSettings).where(eq(clientReminderSettings.id, 1)).limit(1);
  if (settings?.scheduleCronTaskUid && settings.scheduleCronTaskUid !== identity.taskUid) return res.json({ ok: true, skipped: "orphan_schedule" });
  if (!settings) {
    await db.insert(clientReminderSettings).values({ id: 1, scheduleCronTaskUid: identity.taskUid });
  } else if (!settings.scheduleCronTaskUid) {
    await db.update(clientReminderSettings).set({ scheduleCronTaskUid: identity.taskUid }).where(eq(clientReminderSettings.id, 1));
  }
  try {
    const result = await runClientLifecycleReminders(new Date());
    return res.json({ ok: true, taskUid: identity.taskUid, ...result });
  } catch (error) {
    console.error("[ClientLifecycleReminders] Scheduled run failed:", error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      error: error instanceof Error ? error.message : "client_lifecycle_reminders_failed",
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl, taskUid: identity.taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
