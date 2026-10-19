// @ts-nocheck
import { afterEach, describe, expect, it } from "vitest";
import { cairoParts } from "./ai";
import { createWeeklyOperations, weeklyReadiness } from "./weeklyOperations";

const saved = {
  openai: process.env.OPENAI_API_KEY,
  claude: process.env.ANTHROPIC_API_KEY,
  higgs: process.env.HF_API_KEY,
};

afterEach(() => {
  process.env.OPENAI_API_KEY = saved.openai;
  process.env.ANTHROPIC_API_KEY = saved.claude;
  process.env.HF_API_KEY = saved.higgs;
});

function harness({ workers = 2 } = {}) {
  const records = new Map();
  const state = { settings: { credits: {} }, items: [], audit: [] };
  const notifications = [];
  const fetcher = async (url) => {
    const text = String(url);
    if (text.includes("higgsfield.ai/requests/")) return new Response("{}", { status: 404 });
    return new Response("{}", { status: 200 });
  };
  const deps = {
    q: async (sql, args = []) => {
      if (/SELECT value FROM ec_kv/.test(sql)) return records.has(args[0]) ? [{ value: records.get(args[0]) }] : [];
      if (/INSERT INTO ec_kv/.test(sql)) { records.set(args[0], args[1]); return { affectedRows: 1 }; }
      return [];
    },
    loadState: async () => ({ state }),
    mutate: async (_ctx, fn) => fn(state),
    studio: async () => ({ startWeekly: async (week) => ({ id: 70001, week }), watchdog: async () => ({ checked: 0, recovered: 0, failed: 0 }) }),
    metaHub: async () => ({ checkConnection: async () => ({ key: { ok: true }, page: { ok: true }, insights: { ok: true }, comments: { ok: true }, messages: { ok: true }, instagram: { ok: true }, ads: { ok: true }, forms: { ok: true } }) }),
    renderBridge: async () => ({ status: async () => ({ requiredRendererVersion: 3, queue: {}, workers: Array.from({ length: workers }, (_, n) => ({ id: `mac-${n + 1}`, rendererVersion: 3, outdated: false, lastSeen: "2026-10-21T06:00:00.000Z" })) }) }),
    creditsReport: async () => ({ platforms: [{ id: "elevenlabs", source: "live", remaining: 1000 }, { id: "openai_api", source: "needs_key" }, { id: "claude_api", source: "needs_key" }, { id: "higgsfield_api", source: "estimate" }] }),
    notifyOwner: async (notice) => { notifications.push(notice); return true; },
    fetcher,
  };
  return { deps, state, notifications, records };
}

describe("weekly Command Center operations", () => {
  it("starts Wednesday production only after redacted providers, Meta, and two eligible workers are ready", async () => {
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.ANTHROPIC_API_KEY = "test-claude";
    process.env.HF_API_KEY = "test-higgsfield";
    const h = harness({ workers: 2 });
    const report = await weeklyReadiness(h.deps);
    expect(report.ok).toBe(true);
    expect(report.workers.eligible).toBe(2);
    expect(JSON.stringify(report)).not.toContain("test-openai");

    const now = Date.parse("2026-10-21T06:00:00.000Z");
    expect(cairoParts(now)).toMatchObject({ weekday: "Wed", hour: 9 });
    const controller = createWeeklyOperations({ ...h.deps, now: () => now });
    const result = await controller.run();
    expect(result.events).toContain("preflight_ready");
    expect(result.events).toContain("plan_start_checked");
    expect(h.state.settings.weeklyOperations).toMatchObject({ status: "production" });
  });

  it("continues independent weekly production and reports a degraded render pool when one Mac is ineligible", async () => {
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.ANTHROPIC_API_KEY = "test-claude";
    process.env.HF_API_KEY = "test-higgsfield";
    const h = harness({ workers: 1 });
    const now = Date.parse("2026-10-21T06:00:00.000Z");
    const controller = createWeeklyOperations({ ...h.deps, now: () => now });
    const result = await controller.run();
    expect(result.events).toContain("preflight_ready");
    expect(result.events).toContain("plan_start_checked");
    expect(h.state.settings.weeklyOperations.latestPreflight.ok).toBe(true);
    expect(h.state.settings.weeklyOperations.latestPreflight.blockers.join(" ")).toMatch(/Render workers/);
    expect(h.notifications[0].title).toMatch(/limited dependencies/i);
  });

  it("does not start without the required plan-writing providers", async () => {
    process.env.OPENAI_API_KEY = "";
    process.env.ANTHROPIC_API_KEY = "test-claude";
    process.env.HF_API_KEY = "test-higgsfield";
    const h = harness({ workers: 2 });
    const controller = createWeeklyOperations(h.deps);
    const result = await controller.startNow("2026-W44");
    expect(result).toMatchObject({ ok: false, blocked: true });
    expect(h.notifications[0].title).toMatch(/paused/i);
  });
});
