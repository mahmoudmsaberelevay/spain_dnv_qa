import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEEKLY_CONTENT_MIX,
  currentCairoWeekStart,
  enforceWeeklyMediaMinimum,
  findDisallowedWeeklyResultsData,
  isSaturdayDate,
  isSundayDate,
  isValidCairoClockTime,
  nextCairoPublishingSunday,
  plannedCairoPublishingSlot,
  WEEKLY_RESULTS_EXECUTION_BOUNDARY,
  weeklyResultsItemCanTransition,
} from "../shared/marketingWeeklyResults";
import { normalizeWeeklyProgramKey } from "../shared/marketingWeeklyProgramKey";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Weekly Results shared policy", () => {
  it("uses Cairo-time controls and validates Sunday-through-Saturday publishing periods", () => {
    expect(isValidCairoClockTime("08:00")).toBe(true);
    expect(isValidCairoClockTime("23:59")).toBe(true);
    expect(isValidCairoClockTime("24:00")).toBe(false);
    expect(isSaturdayDate("2026-10-03")).toBe(true);
    expect(isSaturdayDate("2026-09-29")).toBe(false);
    expect(isSundayDate("2026-10-04")).toBe(true);
    expect(isSundayDate("2026-10-03")).toBe(false);
    expect(DEFAULT_WEEKLY_CONTENT_MIX).toEqual({ research_update: 0, static_post: 4, carousel: 0, reel: 3, image: 0, graphic: 0, ad_setup: 0 });
    expect(enforceWeeklyMediaMinimum({ static_post: 1, reel: 0, carousel: 3 })).toEqual(DEFAULT_WEEKLY_CONTENT_MIX);
    expect(currentCairoWeekStart(new Date("2026-10-04T09:00:00.000Z"))).toBe("2026-10-04");
    expect(nextCairoPublishingSunday(new Date("2026-10-02T08:00:00.000Z"))).toBe("2026-10-04");
    expect(nextCairoPublishingSunday(new Date("2026-10-04T09:00:00.000Z"))).toBe("2026-10-11");
    expect(isSundayDate(nextCairoPublishingSunday(new Date("2026-10-03T21:05:00.000Z")))).toBe(true);
    expect(plannedCairoPublishingSlot("2026-10-04", "Monday", "17:30")).toBe("2026-10-05 17:30 Africa/Cairo");
    expect(plannedCairoPublishingSlot("2026-10-04", "Saturday", "20:00")).toBe("2026-10-10 20:00 Africa/Cairo");
    expect(plannedCairoPublishingSlot("2026-10-01", "Monday", "17:30")).toBeNull();
  });

  it("preserves individual-only review decisions and terminal stop behavior", () => {
    expect(weeklyResultsItemCanTransition("draft", "pending_individual_review")).toBe(true);
    expect(weeklyResultsItemCanTransition("pending_individual_review", "approved")).toBe(true);
    expect(weeklyResultsItemCanTransition("pending_individual_review", "changes_requested")).toBe(true);
    expect(weeklyResultsItemCanTransition("approved", "pending_individual_review")).toBe(false);
    expect(weeklyResultsItemCanTransition("stopped", "draft")).toBe(false);
  });

  it("blocks identity-bearing planning, feedback, and aggregate-performance notes", () => {
    expect(findDisallowedWeeklyResultsData("Prioritise Arabic-first educational reels for Spain DNV.")).toBeNull();
    expect(findDisallowedWeeklyResultsData("Contact a@example.com for this item.")).toBe("email address");
    expect(findDisallowedWeeklyResultsData("Call +20 100 123 4567.")).toBe("phone or contact number");
    expect(findDisallowedWeeklyResultsData("Review client code 26091.")).toBe("client identity reference");
  });
});

