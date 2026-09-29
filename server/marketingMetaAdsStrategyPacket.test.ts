import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  META_ADS_STRATEGY_PROGRAM_CONFIRMATION_QUESTION_NUMBERS,
  META_ADS_STRATEGY_REQUIRED_PROGRAMS,
  META_ADS_STRATEGY_TOTAL_QUESTIONS,
} from "../shared/marketingMetaAdsStrategy";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Meta Ads Strategy Approval Packet", () => {
  it("requires explicit Spain DNV and Malta MPRP confirmation scope without replacing the company interview", () => {
    expect(META_ADS_STRATEGY_TOTAL_QUESTIONS).toBe(66);
    expect(META_ADS_STRATEGY_REQUIRED_PROGRAMS.map(program => program.key)).toEqual(["spain_dnv", "malta_mprp"]);
    expect(META_ADS_STRATEGY_PROGRAM_CONFIRMATION_QUESTION_NUMBERS).toContain(1);
    expect(META_ADS_STRATEGY_PROGRAM_CONFIRMATION_QUESTION_NUMBERS).toContain(62);
    expect(new Set(META_ADS_STRATEGY_PROGRAM_CONFIRMATION_QUESTION_NUMBERS).size).toBe(META_ADS_STRATEGY_PROGRAM_CONFIRMATION_QUESTION_NUMBERS.length);
  });

  it("blocks packet proposal unless the active Brand Book, company answers and both program confirmation sets are ready", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("getMetaStrategyPacketReadiness");
    expect(router).toContain("activeBrandBook");
    expect(router).toContain("missingCompanyQuestions");
    expect(router).toContain("unknownCompanyQuestions");
    expect(router).toContain("META_ADS_STRATEGY_PROGRAM_CONFIRMATION_QUESTION_NUMBERS");
    expect(router).toContain("Complete the company-wide 66-question interview before confirming programme-specific answers.");
    expect(router).toContain("proposeMetaAdsStrategyPacket");
    expect(router).toContain("The Strategy Approval Packet requires a current active Brand Book");
  });

  it("locks a deterministic source-answer and Brand Book snapshot, revalidates it at approval, and remains owner-only", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("sourceAnswerHash");
    expect(router).toContain("packetHash");
    expect(router).toContain("currentSourceHash !== packet.sourceAnswerHash");
    expect(router).toContain("approveMetaAdsStrategyPacket");
    expect(router).toContain("await requireMarketingSystemAdministrator(ctx.user);");
    expect(router).toContain("noCampaignActivation: true");
    expect(router).toContain("status: \"approved\"");
  });

  it("keeps the reviewed migration additive and excludes campaign, spend, payment, Meta credential and CRM tables", () => {
    const migration = read("drizzle/0096_agentic_marketing_meta_ads_strategy_packets.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_meta_ads_strategy_approval_packets`");
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|ALTER|RENAME)\b/i);
    expect(migration).not.toMatch(/CREATE TABLE\s+`?(campaign|ad_account|payment|lead|contract|fin)/i);
  });

  it("wires the protected owner workspace and visibly describes the no-execution boundary", () => {
    const app = read("client/src/App.tsx");
    const workspace = read("client/src/pages/marketing/WeeklyResults.tsx");
    const mobile = read("client/src/components/MobileLayout.tsx");
    const page = read("client/src/pages/marketing/MetaAdsStrategyPacket.tsx");
    expect(app).toContain('path="/marketing/meta-ads-strategy-packet"');
    expect(workspace).toContain('title: "Strategy Packet"');
    expect(workspace).toContain('href: "/marketing/meta-ads-strategy-packet"');
    expect(mobile).toContain('label: "AI Agentic Marketing System", path: "/marketing/agentic-system"');
    expect(page).toContain("Meta operations locked");
    expect(page).toContain("Approve planning packet only");
    expect(page).toContain("A separate Phase 5b proposal, Meta authorization, explicit budget/spend caps and measurement-pilot approval are still required.");
    expect(page).not.toContain("createCampaign");
  });
});
