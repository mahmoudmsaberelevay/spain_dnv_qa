// @ts-nocheck
import { describe, expect, it } from "vitest";

process.env.ELEVAY_RENDER_WORKER_TEST = "1";
const { isApprovedMacHostname, normalizeMacHostname, workerSourceUrl } = await import("../../scripts/elevay-render-worker.ts");
delete process.env.ELEVAY_RENDER_WORKER_TEST;

describe("approved macOS render-worker hostname", () => {
  it("accepts the exact approved hostname and macOS typographic-dash variants", () => {
    expect(normalizeMacHostname("Mahmouds-MacBook-Pro")).toBe("mahmouds-macbook-pro");
    expect(isApprovedMacHostname("Mahmouds-MacBook-Pro")).toBe(true);
    expect(isApprovedMacHostname("Mahmouds–MacBook–Pro")).toBe(true);
    expect(isApprovedMacHostname("Mahmouds—MacBook—Pro")).toBe(true);
  });

  it("continues to reject every other hostname", () => {
    expect(isApprovedMacHostname("Mahmouds-MacBook-Pro-2")).toBe(false);
    expect(isApprovedMacHostname("other-macbook-pro")).toBe(false);
  });

  it("cache-busts reviewed worker source refreshes", () => {
    expect(workerSourceUrl("https://elevay.vip", "elevay-render-worker.ts", 123)).toBe("https://elevay.vip/admin/render-worker-source/elevay-render-worker.ts?v=123");
  });
});
