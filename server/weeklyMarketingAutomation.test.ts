import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WEEKLY_AUTOMATION_MONTHLY_CAP_USD,
  WEEKLY_AUTOMATION_PER_RUN_RESERVE_USD,
  weeklyAutomationPlanJsonSchema,
  weeklyAutomationPlanSchema,
} from "../shared/marketingWeeklyAutomation";
import { cairoPeriodStart, isConfiguredCairoAutomationHour, normalizeGeneratedWeeklyItem, normalizeWeeklyAutomationPlanScheduleLabels } from "./weeklyMarketingAutomationService";

const root = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

const validPlan = {
  weeklyTitle: "خطة أسبوعية تجريبية",
  executiveSummary: "خطة مراجعة داخلية لإنتاج مواد عربية بعد تدقيق الاستراتيجية والمخاطر.",
  researchResults: [],
  adAuditRecommendations: [],
  crmMetaComparisonNotes: [],
  risksAndEvidenceGaps: ["لا تُستخدم أي معلومة برنامجية إلا عند ربطها بادعاء معتمد."],
  items: Array.from({ length: 7 }, (_, index) => ({
    itemType: index < 3 ? "reel" : "static_post", title: `فكرة تجريبية ${index + 1}`, programKey: "spain_dnv", objective: "تقديم محتوى تعليمي قابل للمراجعة", creativeDirection: "Premium editorial look", scriptCopy: "تعليمات داخلية", caption: "محتوى تعليمي", cta: "تواصل معنا", hashtags: ["#إليفاي"], onScreenEnglishText: index < 3 ? "NONE" : "SPAIN RESIDENCY", visualBrief: "Luxury editorial composition", plannedDay: "Monday", plannedTime: "10:00", approvedClaimIds: [], ownerConfirmedInternalClaimIds: [], assetFileNames: [], adRecommendation: "No campaign action; review only.",
  })),
};

