import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { executeScheduledWeeklyMetaLeadAudit } from "./weeklyMetaLeadAuditService";

type CronIdentity = { isCron?: boolean; taskUid?: string };

export function createScheduledWeeklyMetaLeadAuditHandler(dependencies = {
  authenticateRequest: (req: Request) => sdk.authenticateRequest(req),
  executeAudit: executeScheduledWeeklyMetaLeadAudit,
}) {
  return async function scheduledWeeklyMetaLeadAuditHandler(req: Request, res: Response) {
    let cronIdentity: CronIdentity;
    try {
      cronIdentity = await dependencies.authenticateRequest(req) as CronIdentity;
    } catch {
      return res.status(401).json({ error: "authentication-required" });
    }
    if (!cronIdentity.isCron || !cronIdentity.taskUid) return res.status(403).json({ error: "cron-only" });
    try {
      return res.json(await dependencies.executeAudit(cronIdentity.taskUid));
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "META_WEEKLY_AUDIT_FAILED";
      console.error("[WeeklyMetaLeadAudit] Scheduled run failed:", errorCode);
      return res.status(500).json({
        error: "Weekly Meta lead audit failed; review scheduled-job diagnostics",
        errorCode,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

export const scheduledWeeklyMetaLeadAuditHandler = createScheduledWeeklyMetaLeadAuditHandler();
