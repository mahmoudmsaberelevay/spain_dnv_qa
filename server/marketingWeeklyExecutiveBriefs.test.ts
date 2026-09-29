import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findDisallowedWeeklyExecutiveBriefData,
  isMondayPeriodStart,
  statusForWeeklyExecutiveBriefDecision,
  weeklyExecutiveBriefCanTransition,
  weeklyExecutiveBriefKey,
} from "../shared/marketingExecutiveBriefs";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Weekly Executive Brief policy", () => {
  it("accepts valid Monday review periods and produces stable versioned identifiers", () => {
    expect(isMondayPeriodStart("2026-09-28")).toBe(true);
    expect(isMondayPeriodStart("2026-09-29")).toBe(false);
    expect(isMondayPeriodStart("2026-02-30")).toBe(false);
    expect(weeklyExecutiveBriefKey("2026-09-28", 2)).toBe("meb-20260928-v2");
  });

  it("permits only manual planning decisions and makes stop terminal", () => {
    expect(statusForWeeklyExecutiveBriefDecision("acknowledge_blocked")).toBe("acknowledged");
    expect(statusForWeeklyExecutiveBriefDecision("request_evidence")).toBe("evidence_requested");
    expect(statusForWeeklyExecutiveBriefDecision("hold_planning")).toBe("held");
    expect(statusForWeeklyExecutiveBriefDecision("stop")).toBe("stopped");
    expect(weeklyExecutiveBriefCanTransition("captured", "held")).toBe(true);
    expect(weeklyExecutiveBriefCanTransition("stopped", "acknowledged")).toBe(false);
  });

  it("blocks contact and identity data from aggregate-only notes", () => {
    expect(findDisallowedWeeklyExecutiveBriefData("Check monitoring freshness before planning.")).toBeNull();
    expect(findDisallowedWeeklyExecutiveBriefData("Contact a@example.com before planning.")).toBe("email address");
    expect(findDisallowedWeeklyExecutiveBriefData("Call +20 100 123 4567 before planning.")).toBe("phone or contact number");
    expect(findDisallowedWeeklyExecutiveBriefData("Review client code 26091.")).toBe("client or Lead identity reference");
  });
});

describe("Weekly Executive Brief CRM integration contract", () => {
  it("captures server-computed aggregates and keeps capture and decisions owner-only", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("getPilotReadinessExecutiveData");
    expect(router).toContain("captureWeeklyExecutiveBrief");
    expect(router).toContain("decideWeeklyExecutiveBrief");
    expect(router).toContain("await requireOwner(ctx.user);");
    expect(router).toContain("snapshot = await getPilotReadinessExecutiveData()");
    expect(router).toContain("externalOperationsEnabled: false");
    expect(router).toContain("findDisallowedWeeklyExecutiveBriefData");
    expect(router).toContain("marketing_weekly_executive_brief_decision");
  });

  it("uses additive control-plane tables and exposes protected CRM navigation only", () => {
    const migration = read("drizzle/0098_agentic_marketing_weekly_executive_briefs.sql");
    const schema = read("drizzle/schema.ts");
    const app = read("client/src/App.tsx");
    const dashboard = read("client/src/pages/marketing/MarketingDashboard.tsx");
    const hub = read("client/src/pages/marketing/AgenticMarketingHub.tsx");
    const page = read("client/src/pages/marketing/WeeklyExecutiveBriefs.tsx");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_weekly_executive_briefs`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_weekly_executive_brief_events`");
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|ALTER|RENAME)\b/i);
    expect(schema).toContain("marketingWeeklyExecutiveBriefs");
    expect(schema).toContain("marketingWeeklyExecutiveBriefEvents");
    expect(app).toContain('path="/marketing/weekly-executive-briefs"');
    expect(dashboard).toContain("Weekly Executive Brief & Decision Log");
    expect(hub).toContain("Weekly Executive Brief & Decision Log");
    expect(page).toContain("No schedule, email, message, campaign, spend, publication, provider call, CAPI event, or CRM mutation");
    expect(page).not.toContain("fullName");
    expect(page).not.toContain("passport");
  });
});
