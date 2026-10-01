import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

describe("bounded Manus review-media production", () => {
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
});
