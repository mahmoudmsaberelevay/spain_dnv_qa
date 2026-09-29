import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { marketingWeeklyAutomationControls, marketingWeeklyResultsSettings } from "../drizzle/schema";
import { WEEKLY_AUTOMATION_CONTROL_KEY } from "../shared/marketingWeeklyAutomation";
import { isConfiguredCairoAutomationHour, markAutomationScheduleTask, startWeeklyAutomationCycle } from "./weeklyMarketingAutomationService";

export async function scheduledWeeklyMarketingAutomationHandler(req: Request, res: Response) {
  let identity: { isCron?: boolean; taskUid?: string };
  try { identity = await sdk.authenticateRequest(req) as { isCron?: boolean; taskUid?: string }; }
  catch { return res.status(401).json({ error: "authentication_required" }); }
  if (!identity.isCron || !identity.taskUid) return res.status(403).json({ error: "cron_only" });
  const db = await getDb();
  if (!db) return res.status(503).json({ error: "database_unavailable" });
  const [control, settings] = await Promise.all([
    db.select().from(marketingWeeklyAutomationControls).where(eq(marketingWeeklyAutomationControls.controlKey, WEEKLY_AUTOMATION_CONTROL_KEY)).limit(1).then(rows => rows[0] ?? null),
    db.select().from(marketingWeeklyResultsSettings).where(eq(marketingWeeklyResultsSettings.settingsKey, "primary-weekly-results")).limit(1).then(rows => rows[0] ?? null),
  ]);
  if (!control?.isEnabled || control.state !== "active") return res.json({ ok: true, skipped: "automation_disabled" });
  if (control.scheduleTaskUid && control.scheduleTaskUid !== identity.taskUid) return res.json({ ok: true, skipped: "orphan_schedule" });
  if (!control.scheduleTaskUid) await markAutomationScheduleTask(identity.taskUid);
  if (!settings?.preparationScheduleEnabled) return res.json({ ok: true, skipped: "schedule_disabled_in_settings" });
  if (!isConfiguredCairoAutomationHour(settings)) return res.json({ ok: true, skipped: "outside_configured_cairo_time" });
  try {
    const result = await startWeeklyAutomationCycle({ triggerType: "scheduled" });
    return res.status(202).json({ ok: true, taskUid: identity.taskUid, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "weekly_automation_failed";
    console.error("[WeeklyMarketingAutomation] scheduled trigger failed:", message);
    return res.status(500).json({ error: "weekly_automation_failed", detail: message });
  }
}
