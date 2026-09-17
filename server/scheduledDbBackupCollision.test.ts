import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./scheduledDbBackupService.ts", import.meta.url), "utf8");
const runner = readFileSync(new URL("../scripts/run-scheduled-database-backup.ts", import.meta.url), "utf8");

describe("scheduled backup collision handling", () => {
  it("uses a trigger-independent primary-backup key for each Cairo date", () => {
    expect(service).toContain("db-backup:primary-database-backup:${cairoParts(now).date}");
  });

  it("stores every claimed run under an immutable run-specific encrypted artifact key", () => {
    expect(service).toContain("elevay-backup-${cairoParts(now).date}-run-${run.id}.sql.gz.enc");
  });

  it("walks wrapped error causes when detecting a duplicate run key", () => {
    expect(service).toContain("candidate.cause");
    expect(service).toContain('candidate.code === "ER_DUP_ENTRY"');
    expect(service).toContain("candidate.errno === 1062");
  });

  it("returns existing success or processing state without exporting or emailing again", () => {
    expect(service).toContain('if (existing.status === "success") return { state: "success" as const, run: existing }');
    expect(service).toContain('if (existing.status === "processing" && existing.startedAt > now - PROCESSING_STALE_AFTER_MS)');
    expect(service).toContain('if (claim.state === "success") return { ok: true, duplicate: true, status: "success" as const }');
    expect(service).toContain('if (claim.state === "processing") return { ok: true, duplicate: true, status: "processing" as const }');
  });

  it("continues resolving the one authoritative task identity from database settings", () => {
    expect(runner).toContain('databaseBackupSettings.name, "primary-database-backup"');
    expect(runner).toContain("scheduleCronTaskUid");
  });
});
