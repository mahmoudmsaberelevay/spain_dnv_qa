// @ts-nocheck
import { describe, expect, it } from "vitest";
import E from "./engine";
import R from "./rules";
import { createMetaHub, cleanMetaAction } from "./meta";

process.env.META_PAGE_ACCESS_TOKEN = "page-token";
process.env.META_PAGE_ID = "111";
process.env.META_SYSTEM_USER_ACCESS_TOKEN = "ads-token";
process.env.META_AD_ACCOUNT_ID = "548667060148825";

function db() {
  const rows = new Map(), seen = new Set(), kv = new Map();
  let seq = 0;
  return async (sql, a = []) => {
    if (sql.startsWith("CREATE")) return [];
    if (sql.startsWith("INSERT INTO ec_meta_actions")) { const id = ++seq; rows.set(id, { id, status: a[1], ver: 0, doc: a[2] }); return { insertId: id }; }
    if (sql.startsWith("SELECT id, ver, doc FROM ec_meta_actions")) { const r = rows.get(Number(a[0])); return r ? [{ ...r }] : []; }
    if (sql.startsWith("UPDATE ec_meta_actions")) { const [doc, status, id, ver] = a; const r = rows.get(id); if (!r || r.ver !== ver) return { affectedRows: 0 }; Object.assign(r, { doc, status, ver: ver + 1 }); return { affectedRows: 1 }; }
    if (sql.startsWith("SELECT id, doc FROM ec_meta_actions WHERE status")) return [...rows.values()].filter((r) => r.status === a[0]).reverse();
    if (sql.startsWith("SELECT id, doc FROM ec_meta_actions")) return [...rows.values()].reverse();
    if (sql.startsWith("INSERT IGNORE INTO ec_meta_seen")) { if (seen.has(a[0])) return { affectedRows: 0 }; seen.add(a[0]); return { affectedRows: 1 }; }
    if (sql.includes("lead_integrations")) return [];
    if (sql.startsWith("SELECT value FROM ec_kv")) return kv.has("meta_inbox_sync") ? [{ value: kv.get("meta_inbox_sync") }] : [];
    if (sql.startsWith("INSERT INTO ec_kv")) { kv.set("meta_inbox_sync", a[0]); return {}; }
    throw new Error("unexpected sql: " + sql);
  };
}

function fakeMeta({ mtd = 100000, activeDaily = 3000, cpl = { "c1": 80, "c2": 150 } } = {}) {
  const posts = [];
  const fetcher = async (url, init) => {
    const u = new URL(url), path = u.pathname.split("/").slice(2).join("/"), body = init.body ? JSON.parse(init.body) : null;
    if (init.method === "POST") posts.push({ path, body, token: init.headers.Authorization });
    let out = {};
    if (init.method === "GET") {
      if (path === "act_548667060148825/insights" && u.searchParams.get("date_preset") === "this_month") out = { data: [{ spend: String(mtd) }] };
      else if (path === "act_548667060148825/insights") out = { data: Object.entries(cpl).map(([id, v]) => ({ campaign_id: id, spend: String(v * 10), actions: [{ action_type: "lead", value: "10" }] })) };
      else if (path === "act_548667060148825/campaigns") out = { data: [{ id: "c1", name: "Spain DNV", effective_status: "ACTIVE", daily_budget: String(activeDaily * 100) }, { id: "c2", name: "Greece", effective_status: "PAUSED", daily_budget: "200000" }] };
      else if (path === "act_548667060148825/adsets") out = { data: [] };
      else if (path === "111/published_posts") out = { data: [{ id: "111_p1", message: "Spain post", permalink_url: "https://fb/p1" }] };
      else if (path === "111_p1/comments") out = { data: [
        { id: "cm1", message: "كم تكلفة إقامة إسبانيا؟", from: { id: "u1", name: "Ahmed" }, created_time: new Date().toISOString() },
        { id: "cm2", message: "Buy followers cheap!!!", from: { id: "u2", name: "Spam" }, created_time: new Date().toISOString() },
        { id: "cm3", message: "Thanks!", from: { id: "111", name: "ELEVAY" }, created_time: new Date().toISOString() },
        { id: "cm4", message: "You took my money and nothing happened", from: { id: "u3", name: "Omar" }, created_time: new Date().toISOString() },
      ] };
      else if (path === "111") out = { instagram_business_account: { id: "ig1", username: "elevayglobal" } };
      else if (path === "ig1/media") out = { data: [] };
      else if (path === "111/conversations") out = { data: [] };
      else if (path === "igc1") out = { status_code: "FINISHED" };
    } else {
      if (path.endsWith("/campaigns")) out = { id: "newcamp" }; else if (path.endsWith("/adsets")) out = { id: "newset" }; else if (path.endsWith("/adcreatives")) out = { id: "newcr" }; else if (path.endsWith("/ads")) out = { id: "newad" };
      else if (path === "111/photos") out = { id: "ph1", post_id: "111_post9" }; else if (path === "ig1/media") out = { id: "igc1" }; else if (path === "ig1/media_publish") out = { id: "igpost1" };
      else out = { id: "r1", success: true };
    }
    return { ok: true, status: 200, json: async () => out };
  };
  return { fetcher, posts };
}