describe("bounded weekly multi-model automation", () => {
  it("uses a Manus-compatible schema but still validates Cairo posting times locally", () => {
    expect(JSON.stringify(weeklyAutomationPlanJsonSchema)).not.toMatch(/"(?:pattern|format|minimum|maximum|minItems|maxItems|minLength|maxLength)"/);
    expect(weeklyAutomationPlanSchema.safeParse({ ...validPlan, items: validPlan.items.map((item, index) => index === 0 ? { ...item, plannedTime: "25:00" } : item) }).success).toBe(false);
  });
  it("adjusts failed pre-Manus reservations idempotently without claiming provider charges were zero", () => {
    const service = read("server/weeklyMarketingAutomationService.ts");
    expect(service).toContain("releaseFailedPreManusReservation(context.db, jobId)");
    expect(service).toContain("`mwa-release-${jobId}`");
    expect(service).toContain("Number(reservation.amountUsd) - 1");
    expect(service).toContain("not an invoice reconciliation");
  });
  it("requires Egyptian Arabic narration instructions with country and company exceptions", () => {
    const service = read("server/weeklyMarketingAutomationService.ts");
    expect(service).toContain("reel scripts must be natural Egyptian Arabic");
    expect(service).toContain("ELEVAY as the company name may be written in English");
    expect(service).toContain("validateElevayArabicVoiceOverScript(item.scriptCopy)");
  });
  it("keeps only spoken Egyptian narration on reels and removes non-spoken static scripts", () => {
    const reel = normalizeGeneratedWeeklyItem({ ...validPlan.items[0], itemType: "reel",
      scriptCopy: "Scene 1: Hook - لو بتشتغل أونلاين، خلينا نبدأ من Spain.\\nOutro: Brand signature on white background.",
    } as any);
    expect(reel.scriptCopy).toContain("Spain");
    expect(reel.scriptCopy).not.toMatch(/Scene|Outro|Hook/);
    const staticPost = normalizeGeneratedWeeklyItem({ ...validPlan.items[3], scriptCopy: "Scene 1: visual guidance", hashtags: ["#سفر", "#EnglishCampaign"] } as any);
    expect(staticPost.scriptCopy).toBe("");
    expect(staticPost.hashtags).toEqual(["#سفر"]);
  });

  it("normalizes supported Arabic schedule labels before strict output validation", () => {
    const output = normalizeWeeklyAutomationPlanScheduleLabels({ items: [{ plannedDay: "الأربعاء" }, { plannedDay: "Saturday" }] }) as { items: Array<{ plannedDay: string }> };
    expect(output.items.map(item => item.plannedDay)).toEqual(["Wednesday", "Saturday"]);
  });

  it("keeps the owner-selected USD 100/month and USD 20/run caps fixed", () => {
    expect(WEEKLY_AUTOMATION_MONTHLY_CAP_USD).toBe(100);
    expect(WEEKLY_AUTOMATION_PER_RUN_RESERVE_USD).toBe(20);
  });

  it("accepts only bounded review-plan output with an explicit per-item schema", () => {
    expect(weeklyAutomationPlanSchema.parse(validPlan).items).toHaveLength(7);
    expect(() => weeklyAutomationPlanSchema.parse({ ...validPlan, items: [] })).toThrow();
    expect(() => weeklyAutomationPlanSchema.parse({ ...validPlan, items: [{ ...validPlan.items[0], itemType: "publish_now" }] })).toThrow();
    expect(() => weeklyAutomationPlanSchema.parse({ ...validPlan, items: [{ ...validPlan.items[0], itemType: "static_post" }, ...validPlan.items.slice(1)] })).toThrow(/At least 3 reels/);
    expect(() => weeklyAutomationPlanSchema.parse({ ...validPlan, items: [...validPlan.items.slice(0, -1), { ...validPlan.items[6], itemType: "reel" }] })).toThrow(/At least 4 static posts/);
    expect(() => weeklyAutomationPlanSchema.parse({ ...validPlan, items: [{ ...validPlan.items[0], plannedTime: null }, ...validPlan.items.slice(1)] })).toThrow(/publishing time/);
    expect(() => weeklyAutomationPlanSchema.parse({ ...validPlan, items: [{ ...validPlan.items[0], onScreenEnglishText: "SUMMER" }, ...validPlan.items.slice(1)] })).toThrow(/no embedded text/);
  });

  it("derives the following Sunday Cairo period and starts only at the configured Saturday minute", () => {
    expect(cairoPeriodStart(new Date("2026-10-03T06:00:00.000Z"))).toBe("2026-10-04");
    expect(isConfiguredCairoAutomationHour({ prepareDayOfWeek: 6, prepareStartTime: "09:00" }, new Date("2026-10-03T06:00:00.000Z"))).toBe(true);
    expect(isConfiguredCairoAutomationHour({ prepareDayOfWeek: 6, prepareStartTime: "09:00" }, new Date("2026-10-03T06:01:00.000Z"))).toBe(false);
  });

  it("requires a signed raw-body callback, event idempotency and review-only output persistence", () => {
    const callback = read("server/weeklyMarketingAutomationWebhook.ts");
    const service = read("server/weeklyMarketingAutomationService.ts");
    const server = read("server/_core/index.ts");
    expect(callback).toContain("RSA-SHA256");
    expect(callback).toContain("x-webhook-signature");
    expect(callback).toContain("x-webhook-timestamp");
    expect(callback).toContain("Math.abs(Math.floor(Date.now() / 1000)");
    expect(callback).toContain("marketingProviderWebhookEvents");
    expect(server).toContain('app.post("/api/webhooks/marketing/manus", express.raw');
    expect(service).toContain('state: "completed_pending_review"');
    expect(service).toContain("requiresIndividualApproval: true");
    expect(service).toContain("No provider task was created");
  });

  it("registers one authenticated CRM heartbeat endpoint but never includes publication or Meta mutations", () => {
    const handler = read("server/scheduledWeeklyMarketingAutomationHandler.ts");
    const service = read("server/weeklyMarketingAutomationService.ts");
    expect(handler).toContain("sdk.authenticateRequest");
    expect(handler).toContain("cron_only");
    expect(handler).toContain('triggerType: "scheduled"');
    expect(service).toContain("https://api.manus.ai/v2/task.create");
    expect(service).not.toContain("graph.facebook.com");
    expect(service).not.toContain("api.facebook.com");
    expect(service).not.toContain("/act_");
    expect(service).not.toContain("/events");
  });

  it("uses owner-provided internal programme references as the planning default and blocks external research sources", () => {
    const service = read("server/weeklyMarketingAutomationService.ts");
    expect(service).toContain("marketingInternalProgrammeReferences");
    expect(service).toContain("ownerProvidedInternalReferences");
    expect(service).toContain("primarySource: \"owner_provided_internal_programme_references\"");
    expect(service).toContain("Do not retrieve, browse, cite, or use government or other external sources automatically.");
    expect(service).toContain('result.sourceUrl.startsWith("internal://")');
    expect(service).toContain("was blocked pending owner confirmation");
  });

  it("permits only source-current owner-confirmed internal claims in review-only draft output", () => {
    const service = read("server/weeklyMarketingAutomationService.ts");
    const schema = read("drizzle/schema.ts");
    expect(schema).toContain("marketingOwnerConfirmedInternalClaims");
    expect(service).toContain("ownerConfirmedInternalClaims");
    expect(service).toContain("ownerConfirmedInternalClaimIds");
    expect(service).toContain("internalClaimReviewOnly: true");
    expect(service).toContain("not official evidence, legal advice, or publication authority");
    expect(service).toContain("sourceDocumentHash, marketingInternalProgrammeReferences.documentHash");
  });

  it("sanitizes model-bound planning context and handles Drizzle insert-result tuples", () => {
    const service = read("server/weeklyMarketingAutomationService.ts");
    expect(service).toContain("sanitizePlanningSnapshotValue");
    expect(service).toContain("planningSnapshotPrivacyProblems");
    expect(service).toContain("const [insert] = await context.db.insert(marketingWeeklyAutomationJobs)");
    expect(service).toContain("const [result] = await db.insert(marketingWeeklyResultsPlans)");
    expect(service).toContain("const [inserted] = await db.insert(marketingWeeklyResultsItems)");
    expect(service).toContain("ISO calendar dates are structured schedule metadata");
    expect(service).toContain("Reserve against the Cairo month in which provider work is dispatched");
    expect(service).toContain("const periodKey = automationMonthKey(now)");
    expect(service).toContain("A scheduled heartbeat must never retry a failed job by itself");
    expect(service).toContain("manual-retry-released");
    expect(service).toContain("compactManusPlanningContext");
    expect(service).toContain("bounded Manus planning prompt exceeds the safe API message size");
    expect(service).toContain("manusTaskRequestError");
  });
});
