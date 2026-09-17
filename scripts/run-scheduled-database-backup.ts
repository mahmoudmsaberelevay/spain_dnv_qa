import "dotenv/config";
import { eq } from "drizzle-orm";
import { databaseBackupSettings } from "../drizzle/schema";
import { getDb } from "../server/db";
import { executeScheduledDatabaseBackup } from "../server/scheduledDbBackupService";

const db = await getDb();
if (!db) {
  console.error("[ScheduledBackup] Database unavailable");
  process.exit(1);
}

const [settings] = await db.select({ taskUid: databaseBackupSettings.scheduleCronTaskUid })
  .from(databaseBackupSettings)
  .where(eq(databaseBackupSettings.name, "primary-database-backup"))
  .limit(1);
const taskUid = settings?.taskUid?.trim() || "";
if (!/^[A-Za-z0-9_-]{1,65}$/.test(taskUid)) {
  console.error("[ScheduledBackup] The primary backup task binding is missing or invalid");
  process.exit(2);
}

try {
  const result = await executeScheduledDatabaseBackup(taskUid);
  console.log(JSON.stringify({
    ok: result.ok,
    status: "status" in result ? result.status : undefined,
    skipped: "skipped" in result ? result.skipped : undefined,
    duplicate: "duplicate" in result ? result.duplicate : undefined,
    sizeBytes: "sizeBytes" in result ? result.sizeBytes : undefined,
    emailsSent: "emailsSent" in result ? result.emailsSent : undefined,
    encryption: "encryption" in result ? result.encryption : undefined,
  }));
  if (!result.ok) process.exit(1);
  process.exit(0);
} catch (error) {
  console.error("[ScheduledBackup] Backup execution failed:", error instanceof Error ? error.message : "BACKUP_FAILED");
  process.exit(1);
}
