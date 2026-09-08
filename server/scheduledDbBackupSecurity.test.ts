import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BACKUP_ENCRYPTION_METADATA,
  decryptBackupBuffer,
  encryptBackupBuffer,
} from "./backupEncryption";
import {
  BACKUP_NOTIFICATION_EMAILS,
  isCairoBackupWindow,
  makeBackupRunKey,
  sendBackupNotifications,
} from "./scheduledDbBackupService";

describe("scheduled database backup security contract", () => {
  it("round-trips AES-256-GCM data and rejects tampering", () => {
    const password = "unit-test-only-password";
    const encrypted = encryptBackupBuffer(Buffer.from("CREATE TABLE qa(id int);"), password);
    expect(BACKUP_ENCRYPTION_METADATA.algorithm).toBe("AES-256-GCM");
    expect(decryptBackupBuffer(encrypted, password).toString()).toBe("CREATE TABLE qa(id int);");
    encrypted[encrypted.length - 1] ^= 1;
    expect(() => decryptBackupBuffer(encrypted, password)).toThrow();
  });

  it("recognizes 18:00 Cairo in summer and winter", () => {
    expect(isCairoBackupWindow(Date.parse("2026-09-07T15:00:00Z"))).toBe(true);
    expect(isCairoBackupWindow(Date.parse("2026-01-05T16:00:00Z"))).toBe(true);
    expect(isCairoBackupWindow(Date.parse("2026-01-05T15:00:00Z"))).toBe(false);
  });

  it("uses one idempotency key per Cairo calendar date", () => {
    const first = makeBackupRunKey("task", Date.parse("2026-09-07T15:00:00Z"));
    const retry = makeBackupRunKey("task", Date.parse("2026-09-07T15:59:59Z"));
    expect(first).toBe(retry);
  });

  it("targets every approved notification recipient", () => {
    expect([...BACKUP_NOTIFICATION_EMAILS]).toEqual([
      "mahmoud.saberelevay@gmail.com",
      "mahmoud.saber@elevay.com",
      "Ziadelshurafa@gmail.com",
    ]);
  });

  it("attempts every notification without exposing a restoration credential", async () => {
    const send = vi.fn().mockResolvedValue(true);
    const result = await sendBackupNotifications(
      "elevay-backup-2026-09-07.sql.gz.enc",
      "https://storage.example.test/backup",
      1024,
      Date.parse("2026-09-07T15:00:00Z"),
      send,
    );
    expect(result).toMatchObject({ successCount: 3, failureCount: 0 });
    expect(send.mock.calls.map(call => call[0].to)).toEqual([...BACKUP_NOTIFICATION_EMAILS]);
    for (const [message] of send.mock.calls) {
      expect(`${message.subject}\n${message.html}\n${message.text}`).not.toMatch(/password\s*[:=]|3488|aes-256-cbc/i);
    }
  });

  it("contains no legacy restoration password or AES-CBC command in active source", () => {
    const root = path.resolve(process.cwd());
    const files = [
      "server/scheduledDbBackupHandler.ts",
      "server/scheduledDbBackupService.ts",
      "server/_core/index.ts",
      "server/_core/vite.ts",
      "server/backupDownloadPage.ts",
      "server/routers/backupDownload.ts",
      "client/public/backup.html",
      "client/src/pages/BackupDownload.tsx",
      "client/src/pages/BackupDownloadPublic.tsx",
      "client/src/pages/BackupHistory.tsx",
      "client/src/pages/BackupPreview.tsx",
    ];
    const content = files.map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
    expect(content).not.toContain("3488");
    expect(content.toLowerCase()).not.toContain("aes-256-cbc");
    expect(content).not.toMatch(/password\s*[:=]\s*["']?[0-9]{4}/i);
  });
});
