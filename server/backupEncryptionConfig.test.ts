import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BACKUP_ENCRYPTION_METADATA,
  decryptBackupBuffer,
  encryptBackupBuffer,
  getBackupEncryptionPassword,
} from "./backupEncryption";

describe("BACKUP_ENCRYPTION_PASSWORD integration", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.get("/api/test/backup-encryption-health", (_req, res) => {
      try {
        const password = getBackupEncryptionPassword();
        const probe = Buffer.from("elevay-backup-secret-health", "utf8");
        const encrypted = encryptBackupBuffer(probe, password);
        const decrypted = decryptBackupBuffer(encrypted, password);
        res.json({
          ok: decrypted.equals(probe),
          algorithm: BACKUP_ENCRYPTION_METADATA.algorithm,
          envelopeVersion: BACKUP_ENCRYPTION_METADATA.envelopeVersion,
        });
      } catch {
        res.status(503).json({ ok: false });
      }
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it("validates the supplied secret through a lightweight HTTP encryption round trip", async () => {
    const response = await fetch(`${baseUrl}/api/test/backup-encryption-health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      algorithm: "AES-256-GCM",
      envelopeVersion: 2,
    });
  });
});
