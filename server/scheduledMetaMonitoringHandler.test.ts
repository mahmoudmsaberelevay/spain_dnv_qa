import { readFileSync } from "node:fs";
import { describe, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  collectMetaMonitoringSnapshot: vi.fn(),
  processMetaNotificationOutbox: vi.fn(),
  registeredRows: [{ id: 1 }] as Array<{ id: number }>,
}));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./metaAssignmentMonitoring", () => ({
  collectMetaMonitoringSnapshot: mocks.collectMetaMonitoringSnapshot,
  processMetaNotificationOutbox: mocks.processMetaNotificationOutbox,
}));
vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => mocks.registeredRows }),
      }),
    }),
  })),
}));

import { scheduledMetaMonitoringHandler } from "./scheduledMetaMonitoringHandler";

function responseRecorder() {
  const response: any = {
    statusCode: 200,
    body: undefined,
    status: vi.fn((code: number) => { response.statusCode = code; return response; }),
    json: vi.fn((body: unknown) => { response.body = body; return response; }),
  };
  return response;
}

describe("scheduled Meta monitoring authentication and safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.registeredRows = [{ id: 1 }];
    mocks.collectMetaMonitoringSnapshot.mockResolvedValue({
      assignmentCoverageBps: 10_000,
      unassignedOverTenMinutes: 0,
      duplicateAttributionCount: 0,
      ambiguousMatchCount: 0,
      manualReviewCount: 0,
      testLeadLeakageCount: 0,
      productionSendingEnabled: false,
    });
    mocks.processMetaNotificationOutbox.mockResolvedValue({ selected: 0, sent: 0, failed: 0 });
  });

  it("rejects ordinary users and does not collect monitoring data", async () => {
    mocks.authenticateRequest.mockResolvedValue({ id: 8, role: "admin", isCron: false });
    const response = responseRecorder();
    await scheduledMetaMonitoringHandler({} as any, response);
    expect(response.statusCode).toBe(403);
    expect(mocks.collectMetaMonitoringSnapshot).not.toHaveBeenCalled();
  });

  it("acknowledges an orphan task UID without running monitoring", async () => {
    mocks.registeredRows = [];
    mocks.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "orphan" });
    const response = responseRecorder();
    await scheduledMetaMonitoringHandler({} as any, response);
    expect(response.body).toEqual({ ok: true, skipped: "orphan-schedule" });
    expect(mocks.collectMetaMonitoringSnapshot).not.toHaveBeenCalled();
  });

  it("returns privacy-safe metrics and keeps production CAPI disabled", async () => {
    mocks.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "meta-monitor-five-minute" });
    const response = responseRecorder();
    await scheduledMetaMonitoringHandler({} as any, response);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      assignmentCoverageBps: 10_000,
      unassignedOverTenMinutes: 0,
      productionSendingEnabled: false,
    });
    expect(mocks.processMetaNotificationOutbox).toHaveBeenCalledWith(25);
  });

  it("mounts the callback before the tRPC and static fallthrough", () => {
    const source = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    const scheduledRoute = source.indexOf('app.post("/api/scheduled/metaMonitoring"');
    const viteFallback = source.indexOf("await setupVite(app, server)");
    const staticFallback = source.indexOf("serveStatic(app)");
    expect(scheduledRoute).toBeGreaterThan(-1);
    expect(viteFallback).toBeGreaterThan(scheduledRoute);
    expect(staticFallback).toBeGreaterThan(scheduledRoute);
  });
});
