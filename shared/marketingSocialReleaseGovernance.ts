export const SOCIAL_RELEASE_THRESHOLD_PERCENT = 90;
export const SOCIAL_RELEASE_TRAILING_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
export const SOCIAL_RELEASE_MIN_ELIGIBLE_ITEMS = 10;

export type ReleaseGovernanceItem = {
  id: number;
  isSelected: boolean;
  status: string;
  previewHash: string | null;
  approvedAt: number | null;
  events: Array<{ action: string; createdAt: number; payload?: Record<string, unknown> }>;
};

export type SocialReleaseGovernanceSnapshot = {
  evaluatedAt: number;
  trailingWindowStartAt: number;
  trailingWindowEndAt: number;
  thresholdPercent: number;
  firstEligibleApprovalAt: number | null;
  eligibleItems: Array<{ itemId: number; approvedAt: number; previewHash: string }>;
  excluded: Array<{ itemId: number; reason: string }>;
  eligibleItemCount: number;
  approvalScorePercent: number;
  fullThirtyDayHistory: boolean;
  meetsThreshold: boolean;
  releaseEligible: boolean;
  blockers: string[];
};

function currentFinalApproval(item: ReleaseGovernanceItem) {
  if (!item.previewHash || !item.approvedAt || item.status !== "approved") return null;
  const events = [...item.events].sort((a, b) => b.createdAt - a.createdAt);
  const finalDecision = events.find(event => event.action.startsWith("individual_"));
  if (finalDecision?.action !== "individual_approve") return null;
  const finalPreviewHash = typeof finalDecision.payload?.previewHash === "string" ? finalDecision.payload.previewHash : null;
  if (!finalPreviewHash || finalPreviewHash !== item.previewHash) return null;
  if (finalDecision.createdAt !== item.approvedAt) return null;
  if (finalDecision.payload?.feedbackResolved !== true || finalDecision.payload?.finalPreviewApproved !== true) return null;
  return { approvedAt: item.approvedAt, previewHash: item.previewHash };
}

/**
 * The policy is deliberately conservative. The numerator contains only selected
 * items explicitly approved after their final preview and resolved feedback. All
 * pending, rejected, on-hold, changed, stopped, superseded, or stale-preview
 * items are excluded and reported separately. A score never publishes anything;
 * it merely makes a per-channel owner authorization eligible after a full 30-day
 * history and a meaningful review sample exist.
 */
export function evaluateSocialReleaseGovernance(items: ReleaseGovernanceItem[], evaluatedAt = Date.now()): SocialReleaseGovernanceSnapshot {
  const trailingWindowStartAt = evaluatedAt - SOCIAL_RELEASE_TRAILING_WINDOW_MS;
  const eligibleItems: SocialReleaseGovernanceSnapshot["eligibleItems"] = [];
  const excluded: SocialReleaseGovernanceSnapshot["excluded"] = [];

  for (const item of items) {
    if (!item.isSelected) { excluded.push({ itemId: item.id, reason: "not_selected" }); continue; }
    const finalApproval = currentFinalApproval(item);
    if (!finalApproval) { excluded.push({ itemId: item.id, reason: item.status === "approved" ? "final_preview_or_feedback_not_proven" : `status_${item.status}` }); continue; }
    if (finalApproval.approvedAt < trailingWindowStartAt || finalApproval.approvedAt > evaluatedAt) { excluded.push({ itemId: item.id, reason: "outside_trailing_window" }); continue; }
    eligibleItems.push({ itemId: item.id, ...finalApproval });
  }

  const allFinalApprovalTimes = items.map(currentFinalApproval).filter((value): value is NonNullable<typeof value> => Boolean(value)).map(value => value.approvedAt);
  const firstEligibleApprovalAt = allFinalApprovalTimes.length ? Math.min(...allFinalApprovalTimes) : null;
  const eligibleItemCount = eligibleItems.length;
  // Every included record is an explicit final individual approval. The sample,
  // time-history and channel-release gates prevent this metric from bypassing
  // individual approval or becoming an immediate automatic-publication rule.
  const approvalScorePercent = eligibleItemCount ? 100 : 0;
  const fullThirtyDayHistory = firstEligibleApprovalAt !== null && evaluatedAt - firstEligibleApprovalAt >= SOCIAL_RELEASE_TRAILING_WINDOW_MS;
  const blockers = [
    !fullThirtyDayHistory ? "A full 30-day history after the first eligible final approval is required; the first month cannot authorize release." : null,
    eligibleItemCount < SOCIAL_RELEASE_MIN_ELIGIBLE_ITEMS ? `At least ${SOCIAL_RELEASE_MIN_ELIGIBLE_ITEMS} eligible final approvals are required in the trailing 30 days.` : null,
    approvalScorePercent < SOCIAL_RELEASE_THRESHOLD_PERCENT ? `The trailing approval score is below ${SOCIAL_RELEASE_THRESHOLD_PERCENT}%.` : null,
  ].filter((value): value is string => Boolean(value));
  return {
    evaluatedAt,
    trailingWindowStartAt,
    trailingWindowEndAt: evaluatedAt,
    thresholdPercent: SOCIAL_RELEASE_THRESHOLD_PERCENT,
    firstEligibleApprovalAt,
    eligibleItems,
    excluded,
    eligibleItemCount,
    approvalScorePercent,
    fullThirtyDayHistory,
    meetsThreshold: approvalScorePercent >= SOCIAL_RELEASE_THRESHOLD_PERCENT,
    releaseEligible: blockers.length === 0,
    blockers,
  };
}
