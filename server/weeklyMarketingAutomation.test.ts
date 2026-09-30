import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WEEKLY_AUTOMATION_MONTHLY_CAP_USD,
  WEEKLY_AUTOMATION_PER_RUN_RESERVE_USD,
  weeklyAutomationPlanSchema,
} from "../shared/marketingWeeklyAutomation";
import { cairoPeriodStart, isConfiguredCairoAutomationHour } from "./weeklyMarketingAutomationService";

const root = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

const validPlan = {
  weeklyTitle: "خطة أسبوعية تجريبية",
  executiveSummary: "خطة مراجعة داخلية لإنتاج مواد عربية بعد تدقيق الاستراتيجية والمخاطر.",
  researchResults: [],
  adAuditRecommendations: [],
  crmMetaComparisonNotes: [],
  risksAndEvidenceGaps: ["لا تُستخدم أي معلومة برنامجية إلا عند ربطها بادعاء معتمد."],
  items: [{
    itemType: "reel", title: "فكرة ريل تجريبية", programKey: "spain_dnv", objective: "تقديم محتوى تعليمي قابل للمراجعة", creativeDirection: "Premium editorial look", scriptCopy: "اكتشف خيارات الإقامة مع Elevay.", caption: "محتوى تعليمي من Elevay", cta: "تواصل معنا", hashtags: ["#إليفاي"], onScreenEnglishText: "SPAIN DNV", visualBrief: "Luxury editorial composition", plannedDay: "Monday", plannedTime: "10:00", approvedClaimIds: [], assetFileNames: [], adRecommendation: "No campaign action; review only.",
  }],
};

describe("bounded weekly multi-model automation", () => {
  it("keeps the owner-selected USD 100/month and USD 20/run caps fixed", () => {
    expect(WEEKLY_AUTOMATION_MONTHLY_CAP_USD).toBe(100);
    expect(WEEKLY_AUTOMATION_PER_RUN_RESERVE_USD).toBe(20);
  });

  it("accepts only bounded review-plan output with an explicit per-item schema", () => {
    expect(weeklyAutomationPlanSchema.parse(validPlan).items).toHaveLength(1);
    expect(() => weeklyAutomationPlanSchema.parse({ ...validPlan, items: [] })).toThrow();
    expect(() => weeklyAutomationPlanSchema.parse({ ...validPlan, items: [{ ...validPlan.items[0], itemType: "publish_now" }] })).toThrow();
  });

  it("derives the Saturday Cairo period correctly and only starts at the configured Cairo minute", () => {
    expect(cairoPeriodStart(new Date("2026-09-30T10:00:00.000Z"))).toMatch(/^2026-09-2[6-7]$/);
    expect(isConfiguredCairoAutomationHour({ prepareDayOfWeek: 6, prepareStartTime: "08:00" }, new Date("2026-09-26T05:00:00.000Z"))).toBe(true);
    expect(isConfiguredCairoAutomationHour({ prepareDayOfWeek: 6, prepareStartTime: "08:00" }, new Date("2026-09-26T05:01:00.000Z"))).toBe(false);
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
});
