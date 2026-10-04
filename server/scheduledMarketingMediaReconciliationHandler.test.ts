import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticateRequest: vi.fn(), reconcileWaitingMarketingMediaJobs: vi.fn(), reconcileWaitingWeeklyAutomationJobs: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./marketingMediaProductionService", () => ({ reconcileWaitingMarketingMediaJobs: mocks.reconcileWaitingMarketingMediaJobs }));
vi.mock("./weeklyMarketingAutomationService", () => ({ reconcileWaitingWeeklyAutomationJobs: mocks.reconcileWaitingWeeklyAutomationJobs }));
import { scheduledMarketingMediaReconciliationHandler } from "./scheduledMarketingMediaReconciliationHandler";
function response() {
  const v = { statusCode: 200, body: undefined as unknown, status(code: number) { v.statusCode = code; return v; }, json(body: unknown) { v.body = body; return v; } };
  return v;
}
describe("scheduled media reconciliation", () => {
  it("rejects unsigned and non-cron requests before calling Manus", async () => {
    mocks.authenticateRequest.mockRejectedValueOnce(new Error("unsigned"));
    const missing = response(); await scheduledMarketingMediaReconciliationHandler({} as any, missing as any);
    expect(missing.statusCode).toBe(401);
    mocks.authenticateRequest.mockResolvedValueOnce({ isCron: false });
    const ordinary = response(); await scheduledMarketingMediaReconciliationHandler({} as any, ordinary as any);
    expect(ordinary.statusCode).toBe(403);
    expect(mocks.reconcileWaitingMarketingMediaJobs).not.toHaveBeenCalled();
    expect(mocks.reconcileWaitingWeeklyAutomationJobs).not.toHaveBeenCalled();
  });
  it("uses the existing provider tasks for background reconciliation only", async () => {
    mocks.authenticateRequest.mockResolvedValueOnce({ isCron: true, taskUid: "media-heartbeat" });
    mocks.reconcileWaitingMarketingMediaJobs.mockResolvedValueOnce({ checked: 2, pending: 2 });
    mocks.reconcileWaitingWeeklyAutomationJobs.mockResolvedValueOnce({ examined: 1, completed: 1 });
    const res = response(); await scheduledMarketingMediaReconciliationHandler({} as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, checked: 2, planning: { examined: 1, completed: 1 } });
    expect(mocks.reconcileWaitingMarketingMediaJobs).toHaveBeenCalledOnce();
    expect(mocks.reconcileWaitingWeeklyAutomationJobs).toHaveBeenCalledOnce();
  });
});
