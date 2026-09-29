import { findDisallowedContentPacketData, normalizeContentStudioText } from "./marketingContentStudio";

export const WEEKLY_RESULTS_TIMEZONE = "Africa/Cairo" as const;
export const WEEKLY_RESULTS_ITEM_TYPES = [
  "research_update",
  "static_post",
  "carousel",
  "reel",
  "image",
  "graphic",
  "ad_setup",
] as const;
export type WeeklyResultsItemType = (typeof WEEKLY_RESULTS_ITEM_TYPES)[number];

export const WEEKLY_RESULTS_ITEM_TYPE_LABELS: Record<WeeklyResultsItemType, string> = {
  research_update: "Research update",
  static_post: "Static post",
  carousel: "Carousel",
  reel: "Reel",
  image: "Image",
  graphic: "Graphic",
  ad_setup: "Ad setup",
};

export const WEEKLY_RESULTS_ITEM_STATUSES = [
  "draft",
  "on_hold",
  "pending_individual_review",
  "changes_requested",
  "approved",
  "rejected",
  "stopped",
  "superseded",
] as const;
export type WeeklyResultsItemStatus = (typeof WEEKLY_RESULTS_ITEM_STATUSES)[number];

export const WEEKLY_RESULTS_ALLOWED_NEXT_STATES: Record<WeeklyResultsItemStatus, readonly WeeklyResultsItemStatus[]> = {
  draft: ["on_hold", "pending_individual_review", "stopped"],
  on_hold: ["draft", "stopped"],
  pending_individual_review: ["changes_requested", "approved", "rejected", "stopped"],
  changes_requested: ["draft", "stopped"],
  approved: ["stopped"],
  rejected: ["draft", "stopped"],
  stopped: [],
  superseded: [],
};

export type WeeklyContentMix = Record<WeeklyResultsItemType, number>;

export const DEFAULT_WEEKLY_CONTENT_MIX: WeeklyContentMix = {
  research_update: 0,
  static_post: 1,
  carousel: 1,
  reel: 1,
  image: 1,
  graphic: 1,
  ad_setup: 0,
};

export const WEEKLY_RESULTS_FEEDBACK_CATEGORIES = [
  "factual_accuracy",
  "brand",
  "wording",
  "visual_design",
  "voice",
  "targeting",
  "budget",
  "timing",
  "other",
] as const;
export type WeeklyResultsFeedbackCategory = (typeof WEEKLY_RESULTS_FEEDBACK_CATEGORIES)[number];

export const WEEKLY_RESULTS_EXECUTION_BOUNDARY = "Weekly Results is a controlled in-CRM planning and individual-approval workspace. Until a separate execution-release checkpoint is approved, it cannot call an AI provider, create a Manus task, render media, synthesize voice, publish, schedule a social post, change Meta or CAPI, create a campaign, spend, send a message, or change CRM operating records.";

export function weeklyResultsItemCanTransition(from: WeeklyResultsItemStatus, to: WeeklyResultsItemStatus): boolean {
  return WEEKLY_RESULTS_ALLOWED_NEXT_STATES[from].includes(to);
}

export function normalizeWeeklyResultsText(value: string): string {
  return normalizeContentStudioText(value);
}

/** Weekly planning, feedback, and performance notes must stay aggregate and free of CRM contact data. */
export function findDisallowedWeeklyResultsData(value: string): string | null {
  return findDisallowedContentPacketData(value);
}

export function isValidCairoClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isSaturdayDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && parsed.getUTCDay() === 6;
}
