import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync(new URL("./marketingSystemRouter.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/marketing/WeeklyResults.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0111_elevay_one_click_weekly_runs.sql", import.meta.url), "utf8");

describe("one-click weekly production integration", () => {
  it("exposes a protected planner entry point and durable run status query", () => {
    expect(router).toContain("getOneClickWeeklyRun");
    expect(router).toContain("startOneClickWeeklyProduction");
    expect(router).toContain("planOneClickSundayToSaturdayWeek");
    expect(router).toContain("marketingOneClickWeeklyRuns");
    expect(router).toContain("marketingOneClickWeeklyRunItems");
  });

  it("persists a seven-item review-only pack and never authorizes publication", () => {
    expect(router).toContain('itemCount: 7');
    expect(router).toContain('mediaDispatchStarted: false');
    expect(router).toContain('publishingEnabled: false');
    expect(router).toContain('state: "planning_complete_media_locked"');
    expect(router).toContain('progressPercent: 0');
    expect(router).toContain('state: "completed_pending_review"');
    expect(migration).toContain("marketing_one_click_weekly_runs");
    expect(migration).toContain("marketing_one_click_weekly_run_items");
  });

  it("renders one-click generation and percentage progress in Media Production", () => {
    expect(page).toContain("Generate weekly pack");
    expect(page).toContain("getOneClickWeeklyRun.useQuery");
    expect(page).toContain("startOneClickWeeklyProduction.useMutation");
    expect(page).toContain("oneClickRun.data.progressPercent");
    expect(page).toContain("3 reels");
    expect(page).toContain("4 static");
  });
});
