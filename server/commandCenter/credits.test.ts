import { describe, it, expect, beforeEach } from "vitest";
import { creditsReport, clearCreditsCache, cleanManualCredit } from "./credits";

const res = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
function fakeFetch(calls) {
  return async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers || {} });
    if (url.includes("manus.ai")) return res({ ok: true, data: { total_credits: 3200, periodic_credits: 3000, addon_credits: 200, current_period_end: 1793000000 } });
    if (url.includes("elevenlabs")) return res({ character_count: 40000, character_limit: 100000, tier: "creator", next_character_count_reset_unix: 1793000000 });
    if (url.includes("cost_report")) return res({ data: [{ results: [{ amount: "1250.5" }, { amount: "49.5" }] }], has_more: false });
    if (url.includes("organization/costs")) return res({ data: [{ results: [{ amount: { value: 7.25 } }] }, { results: [{ amount: { value: 2.75 } }] }], has_more: false });
    return res({}, 404);
  };
}
const q = async () => [{ doc: JSON.stringify({ created_at: new Date().toISOString(), artifacts: { clips: [{ url: "a", completed_at: new Date().toISOString() }, { url: "b", completed_at: new Date().toISOString() }] } }) }];

describe("Credits tab", () => {
  beforeEach(() => { clearCreditsCache(); for (const k of ["MANUS_API_KEY", "ELEVENLABS_API_KEY", "ANTHROPIC_ADMIN_KEY", "OPENAI_ADMIN_KEY"]) delete process.env[k]; });

  it("shows which key each live source needs when none are set", async () => {
    const r = await creditsReport({ q, fetcher: fakeFetch([]), refresh: true });
    const by = Object.fromEntries(r.platforms.map((p) => [p.id, p]));
    expect(by.manus.need).toBe("MANUS_API_KEY");
    expect(by.claude_api.need).toBe("ANTHROPIC_ADMIN_KEY");
    expect(by.openai_api.need).toBe("OPENAI_ADMIN_KEY");
    expect(r.platforms).toHaveLength(8);
  });

  it("reads live balances and subtracts live spend from entered balances", async () => {
    Object.assign(process.env, { MANUS_API_KEY: "m", ELEVENLABS_API_KEY: "e", ANTHROPIC_ADMIN_KEY: "a", OPENAI_ADMIN_KEY: "o" });
    const calls = [];
    const manual = { claude_api: { balance: 50, updated_at: new Date(Date.now() - 86400000).toISOString() }, openai_api: { balance: 30, updated_at: new Date(Date.now() - 86400000).toISOString() }, higgsfield_api: { balance: 1000, credits_per_clip: 40, updated_at: new Date(Date.now() - 86400000).toISOString() } };
    const r = await creditsReport({ q, manual, fetcher: fakeFetch(calls), refresh: true });
    const by = Object.fromEntries(r.platforms.map((p) => [p.id, p]));
    expect(by.manus).toMatchObject({ source: "live", remaining: 3200 });
    expect(by.elevenlabs).toMatchObject({ remaining: 60000, limit: 100000 });
    expect(by.claude_api).toMatchObject({ spent_this_month: 13, remaining: 37 }); // 1300 cents = $13
    expect(by.openai_api).toMatchObject({ spent_this_month: 10, remaining: 20 });
    expect(by.higgsfield_api.remaining).toBe(920); // 1000 − 2 clips × 40
    expect(calls.find((c) => c.url.includes("manus")).headers["x-manus-api-key"]).toBe("m");
    expect(JSON.stringify(r)).not.toMatch(/"m"|"a"|"o"/); // keys never returned
  });

  it("cleans owner input", () => {
    expect(cleanManualCredit({ balance: "12.5", renews_on: "bad", plan: "Pro" })).toMatchObject({ balance: 12.5, renews_on: "", plan: "Pro" });
    expect(cleanManualCredit({ balance: "" }).balance).toBe(null);
  });
});
