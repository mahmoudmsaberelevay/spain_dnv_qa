import { beforeEach, describe, expect, it, vi } from "vitest";
import { marketingDesignSystemAssets, marketingReviewMediaRuns, marketingWeeklyResultsItems, marketingWeeklyResultsPlans } from "../drizzle/schema";
import { getDb } from "./db";
import { quoteElevayHiggsfieldProClips } from "./higgsfieldProClipQuote";
import { quoteElevayMarketingMediaItem, recordOwnerElevayMediaCostReview } from "./elevayMarketingMediaQuoteService";
vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./higgsfieldProClipQuote", () => ({ ELEVAY_HIGGSFIELD_PRO_MODEL: "kling-video/v2.5-turbo/pro/image-to-video", quoteElevayHiggsfieldProClips: vi.fn() }));
const item: any = { id: 15, planId: 3, isSelected: true, itemType: "static_post", status: "draft", title: "Quiet city life", programKey: "spain_dnv", objective: "Educational", creativeDirection: "Warm editorial", scriptCopy: "بنراجع التفاصيل معاك، ومع ELEVAY بنوضحلك الخيارات خطوة بخطوة.", caption: "", cta: null, visualBrief: "Architecture", sourceClaimIdsJson: "[]", metadataJson: "{}", updatedAt: 1791110000000 };
const plan: any = { id: 3, planHash: "a".repeat(64), periodStart: "2026-10-04", status: "draft_prepared", source: "manual_internal" };
const assets = [{ assetType: "logo", sha256Digest: "b".repeat(64) }, { assetType: "design_instruction", sha256Digest: "c".repeat(64) }];
function fakeDb() {
  let quoteRow: any = null;
  const rows = (table: unknown) => table === marketingWeeklyResultsItems ? [item] : table === marketingWeeklyResultsPlans ? [plan] : table === marketingReviewMediaRuns ? (quoteRow ? [quoteRow] : []) : table === marketingDesignSystemAssets ? assets : [];
  return {
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => rows(table), orderBy: () => ({ limit: async () => rows(table) }), then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows(table)).then(resolve) }) }) }),
    insert: () => ({ values: async (values: unknown) => { quoteRow = { id: 61, ...(values as object) }; return {}; } }),
    update: () => ({ set: (values: unknown) => ({ where: async () => { quoteRow = { ...quoteRow, ...(values as object) }; return {}; } }) }),
  };
}
describe("isolated owner-reviewed marketing media cost quote", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getDb).mockResolvedValue(fakeDb() as any); vi.mocked(quoteElevayHiggsfieldProClips).mockResolvedValue({ provider: "higgsfield", model: "kling-video/v2.5-turbo/pro/image-to-video", clips: [1, 2, 3, 4].map(clip => ({ clip, estimatedUsd: 0.298 })), estimatedTotalUsd: 1.192, quoteOnly: true, estimatedAt: Date.now(), excludes: [] }); item.isSelected = true; item.itemType = "static_post"; item.updatedAt = 1791110000000; plan.source = "manual_internal"; });
  it("persists an exact static quote before owner acknowledgment and starts no generation", async () => {
    const q = await quoteElevayMarketingMediaItem(item.id);
    expect(q.productionEnabled).toBe(false);
    expect(q.runId).toBe(61);
    expect(q.quote.breakdown.map(part => part.provider)).toEqual(["openai", "manus_assembly"]);
    const saved = await recordOwnerElevayMediaCostReview({ runId: q.runId, quoteFingerprint: q.quote.quoteFingerprint, actorUserId: 1 });
    expect(saved).toMatchObject({ runId: 61, paidGenerationStarted: false, publicationEnabled: false });
    expect(quoteElevayHiggsfieldProClips).not.toHaveBeenCalled();
  });
  it("rejects changed creative and guessed quote fingerprints", async () => {
    const q = await quoteElevayMarketingMediaItem(item.id);
    await expect(recordOwnerElevayMediaCostReview({ runId: q.runId, quoteFingerprint: "f".repeat(64), actorUserId: 1 })).rejects.toThrow("expired or changed");
    item.updatedAt += 1;
    await expect(recordOwnerElevayMediaCostReview({ runId: q.runId, quoteFingerprint: q.quote.quoteFingerprint, actorUserId: 1 })).rejects.toThrow("creative or active design changed");
  });
  it("rejects retired plans and unselected items before any quote request", async () => {
    plan.source = "automated_multi_model";
    await expect(quoteElevayMarketingMediaItem(item.id)).rejects.toThrow("Historical or retired");
    plan.source = "manual_internal"; item.isSelected = false;
    await expect(quoteElevayMarketingMediaItem(item.id)).rejects.toThrow("Select an editable");
    expect(quoteElevayHiggsfieldProClips).not.toHaveBeenCalled();
  });
  it("persists four video estimates without a generation endpoint", async () => {
    item.itemType = "reel";
    const q = await quoteElevayMarketingMediaItem(item.id);
    expect(q.productionEnabled).toBe(false);
    expect(q.quote.breakdown.map(part => part.provider)).toEqual(["openai", "higgsfield", "elevenlabs", "manus_assembly"]);
    expect(quoteElevayHiggsfieldProClips).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ keyframeUrl: expect.stringContaining("illustrative-quote-only") })]));
  });
});
