export const MARKETING_WORK_ORDER_TYPES = [
  "source_research",
  "strategy_brief",
  "creative_package",
  "voiceover_draft",
  "media_render_brief",
  "qa_review",
] as const;

export type MarketingWorkOrderType = (typeof MARKETING_WORK_ORDER_TYPES)[number];

export const MARKETING_WORK_ORDER_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "hold",
  "rejected",
  "cancelled",
] as const;

export type MarketingWorkOrderStatus = (typeof MARKETING_WORK_ORDER_STATUSES)[number];

export const MARKETING_WORK_ORDER_ALLOWED_NEXT_STATES: Record<MarketingWorkOrderStatus, readonly MarketingWorkOrderStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["approved", "hold", "rejected", "cancelled"],
  approved: ["hold", "cancelled"],
  hold: ["submitted", "approved", "rejected", "cancelled"],
  rejected: [],
  cancelled: [],
};

export const MARKETING_WORK_ORDER_TYPE_LABELS: Record<MarketingWorkOrderType, string> = {
  source_research: "Source research",
  strategy_brief: "Strategy brief",
  creative_package: "Creative package",
  voiceover_draft: "Arabic voice-over draft",
  media_render_brief: "Media-render brief",
  qa_review: "QA review",
};

export const MARKETING_WORK_ORDER_DEFAULT_SCHEMAS: Record<MarketingWorkOrderType, Record<string, unknown>> = {
  source_research: {
    artifactType: "FactProposal",
    required: ["programme", "sourceIds", "effectiveDate", "uncertainty", "affectedMessaging"],
  },
  strategy_brief: {
    artifactType: "StrategyBrief",
    required: ["objective", "audience", "hypothesis", "measurement", "risk", "costAllocation"],
  },
  creative_package: {
    artifactType: "CreativePackage",
    required: ["programme", "audience", "claimIds", "arabicCopy", "cta", "visualBrief", "utm"],
  },
  voiceover_draft: {
    artifactType: "VoiceDraft",
    required: ["approvedScript", "language", "voiceProfile", "pronunciationNotes", "audioHash"],
  },
  media_render_brief: {
    artifactType: "RenderPackage",
    required: ["aspectRatios", "duration", "assetProvenance", "visualBrief", "qaRequirements"],
  },
  qa_review: {
    artifactType: "QAReport",
    required: ["checks", "issues", "severity", "passFail", "evidence"],
  },
};

const CREATIVE_TYPES = new Set<MarketingWorkOrderType>([
  "strategy_brief",
  "creative_package",
  "voiceover_draft",
  "media_render_brief",
  "qa_review",
]);

export function workOrderRequiresApprovedClaims(type: MarketingWorkOrderType): boolean {
  return CREATIVE_TYPES.has(type);
}

export function workOrderRequiresBrandBook(type: MarketingWorkOrderType): boolean {
  return type !== "source_research";
}

export function capabilityForWorkOrder(type: MarketingWorkOrderType): "create_research" | "create_creative" | "review_creative" {
  if (type === "source_research" || type === "strategy_brief") return "create_research";
  if (type === "qa_review") return "review_creative";
  return "create_creative";
}

export function normalizeWorkOrderText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[\t ]+/g, " ").trim();
}

/** Prevent client, Lead, passport and direct-contact data from entering model-ready work orders. */
export function findDisallowedWorkOrderData(value: string): string | null {
  const text = normalizeWorkOrderText(value);
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) return "email address";
  if (/\+?\d[\d\s().-]{7,}\d/.test(text)) return "phone or contact number";
  if (/\b(passport|جواز سفر|national id|رقم قومي|client code|رقم العميل)\b/i.test(text)) return "client identity reference";
  return null;
}

export function workOrderCanTransition(from: MarketingWorkOrderStatus, to: MarketingWorkOrderStatus): boolean {
  return MARKETING_WORK_ORDER_ALLOWED_NEXT_STATES[from].includes(to);
}
