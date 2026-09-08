import { describe, expect, it, vi } from "vitest";
import { createScheduledDbBackupHandler } from "./scheduledDbBackupHandler";

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };
  return response;
}

describe("scheduled database backup handler", () => {
  it("returns 401 when scheduler authentication fails", async () => {
    const handler = createScheduledDbBackupHandler({
      authenticateRequest: vi.fn().mockRejectedValue(new Error("invalid")),
      executeBackup: vi.fn(),
    });
    const response = createResponse();
    await handler({} as any, response as any);
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: "authentication-required" });
  });

  it("returns 403 for an authenticated non-cron user", async () => {
    const executeBackup = vi.fn();
    const handler = createScheduledDbBackupHandler({
      authenticateRequest: vi.fn().mockResolvedValue({ isCron: false }),
      executeBackup,
    });
    const response = createResponse();
    await handler({} as any, response as any);
    expect(response.statusCode).toBe(403);
    expect(executeBackup).not.toHaveBeenCalled();
  });

  it("passes the authenticated task UID to the backup service", async () => {
    const executeBackup = vi.fn().mockResolvedValue({ ok: true, status: "success" });
    const handler = createScheduledDbBackupHandler({
      authenticateRequest: vi.fn().mockResolvedValue({ isCron: true, taskUid: "backup-task" }),
      executeBackup,
    });
    const response = createResponse();
    await handler({} as any, response as any);
    expect(executeBackup).toHaveBeenCalledWith("backup-task");
    expect(response.body).toEqual({ ok: true, status: "success" });
  });

  it("returns a sanitized 500 response", async () => {
    const handler = createScheduledDbBackupHandler({
      authenticateRequest: vi.fn().mockResolvedValue({ isCron: true, taskUid: "backup-task" }),
      executeBackup: vi.fn().mockRejectedValue(new Error("DATABASE_FAILED")),
    });
    const response = createResponse();
    await handler({} as any, response as any);
    expect(response.statusCode).toBe(500);
    expect(response.body).toMatchObject({
      error: "Database backup failed; review the scheduled-job diagnostics",
      errorCode: "DATABASE_FAILED",
    });
    expect(JSON.stringify(response.body)).not.toContain("password");
  });
});
