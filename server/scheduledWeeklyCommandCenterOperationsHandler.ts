import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { runWeeklyCommandCenterOperations } from "./commandCenter/routes";

type CronIdentity = { isCron?: boolean; taskUid?: string };

/**
 * Runs the Command Center's Cairo-time Wednesday–Sunday operating model.
 * It is cron-only and delegates to a controller that has no Meta publishing,
 * ad-spend, CRM, or Lead-data mutation authority.
 */
export function createScheduledWeeklyCommandCenterOperationsHandler(dependencies = {
  authenticateRequest: (req: Request) => sdk.authenticateRequest(req),
  runOperations: runWeeklyCommandCenterOperations,
}) {
  return async function scheduledWeeklyCommandCenterOperationsHandler(req: Request, res: Response) {
    let identity: CronIdentity;
    try {
      identity = await dependencies.authenticateRequest(req) as CronIdentity;
    } catch {
      return res.status(401).json({ error: "authentication_required" });
    }
    if (!identity.isCron || !identity.taskUid) return res.status(403).json({ error: "cron_only" });
    try {
      const result = await dependencies.runOperations();
      return res.json({ ok: true, taskUid: identity.taskUid, ...result });
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 300) : "weekly_operations_failed";
      console.error("[WeeklyOperations] scheduled run failed:", detail);
      return res.status(500).json({ error: "weekly_operations_failed", detail });
    }
  };
}

export const scheduledWeeklyCommandCenterOperationsHandler = createScheduledWeeklyCommandCenterOperationsHandler();
