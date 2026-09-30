import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("Pass 2 reliability remediation", () => {
  it("uses the typed mysql2 pool API for backup row queries", () => {
    const source = read("server/backupHandlers.ts");
    expect(source).toContain("db.$client.promise().query");
    expect(source).not.toContain("db.query(");
  });

  it("preserves protected Audit and backup procedures in the active admin router", () => {
    const source = read("server/routers/admin.ts");
    expect(source).toContain("listAuditLogs: adminProcedure");
    expect(source).toContain("getWeeklyBackupStatus: adminProcedure");
    expect(source).toContain("exportFullBackup: adminProcedure");
    expect(source).toContain("exportDatabaseBackup()");
    expect(source).toContain('"full_backup"');
  });

  it("keeps financial client public aliases while querying the actual name column", () => {
    const attestation = read("server/attestationDb.ts");
    const paralegal = read("server/paralegalDb.ts");
    expect(attestation).toContain("clientName: finClients.name");
    expect(attestation).toContain("like(finClients.name");
    expect(paralegal).toContain("clientName: finClients.name");
    expect(paralegal).toContain("like(finClients.name");
  });

  it("keeps the backup preview parser target-compatible and escapes dynamic table names", () => {
    const source = read("server/_core/index.ts");
    expect(source).toContain("const escapedTableName = tableName.replace");
    expect(source).toContain("[\\\\s\\\\S]");
    expect(source).not.toContain('"gs"');
  });

  it("validates storage proxy JSON shape before redirecting", () => {
    const source = read("server/_core/storageProxy.ts");
    expect(source).toContain("const payload: unknown = await forgeResp.json()");
    expect(source).toContain('typeof payload.url === "string"');
    expect(source).toContain('res.redirect(307, url)');
  });

  it("uses target-compatible contract XML collection iteration", () => {
    const source = read("server/contractGenerator.ts");
    expect(source).toContain("Array.from(appendixDocXml.matchAll");
    expect(source).toContain("for (const styleId of Array.from(usedStyles))");
  });
});
