import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticateRequest: vi.fn(), runMetaReconciliation: vi.fn() }));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./metaLeadsService", () => ({ runMetaReconciliation: mocks.runMetaReconciliation }));

import { scheduledMetaReconciliationHandler } from "./scheduledMetaReconciliationHandler";

function responseRecorder() {
  const response: any = {
    statusCode: 200,
    body: undefined,
    status: vi.fn((code: number) => { response.statusCode = code; return response; }),
    json: vi.fn((body: unknown) => { response.body = body; return response; }),
  };
  return response;
}

describe("scheduled Meta reconciliation authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runMetaReconciliation.mockResolvedValue({ pull: { scanned: 0, queued: 0 }, inbox: { processed: 0 }, events: { sent: 0 } });
  });

  it("rejects an ordinary authenticated user", async () => {
    mocks.authenticateRequest.mockResolvedValue({ id: 8, role: "user", isCron: false });
    const response = responseRecorder();
    await scheduledMetaReconciliationHandler({} as any, response);
    expect(response.statusCode).toBe(403);
    expect(mocks.runMetaReconciliation).not.toHaveBeenCalled();
  });

  it("returns 401 when scheduler authentication is absent or invalid", async () => {
    mocks.authenticateRequest.mockRejectedValue(new Error("No authorization"));
    const response = responseRecorder();
    await scheduledMetaReconciliationHandler({} as any, response);
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: "authentication-required" });
    expect(mocks.runMetaReconciliation).not.toHaveBeenCalled();
  });

  it("accepts only a cron identity with a task UID", async () => {
    mocks.authenticateRequest.mockResolvedValue({ id: 0, role: "user", isCron: true, taskUid: "meta-reconcile-daily" });
    const response = responseRecorder();
    await scheduledMetaReconciliationHandler({} as any, response);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ ok: true, taskUid: "meta-reconcile-daily" });
    expect(mocks.runMetaReconciliation).toHaveBeenCalledWith({ limit: 200 });
  });
});
