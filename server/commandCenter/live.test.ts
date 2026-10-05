// @ts-nocheck
import { describe, expect, it } from "vitest";
import { analyze, buildLiveReport, cairoMidnight, lastDays, leadsFromActions, outcomesBy, summarizeCrm } from "./live";

describe("live report helpers", () => {
  it("uses Cairo days and matches Meta's last 30 complete days", () => {
    expect(new Date(cairoMidnight("2026-10-05")).toISOString()).toBe("2026-10-04T21:00:00.000Z");
    expect(new Date(cairoMidnight("2026-01-15")).toISOString()).toBe("2026-01-14T22:00:00.000Z");
    const w = lastDays(30, Date.parse("2026-10-05T07:00:00Z"));
    expect(w).toMatchObject({ since: "2026-09-05", until: "2026-10-04" });
  });

  it("counts each Meta lead once even when several action types report it", () => {
    expect(leadsFromActions([{ action_type: "lead", value: "12" }, { action_type: "onsite_conversion.lead_grouped", value: "12" }, { action_type: "leadgen_grouped", value: "12" }])).toBe(12);
    expect(leadsFromActions([{ action_type: "onsite_conversion.lead_grouped", value: "7" }])).toBe(7);
    expect(leadsFromActions([])).toBe(0);
  });

  it("builds the CRM funnel from stage history, contracts and the 30-day cohort", () => {
    const r = summarizeCrm({
      created: [
        { id: 1, stage: "qualified", isMeta: 1 }, { id: 2, stage: "not_qualified_budget", isMeta: 1 },
        { id: 3, stage: "fresh", isMeta: 1 }, { id: 4, stage: "client", isMeta: 0 },
      ],
      moves: [
        { leadId: 1, isMeta: 1, description: 'Stage changed from "contacted" to "qualified" by Sara' },
        { leadId: 1, isMeta: 1, description: 'Stage changed from "contacted" to "qualified" by Sara' },
        { leadId: 2, isMeta: 1, description: 'Stage changed from "contacted" to "not_qualified_budget" by Omar' },
        { leadId: 4, isMeta: 0, description: 'Stage changed from "prospect" to "client" when Contract C-1 was created by Ali' },
        { leadId: 9, isMeta: 1, description: "Note added" },
      ],
      signed: [{ id: 4, isMeta: 0 }, { id: 7, isMeta: 1 }],
    });
    expect(r.meta).toMatchObject({ leads: 3, qualified: 1, unqualified: 1, clients: 1, unqualifiedReasons: { budget: 1 } });
    expect(r.all).toMatchObject({ leads: 4, qualified: 1, unqualified: 1, clients: 2 });
    expect(r.meta.cohort).toMatchObject({ qualifiedOrBetter: 1, unqualified: 1, open: 1 });
  });

  it("turns 6 months of results into plan suggestions inside the cap", () => {
    const camp = (id, spend, leads) => ({ campaignId: id, campaign: id, month: "2026-09", spend, leads });
    const meta = { monthly: { total: [{ month: "2026-09", spend: 60000, leads: 700 }], campaigns: [camp("good", 20000, 300), camp("mid", 20000, 250), camp("costly", 20000, 150)] } };
    const rows = [];
    const add = (c, n, stage) => { for (let i = 0; i < n; i++) rows.push({ metaCampaignId: c, stage, isMeta: 1 }); };
    add("good", 60, "qualified"); add("good", 240, "fresh"); add("mid", 20, "qualified"); add("mid", 230, "fresh"); add("costly", 10, "client"); add("costly", 140, "fresh");
    const a = analyze({ meta, crm6: { byMonth: [], byCampaign: outcomesBy(rows, (l) => l.metaCampaignId), byProgram: [], unqualifiedReasons: {} }, months: ["2026-09"], settings: { maxCplEgp: 100, monthlyAdCapEgp: 200000 } });
    expect(a.recommendations.find((r) => r.campaignId === "costly").type).toBe("reduce");
    expect(a.recommendations.find((r) => r.campaignId === "good").type).toBe("scale");
    const total = a.budgetSplit.reduce((s, b) => s + b.monthlyEgp, 0);
    expect(total).toBeLessThanOrEqual(180000);
    expect(a.budgetSplit.map((b) => b.campaignId)).not.toContain("costly");
  });
});

describe("buildLiveReport", () => {
  it("only issues GET requests to Meta and reports missing pieces without failing", async () => {
    process.env.META_SYSTEM_USER_ACCESS_TOKEN = "t";
    process.env.META_AD_ACCOUNT_ID = "548667060148825";
    process.env.META_PAGE_ACCESS_TOKEN = "p";
    process.env.META_PAGE_ID = "123";
    const methods = new Set();
    const fetcher = async (url, init) => {
      methods.add(init.method);
      const u = new URL(url);
      const path = u.pathname.split("/").slice(2).join("/");
      let body = { data: [] };
      if (path === "act_548667060148825") body = { name: "ELEVAY", currency: "EGP", timezone_name: "Africa/Cairo" };
      else if (path.endsWith("/insights") && path.startsWith("act_") && !u.searchParams.get("level") && !u.searchParams.get("time_increment")) body = { data: [{ spend: "1000", impressions: "5000", reach: "3000", clicks: "100", actions: [{ action_type: "lead", value: "10" }] }] };
      else if (path === "123") body = { name: "ELEVAY", fan_count: 5000, followers_count: 5200 };
      else if (path === "123/insights") {
        const m = u.searchParams.get("metric");
        body = m === "page_media_view" ? { data: [{ values: [{ value: 40, end_time: "2026-09-06" }, { value: 60, end_time: "2026-09-07" }] }] }
          : m === "page_daily_follows_unique" ? { error: { message: "invalid metric" } } : m === "page_fan_adds_unique" ? { data: [{ values: [{ value: 3 }, { value: 4 }] }] } : { data: [] };
        if (body.error) return { ok: false, status: 400, json: async () => body };
      }
      return { ok: true, status: 200, json: async () => body };
    };
    const q = async (sql) => (sql.includes("FROM leads l WHERE l.isMetaTestLead = 0 AND COALESCE") ? [{ id: 1, stage: "qualified", isMeta: 1, ts: Date.parse("2026-09-20"), metaCampaignId: "c1" }] : []);
    const r = await buildLiveReport({ q, fetcher, settings: { maxCplEgp: 100, monthlyAdCapEgp: 200000 }, now: Date.parse("2026-10-05T07:00:00Z") });
    expect([...methods]).toEqual(["GET"]);
    expect(r.ads.total).toMatchObject({ spend: 1000, leads: 10, cpl: 100 });
    expect(r.page.views).toMatchObject({ metric: "page_media_view", total: 100 });
    expect(r.page.newLikes).toMatchObject({ metric: "page_fan_adds_unique", total: 7 });
    expect(r.crm.meta.leads).toBe(1);
    expect(r.analysis.byMonth).toHaveLength(6);
    expect(r.errors).toEqual({});
  });
});
