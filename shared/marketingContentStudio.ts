import { findDisallowedWorkOrderData, normalizeWorkOrderText } from "./marketingWorkOrders";

export const MARKETING_CONTENT_TYPES = [
  "static_post",
  "carousel",
  "reel",
  "lead_ad",
  "landing_page",
] as const;

export type MarketingContentType = (typeof MARKETING_CONTENT_TYPES)[number];

export const MARKETING_CONTENT_STATUSES = [
  "draft",
  "in_review",
  "changes_requested",
  "qa_passed",
  "approval_ready",
  "approved",
  "rejected",
  "stopped",
  "superseded",
] as const;

export type MarketingContentStatus = (typeof MARKETING_CONTENT_STATUSES)[number];

export const MARKETING_CONTENT_ALLOWED_NEXT_STATES: Record<MarketingContentStatus, readonly MarketingContentStatus[]> = {
  draft: ["in_review", "stopped"],
  in_review: ["changes_requested", "qa_passed", "stopped"],
  changes_requested: ["draft", "stopped"],
  qa_passed: ["approval_ready", "changes_requested", "stopped"],
  approval_ready: ["approved", "changes_requested", "rejected", "stopped"],
  approved: ["stopped"],
  rejected: ["draft", "stopped"],
  stopped: [],
  superseded: [],
};

export const MARKETING_CONTENT_QA_CHECKS = [
  "factual_claims",
  "brand_tone",
  "arabic_language",
  "visual_identity",
  "safe_areas",
  "accessibility",
  "cta_and_destination",
  "asset_provenance",
  "no_guarantees",
  "human_depiction_and_reel_continuity",
  "preview_equivalence",
] as const;

export type MarketingContentQaCheck = (typeof MARKETING_CONTENT_QA_CHECKS)[number];

export const MARKETING_CONTENT_QA_CHECK_LABELS: Record<MarketingContentQaCheck, string> = {
  factual_claims: "Factual claims and source links",
  brand_tone: "Premium ELEVAY tone and message hierarchy",
  arabic_language: "Arabic spelling, clarity and programme terminology",
  visual_identity: "Official logo, palette, typography and luxury visual direction",
  safe_areas: "Platform safe areas and layout readability",
  accessibility: "Captions, alt text and contrast",
  cta_and_destination: "CTA and destination consistency",
  asset_provenance: "Asset source, licensing and provenance",
  no_guarantees: "No immigration, financial or timing guarantees",
  human_depiction_and_reel_continuity: "If people appear: complete realistic wardrobe and formal footwear, anatomy and hand integrity, no random cultural accessories, and frame-to-frame reel continuity; mark N/A only when no person appears",
  preview_equivalence: "Final preview matches the represented content",
};

export type ContentQaResult = {
  check: MarketingContentQaCheck;
  passed: boolean;
  note: string;
};

export function contentCanTransition(from: MarketingContentStatus, to: MarketingContentStatus): boolean {
  return MARKETING_CONTENT_ALLOWED_NEXT_STATES[from].includes(to);
}

export function contentPacketRequiresPreview(status: MarketingContentStatus): boolean {
  return status === "approval_ready" || status === "approved";
}

export function contentPacketHasArabicText(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

export function normalizeContentStudioText(value: string): string {
  return normalizeWorkOrderText(value);
}

/** Content packets may hold brand and programme material, but never client/Lead identity data. */
export function findDisallowedContentPacketData(value: string): string | null {
  return findDisallowedWorkOrderData(value);
}

export function validatePreviewFingerprint(previewUrl: string | null | undefined, previewHash: string | null | undefined): string | null {
  if (!previewUrl || !previewHash) return "A final HTTPS preview URL and its SHA-256 fingerprint are required before Approval Ready.";
  try {
    const parsed = new URL(previewUrl);
    if (parsed.protocol !== "https:") return "Final previews must use HTTPS.";
  } catch {
    return "The final preview URL is invalid.";
  }
  if (!/^[a-f0-9]{64}$/i.test(previewHash)) return "The preview fingerprint must be a 64-character SHA-256 hash.";
  return null;
}

export function contentPacketOutputSchema(type: MarketingContentType): Record<string, unknown> {
  const common = ["objective", "audience", "program", "claimIds", "sourceLinks", "cta", "scheduledTime", "platformVariants"];
  switch (type) {
    case "static_post":
      return { artifactType: "StaticPostPacket", required: [...common, "arabicCopy", "caption", "visualBrief", "preview"] };
    case "carousel":
      return { artifactType: "CarouselPacket", required: [...common, "slides", "arabicCopy", "caption", "visualBrief", "preview"] };
    case "reel":
      return { artifactType: "ReelPacket", required: [...common, "arabicScript", "shotList", "caption", "subtitles", "preview"] };
    case "lead_ad":
      return { artifactType: "LeadAdPacket", required: [...common, "adCopy", "targetingSummary", "landingDestination", "preview"] };
    case "landing_page":
      return { artifactType: "LandingPagePacket", required: [...common, "pageSections", "arabicCopy", "landingDestination", "preview"] };
  }
}
