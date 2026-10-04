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
  static_post: 4,
  carousel: 0,
  reel: 3,
  image: 0,
  graphic: 0,
  ad_setup: 0,
};

export const MIN_WEEKLY_STATIC_POSTS = 4;
export const MIN_WEEKLY_REELS = 3;

/** The owner-selected weekly pack is exactly three reels plus four static designs. */
export function enforceWeeklyMediaMinimum<T extends { static_post?: number; reel?: number }>(mix: T): T {
  return { ...mix, ...DEFAULT_WEEKLY_CONTENT_MIX };
}

const WEEK_DAYS_FROM_SUNDAY: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
function cairoCalendarDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: WEEKLY_RESULTS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function currentCairoWeekStart(now = new Date()): string {
  const day = new Date(`${cairoCalendarDate(now)}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  return day.toISOString().slice(0, 10);
}
/** Initial date for a new publishing week; an existing version keeps its own Sunday. */
export function nextCairoPublishingSunday(now = new Date()): string {
  const day = new Date(`${cairoCalendarDate(now)}T12:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + (7 - day.getUTCDay()));
  return day.toISOString().slice(0, 10);
}
/** Review-only posting slot. Does not enqueue a Meta post or produce a UTC publish event. */
export function plannedCairoPublishingSlot(periodStart: string, day: string | null, time: string | null) {
  const offset = day ? WEEK_DAYS_FROM_SUNDAY[day] : undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || offset === undefined || !time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const date = new Date(`${periodStart}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== periodStart || date.getUTCDay() !== 0) return null;
  date.setUTCDate(date.getUTCDate() + offset);
  return `${date.toISOString().slice(0, 10)} ${time} Africa/Cairo`;
}

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

/** New owner-approved Sunday–Saturday publishing week. Historical Saturday plans remain readable. */
export function isSundayDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && parsed.getUTCDay() === 0;
}
