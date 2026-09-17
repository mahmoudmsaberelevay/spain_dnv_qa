import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const playbook = readFileSync(new URL("../scripts/backup_final.sh", import.meta.url), "utf8");
const runner = readFileSync(new URL("../scripts/run-scheduled-database-backup.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("./scheduledDbBackupService.ts", import.meta.url), "utf8");

describe("scheduled full-system database backup playbook", () => {
  it("runs fail-fast from the durable project path", () => {
    expect(playbook).toContain("set -Eeuo pipefail");
    expect(playbook).toContain('PROJECT_DIR="/home/ubuntu/spain_dnv_qa"');
    expect(playbook).toContain("pnpm exec tsx scripts/run-scheduled-database-backup.ts");
  });

  it("resolves the authoritative primary task binding and invokes the AES-256-GCM backup service", () => {
    expect(runner).toContain('databaseBackupSettings.name, "primary-database-backup"');
    expect(runner).toContain("scheduleCronTaskUid");
    expect(runner).toContain("executeScheduledDatabaseBackup");
    expect(service).toContain("encryptBackupBuffer(compressed)");
    expect(service).toContain("BACKUP_ENCRYPTION_METADATA.algorithm");
    expect(service).toContain("-run-${run.id}.sql.gz.enc");
  });

  it("exports every table for complete restoration rather than selected modules only", () => {
    expect(service).toContain("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME");
    expect(service).toContain("SHOW CREATE TABLE");
    expect(service).toContain("SELECT * FROM");
    expect(service).toContain("SET FOREIGN_KEY_CHECKS=0");
    expect(service).toContain("SET FOREIGN_KEY_CHECKS=1");
  });

  it("does not embed database, email, storage, or encryption credentials", () => {
    expect(`${playbook}\n${runner}`).not.toMatch(/DATABASE_URL\s*=|GMAIL_APP_PASSWORD\s*=|BACKUP_ENCRYPTION_PASSWORD\s*=|BUILT_IN_FORGE_API_KEY\s*=/);
  });
});
