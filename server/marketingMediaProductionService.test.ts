import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

describe("bounded Manus review-media production", () => {
  it("uses one normalized Manus credential with non-secret dispatch diagnostics", () => {
    const service = read("server/marketingMediaProductionService.ts");
    const env = read("server/_core/env.ts");
    expect(service).toContain("function manusCredentialForMedia()");
    expect(service).toContain("keyFingerprint: credential.fingerprint");
    expect(service).toContain('"x-manus-api-key": credential.value');
    expect(env).toContain('manusApiKey: (process.env.MANUS_API_KEY ?? "").trim()');
  });

  it("uses separate owner-approved USD caps and has no Meta or publishing path", () => {
    const service = read("server/marketingMediaProductionService.ts");
    const migration = read("drizzle/0108_bounded_manus_media_production_controls.sql");
    expect(service).toContain("MONTHLY_CAP_USD = 100");
    expect(service).toContain("PER_ITEM_CAP_USD = 1.5");
    expect(service).toContain("https://api.manus.ai/v2/task.create");
    expect(service).toContain("review-only ELEVAY marketing visual");
    expect(service).toContain("do not browse or cite external/government sources");
    expect(service).not.toContain("graph.facebook.com");
    expect(service).not.toContain("/events");
    expect(migration).toContain("marketing_media_production_controls");
    expect(migration).toContain("marketing_media_production_jobs");
  });

  it("requires exact generated attachment linkage and composes Arabic narration for reels", () => {
    const service = read("server/marketingMediaProductionService.ts");
    const webhook = read("server/weeklyMarketingAutomationWebhook.ts");
    expect(service).toContain("marketingGeneratedMediaAssets");
    expect(service).toContain("generateElevayArabicVoiceOver(item.scriptCopy)");
    expect(service).toContain("composeApprovedReelForReview");
    expect(service).toContain("origin: \"system_generated\"");
    expect(service).toContain("filename?: unknown");
    expect(service).toContain("typeof file.filename === \"string\"");
    expect(webhook).toContain("applyMarketingMediaManusWebhook");
  });

  it("hides provider tasks, recovers stopped output, and generates English-only visual text automatically", () => {
    const service = read("server/marketingMediaProductionService.ts");
    const workspace = read("client/src/pages/marketing/WeeklyResults.tsx");
    expect(service).toContain("enable_visible_in_task_list: false");
    expect(service).toContain("hide_in_task_list: true");
    expect(service).toContain("reconcileWaitingMarketingMediaJobs");
    expect(service).toContain("repairMissingSystemMediaPreviewLinks");
    expect(service).toContain("onScreenEnglishTextSource: \"system_generated\"");
    expect(workspace).toContain("System-generated preview — linked to this exact item");
    expect(workspace).toContain("English text inside the visual");
    expect(workspace).toContain("You do not type this field.");
  });

  it("replaces a preview from owner feedback without retaining an older media version", () => {
    const service = read("server/marketingMediaProductionService.ts");
    const router = read("server/marketingSystemRouter.ts");
    const workspace = read("client/src/pages/marketing/WeeklyResults.tsx");
    const decisionSection = router.slice(router.indexOf("decideWeeklyResultsItem"), router.indexOf("composeApprovedReelNarrationForReview"));
    expect(service).toContain("regenerateSystemMediaFromFeedback");
    expect(service).toContain("latestRevisionInstruction");
    expect(service).toContain("Mandatory owner revision instruction");
    expect(service).toContain("tx.delete(marketingGeneratedMediaAssets)");
    expect(decisionSection).toContain("regenerateSystemMediaFromFeedback");
    expect(decisionSection).not.toContain("getApprovedContentClaims");
    expect(workspace).toContain("Request changes & regenerate");
    expect(workspace).toContain("No claim-reference IDs are required.");
  });

  it("injects the active owner design standard into every system media task", () => {
    const service = read("server/marketingMediaProductionService.ts");
    const standard = read("shared/elevayAgenticDesignStandard.ts");
    expect(service).toContain("ELEVAY_AGENTIC_DESIGN_STANDARD");
    expect(standard).toContain("at least 90% of designed elements");
    expect(standard).toContain("exact official ELEVAY logo");
    expect(standard).toContain("centered on pure white #FFFFFF");
    expect(standard).toContain("Arab/Middle Eastern");
    expect(standard).toContain("sentence case");
    expect(standard).toContain("Egyptian Arabic by default");
  });
});
