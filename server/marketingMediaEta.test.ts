import { describe, expect, it } from "vitest";
import { estimateMediaCompletion } from "../shared/marketingMediaEta";

describe("review-media remaining time", () => {
  const now = Date.UTC(2026, 9, 4, 8, 0, 0);
  it("shows an estimated range rather than vendor percentage", () => {
    const result = estimateMediaCompletion({ mediaKind: "reel", state: "waiting_manus", createdAt: now - 4 * 60_000 }, [], now);
    expect(result.label).toContain("4–21 min remaining");
    expect(result.label).toContain("not guaranteed");
  });
  it("does not fabricate an ETA after the typical duration expires", () => {
    const result = estimateMediaCompletion({ mediaKind: "static", state: "waiting_manus", createdAt: now - 30 * 60_000 }, [], now);
    expect(result.basis).toBe("overdue");
    expect(result.remainingRange).toBeNull();
  });
  it("does not imply a stalled provider waiting for input will finish automatically", () => {
    expect(estimateMediaCompletion({ mediaKind: "reel", state: "waiting_input", createdAt: now - 2 * 60_000 }, [], now).label).toContain("no ETA");
  });
});
