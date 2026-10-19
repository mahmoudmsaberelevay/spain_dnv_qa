import { describe, expect, it, vi } from "vitest";
import { createScheduledWeeklyCommandCenterOperationsHandler } from "./scheduledWeeklyCommandCenterOperationsHandler";

function response() {
  const res: any = { statusCode: 200, body: null };
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.json = vi.fn((body) => { res.body = body; return res; });
  return res;
}

describe("scheduled weekly Command Center operations", () => {
  it("rejects non-cron callers before invoking operations", async () => {
    const runOperations = vi.fn();
    const handler = createScheduledWeeklyCommandCenterOperationsHandler({ authenticateRequest: async () => ({ isCron: false }), runOperations });
    const res = response();
    await handler({} as any, res);
    expect(res.statusCode).toBe(403);
    expect(runOperations).not.toHaveBeenCalled();
  });

  it("runs only for an authenticated platform heartbeat", async () => {
    const runOperations = vi.fn(async () => ({ cairo: { weekday: "Wed" }, events: ["preflight_ready"] }));
    const handler = createScheduledWeeklyCommandCenterOperationsHandler({ authenticateRequest: async () => ({ isCron: true, taskUid: "weekly-task" }), runOperations });
    const res = response();
    await handler({} as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, taskUid: "weekly-task", events: ["preflight_ready"] });
  });
});
