import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  syncAllMetaIntegrations: vi.fn(),
  sendLeadSyncSummaryEmail: vi.fn(),
  sendMetaLeadAlert: vi.fn(),
}));

vi.mock("./metaLeadSync", () => ({ syncAllMetaIntegrations: mocks.syncAllMetaIntegrations }));
vi.mock("./emailService", () => ({
  sendLeadSyncSummaryEmail: mocks.sendLeadSyncSummaryEmail,
  sendMetaLeadAlert: mocks.sendMetaLeadAlert,
}));

import { META_LEAD_SYNC_INTERVAL_MS, startMetaLeadSyncScheduler } from "./metaLeadSyncScheduler";

describe("Meta Lead Ads durable scheduler", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("starts one recovery run after deployment and reconciles missed leads every fifteen minutes", async () => {
    vi.useFakeTimers();
    mocks.syncAllMetaIntegrations.mockResolvedValue([]);

    startMetaLeadSyncScheduler();
    startMetaLeadSyncScheduler();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.syncAllMetaIntegrations).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(META_LEAD_SYNC_INTERVAL_MS);
    expect(mocks.syncAllMetaIntegrations).toHaveBeenCalledTimes(2);
  });
});
