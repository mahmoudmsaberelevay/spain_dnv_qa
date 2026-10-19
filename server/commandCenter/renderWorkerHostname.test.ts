// @ts-nocheck
import { describe, expect, it } from "vitest";

process.env.ELEVAY_RENDER_WORKER_TEST = "1";
const { isApprovedMacHostname, normalizeMacHostname } = await import("../../scripts/elevay-render-worker.ts");
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
});
