import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_PILOT_ALLOWED_PERMISSION_IDS,
  CAMPAIGN_PILOT_MAX_MONTHLY_MEDIA_CAP_EGP,
  campaignPilotCanTransition,
  findDisallowedCampaignPilotData,
  hasOnlyAllowedCampaignPilotPermissions,
  validateCampaignPilotBudgetPlan,
} from "../shared/marketingCampaignPilot";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Campaign Pilot Proposal", () => {
  it("enforces a bounded proposal-only media-cap plan and reviewed permission vocabulary", () => {
    expect(CAMPAIGN_PILOT_MAX_MONTHLY_MEDIA_CAP_EGP).toBe(200_000);
    expect(validateCampaignPilotBudgetPlan({ monthlyMediaCapEgp: 100_000, dailyMediaCapEgp: 5_000, campaignCapEgp: 20_000 })).toBeNull();
    expect(validateCampaignPilotBudgetPlan({ monthlyMediaCapEgp: 200_001, dailyMediaCapEgp: 5_000, campaignCapEgp: 20_000 })).toContain("cannot exceed");
    expect(validateCampaignPilotBudgetPlan({ monthlyMediaCapEgp: 10_000, dailyMediaCapEgp: 10_001, campaignCapEgp: 2_000 })).toContain("daily");
    expect(hasOnlyAllowedCampaignPilotPermissions([CAMPAIGN_PILOT_ALLOWED_PERMISSION_IDS[0]])).toBe(true);
    expect(hasOnlyAllowedCampaignPilotPermissions(["ads_read", "unreviewed_scope"])).toBe(false);
  });

  it("keeps a constrained human state machine and rejects client or Lead identity data", () => {
    expect(campaignPilotCanTransition("proposed", "internally_approved")).toBe(true);
    expect(campaignPilotCanTransition("internally_approved", "stopped")).toBe(true);
    expect(campaignPilotCanTransition("stopped", "proposed")).toBe(false);
    expect(findDisallowedCampaignPilotData("Call +201234567890")).toBe("phone number");
    expect(findDisallowedCampaignPilotData("client code 26001")).toContain("identity");
  });

  it("requires an approved current Strategy Packet, active Brand Book, hashes and explicit owner transition", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("proposeCampaignPilot");
    expect(router).toContain("A Campaign Pilot Proposal requires an explicitly owner-approved Strategy Approval Packet");
    expect(router).toContain("Use the latest approved Strategy Approval Packet");
    expect(router).toContain("active Brand Book differs from the approved strategy packet");
    expect(router).toContain("proposalHash");
    expect(router).toContain("strategyPacketHash");
    expect(router).toContain("decideCampaignPilot");
    expect(router).toContain("strategy packet or active Brand Book has changed");
    expect(router).toContain("externalAuthorityGranted: false");
  });

  it("keeps the migration additive and excludes all external operating and CRM tables", () => {
    const migration = read("drizzle/0097_agentic_marketing_meta_campaign_pilot_proposals.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_meta_campaign_pilot_proposals`");
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|ALTER|RENAME)\b/i);
    expect(migration).not.toMatch(/CREATE TABLE\s+`?(campaign|ad_account|payment|lead|contract|fin|meta_credential)/i);
  });

  it("wires a protected workspace and visibly retains the no-execution boundary", () => {
    const app = read("client/src/App.tsx");
    const workspace = read("client/src/pages/marketing/WeeklyResults.tsx");
    const mobile = read("client/src/components/MobileLayout.tsx");
    const hub = read("client/src/pages/marketing/AgenticMarketingHub.tsx");
    const page = read("client/src/pages/marketing/CampaignPilotProposal.tsx");
    expect(app).toContain('path="/marketing/campaign-pilot-proposal"');
    expect(workspace).toContain('title: "Pilot Proposal"');
    expect(workspace).toContain('href: "/marketing/campaign-pilot-proposal"');
    expect(mobile).toContain('label: "AI Agentic Marketing System", path: "/marketing/agentic-system"');
    expect(hub).toContain("Everything is now organized inside two main sections");
    expect(page).toContain("External operations locked");
    expect(page).toContain("Create hash-locked internal proposal");
    expect(page).toContain("does not authorize a Meta sign-in");
    expect(page).not.toContain("createCampaign");
  });
});