describe("Weekly Results CRM integration contract", () => {
  it("uses additive control-plane tables, never a provider execution path", () => {
    const migration = read("drizzle/0101_agentic_marketing_weekly_results.sql");
    const schema = read("drizzle/schema.ts");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_weekly_results_settings`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_weekly_results_plans`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_weekly_results_items`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_weekly_results_item_events`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_weekly_results_preference_memories`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_weekly_results_performance_snapshots`");
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|ALTER|RENAME)\b/i);
    expect(schema).toContain("marketingWeeklyResultsSettings");
    expect(schema).toContain("marketingWeeklyResultsItems");
  });

  it("requires controlled individual reviews and keeps external operations unavailable", () => {
    const router = read("server/marketingSystemRouter.ts");
    const policy = read("shared/marketingWeeklyResults.ts");
    expect(router).toContain("getWeeklyResultsWorkspace");
    expect(router).toContain("saveWeeklyResultsSetup");
    expect(router).toContain("createWeeklyResultsPlan");
    expect(router).toContain("submitWeeklyResultsItemForIndividualReview");
    expect(router).toContain("decideWeeklyResultsItem");
    expect(router).toContain("saveWeeklyResultsPerformance");
    expect(router).toContain("batchApprovalAvailable: false");
    expect(router).toContain("explicitIndividualDecision: true");
    expect(router).toContain("externalOperationsEnabled: false");
    expect(router).toContain("scheduleState: \"waiting_execution_release\"");
    expect(policy).toContain("cannot call an AI provider");
    expect(WEEKLY_RESULTS_EXECUTION_BOUNDARY).toContain("cannot call an AI provider");
  });

  it("allows individual copy-and-plan review before media exists but requires a linked system asset for final approval", () => {
    const router = read("server/marketingSystemRouter.ts");
    const page = read("client/src/pages/marketing/WeeklyResults.tsx");
    const submitSection = router.slice(router.indexOf("submitWeeklyResultsItemForIndividualReview"), router.indexOf("decideWeeklyResultsItem"));
    expect(submitSection).toContain("initialCopyAndPlanReview: true");
    expect(submitSection).not.toContain("validatePreviewFingerprint");
    expect(router).toContain("requireSystemGeneratedWeeklyMedia(item)");
    expect(page).toContain("Review plan & copy");
    expect(page).toContain("Await system media");
  });

  it("allows a no-cost editable draft version on demand without masquerading as AI regeneration", () => {
    const router = read("server/marketingSystemRouter.ts");
    const page = read("client/src/pages/marketing/WeeklyResults.tsx");
    expect(router).toContain("const version = (latest[0]?.version ?? 0) + 1");
    expect(router).toContain("previewUrl: null");
    expect(router).toContain('status: "draft", blockedReason: null, contentPacketId: null');
    expect(page).toContain("Copy as editable v{plan.version + 1} draft");
    expect(page).toContain("Start editable 3 reels + 4 static draft");
    expect(page).toContain('sourceClaimIds: ""');
    expect(page).toContain('plan.status !== "superseded" && isSundayDate(plan.periodStart)');
    expect(page).toContain("copyPlan.mutate({ periodStart: plan.periodStart, title: plan.title, items: editableVersionItems(plan).map(normalizeDraft) })");
    expect(page).toContain("Your unsaved form remains unchanged");
    expect(page).toContain('disabled={true} onClick={() => regenerateWeekMedia.mutate');
    expect(page).toContain("No AI media was generated and item approvals were reset");
    expect(router).toContain("onDemandRegeneration: {");
    expect(router).toContain("scheduleRequired: false as const");
    expect(router).toContain('costPolicy: "itemized_estimate_and_owner_review_no_fixed_caps"');
    expect(router).not.toContain("automation.readiness.budgetRemainingUsd < Number(automation.control.perRunReserveUsd)");
    expect(page).toContain("no fixed per-item or monthly cap");
    expect(router).toContain("quoteOwnerReviewedMediaItem: protectedProcedure");
    expect(router).toContain("reviewOwnerMediaItemCost: protectedProcedure");
    expect(router).toContain('Only Mahmoud, the CRM owner, can review and acknowledge a media generation cost quote.');
    expect(page).toContain("Record owner cost review — no generation");
    expect(page).toContain("See itemized cost estimate");
    expect(page).toContain("Full AI Regenerate is not available yet.");
    expect(page).toContain("workspace.data.onDemandRegeneration.blockers.map");
  });

  it("accepts readable programme names and only archives retired plans in the UI, preserving their audit data", () => {
    const router = read("server/marketingSystemRouter.ts");
    const page = read("client/src/pages/marketing/WeeklyResults.tsx");
    expect(normalizeWeeklyProgramKey("Spain DNV")).toBe("spain_dnv");
    expect(router).toContain("programKey: weeklyProgramKeyInput.optional()");
    expect(page).toContain("validDraftProgrammeKeys(draftItems) && createPlan.mutate");
    expect(page).toContain("validDraftProgrammeKeys([editDraft]) && updateItem.mutate");
    expect(page).toContain('return plan.source === "automated_multi_model"');
    expect(page).toContain("showRetiredPlans || !isRetiredGeneratedPlan(plan)");
    expect(page).toContain("Show archived history");
    expect(page).toContain("Linked previews, reviews and audit records are preserved.");
  });

  it("stores reviewable Design System assets and 30-day targets without enabling autopublish", () => {
    const migration = read("drizzle/0102_agentic_marketing_settings_production.sql");
    const schema = read("drizzle/schema.ts");
    const router = read("server/marketingSystemRouter.ts");
    const page = read("client/src/pages/marketing/WeeklyResults.tsx");
    expect(migration).toContain("marketing_design_system_assets");
    expect(migration).toContain("targetMaxAdSpend30dEgp");
    expect(schema).toContain("marketingDesignSystemAssets");
    expect(router).toContain("uploadDesignSystemAsset");
    expect(router).toContain("requireActiveDesignSystemForCreative");
    expect(router).toContain("requestedAutopublishThreshold");
    expect(router).toContain("externalOperationsEnabled: false");
    expect(page).toContain("Design System and official logo");
    expect(page).toContain("90% approval target is measured as a quality KPI only");
    expect(page).not.toContain("Automatically publish approved plans");
  });

  it("uses scoped high-contrast styling for readable white text in Agentic workspaces", () => {
    const styles = read("client/src/index.css");
    const workspace = read("client/src/pages/marketing/WeeklyResults.tsx");
    const dashboard = read("client/src/pages/marketing/MarketingDashboard.tsx");
    const hub = read("client/src/pages/marketing/AgenticMarketingHub.tsx");
    expect(styles).toContain(".agentic-readable");
    expect(styles).toContain("color: #ffffff");
    expect(styles).toContain("input::placeholder");
    expect(workspace).toContain('agentic-readable min-h-full bg-[#0c1320] text-white');
    expect(dashboard).toContain('agentic-readable min-h-full bg-[#0c1320] text-white');
    expect(hub).toContain('agentic-readable min-h-full bg-[#0c1320]');
  });

  it("keeps Weekly Results inside the protected central Agentic Marketing workspace", () => {
    const app = read("client/src/App.tsx");
    const dashboard = read("client/src/pages/marketing/MarketingDashboard.tsx");
    const desktopNav = read("client/src/components/DashboardLayout.tsx");
    const mobileNav = read("client/src/components/MobileLayout.tsx");
    const page = read("client/src/pages/marketing/WeeklyResults.tsx");
    expect(app).toContain('path="/marketing/weekly-results"');
    expect(dashboard).toContain('title: "AI Agentic Marketing System"');
    expect(desktopNav).toContain('label: "AI Agentic Marketing System", path: "/marketing/agentic-system"');
    expect(mobileNav).toContain('label: "AI Agentic Marketing System", path: "/marketing/agentic-system"');
    expect(desktopNav).not.toContain('label: "1. Setup"');
    expect(desktopNav).not.toContain('label: "2. Weekly Results"');
    expect(page).toContain("Provider execution paused");
    expect(page).toContain("Batch approval");
    expect(page).toContain("Not available by design");
  });
});
