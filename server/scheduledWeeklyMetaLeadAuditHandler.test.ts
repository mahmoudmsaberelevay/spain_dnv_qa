import { describe, expect, it, vi } from "vitest";
import { createScheduledWeeklyMetaLeadAuditHandler } from "./scheduledWeeklyMetaLeadAuditHandler";

function responseRecorder() {
  const response: any = {
    statusCode: 200,
    body: undefined,
    status: vi.fn((code: number) => { response.statusCode = code; return response; }),
    json: vi.fn((body: unknown) => { response.body = body; return response; }),
  };
  return response;
}

describe("scheduled weekly Meta lead audit", () => {
  it("accepts only a Heartbeat identity and passes the trusted task UID to the audit", async () => {
    const executeAudit = vi.fn().mockResolvedValue({ ok: true, status: "success" });
    const handler = createScheduledWeeklyMetaLeadAuditHandler({
      authenticateRequest: vi.fn().mockResolvedValue({ isCron: true, taskUid: "weekly-meta-audit" }) as any,
      executeAudit,
    });
    const response = responseRecorder();
    await handler({} as any, response);
    expect(response.statusCode).toBe(200);
    expect(executeAudit).toHaveBeenCalledWith("weekly-meta-audit");
  });

  it("rejects a non-cron request without running reconciliation", async () => {
    const executeAudit = vi.fn();
    const handler = createScheduledWeeklyMetaLeadAuditHandler({
      authenticateRequest: vi.fn().mockResolvedValue({ isCron: false }) as any,
      executeAudit,
    });
    const response = responseRecorder();
    await handler({} as any, response);
    expect(response.statusCode).toBe(403);
    expect(executeAudit).not.toHaveBeenCalled();
  });
});
