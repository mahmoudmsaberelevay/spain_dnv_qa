// @ts-nocheck
import { describe, expect, it } from "vitest";
import E from "./engine";
import R from "./rules";
import { createOrchestrator, extractJson, nextItemId } from "./ai";

const CAPTION = `هل تفكر في مستقبل عائلتك في أوروبا؟

تقدم برامج الإقامة الأوروبية خيارات متعددة للعائلات المصرية والعربية التي تبحث عن الاستقرار وجودة الحياة والتعليم المتميز لأبنائها. في ELEVAY نرافقك منذ عام 1998 بخبرة واضحة وخطوات منظمة، بداية من دراسة ملفك وحتى استكمال جميع المتطلبات بدقة واحترافية.

نساعدك على فهم الشروط الحقيقية لكل برنامج، ومقارنة البدائل المتاحة وفق أهدافك وميزانيتك، مع شفافية كاملة في كل مرحلة. اختيار الإقامة المناسبة قرار مهم يستحق استشارة متخصصة ورؤية بعيدة المدى لعائلتك ومستقبلك المهني.

تخضع جميع الطلبات لموافقة الجهات المختصة وتختلف النتائج حسب الظروف الفردية لكل متقدم.

تواصل مع ELEVAY اليوم واحجز استشارتك الخاصة لتبدأ رحلتك بثقة.`;

function memoryDb() {
  const rows = new Map(), kv = new Map();
  let seq = 0;
  const q = async (sql, args = []) => {
    if (sql.startsWith("CREATE")) return [];
    if (sql.startsWith("INSERT INTO ec_ai_runs")) { const id = ++seq; rows.set(id, { id, status: args[1], ver: 0, doc: args[2] }); return { insertId: id }; }
    if (sql.startsWith("SELECT id, ver, doc")) { const r = rows.get(Number(args[0])); return r ? [{ ...r }] : []; }
    if (sql.startsWith("UPDATE ec_ai_runs")) { const [doc, status, id, ver] = args; const r = rows.get(id); if (!r || r.ver !== ver) return { affectedRows: 0 }; Object.assign(r, { doc, status, ver: ver + 1 }); return { affectedRows: 1 }; }
    if (sql.startsWith("INSERT IGNORE INTO ec_kv")) { if (kv.has(args[0])) return { affectedRows: 0 }; kv.set(args[0], args[1]); return { affectedRows: 1 }; }
    if (sql.startsWith("SELECT id, doc")) return [...rows.values()].sort((a, b) => b.id - a.id).slice(0, args[0]);
    if (sql.startsWith("SELECT id, status, doc")) return [...rows.values()].filter((r) => ["waiting", "queued", "running"].includes(r.status));
    throw new Error("unexpected sql " + sql);
  };
  return q;
}

function setup(claudeAnswers, { autopilot = false } = {}) {
  const state = E.emptyState();
  if (autopilot) state.settings.autopublish = { enabled: true, enabledAt: "2026-11-20T00:00:00Z", enabledBy: "autopilot", disabledReason: null };
  const calls = { claude: [], openai: 0, hfSubmit: 0, hfPoll: 0 };
  let hfDone = false;
  const providers = {
    claude: async ({ prompt, images }) => { calls.claude.push({ prompt, images }); const next = claudeAnswers.shift(); const data = typeof next === "function" ? next(prompt) : next; return { text: JSON.stringify(data), data }; },
    openaiImage: async ({ purpose }) => { calls.openai++; return { url: `https://cdn.example/${purpose}-${calls.openai}.png`, sha256: "a".repeat(64), width: purpose === "static_post" ? 1024 : 864, height: purpose === "static_post" ? 1024 : 1536, measuredCostUsd: 0.1 }; },
    brandStatic: async (url) => url.replace(".png", "-logo.png"),
    higgsfieldSubmit: async ({ idempotencyKey }) => { calls.hfSubmit++; return { requestId: `00000000-0000-0000-0000-00000000000${calls.hfSubmit}`, statusUrl: `https://api.higgsfield.ai/requests/x/status`, key: idempotencyKey }; },
    higgsfieldStatus: async (c) => { calls.hfPoll++; return hfDone ? { state: "completed", videoUrl: `https://cdn.hf/${c.requestId}.mp4` } : { state: "in_progress", videoUrl: null }; },
    test: async () => ({}),
  };
  const mutate = async (_ctx, fn) => fn(state);
  const o = createOrchestrator({ q: memoryDb(), mutate, loadState: async () => ({ state }), liveReport: async () => ({ window: {}, ads: { total: { spend: 1000 } } }), providers, E, R });
  return { o, state, calls, finishClips: () => (hfDone = true) };
}
const settle = async (o, id, busy = ["running", "queued"]) => { for (let i = 0; i < 200; i++) { const r = await o.get(id); if (!busy.includes(r.status)) return r; await new Promise((res) => setTimeout(res, 5)); } throw new Error("run did not settle"); };
const owner = { email: "o@elevay.com", role: "owner" }, marketer = { email: "m@elevay.com", role: "marketer" };