function hub({ autopilot = false, meta = {}, claude } = {}) {
  const state = E.emptyState();
  if (autopilot) state.settings.autopublish = { enabled: true, enabledAt: "x" };
  const f = fakeMeta(meta);
  const providers = { claude: claude || (async ({ prompt }) => ({ data: /Buy followers/.test(prompt) ? { category: "spam" } : /took my money/.test(prompt) ? { category: "complaint", reply: "", needs_human: true, reason: "Complaint" } : { category: "lead", reply: "شكرًا لاهتمامك! يسعدنا التواصل معك عبر رسالة خاصة لحجز استشارة مع ELEVAY.", needs_human: false } })) };
  const h = createMetaHub({ q: db(), mutate: async (_c, fn) => fn(state), loadState: async () => ({ state }), E, R, providers, fetcher: f.fetcher });
  return { h, state, posts: f.posts };
}
const owner = { email: "o@elevay.com", role: "owner" };

describe("Meta actions", () => {
  it("drafts replies to new comments, skips spam and the page's own comments, flags complaints", async () => {
    const { h } = hub();
    const r = await h.syncInbox();
    expect(r.queued).toBe(2);
    const actions = await h.list();
    const lead = actions.find((a) => a.target_id === "cm1"), complaint = actions.find((a) => a.target_id === "cm4");
    expect(lead).toMatchObject({ kind: "reply_comment", status: "pending", platform: "facebook" });
    expect(complaint.needs_human).toBe(true);
    expect((await h.syncInbox()).queued).toBe(0); // already seen
  });

  it("sends a reply only after the owner approves, with edits checked against the rules", async () => {
    const { h, posts } = hub();
    await h.syncInbox();
    const a = (await h.list()).find((x) => x.target_id === "cm1");
    await expect(h.approve(a.id, { email: "m", role: "marketer" })).rejects.toThrow(/owner/);
    await expect(h.approve(a.id, owner, { text: "احصل على تأشيرة مضمونة" })).rejects.toThrow(/rules/);
    await h.approve(a.id, owner, { text: "شكرًا لك! راسلنا لحجز استشارة مع ELEVAY." });
    expect(posts.find((p) => p.path === "cm1/comments").body.message).toMatch(/استشارة/);
  });

  it("under autopilot sends clean replies itself but leaves complaints for a person", async () => {
    const { h, posts } = hub({ autopilot: true });
    await h.syncInbox();
    const all = await h.list();
    expect(all.find((a) => a.target_id === "cm1").status).toBe("done");
    expect(all.find((a) => a.target_id === "cm4").status).toBe("pending");
    expect(posts.filter((p) => p.path.endsWith("/comments"))).toHaveLength(1);
  });

  it("refuses budget changes that would break the cap or raise a campaign above the max CPL", async () => {
    const { h } = hub({ meta: { mtd: 150000, activeDaily: 3000 } });
    const over = await h.enqueue(cleanMetaAction({ kind: "campaign_budget", target_id: "1", target_name: "x", daily_budget_egp: 9000 }, R), "team");
    // target "1" unknown → +9000/day on top of 3000/day for the rest of the month
    expect(over.status).toBe("blocked");
    const { h: h2 } = hub({ meta: { mtd: 10000, activeDaily: 1000, cpl: { c1: 150 } } });
    const cplHigh = await h2.enqueue({ kind: "campaign_budget", target_id: "c1", daily_budget_egp: 2000, preview: "x" }, "team");
    expect(cplHigh.status).toBe("blocked");
    expect(cplHigh.check.reason).toMatch(/CPL/);
    const pause = await h2.enqueue({ kind: "campaign_status", target_id: "c1", status_to: "PAUSED", preview: "x" }, "team");
    expect(pause.status).toBe("pending");
  });

  it("creates new lead campaigns paused, end to end", async () => {
    const { h, posts } = hub({ meta: { mtd: 10000, activeDaily: 1000 } });
    const a = await h.enqueue(cleanMetaAction({ kind: "create_campaign", campaign: { name: "EG | Malta PR", daily_budget_egp: 1500, form_id: "999", image_url: "https://cdn/x.png", message: "إقامة دائمة في Malta لعائلتك. تواصل مع ELEVAY.", headline: "Your family's European base" } }, R), "team");
    await h.approve(a.id, owner);
    const created = posts.filter((p) => /\/(campaigns|adsets|ads)$/.test(p.path));
    expect(created.every((p) => p.body.status === "PAUSED")).toBe(true);
    expect(posts.find((p) => p.path.endsWith("/adsets")).body.daily_budget).toBe(150000);
    expect((await h.list())[0].result).toMatchObject({ campaign_id: "newcamp", ad_id: "newad", status: "PAUSED" });
  });

  it("rejects campaign ad text that breaks the ELEVAY rules", () => {
    expect(() => cleanMetaAction({ kind: "create_campaign", campaign: { name: "x", daily_budget_egp: 500, form_id: "1", image_url: "https://a/b.png", message: "تأشيرة مضمونة" } }, R)).toThrow(/rules/);
  });

  it("publishes approved posts at their time on Facebook and Instagram when direct publishing is on", async () => {
    const { h, state, posts } = hub();
    state.settings.meta = { directPublish: true };
    state.items.push({ item_id: "2026-W41-01", type: "static", status: "approved", caption_ar: "نص", media: { image_url: "https://cdn/final.png" }, publish: { channel: "both", datetime_cairo: "2026-01-01T10:00" }, owner_comments: [] });
    const r = await h.publishDue();
    expect(r.published).toBe(1);
    expect(posts.map((p) => p.path)).toEqual(["111/photos", "ig1/media", "ig1/media_publish"]);
    expect(state.items[0]).toMatchObject({ status: "published", publish: { direct: { facebook: "111_post9", instagram: "igpost1", done: true } } });
  });
});

describe("contact details in message replies", () => {
  it("only allows the saved ELEVAY number in private replies", () => {
    const { h, state } = hub();
    expect(h.replyProblems("راسلنا على الواتساب +20 12 84981717", false, "")).toContain("Reply contains a phone number that is not the saved ELEVAY contact number.");
    expect(h.replyProblems("راسلنا على الواتساب +20 12 84981717", false, "+201284981717")).toEqual([]);
    expect(h.replyProblems("راسلنا على 01099999999", false, "+201284981717").length).toBe(1);
    expect(h.replyProblems("زور www.example.com", false, "+201284981717")).toContain("Reply contains a link or email address.");
    expect(h.replyProblems("الإقامة متاحة بشروط", false, "")).toEqual([]);
    expect(state).toBeTruthy();
  });
});
