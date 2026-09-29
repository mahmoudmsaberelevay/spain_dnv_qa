import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getDb: vi.fn(),
  markAutomationScheduleTask: vi.fn(),
  startWeeklyAutomationCycle: vi.fn(),
  isConfiguredCairoAutomationHour: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./weeklyMarketingAutomationService", () => ({
  markAutomationScheduleTask: mocks.markAutomationScheduleTask,
  startWeeklyAutomationCycle: mocks.startWeeklyAutomationCycle,
  isConfiguredCairoAutomationHour: mocks.isConfiguredCairoAutomationHour,
}));

import { scheduledWeeklyMarketingAutomationHandler } from "./scheduledWeeklyMarketingAutomationHandler";

function response() {
  const value = { statusCode: 200, body: undefined as unknown, status(code: number) { value.statusCode = code; return value; }, json(body: unknown) { value.body = body; return value; } };
  return value;
}

describe("scheduled weekly marketing automation handler", () => {
  it("rejects unauthenticated and non-cron callers before reading automation state", async () => {
    mocks.authenticateRequest.mockRejectedValueOnce(new Error("no"));
    const first = response(); await scheduledWeeklyMarketingAutomationHandler({} as any, first as any);
    expect(first.statusCode).toBe(401);
    mocks.authenticateRequest.mockResolvedValueOnce({ isCron: false });
    const second = response(); await scheduledWeeklyMarketingAutomationHandler({} as any, second as any);
    expect(second.statusCode).toBe(403);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("runs only an enabled schedule at its exact Cairo preparation minute", async () => {
    mocks.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "weekly-cron" });
    const controls = { isEnabled: true, state: "active", scheduleTaskUid: "weekly-cron" };
    const settings = { preparationScheduleEnabled: true, prepareDayOfWeek: 6, prepareStartTime: "08:00" };
    mocks.getDb.mockResolvedValue({ select: vi.fn().mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([controls]) }) }) }).mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([settings]) }) }) }) });
    mocks.isConfiguredCairoAutomationHour.mockReturnValue(true);
    mocks.startWeeklyAutomationCycle.mockResolvedValue({ reused: false, job: { id: 8, state: "waiting_manus" } });
    const res = response(); await scheduledWeeklyMarketingAutomationHandler({} as any, res as any);
    expect(mocks.startWeeklyAutomationCycle).toHaveBeenCalledWith({ triggerType: "scheduled" });
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({ ok: true, taskUid: "weekly-cron" });
  });
});
