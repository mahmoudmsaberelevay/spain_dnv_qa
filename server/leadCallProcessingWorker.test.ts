import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ process: vi.fn(), purge: vi.fn() }));
vi.mock("./leadCallProcessing", () => ({ processLeadCallQueue: mocks.process, purgeExpiredLeadCalls: mocks.purge, getCallProcessingReadiness: vi.fn() }));
import { runLeadCallProcessingRecovery } from "./leadCallProcessingWorker";
beforeEach(() => {
  mocks.process.mockReset().mockResolvedValue({ claimed: 0, completed: 0, failed: 0, blocked: 1 });
  mocks.purge.mockReset().mockResolvedValue({ purged: 0, failed: 0, blocked: 1 });
});
describe("managed call recovery lifecycle", () => {
  it("has independently gated idle retention and one shared abort signal", async () => {
    const result = await runLeadCallProcessingRecovery({ limit: 10 });
    expect(result).toEqual({ processing: { claimed: 0, completed: 0, failed: 0, blocked: 1 }, retention: { purged: 0, failed: 0, blocked: 1 } });
    expect(mocks.process.mock.calls[0][0].limit).toBe(1); expect(mocks.purge.mock.calls[0][0].limit).toBe(1);
    expect(mocks.process.mock.calls[0][0].signal).toBe(mocks.purge.mock.calls[0][0].signal);
  });
  it("does not start retention after a paid processing stage", async () => {
    mocks.process.mockResolvedValue({ claimed: 1, completed: 1, failed: 0, blocked: 0 });
    const result = await runLeadCallProcessingRecovery(); expect(result.retention.purged).toBe(0); expect(mocks.purge).not.toHaveBeenCalled();
  });
  it("does not start retention after the shared signal aborts", async () => {
    const controller = new AbortController(); mocks.process.mockImplementationOnce(async () => { controller.abort(); return { claimed: 0, completed: 0, failed: 0, blocked: 0 }; });
    await runLeadCallProcessingRecovery({ signal: controller.signal }); expect(mocks.purge).not.toHaveBeenCalled();
    expect(mocks.process.mock.calls[0][0].signal.aborted).toBe(true);
  });
});
