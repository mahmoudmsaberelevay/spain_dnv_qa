import { describe, expect, it } from "vitest";
import { itemizedElevayReelCostReview, itemizedElevayStaticCostReview } from "./elevayMediaCostReview";
const item = { itemId: 32, snapshotHash: "a".repeat(64), clips: [1, 2, 3, 4].map(clip => ({ clip, estimatedUsd: 0.298 })), narrationScript: "كل خطوة بتبدأ بفهم احتياجاتك، ومع ELEVAY نوضحلك الخيارات." };
describe("owner-reviewed media quote", () => {
  it("itemizes four Pro clips, four direct OpenAI keyframes, ELEVAY v3 and local assembly with no fixed cap", () => {
    const quote = itemizedElevayReelCostReview(item);
    expect(quote.breakdown).toHaveLength(4);
    expect(quote.breakdown.map(line => line.provider)).toEqual(["openai", "higgsfield", "elevenlabs", "manus_assembly"]);
    expect(quote.breakdown[1].estimatedUsd).toBe(1.192);
    expect(quote.breakdown[0].estimatedUsd).toBe(2);
    expect(quote.breakdown[0].basis).toContain("NOT a model quote");
    expect(quote.breakdown[2].estimatedUsd).toBeGreaterThan(0);
    expect(quote.fixedCostCap).toBe(false);
    expect(quote.estimatedSubtotalUsd).toBeGreaterThan(1.192);
    expect(quote.quoteFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(itemizedElevayReelCostReview(item).quoteFingerprint).toEqual(quote.quoteFingerprint);
    expect(itemizedElevayReelCostReview({ ...item, clips: item.clips.map(row => ({ ...row, estimatedUsd: row.estimatedUsd + 0.001 })) }).quoteFingerprint).not.toEqual(quote.quoteFingerprint);
  });
  it("blocks mismatched snapshots, altered model, missing scene or missing voice text", () => {
    expect(() => itemizedElevayReelCostReview({ ...item, snapshotHash: "bad" })).toThrow("snapshot");
    expect(() => itemizedElevayReelCostReview({ ...item, imageModel: "other-model" })).toThrow("unverified");
    expect(() => itemizedElevayReelCostReview({ ...item, clips: item.clips.slice(0, 3) })).toThrow("four");
    expect(() => itemizedElevayReelCostReview({ ...item, narrationScript: "" })).toThrow("voice script");
  });
  it("quotes one direct OpenAI static and the exact local logo, with no video or voice provider", () => {
    const result = itemizedElevayStaticCostReview({ itemId: item.itemId, snapshotHash: item.snapshotHash });
    expect(result.fixedCostCap).toBe(false);
    expect(result.breakdown.map(part => part.provider)).toEqual(["openai", "manus_assembly"]);
    expect(result.breakdown[0].estimatedUsd).toBe(0.5);
    expect(result.breakdown[0].basis).toContain("NOT a quoted");
    expect(result.breakdown[1].estimatedUsd).toBe(0);
    expect(result.quoteFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
