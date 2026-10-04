import { z } from "zod";
import { MIN_WEEKLY_REELS, MIN_WEEKLY_STATIC_POSTS } from "./marketingWeeklyResults";

export const WEEKLY_AUTOMATION_CONTROL_KEY = "primary-weekly-multi-model" as const;
export const WEEKLY_AUTOMATION_MONTHLY_CAP_USD = 100;
export const WEEKLY_AUTOMATION_PER_RUN_RESERVE_USD = 20;
export const WEEKLY_AUTOMATION_PROVIDER_ALIASES = ["openai-editorial", "editorial-challenge", "manus-orchestrator"] as const;
export const WEEKLY_AUTOMATION_STATES = ["disabled", "active", "paused", "blocked"] as const;
export const WEEKLY_AUTOMATION_JOB_STATES = ["queued", "running_council", "waiting_manus", "completed_pending_review", "blocked", "failed", "stopped"] as const;

export const WEEKLY_AUTOMATION_EXECUTION_BOUNDARY = "The weekly automation may prepare internal research, a draft plan, and review-ready production material. It never publishes, schedules a social post, launches or edits a Meta campaign, spends money, sends CAPI events, contacts Leads or clients, or changes CRM operating data. Each production item remains subject to individual review and final-preview QA.";

export const weeklyAutomationItemSchema = z.object({
  itemType: z.enum(["research_update", "static_post", "carousel", "reel", "image", "graphic", "ad_setup"]),
  title: z.string().trim().min(3).max(300),
  programKey: z.string().trim().min(2).max(96).nullable(),
  objective: z.string().trim().min(10).max(500),
  creativeDirection: z.string().trim().max(8_000),
  scriptCopy: z.string().trim().max(16_000),
  caption: z.string().trim().max(8_000),
  cta: z.string().trim().max(500),
  hashtags: z.array(z.string().trim().min(1).max(140)).max(15),
  onScreenEnglishText: z.string().trim().max(2_000),
  visualBrief: z.string().trim().max(8_000),
  plannedDay: z.enum(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]).nullable(),
  plannedTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  approvedClaimIds: z.array(z.number().int().positive()).max(20),
  ownerConfirmedInternalClaimIds: z.array(z.number().int().positive()).max(20),
  assetFileNames: z.array(z.string().trim().min(1).max(500)).max(8),
  adRecommendation: z.string().trim().max(4_000),
});

export const weeklyAutomationPlanSchema = z.object({
  weeklyTitle: z.string().trim().min(3).max(300),
  executiveSummary: z.string().trim().min(20).max(12_000),
  researchResults: z.array(z.object({
    title: z.string().trim().min(3).max(500),
    summary: z.string().trim().min(10).max(4_000),
    sourceUrl: z.string().trim().max(2_000),
    relevance: z.string().trim().min(5).max(2_000),
  })).max(8),
  adAuditRecommendations: z.array(z.string().trim().min(5).max(4_000)).max(12),
  crmMetaComparisonNotes: z.array(z.string().trim().min(5).max(4_000)).max(12),
  items: z.array(weeklyAutomationItemSchema).min(MIN_WEEKLY_REELS + MIN_WEEKLY_STATIC_POSTS).max(12),
  risksAndEvidenceGaps: z.array(z.string().trim().min(5).max(4_000)).max(12),
}).superRefine((plan, ctx) => {
  const staticPosts = plan.items.filter(item => item.itemType === "static_post");
  const reels = plan.items.filter(item => item.itemType === "reel");
  if (staticPosts.length < MIN_WEEKLY_STATIC_POSTS) ctx.addIssue({ code: "custom", path: ["items"], message: `At least ${MIN_WEEKLY_STATIC_POSTS} static posts are required for each week.` });
  if (reels.length < MIN_WEEKLY_REELS) ctx.addIssue({ code: "custom", path: ["items"], message: `At least ${MIN_WEEKLY_REELS} reels are required for each week.` });
  for (let index = 0; index < plan.items.length; index += 1) {
    const item = plan.items[index]!;
    if ((item.itemType === "static_post" || item.itemType === "reel") && (!item.plannedDay || !item.plannedTime)) {
      ctx.addIssue({ code: "custom", path: ["items", index, "plannedDay"], message: "Every static post and reel needs a day and Cairo publishing time for owner review." });
    }
    if (item.itemType === "reel" && item.onScreenEnglishText.trim().toUpperCase() !== "NONE") {
      ctx.addIssue({ code: "custom", path: ["items", index, "onScreenEnglishText"], message: "ELEVAY reels use no embedded text; set visual text to NONE." });
    }
  }
});
export type WeeklyAutomationPlanOutput = z.infer<typeof weeklyAutomationPlanSchema>;

export const weeklyAutomationPlanJsonSchema = {
  type: "object",
  properties: {
    weeklyTitle: { type: "string" },
    executiveSummary: { type: "string" },
    researchResults: { type: "array", items: { type: "object", properties: { title: { type: "string" }, summary: { type: "string" }, sourceUrl: { type: "string" }, relevance: { type: "string" } }, required: ["title", "summary", "sourceUrl", "relevance"], additionalProperties: false } },
    adAuditRecommendations: { type: "array", items: { type: "string" } },
    crmMetaComparisonNotes: { type: "array", items: { type: "string" } },
    items: { type: "array", items: { type: "object", properties: {
      itemType: { type: "string", enum: ["research_update", "static_post", "carousel", "reel", "image", "graphic", "ad_setup"] }, title: { type: "string" }, programKey: { type: ["string", "null"] }, objective: { type: "string" }, creativeDirection: { type: "string" }, scriptCopy: { type: "string" }, caption: { type: "string" }, cta: { type: "string" }, hashtags: { type: "array", items: { type: "string" } }, onScreenEnglishText: { type: "string" }, visualBrief: { type: "string" }, plannedDay: { anyOf: [{ type: "string", enum: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] }, { type: "null" }] }, plannedTime: { anyOf: [{ type: "string" }, { type: "null" }] }, approvedClaimIds: { type: "array", items: { type: "integer" } }, ownerConfirmedInternalClaimIds: { type: "array", items: { type: "integer" } }, assetFileNames: { type: "array", items: { type: "string" } }, adRecommendation: { type: "string" }
    }, required: ["itemType", "title", "programKey", "objective", "creativeDirection", "scriptCopy", "caption", "cta", "hashtags", "onScreenEnglishText", "visualBrief", "plannedDay", "plannedTime", "approvedClaimIds", "ownerConfirmedInternalClaimIds", "assetFileNames", "adRecommendation"], additionalProperties: false } },
    risksAndEvidenceGaps: { type: "array", items: { type: "string" } },
  },
  required: ["weeklyTitle", "executiveSummary", "researchResults", "adAuditRecommendations", "crmMetaComparisonNotes", "items", "risksAndEvidenceGaps"],
  additionalProperties: false,
} as const;

export function automationMonthKey(timestamp = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).format(new Date(timestamp)).slice(0, 7);
}

export function uniqueStable<T>(items: T[]): T[] { return Array.from(new Set(items)); }
