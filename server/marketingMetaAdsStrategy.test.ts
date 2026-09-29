import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateNextMetaAdsStrategyQuestion,
  isMetaAdsStrategyComplete,
  META_ADS_STRATEGY_QUESTIONS,
  META_ADS_STRATEGY_SECTIONS,
  META_ADS_STRATEGY_TOTAL_QUESTIONS,
} from "../shared/marketingMetaAdsStrategy";

const project = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Meta Ads Strategy Intake contract", () => {
  it("preserves the blueprint's exact 66-question order and section range", () => {
    expect(META_ADS_STRATEGY_TOTAL_QUESTIONS).toBe(66);
    expect(META_ADS_STRATEGY_QUESTIONS).toHaveLength(66);
    expect(META_ADS_STRATEGY_QUESTIONS.map(question => question.number)).toEqual(Array.from({ length: 66 }, (_, index) => index + 1));
    expect(META_ADS_STRATEGY_SECTIONS[0]).toMatchObject({ key: "business_goals", start: 1, end: 7 });
    expect(META_ADS_STRATEGY_SECTIONS.at(-1)).toMatchObject({ key: "reporting", start: 62, end: 66 });
    expect(META_ADS_STRATEGY_QUESTIONS[0]?.prompt).toBe("Which programs do you want to sell in the next 90 days? Rank them by priority.");
    expect(META_ADS_STRATEGY_QUESTIONS[65]?.prompt).toBe("How will sales report lead quality back to marketing, and who checks the accuracy of reasons?");
  });

  it("requires every question and resolves the first unanswered question deterministically", () => {
    expect(calculateNextMetaAdsStrategyQuestion([])).toBe(1);
    expect(calculateNextMetaAdsStrategyQuestion([1, 2, 4])).toBe(3);
    expect(calculateNextMetaAdsStrategyQuestion(Array.from({ length: 66 }, (_, index) => index + 1))).toBeNull();
    expect(isMetaAdsStrategyComplete(Array.from({ length: 66 }, (_, index) => index + 1))).toBe(true);
    expect(isMetaAdsStrategyComplete(Array.from({ length: 65 }, (_, index) => index + 1))).toBe(false);
  });

  it("keeps the intake owner-only, one-question-at-a-time, and turns unknown answers into deadline-bound gaps", () => {
    const router = project("server/marketingSystemRouter.ts");
    const page = project("client/src/pages/marketing/MetaAdsStrategyIntake.tsx");
    expect(router).toContain("getCurrentMetaAdsStrategy: protectedProcedure");
    expect(router).toContain("startOrResumeMetaAdsStrategy: protectedProcedure");
    expect(router).toContain("saveMetaAdsStrategyAnswer: protectedProcedure.input(metaStrategyAnswerInput)");
    expect(router).toContain("resetMetaAdsStrategy: protectedProcedure.input");
    expect(router).toContain("await requireMarketingSystemAdministrator(ctx.user);");
    expect(router).toContain("An unknown answer must have an owner follow-up deadline.");
    expect(router).toContain("marketing_meta_ads_strategy_answer");
    expect(page).toContain("Question {shownNumber} of {session.totalQuestions}");
    expect(page).toContain("Unknown — track a gap");
    expect(page).toContain("Campaigns locked");
    expect(page).toContain("Reset all");
    expect(page).not.toContain("createCampaign");
    expect(page).not.toContain("manageCampaign");
  });

  it("keeps the reviewed migration additive and separate from campaign or CRM records", () => {
    const migration = project("drizzle/0095_agentic_marketing_meta_ads_strategy_intake.sql");
    expect(migration).toContain("CREATE TABLE `marketing_meta_ads_strategy_sessions`");
    expect(migration).toContain("CREATE TABLE `marketing_meta_ads_strategy_answers`");
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|ALTER|RENAME)\b/i);
    expect(migration).not.toMatch(/CREATE TABLE\s+`?(campaign|ad_account|payment|lead)/i);
  });
});