const STATIC_BRIEF = { topic: "Family residency", pillar: "Family Security", program: "Portugal D7", headline_en: "Plan your family's next chapter", caption_ar: CAPTION, image_prompt: "An Arab family of four on a sunlit Lisbon terrace, elegant linen clothing and leather shoes. No logo, no passports, no flags, no other text." };
const scene = (i) => ({ keyframe_prompt: `Arab couple in Lisbon, scene ${i}, elegant clothing, no text, no logo`, motion_prompt: "Slow dolly forward", spoken_text_ar: "عيلتك تستاهل حياة هادية في Portugal مع ELEVAY" });

describe("AI Studio orchestrator", () => {
  it("static: Claude brief → check → OpenAI (no approval) → Claude QC → weekly plan for the owner", async () => {
    const { o, state, calls } = setup([STATIC_BRIEF, { pass: true, issues: [] }]);
    const run = await o.create({ kind: "static", request: "Family post for Portugal D7", user: marketer });
    const r = await settle(o, run.id);
    expect(calls.openai).toBe(1);
    expect(r.status).toBe("done");
    expect(calls.claude[1].images).toEqual(["https://cdn.example/static_post-1-logo.png"]);
    const item = state.items.find((i) => i.item_id === r.artifacts.item_id);
    expect(item).toMatchObject({ type: "static", status: "pending_approval", media: { image_url: "https://cdn.example/static_post-1-logo.png" } });
    expect(calls.claude[0].prompt).toMatch(/PROGRAM FACT RULE/);
    expect(r.messages.some((m) => m.from === "claude") && r.messages.some((m) => m.to === "openai")).toBe(true);
  });

  it("asks Claude to fix a blocked brief once", async () => {
    const bad = { ...STATIC_BRIEF, caption_ar: CAPTION.replace("الإقامة المناسبة", "التأشيرة المناسبة") };
    const { o, calls } = setup([bad, { caption_ar: CAPTION }, { pass: true }]);
    const run = await o.create({ kind: "static", request: "x", user: marketer });
    const r = await settle(o, run.id);
    expect(calls.claude).toHaveLength(3); // brief, fix, visual QC
    expect(calls.claude[1].prompt).toMatch(/blocking checks/);
    expect(r.artifacts.brief.caption_ar).not.toMatch(/تأشير/);
  });

  it("reel: Higgsfield needs the owner, waits for clips, then lands in the plan", async () => {
    const { o, state, calls, finishClips } = setup([{ topic: "Lisbon", pillar: "Family Security", program: "Portugal D7", caption_ar: CAPTION, scenes: [1, 2, 3, 4].map(scene) }, { pass: true }]);
    const run = await o.create({ kind: "reel", request: "Reel for retirees", user: marketer });
    let r = await settle(o, run.id);
    expect(calls.openai).toBe(4);
    expect(r.steps[4]).toMatchObject({ provider: "higgsfield", status: "needs_approval", gate: "owner" });
    await expect(o.approve(run.id, 5, marketer)).rejects.toThrow(/owner/);
    await o.approve(run.id, 5, owner);
    r = await settle(o, run.id);
    expect(r.status).toBe("waiting");
    expect(calls.hfSubmit).toBe(4);
    finishClips();
    await o.tick();
    r = await settle(o, run.id, ["running", "queued", "waiting"]);
    expect(r.status).toBe("done");
    const item = state.items.find((i) => i.item_id === r.artifacts.item_id);
    expect(item.media.clips).toHaveLength(4);
    expect(item.reel.storyboard[0].spoken_text_ar).toMatch(/Portugal/);
  });

  it("routes a free request and hands Meta work to Manus with owner approval", async () => {
    const { o, state } = setup([
      { route: "manus", why: "Needs Meta", request: "Pause the Greece campaign" },
      { instructions: "Pause campaign Greece Golden Visa in Ads Manager.", needs_owner_approval: true, why: "Changes Meta" },
      { summary: "Paused." },
    ]);
    const run = await o.create({ kind: "request", request: "pause greece", user: marketer });
    let r = await settle(o, run.id);
    expect(r.kind).toBe("manus");
    expect(r.status).toBe("awaiting_approval");
    await o.approve(run.id, r.steps.find((s) => s.action === "job").n, owner);
    r = await settle(o, run.id);
    expect(r.status).toBe("waiting");
    const job = state.jobs.find((j) => j.id === r.artifacts.manus_job);
    expect(job.payload.request).toMatch(/Pause campaign/);
    E.setJobStatus(state, job.id, "done", { result: { note: "Paused at 12:00" } }, "manus");
    await o.tick();
    r = await settle(o, run.id, ["running", "queued", "waiting"]);
    expect(r.status).toBe("done");
    expect(r.artifacts.answer).toBe("Paused.");
  });
});

