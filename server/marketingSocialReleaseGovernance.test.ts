import { describe, expect, it } from "vitest";
import {
  evaluateSocialReleaseGovernance,
  SOCIAL_RELEASE_MIN_ELIGIBLE_ITEMS,
  SOCIAL_RELEASE_TRAILING_WINDOW_MS,
} from "../shared/marketingSocialReleaseGovernance";

const now = Date.UTC(2026, 9, 1, 8, 0, 0);
const approvedItem = (id: number, approvedAt: number) => ({
  id,
  isSelected: true,
  status: "approved",
  previewHash: `${String(id).padStart(2, "0")}${"a".repeat(62)}`,
  approvedAt,
  events: [{
    action: "individual_approve",
    createdAt: approvedAt,
    payload: { finalPreviewApproved: true, feedbackResolved: true, previewHash: `${String(id).padStart(2, "0")}${"a".repeat(62)}` },
  }],
});

describe("social release governance", () => {
  it("blocks the first month even when every recorded item has an individual final approval", () => {
    const snapshot = evaluateSocialReleaseGovernance(Array.from({ length: SOCIAL_RELEASE_MIN_ELIGIBLE_ITEMS }, (_, index) => approvedItem(index + 1, now - 5 * 24 * 60 * 60 * 1_000)), now);
    expect(snapshot.eligibleItemCount).toBe(SOCIAL_RELEASE_MIN_ELIGIBLE_ITEMS);
    expect(snapshot.meetsThreshold).toBe(true);
    expect(snapshot.releaseEligible).toBe(false);
    expect(snapshot.blockers.join(" ")).toContain("full 30-day history");
  });

  it("requires final-preview and resolved-feedback proof and excludes unresolved states", () => {
    const stale = { ...approvedItem(1, now - SOCIAL_RELEASE_TRAILING_WINDOW_MS - 1), status: "approved" };
    const missingFeedback = { ...approvedItem(2, now - 10_000), events: [{ action: "individual_approve", createdAt: now - 10_000, payload: { finalPreviewApproved: true, feedbackResolved: false, previewHash: `02${"a".repeat(62)}` } }] };
    const pending = { ...approvedItem(3, now - 10_000), status: "pending_individual_review", approvedAt: null };
    const snapshot = evaluateSocialReleaseGovernance([stale, missingFeedback, pending], now);
    expect(snapshot.eligibleItemCount).toBe(0);
    expect(snapshot.excluded.map(item => item.reason)).toContain("outside_trailing_window");
    expect(snapshot.excluded.map(item => item.reason)).toContain("final_preview_or_feedback_not_proven");
    expect(snapshot.excluded.map(item => item.reason)).toContain("status_pending_individual_review");
  });

  it("requires a meaningful 30-day sample and never publishes as a side effect", () => {
    const approvals = [
      approvedItem(1, now - SOCIAL_RELEASE_TRAILING_WINDOW_MS - 1),
      ...Array.from({ length: SOCIAL_RELEASE_MIN_ELIGIBLE_ITEMS }, (_, index) => approvedItem(index + 2, now - SOCIAL_RELEASE_TRAILING_WINDOW_MS + index + 1)),
    ];
    const snapshot = evaluateSocialReleaseGovernance(approvals, now);
    expect(snapshot.releaseEligible).toBe(true);
    expect(snapshot.approvalScorePercent).toBe(100);
    expect(snapshot.eligibleItems).toHaveLength(SOCIAL_RELEASE_MIN_ELIGIBLE_ITEMS);
    expect(Object.hasOwn(snapshot, "publicationId")).toBe(false);
  });
});
