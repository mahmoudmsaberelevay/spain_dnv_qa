import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { runAiStudioWatchdog } from "./commandCenter/routes";

type CronIdentity = { isCron?: boolean; taskUid?: string };

/**
 * Platform Heartbeat entry point for AI Studio external-provider recovery.
 * It has no route to Meta publication, campaigns, CRM records, or lead data.
 */
export function createScheduledAiStudioWatchdogHandler(dependencies = {
  authenticateRequest: (req: Request) => sdk.authenticateRequest(req),
  runWatchdog: runAiStudioWatchdog,
}) {
  return async function scheduledAiStudioWatchdogHandler(req: Request, res: Response) {
    let identity: CronIdentity;
    try {
      identity = await dependencies.authenticateRequest(req) as CronIdentity;
    } catch {
      return res.status(401).json({ error: "authentication_required" });
    }
    if (!identity.isCron || !identity.taskUid) return res.status(403).json({ error: "cron_only" });
    try {
      const result = await dependencies.runWatchdog();
      return res.json({ ok: true, taskUid: identity.taskUid, ...result });
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 300) : "ai_studio_watchdog_failed";
      console.error("[AIStudioWatchdog] scheduled run failed:", detail);
      return res.status(500).json({ error: "ai_studio_watchdog_failed", detail });
    }
  };
}

export const scheduledAiStudioWatchdogHandler = createScheduledAiStudioWatchdogHandler();