describe("Autopilot", () => {
  it("runs Higgsfield and approves finished statics itself once the 6-week gate is reached", async () => {
    const { o, state, calls } = setup([STATIC_BRIEF, { pass: true }], { autopilot: true });
    const run = await o.create({ kind: "static", request: "Spain DNV for remote professionals", user: { email: "autopilot", role: "owner" } });
    const r = await settle(o, run.id);
    expect(r.status).toBe("done");
    const item = state.items.find((i) => i.item_id === r.artifacts.item_id);
    expect(item).toMatchObject({ status: "approved", auto_approved: true, first_pass: null, presented_at: null });
    expect(state.jobs.some((j) => j.type === "schedule_post" && j.payload.item_id === item.item_id && j.payload.autopublish === true)).toBe(true);
    expect(calls.claude[0].prompt).toMatch(/€35,000/); // Spain approved facts
  });

  it("Manus requests run Higgsfield without waiting, within the weekly reel limit", async () => {
    const { o, calls, state } = setup([{ topic: "Malta", pillar: "Family Security", program: "Malta Permanent Residence", caption_ar: CAPTION, scenes: [1, 2, 3, 4].map(scene) }, { pass: true }]);
    state.settings.studio = { reelLimitPerWeek: 1 };
    const run = await o.create({ kind: "reel", request: "Malta family reel", options: { auto: true }, user: { email: "manus", role: "marketer" } });
    let r = await settle(o, run.id);
    expect(r.status).toBe("waiting");
    expect(r.steps[4].approved_by).toMatch(/Manus/);
    expect(calls.claude[0].prompt).toMatch(/USD 100,000/);
  });

  it("plans the week: 4 statics + 3 reels started as items 01–07", async () => {
    const posts = [..."SSSSRRR"].map((t, i) => ({ type: t === "S" ? "static" : "reel", date: "2026-10-1" + (i % 7), time: "20:00", program: "Spain Digital Nomad Residence", brief: "Remote professionals in Madrid" }));
    const { o } = setup([{ rationale: "Spain converts best", posts }]);
    const run = await o.startWeekly("2026-W42", owner);
    const r = await settle(o, run.id);
    expect(r.status).toBe("done");
    expect(r.artifacts.children).toHaveLength(7);
    const kids = await Promise.all(r.artifacts.children.map((id) => o.get(id)));
    expect(kids.map((k) => k.kind)).toEqual(["static", "static", "static", "static", "reel", "reel", "reel"]);
    expect(kids[0].options.item_id).toBe("2026-W42-01");
    await expect(o.startWeekly("2026-W42", owner)).rejects.toThrow(/already/);
  });

  it("switches autopilot on the first time the gate is reached and plans on Saturday morning", async () => {
    const { o, state } = setup([]);
    for (let w = 1; w <= 6; w++) for (let i = 1; i <= 7; i++) state.items.push({ item_id: `2026-W3${w}-0${i}`, presented_at: "x", first_pass: true, owner_comments: [] });
    await o.autopilot(Date.parse("2026-10-07T08:00:00Z")); // Wednesday
    expect(state.settings.autopublish.enabled).toBe(true);
    const before = (await o.list()).length;
    await o.autopilot(Date.parse("2026-10-10T07:30:00Z")); // Saturday 10:30 Cairo
    const runs = await o.list();
    expect(runs.length).toBe(before + 1);
    expect(runs[0]).toMatchObject({ kind: "weekly_plan", options: { week: "2026-W42" } });
  });
});

describe("AI Studio helpers", () => {
  it("parses JSON wrapped in prose or fences", () => {
    expect(extractJson('Sure:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here {"b":[1,2]} done')).toEqual({ b: [1, 2] });
  });
  it("numbers studio items after the 7 planned posts", () => {
    expect(nextItemId([{ item_id: "2026-W41-01" }, { item_id: "2026-W41-07" }], "2026-W41")).toBe("2026-W41-08");
    expect(nextItemId([{ item_id: "2026-W41-09" }], "2026-W41")).toBe("2026-W41-10");
  });
});

describe("provider adapters", () => {
  it("calls Claude's Messages API with the ELEVAY rules, images and JSON parsing", async () => {
    const { makeProviders } = await import("./ai");
    process.env.ANTHROPIC_API_KEY = "k";
    let sent;
    const p = makeProviders(async (url, init) => { sent = { url, init: { ...init, body: JSON.parse(init.body) } }; return { ok: true, status: 200, json: async () => ({ model: "m", content: [{ type: "text", text: '{"pass":true}' }] }) }; });
    const r = await p.claude({ system: "S", prompt: "P", images: ["https://cdn/x.png"] });
    expect(sent.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent.init.headers["x-api-key"]).toBe("k");
    expect(sent.init.body.messages[0].content[0]).toEqual({ type: "image", source: { type: "url", url: "https://cdn/x.png" } });
    expect(r.data).toEqual({ pass: true });
  });
});
