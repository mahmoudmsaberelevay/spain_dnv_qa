import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { executeScheduledDatabaseBackup } from "./scheduledDbBackupService";

type CronIdentity = { isCron?: boolean; taskUid?: string };

export function createScheduledDbBackupHandler(dependencies = {
  authenticateRequest: (req: Request) => sdk.authenticateRequest(req),
  executeBackup: executeScheduledDatabaseBackup,
}) {
  return async function scheduledDbBackupHandler(req: Request, res: Response) {
    let cronIdentity: CronIdentity;
    try {
      cronIdentity = await dependencies.authenticateRequest(req) as CronIdentity;
    } catch {
      return res.status(401).json({ error: "authentication-required" });
    }
    if (!cronIdentity.isCron || !cronIdentity.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    try {
      const result = await dependencies.executeBackup(cronIdentity.taskUid);
      return res.json(result);
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "BACKUP_FAILED";
      console.error("[ScheduledBackup] Run failed:", errorCode);
      return res.status(500).json({
        error: "Database backup failed; review the scheduled-job diagnostics",
        errorCode,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

export const scheduledDbBackupHandler = createScheduledDbBackupHandler();
