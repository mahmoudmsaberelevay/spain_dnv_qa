// @ts-nocheck
import { describe, expect, it } from "vitest";
import E from "./engine";
import R from "./rules";
import { createOrchestrator, extractJson, PIPELINES, parseManusVoiceoverLines } from "./ai";

const CAPTION = `هل تفكر في مستقبل عائلتك في أوروبا؟

تقدم برامج الإقامة الأوروبية خيارات متعددة للعائلات المصرية والعربية التي تبحث عن الاستقرار وجودة الحياة والتعليم المتميز لأبنائها. في ELEVAY نرافقك منذ عام 1998 بخبرة واضحة وخطوات منظمة، بداية من دراسة ملفك وحتى استكمال جميع المتطلبات بدقة واحترافية.

نساعدك على فهم الشروط الحقيقية لكل برنامج، ومقارنة البدائل المتاحة وفق أهدافك وميزانيتك، مع شفافية كاملة في كل مرحلة. اختيار الإقامة المناسبة قرار مهم يستحق استشارة متخصصة ورؤية بعيدة المدى لعائلتك ومستقبلك المهني.

تخضع جميع الطلبات لموافقة الجهات المختصة وتختلف النتائج حسب الظروف الفردية لكل متقدم.

تواصل مع ELEVAY اليوم واحجز استشارتك الخاصة لتبدأ رحلتك بثقة.`;

const owner = { email: "owner@elevay.com", role: "owner" };
const marketer = { email: "marketer@elevay.com", role: "marketer" };
const sceneScripts = [
  "لو قرار عيلتك مؤجل، خلينا نبص على Portugal بهدوء ونرتب أول خطوة صح.",
  "بنراجع اختياراتك علشان تعرف أنهي خطوة مناسبة ليك ولعيلتك من غير ضغط.",
  "مع Elevay بنرتب التفاصيل بوضوح ونشرح الصورة كاملة علشان قرارك يبقى أهدى.",
  "تواصل مع Elevay دلوقتي واحجز استشارتك وخد خطوتك الجاية برؤية أوضح.",
];
const scene = (i) => ({
  keyframe_prompt: `Arab couple in Lisbon, scene ${i}, modern elegant clothing and polished leather shoes, no text, no logo, no passports, no flags`,
  motion_prompt: "Slow cinematic dolly forward with restrained natural movement",
  spoken_text_ar: sceneScripts[i - 1],
});
const STORYBOARD = { topic: "Lisbon", pillar: "Family Security", program: "Portugal D7", caption_ar: CAPTION, scenes: [1, 2, 3, 4].map(scene) };
const PASS = { pass: true, issues: [], scene_failures: [], non_scene_failures: [], verdict: "All supplied evidence complies." };
const failScene = (n, fix = "Replace the visible passport with a clean side table and keep the same people and wardrobe.") => ({ pass: false, issues: [`Scene ${n} has a visible visual compliance issue.`], scene_failures: [{ scene: n, issues: ["visible compliance issue"], fix }], non_scene_failures: [], verdict: "Repair only the named scene." });

function memoryDb() {
  const rows = new Map(), kv = new Map(), renderJobs = new Map();
  let seq = 0;
  const q = async (sql, args = []) => {
    if (sql.startsWith("CREATE")) return [];
    if (sql.startsWith("INSERT INTO ec_ai_runs")) { const id = ++seq; rows.set(id, { id, status: args[1], ver: 0, doc: args[2] }); return { insertId: id }; }
    if (sql.startsWith("SELECT id, ver, doc")) { const r = rows.get(Number(args[0])); return r ? [{ ...r }] : []; }
    if (sql.startsWith("UPDATE ec_ai_runs")) { const [doc, status, id, ver] = args; const r = rows.get(id); if (!r || r.ver !== ver) return { affectedRows: 0 }; Object.assign(r, { doc, status, ver: ver + 1 }); return { affectedRows: 1 }; }
    if (sql.startsWith("INSERT IGNORE INTO ec_kv")) { if (kv.has(args[0])) return { affectedRows: 0 }; kv.set(args[0], args[1]); return { affectedRows: 1 }; }
    if (sql.startsWith("SELECT status, doc FROM ec_render_jobs")) { const r = renderJobs.get(String(args[0])); return r ? [{ ...r, doc: JSON.stringify(r.doc) }] : []; }
    if (sql.includes("FROM ec_ai_runs WHERE status='failed'")) return [...rows.values()].filter((r) => r.status === "failed").sort((a, b) => a.id - b.id);
    if (sql.startsWith("SELECT id, doc")) return [...rows.values()].sort((a, b) => b.id - a.id).slice(0, args[0]);
    if (sql.startsWith("SELECT id, status, doc")) return [...rows.values()].filter((r) => ["waiting", "queued", "running"].includes(r.status));
    throw new Error("unexpected sql " + sql);
  };
  q.rows = rows;
  q.renderJobs = renderJobs;
  return q;
}

function setup(claudeAnswers, { autoClips = false, notify = true, voiceError = null, externalRender = false } = {}) {
  const state = E.emptyState();
  // Unit fixtures drive one explicit run. The live scheduler covers calendar
  // autoplan separately; it must not consume mocked Claude responses here.
  state.settings.studio = { autoClips, autoplan: false, autonews: false };
  const calls = { claude: [], openaiText: [], openai: [], hfSubmit: [], hfPoll: 0, voice: 0, render: [], notify: [] };
  let clipsDone = false, failedRequestId = null;
  const providers = {
    claude: async ({ prompt, images }) => {
      calls.claude.push({ prompt, images });
      // The keyframe check before Higgsfield passes by default so each test's answers stay focused on its subject.
      if (/reel keyframes \(no text or logo/.test(prompt) && !(typeof claudeAnswers[0] === "object" && claudeAnswers[0]?.per_image)) { calls.keyframeQc = (calls.keyframeQc || 0) + 1; const data = { pass: true, issues: [], per_image: [1, 2, 3, 4].map((index) => ({ index, pass: true })) }; return { text: JSON.stringify(data), data }; }
      const next = claudeAnswers.shift();
      const data = typeof next === "function" ? next(prompt) : next;
      return { text: JSON.stringify(data), data };
    },
    openaiText: async ({ prompt }) => {
      calls.openaiText.push({ prompt });
      const next = claudeAnswers.shift();
      const data = typeof next === "function" ? next(prompt) : next;
      return { text: JSON.stringify(data), data, model: "gpt-5-mini" };
    },
    openaiImage: async ({ prompt, purpose }) => {
      const n = calls.openai.length + 1;
      calls.openai.push({ prompt, purpose });
      return { url: `https://cdn.example/${purpose}-${n}.png`, sha256: String(n).padStart(64, "a"), width: 864, height: 1536, measuredCostUsd: 0.1 };
    },
    openaiPortrait: async () => { throw new Error("not used by reel tests"); },
    brandStatic: async (url) => url,
    checkEgyptianScript: async (text) => text,
    voiceScene: async (text) => { calls.voice++; if (voiceError) throw new Error(voiceError); return { url: `https://cdn.example/voice-${calls.voice}.mp3`, sha256: "v".repeat(64), script: text, voiceId: "nc8XQG8lRYRZDnjvKW0H", model: "eleven_v4", languageCode: "ar", dialect: "Egyptian Arabic" }; },
    higgsfieldSubmit: async ({ idempotencyKey }) => {
      const n = calls.hfSubmit.length + 1;
      const requestId = `request-${n}`;
      calls.hfSubmit.push({ idempotencyKey, requestId });
      return { requestId, statusUrl: `https://api.higgsfield.example/${requestId}` };
    },
    higgsfieldStatus: async (clip) => {
      calls.hfPoll++;
      if (clip.requestId === failedRequestId) return { state: "failed", videoUrl: null };
      return clipsDone ? { state: "completed", videoUrl: `https://cdn.example/${clip.requestId}.mp4` } : { state: "in_progress", videoUrl: null };
    },
    composeReelStep: async (input) => {
      calls.render.push(input);
      if (externalRender) {
        const id = "render-1", stored = q.renderJobs.get(id);
        if (stored?.status === "failed") throw new Error("External render failed: " + stored.error);
        if (!stored || stored.status !== "done") return { pending: true, jobId: id, parts: {} };
        return { parts: {}, final: stored.doc.final };
      }
      return { parts: {}, final: { url: "https://cdn.example/final.mp4", seconds: 23.3, sha256: "f".repeat(64), music: false, mode: "cuts", peakRssBytes: 240_000_000, renderJobId: "render-1", qcFrames: Array.from({ length: 75 }, (_, i) => ({ url: `https://cdn.example/qc-${i}.jpg`, label: `Scene ${Math.min(4, Math.floor(i / 19) + 1)} frames ${i * 8 + 1}-${i * 8 + 8}` })) } };
    },
    videoFrames: async (_url, _times, evidence) => evidence.map((x) => ({ base64: "eA==", mediaType: "image/jpeg", label: x.label })),
    test: async () => ({}),
  };
  const q = memoryDb();
  const mutate = async (_ctx, fn) => fn(state);
  const o = createOrchestrator({ q, mutate, loadState: async () => ({ state }), liveReport: async () => ({ window: {}, ads: { total: { spend: 1000 } } }), providers, E, R, notifyFailure: notify ? async (payload) => calls.notify.push(payload) : undefined });
  const completeRender = () => q.renderJobs.set("render-1", { status: "done", doc: { final: { url: "https://cdn.example/final.mp4", seconds: 23, sha256: "f".repeat(64), music: false, mode: "cuts", renderJobId: "render-1", qcFrames: Array.from({ length: 75 }, (_, i) => ({ url: `https://cdn.example/qc-${i}.jpg`, label: `Scene ${Math.min(4, Math.floor(i / 19) + 1)} frames ${i * 8 + 1}-${i * 8 + 8}` })) } } });
  return { o, q, state, calls, finishClips: () => { clipsDone = true; }, setClipsDone: (value) => { clipsDone = value; }, failRequest: (id) => { failedRequestId = id; }, completeRender };
}

/** Answers every pending AI-council review job the way Manus would, then lets the run continue until it settles. */
const MANUS_REVIEW = { score_1_10: 8, assessment: "Solid draft.", agree_with_openai: ["Stronger hook"], disagree_with_openai: [], suggestions: ["Lead with the family benefit"] };
async function throughCouncil(ctx, o, id, review = MANUS_REVIEW) {
  let r = await settle(o, id);
  for (let i = 0; i < 60 && !["done", "failed", "needs_review"].includes(r.status); i++) {
    for (const j of ctx.state.jobs) if (j.payload?.purpose === "council_review" && j.status === "pending") { j.status = "done"; j.result = { message: "```json\n" + JSON.stringify(review) + "\n```" }; }
    await o.tick();
    r = await settle(o, id);
    if (r.status === "waiting" && !ctx.state.jobs.some((j) => j.payload?.purpose === "council_review" && j.status === "pending")) break;
  }
  return r;
}
const OPENAI_REVIEW = { score_1_10: 7, assessment: "Good, could be sharper.", issues: ["Hook is soft"], suggestions: ["Stronger hook"] };

const settle = async (o, id, busy = ["running", "queued"]) => {
  for (let i = 0; i < 300; i++) {
    const r = await o.get(id);
    if (!busy.includes(r.status)) return r;
    await new Promise((resolve) => setTimeout(resolve, 3));
  }
  throw new Error("run did not settle");
};

async function approveAndFinish({ o, finishClips }, runId) {
  let r = await settle(o, runId);
  const clips = r.steps.find((s) => s.action === "clips");
  // Higgsfield clips are now automatically submitted; preserve compatibility
  // with legacy fixtures that still carry an old approval gate.
  if (clips.status === "needs_approval") {
    await o.approve(runId, clips.n, owner);
    r = await settle(o, runId);
  }
  expect(r.steps.find((s) => s.action === "clips").status).toBe("waiting");
  expect(r.status).toBe("waiting");
  finishClips();
  await o.tick();
  return settle(o, runId, ["running", "queued", "waiting"]);
}

describe("seven-step ELEVAY reel flow", () => {
  it("starts every OpenAI voice-over writing prompt with the owner's strong Egyptian Arabic line", async () => {
    const ctx = setup([STORYBOARD]);
    const run = await ctx.o.create({ kind: "reel", request: "Strong voice test", user: marketer });
    await settle(ctx.o, run.id, ["running", "queued"]);
    expect(ctx.calls.openaiText[0].prompt.startsWith("i need a strong text for voice over to be strongly spoken at arabic egyptian language")).toBe(true);
  });

  it("re-runs a Claude keyframe check interrupted by a site restart instead of failing the reel", async () => {
    const ctx = setup([STORYBOARD]);
    const run = await ctx.o.create({ kind: "reel", request: "Restart during keyframe QC", user: marketer });
    await settle(ctx.o, run.id, ["running", "queued"]);
    const row = ctx.q.rows.get(run.id), doc = JSON.parse(row.doc);
    const qc = doc.steps.find((s) => s.action === "qc_visual");
    qc.status = "running"; qc.started_at = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    for (const s of doc.steps.filter((x) => x.n > qc.n)) { s.status = "pending"; s.error = null; }
    row.doc = JSON.stringify(doc); row.status = "running";
    await ctx.o.watchdog();
    const r = await ctx.o.get(run.id);
    const step = r.steps.find((s) => s.action === "qc_visual");
    expect(r.status).not.toBe("failed");
    expect(step.status).toBe("pending");
    expect(step.watchdog_retry_count).toBe(1);
    expect(step.watchdog_retry_reason).toMatch(/interrupted/);
  });

  it("recovers a persisted Higgsfield clip with no provider receipt using its original idempotency key after backoff", async () => {
    const ctx = setup([STORYBOARD]);
    const run = await ctx.o.create({ kind: "reel", request: "Receipt recovery", user: marketer });
    let r = await settle(ctx.o, run.id, ["running", "queued"]);
    expect(r.steps.find((s) => s.action === "clips").status).toBe("waiting");
    const oldKey = ctx.calls.hfSubmit[0].idempotencyKey;
    const row = ctx.q.rows.get(run.id), doc = JSON.parse(row.doc);
    const old = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    doc.artifacts.higgsfield_watchdog = { startedAt: old, retryRound: 0 };
    doc.artifacts.clips[0] = { ...doc.artifacts.clips[0], requestId: null, statusUrl: null, state: "submitting", submittedAt: old, lastProgressAt: old };
    row.doc = JSON.stringify(doc);
    await ctx.o.tick(); // queues the one recovery round; no new media yet
    for (let i = 0; i < 60; i++) {
      r = await ctx.o.get(run.id);
      if (r.status === "queued" && r.steps.find((s) => s.action === "clips").watchdog_retry_not_before) break;
      await new Promise((resolve) => setTimeout(resolve, 3));
    }
    expect(r.status).toBe("queued");
    const delayed = JSON.parse(ctx.q.rows.get(run.id).doc);
    delayed.steps.find((s) => s.action === "clips").watchdog_retry_not_before = new Date(Date.now() - 1_000).toISOString();
    ctx.q.rows.get(run.id).doc = JSON.stringify(delayed);
    await new Promise((resolve) => setTimeout(resolve, 10)); // let the completed dispatch release its slot
    await ctx.o.tick(); // recovery POST uses the persisted idempotency key after backoff
    for (let i = 0; i < 60; i++) {
      r = await ctx.o.get(run.id);
      if (r.steps.find((s) => s.action === "clips").status === "waiting") break;
      await new Promise((resolve) => setTimeout(resolve, 3));
    }
    expect(r.steps.find((s) => s.action === "clips").status).toBe("waiting");
    expect(ctx.calls.hfSubmit).toHaveLength(5);
    expect(ctx.calls.hfSubmit[4].idempotencyKey).toBe(oldKey);
  });

  it("retries a failed voice take twice, then stops without a render or replacement voice and notifies once", async () => {
    const ctx = setup([STORYBOARD], { voiceError: "HTTP 503: approved voice unavailable" });
    const run = await ctx.o.create({kind:"reel",request:"Voice failure test",user:marketer});
    const r = await settle(ctx.o, run.id); // voice now runs before Higgsfield, so a voice failure spends no clip credits
    expect(ctx.calls.hfSubmit).toHaveLength(0);
    expect(r.status).toBe("failed");
    expect(r.steps.find(s=>s.action==="voice").status).toBe("failed");
    expect(ctx.calls.voice).toBe(3); // owner rule: a failed take is tried 2 more times, then the step stops
    expect(ctx.calls.render).toHaveLength(0);
    expect(ctx.calls.notify).toHaveLength(1);
  });

  it("schedules a delayed recovery when a waiting Mac render has no progress for twenty minutes", async () => {
    const ctx = setup([STORYBOARD], { externalRender: true });
    const run = await ctx.o.create({ kind: "reel", request: "Render watchdog", user: marketer });
    await settle(ctx.o, run.id);
    ctx.finishClips();
    await ctx.o.tick();
    const row = ctx.q.rows.get(run.id);
    const doc = JSON.parse(row.doc);
    const old = new Date(Date.now() - 21 * 60 * 1000).toISOString();
    const compose = doc.steps.find((s) => s.action === "compose_reel");
    compose.started_at = old;
    doc.artifacts.compose.lastProgressAt = old;
    row.doc = JSON.stringify(doc);
    await ctx.o.watchdog();
    const recovered = await ctx.o.get(run.id);
    const delayed = recovered.steps.find((s) => s.action === "compose_reel");
    expect(recovered.status).toBe("queued");
    expect(delayed.status).toBe("pending");
    expect(delayed.watchdog_retry_count).toBe(1);
    expect(Date.parse(delayed.watchdog_retry_not_before)).toBeGreaterThan(Date.now());
  });
  it("uses exactly storyboard, keyframes, keyframe check, clips, voice, compose, one final Claude check, and weekly plan", async () => {
    expect(PIPELINES.reel.steps().map((s) => s.action)).toEqual(["reel_storyboard", "reel_keyframes", "qc_visual", "voice", "clips", "compose_reel", "qc_final", "to_weekly_plan"]);
    expect(PIPELINES.static.steps().map((s) => s.action)).toContain("check_brief");
    expect(PIPELINES.static.steps().map((s) => s.action)).toContain("qc_visual");

    const ctx = setup([STORYBOARD, PASS]);
    const run = await ctx.o.create({ kind: "reel", request: "Portugal family reel", user: marketer });
    const result = await approveAndFinish(ctx, run.id);
    expect(result.status).toBe("done");
    expect(ctx.calls.openai).toHaveLength(4);
    expect(ctx.calls.hfSubmit).toHaveLength(4);
    expect(ctx.calls.voice).toBe(4);
    expect(ctx.calls.openaiText).toHaveLength(1); // storyboard and Egyptian Arabic narration
    expect(ctx.calls.openaiText[0].prompt).toMatch(/Egyptian Arabic voice-over/);
    expect(ctx.calls.openaiText[0].prompt).toMatch(/cover 20 seconds/);
    expect(ctx.calls.openaiText[0].prompt).toMatch(/direct spoken consultation call to action/);
    expect(ctx.calls.openaiText[0].prompt).toMatch(/OWNER VOICE-OVER REQUIREMENTS/);
    expect(ctx.calls.openaiText[0].prompt).toMatch(/smart, ethical selling technique/);
    expect(ctx.calls.openaiText[0].prompt).toMatch(/amazing hook/);
    expect(ctx.calls.claude).toHaveLength(2); // keyframe check before Higgsfield + sole final QC
    expect(ctx.calls.keyframeQc).toBe(1);
    expect(ctx.calls.claude.at(-1).prompt).toMatch(/ALL supplied visual evidence/);
    expect(ctx.calls.claude.at(-1).prompt).toMatch(/600 frames spread evenly over the whole narrative part/i);
    expect(ctx.calls.claude.at(-1).prompt).toMatch(/Actual script sent/);
    expect(ctx.calls.claude.at(-1).prompt).toMatch(/تأشيرة/);
    expect(result.artifacts.final).toMatchObject({ renderJobId: "render-1", peakRssBytes: 240_000_000 });
    expect(ctx.state.items.find((x) => x.item_id === result.artifacts.item_id)).toMatchObject({ status: "pending_approval" });
  });

  it("recovers a falsely failed parent run when the Mac completed its saved render without regenerating media", async () => {
    const ctx = setup([STORYBOARD, PASS], { externalRender: true });
    const run = await ctx.o.create({ kind: "reel", request: "External worker recovery", user: marketer });
    let r = await settle(ctx.o, run.id);
    ctx.finishClips();
    for (let i = 0; i < 30; i++) {
      await ctx.o.tick();
      r = await ctx.o.get(run.id);
      if (r.steps.find((s) => s.action === "compose_reel").status === "waiting") break;
      await new Promise((resolve) => setTimeout(resolve, 3));
    }
    expect(r.status).toBe("waiting");
    expect(r.steps.find((s) => s.action === "compose_reel").status).toBe("waiting");
    const persisted = ctx.q.rows.get(run.id), orphan = JSON.parse(persisted.doc);
    orphan.status = "failed"; // simulates the old server-restart false failure
    persisted.status = "failed"; persisted.doc = JSON.stringify(orphan);
    ctx.completeRender();
    for (let i = 0; i < 30; i++) {
      await ctx.o.tick();
      r = await ctx.o.get(run.id);
      if (!["running", "queued", "waiting"].includes(r.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 3));
    }
    expect(r.status).toBe("done");
    expect(r.artifacts.final.renderJobId).toBe("render-1");
    expect(ctx.calls.openai).toHaveLength(4);
    expect(ctx.calls.hfSubmit).toHaveLength(4);
    expect(ctx.calls.voice).toBe(4);
    expect(ctx.calls.render.length).toBeGreaterThanOrEqual(2); // durable queue/result polling only; no media providers were re-run
    expect(ctx.calls.render.at(-1)).toMatchObject({ narrationTargetSeconds: 20, narrationSceneSeconds: 5 });
    expect(ctx.calls.claude).toHaveLength(2); // keyframe check + final check
  });

  it("regenerates exactly named final-QC scenes automatically and preserves voice takes", async () => {
    const ctx = setup([STORYBOARD, failScene(2), PASS]);
    const run = await ctx.o.create({ kind: "reel", request: "Portugal family reel", user: marketer });
    let r = await approveAndFinish(ctx, run.id);
    expect(r.status).toBe("done");
    expect(ctx.calls.openai).toHaveLength(5); // only Scene 2 keyframe
    expect(ctx.calls.hfSubmit).toHaveLength(5); // only the corrected scene is re-submitted
    expect(ctx.calls.voice).toBe(4); // visual repair retains voice takes
    expect(ctx.calls.hfSubmit[4].idempotencyKey).toMatch(/clip-2-/);
  });

  it("stops after two targeted repair rounds and notifies failure once", async () => {
    const ctx = setup([STORYBOARD, failScene(3), failScene(3), failScene(3)]);
    const run = await ctx.o.create({ kind: "reel", request: "Portugal family reel", user: marketer });
    const r = await approveAndFinish(ctx, run.id);
    expect(r.status).toBe("needs_review");
    expect(r.artifacts.repair_rounds).toBe(2);
    expect(ctx.calls.openai).toHaveLength(6); // 4 initial + scene 3 twice
    expect(ctx.calls.hfSubmit).toHaveLength(6);
    expect(ctx.calls.voice).toBe(4);
    expect(ctx.calls.notify).toHaveLength(1);
  });

  it("fails closed on malformed final Claude JSON and never regenerates a scene", async () => {
    const ctx = setup([STORYBOARD, { pass: false, issues: ["bad"] }]);
    const run = await ctx.o.create({ kind: "reel", request: "Portugal family reel", options: { noSceneRegeneration: true, preserveVoiceTakes: true, manualReviewOnly: true }, user: marketer });
    const r = await approveAndFinish(ctx, run.id);
    expect(r.status).toBe("needs_review");
    expect(r.steps.find((s) => s.action === "qc_final")).toMatchObject({ status: "needs_review" });
    expect(ctx.calls.openai).toHaveLength(4);
    expect(ctx.calls.hfSubmit).toHaveLength(4);
    expect(ctx.calls.voice).toBe(4);
    expect(ctx.calls.notify).toHaveLength(1);
  });
});

describe("reel durability and legacy compatibility", () => {
  it("migrates an old in-flight step array by action without losing generated assets or an owner approval", async () => {
    const ctx = setup([]);
    const oldSteps = [
      { provider: "claude", action: "reel_storyboard", status: "done", n: 1 },
      { provider: "system", action: "check_brief", status: "done", n: 2 },
      { provider: "openai", action: "reel_keyframes", status: "done", n: 3 },
      { provider: "claude", action: "qc_visual", status: "done", n: 4 },
      { provider: "higgsfield", action: "clips", status: "done", gate: "owner", approved_by: owner.email, n: 5 },
      { provider: "claude", action: "qc_clips", status: "done", n: 6 },
      { provider: "elevenlabs", action: "voice", status: "done", n: 7 },
      { provider: "system", action: "compose_reel", status: "done", n: 8 },
      { provider: "claude", action: "qc_final", status: "done", n: 9 },
      { provider: "system", action: "to_weekly_plan", status: "pending", n: 10 },
    ];
    const doc = { kind: "reel", title: "legacy", request: "legacy", options: { manualReviewOnly: true }, status: "queued", steps: oldSteps, messages: [], created_by: marketer.email, created_at: new Date().toISOString(), artifacts: {
      brief: { type: "reel", topic: "t", pillar: "Family Security", program: "Portugal D7", caption_ar: CAPTION, talent: { mode: "voiceover_elevay_vip", voice_source: "elevay_vip_module" }, reel: { storyboard: [1, 2, 3, 4].map((i) => ({ clip: i, ...scene(i) })), duration_s: 23 } },
      keyframes: [1, 2, 3, 4].map((i) => ({ url: `https://cdn.example/k${i}.png`, sha256: `k${i}` })),
      clips: [1, 2, 3, 4].map((i) => ({ requestId: `legacy-${i}`, state: "completed", url: `https://cdn.example/c${i}.mp4` })),
      voices: [1, 2, 3, 4].map((i) => ({ url: `https://cdn.example/v${i}.mp3`, sha256: `v${i}`, script: scene(i).spoken_text_ar })),
      final: { url: "https://cdn.example/legacy-final.mp4", seconds: 23, sha256: "legacy" }, final_qc: { pass: true },
    } };
    const seeded = await ctx.q("INSERT INTO ec_ai_runs (created_at, status, doc) VALUES (?, ?, ?)", [Date.now(), "queued", JSON.stringify(doc)]);
    await ctx.o.tick();
    const r = await settle(ctx.o, seeded.insertId);
    expect(r.status).toBe("done");
    expect(r.steps.map((s) => s.action)).toEqual(["reel_storyboard", "reel_keyframes", "qc_visual", "voice", "clips", "compose_reel", "qc_final", "to_weekly_plan"]);
    expect(r.steps.find((s) => s.action === "clips")).toMatchObject({ approved_by: owner.email, status: "done" });
    expect(r.artifacts.clips.map((c) => c.url)).toEqual(["https://cdn.example/c1.mp4", "https://cdn.example/c2.mp4", "https://cdn.example/c3.mp4", "https://cdn.example/c4.mp4"]);
    expect(ctx.calls.openai).toHaveLength(0);
    expect(ctx.calls.hfSubmit).toHaveLength(0);
    expect(ctx.calls.voice).toBe(0);
  });

  it("retries a failed paid clip in its original scene slot with a new stable retry index", async () => {
    const ctx = setup([STORYBOARD]);
    const run = await ctx.o.create({ kind: "reel", request: "Portugal family reel", user: marketer });
    let r = await settle(ctx.o, run.id);
    expect(r.steps.find((s) => s.action === "clips").status).toBe("waiting");
    const retainedScene1 = r.artifacts.clips[0].requestId;
    ctx.finishClips();
    ctx.failRequest(r.artifacts.clips[1].requestId);
    await ctx.o.tick();
    r = await settle(ctx.o, run.id, ["running", "queued", "waiting"]);
    expect(r.status).toBe("failed");
    ctx.setClipsDone(false);
    await ctx.o.retry(run.id, owner);
    r = await settle(ctx.o, run.id);
    expect(r.status).toBe("waiting");
    expect(r.artifacts.clips).toHaveLength(4);
    expect(r.artifacts.clips[0].requestId).toBe(retainedScene1);
    expect(r.artifacts.clips[1].requestId).toBe("request-5");
    expect(ctx.calls.hfSubmit.map((x) => x.idempotencyKey)).toEqual(expect.arrayContaining([expect.stringMatching(/clip-2-.*-r0$/), expect.stringMatching(/clip-2-.*-r1$/)]));
  });
});

describe("helpers", () => {
  it("researches news with Claude web search and files only new, sourced items", async () => {
    const { o, state, calls } = setup([{ news: [
      { headline: "Spain updates remote-work residency guidance", country: "Spain", program: "Spain Digital Nomad Residence", what_changed: "x", effective_date: "2026-11-01", published_date: "2026-10-08", source_url: "https://www.exteriores.gob.es/x", source_name: "MAEC", confidence: "verified", marketing_angle: "Explain the update." },
      { headline: "No source", country: "Malta", confidence: "reported" },
      { headline: "Rumour", country: "Grenada", source_url: "https://news.example/r", confidence: "bogus" },
    ] }]);
    const r = await o.researchNews();
    expect(r).toEqual({ found: 2, added: 2 });
    expect(state.news.find((n) => n.headline === "Rumour").confidence).toBe("unconfirmed");
    expect(state.news.some((n) => n.confidence === "verified" && n.researched_by === "claude-web-search")).toBe(true);
    expect(calls.claude[0].prompt).toMatch(/Spain Digital Nomad Residence/);
    expect(JSON.stringify(state.audit)).toMatch(/news\.researched/);
    expect((await o.researchNews().catch(() => ({ added: -1 }))).added).not.toBe(2); // same items are not filed twice
  });

  it("parses JSON embedded in prose or a fence", () => {
    expect(extractJson('Sure:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here {"b":[1,2]} done')).toEqual({ b: [1, 2] });
  });
});

describe("owner-authorized targeted content revisions", () => {
  async function finishedBase(ctx) {
    const run = await ctx.o.create({kind:"reel",request:"Original approved content",user:marketer});
    return approveAndFinish(ctx,run.id);
  }
  function authority(ctx,item,scope,clip=null) {
    const job=E.enqueueJob(ctx.state,"revise_item",{item_id:item.item_id,base_version:item.version,from_version:item.version,scope,clip,owner_authorized:true},owner.email);
    return job;
  }
  it("updates only caption after final Claude check, keeping all rendered media and no reapproval or publish job", async()=>{
    const ctx=setup([STORYBOARD,PASS,{caption_ar:CAPTION.replace("هل تفكر","هل تخطط")},PASS]);
    const base=await finishedBase(ctx);const item=ctx.state.items.find(i=>i.item_id===base.artifacts.item_id);
    authority(ctx,item,"caption");
    const renderCalls=ctx.calls.render.length;
    const rev=await ctx.o.reviseItem(item.item_id,{comment:"Change caption hook",scope:"caption"},owner);
    const result=await settle(ctx.o,rev.id);
    expect(result.status).toBe("done");expect(ctx.calls.openai).toHaveLength(4);expect(ctx.calls.hfSubmit).toHaveLength(4);expect(ctx.calls.voice).toBe(4);expect(ctx.calls.render).toHaveLength(renderCalls);
    expect(item.version).toBe(2);expect(item.caption_ar).toContain("هل تخطط");expect(item.revision_status).toBe("owner_approved");expect(item.history[0].snapshot.caption_ar).toBe(CAPTION);expect(ctx.state.jobs.some(j=>j.type==='schedule_post')).toBe(false);
  });
  it("regenerates only scene 2 keyframe and clip while reusing every narration take", async()=>{
    const revised={scenes:[{scene:2,keyframe_prompt:scene(2).keyframe_prompt+' with a clean desk',motion_prompt:scene(2).motion_prompt}]};
    const ctx=setup([STORYBOARD,PASS,revised,PASS]);const base=await finishedBase(ctx);const item=ctx.state.items.find(i=>i.item_id===base.artifacts.item_id);
    authority(ctx,item,"reel_clip",2);
    const rev=await ctx.o.reviseItem(item.item_id,{comment:"Change scene 2 desk",scope:"reel_clip",clip:2},owner);
    let r=await settle(ctx.o,rev.id);if(r.status==='waiting'){await ctx.o.tick();r=await settle(ctx.o,rev.id,['running','queued','waiting']);}
    expect(r.status).toBe("done");expect(ctx.calls.openai).toHaveLength(5);expect(ctx.calls.hfSubmit).toHaveLength(5);expect(ctx.calls.voice).toBe(4);expect(item.reel.storyboard[0]).toEqual(base.artifacts.brief.reel.storyboard[0]);expect(item.reel.storyboard[1].keyframe_prompt).toContain('clean desk');
  });
  it("does not let a marketer use owner revision options or the direct revision API", async()=>{
    const ctx=setup([]);
    await expect(ctx.o.create({kind:'reel',request:'unsafe',options:{revision:{authorizedBy:owner.email}},user:marketer})).rejects.toThrow(/Only the owner/);
    await expect(ctx.o.reviseItem('2026-W41-02',{comment:'edit'},marketer)).rejects.toThrow(/Only the owner/);
    await expect(ctx.o.create({kind:'reel',request:'sandbox',options:{sandboxOnly:true},user:owner})).rejects.toThrow(/finite worker/);
  });
  it("recreates a completed reel from scratch as a new owner-authorized version without reusing old assets", async()=>{
    const ctx=setup([STORYBOARD,PASS,STORYBOARD,PASS]);
    const base=await finishedBase(ctx);const item=ctx.state.items.find(i=>i.item_id===base.artifacts.item_id);
    const originalMedia=structuredClone(item.media);
    await expect(ctx.o.recreate(base.id,marketer)).rejects.toThrow(/Only the owner/);
    const recreated=await ctx.o.recreate(base.id,owner);
    expect(recreated.id).not.toBe(base.id);
    expect(recreated.artifacts).toEqual({});
    expect(recreated.options.revision).toMatchObject({itemId:item.item_id,baseVersion:1,scope:'whole_concept'});
    expect(recreated.request).toMatch(/completely fresh/i);
    expect(recreated.request).toMatch(/locked ELEVAY Voice-Over Prompt/);
    expect(recreated.request).toMatch(/completely NEW voice-over text/);
    let r=await settle(ctx.o,recreated.id);
    if(r.status==='waiting'){await ctx.o.tick();r=await settle(ctx.o,recreated.id,['running','queued','waiting']);}
    expect(r.status).toBe('done');
    expect(ctx.calls.openai).toHaveLength(8);
    expect(ctx.calls.hfSubmit).toHaveLength(8);
    expect(ctx.calls.voice).toBe(8);
    expect(ctx.calls.render).toHaveLength(2);
    expect(item.version).toBe(2);
    expect(item.history[0].snapshot.media).toEqual(originalMedia);
    expect(item.revision).toMatchObject({scope:'whole_concept',run_id:String(recreated.id)});
    expect(ctx.state.jobs.some(j=>j.type==='schedule_post')).toBe(false);
  });
  it("changes only scene 3 narration and rerenders without regenerating a keyframe or clip", async()=>{
    const ctx=setup([STORYBOARD,PASS,{scenes:[{scene:3,spoken_text_ar:'خلينا نراجع ملفك في Portugal مع Elevay خطوة خطوة وبهدوء علشان قرارك يبقى أهدى.'}]},PASS]);
    const base=await finishedBase(ctx);const item=ctx.state.items.find(i=>i.item_id===base.artifacts.item_id);
    const unchanged=base.artifacts.voices.map(v=>v.url);
    const rev=await ctx.o.reviseItem(item.item_id,{comment:'Change voice scene 3',scope:'voice',clip:3},owner);
    const r=await settle(ctx.o,rev.id);
    expect(r.status).toBe('done');expect(ctx.calls.openai).toHaveLength(4);expect(ctx.calls.hfSubmit).toHaveLength(4);expect(ctx.calls.voice).toBe(5);expect(ctx.calls.render).toHaveLength(2);
    expect(r.artifacts.voices[0].url).toBe(unchanged[0]);expect(r.artifacts.voices[1].url).toBe(unchanged[1]);expect(r.artifacts.voices[3].url).toBe(unchanged[3]);expect(r.artifacts.voices[2].url).not.toBe(unchanged[2]);
  });
  it("changes intended Cairo schedule after final review without regenerating or scheduling media", async()=>{
    const ctx=setup([STORYBOARD,PASS,{datetime_cairo:'2026-10-11T19:45'},PASS]);const base=await finishedBase(ctx);const item=ctx.state.items.find(i=>i.item_id===base.artifacts.item_id);
    const rev=await ctx.o.reviseItem(item.item_id,{comment:'Move schedule to Sunday at 19:45',scope:'schedule'},owner);const r=await settle(ctx.o,rev.id);
    expect(r.status).toBe('done');expect(item.publish.datetime_cairo).toBe('2026-10-11T19:45');expect(ctx.calls.openai).toHaveLength(4);expect(ctx.calls.hfSubmit).toHaveLength(4);expect(ctx.calls.voice).toBe(4);expect(ctx.calls.render).toHaveLength(1);expect(ctx.state.jobs.every(j=>j.type==='revise_item')).toBe(true);
  });
  it("replaces only the requested carousel slide and runs one final complete-carousel check",async()=>{
    const ctx=setup([{slides:[{slide:2,image_prompt:'Arab family in modern elegant clothing, no logo',headline_en:'Plan your next chapter'}]},{pass:true,issues:[],verdict:'Updated carousel compliant'}]);
    const item={item_id:'2026-W41-01',type:'carousel',version:1,status:'approved',caption_ar:CAPTION,topic:'Family mobility',pillar:'Family Security',program:'Portugal D7',carousel:{format:'1080x1080',slides:[1,2,3].map(i=>({slide:i,headline_en:'Family planning',image_prompt:'Modern Arab family, no logo',image_url:`https://cdn.example/slide-${i}.png`}))},media:{image_urls:[1,2,3].map(i=>`https://cdn.example/slide-${i}.png`)},publish:{channel:'both',datetime_cairo:'2026-10-10T20:00'},history:[],owner_comments:[],first_pass:null};ctx.state.items.push(item);
    const rev=await ctx.o.reviseItem(item.item_id,{comment:'Change slide 2 photograph',scope:'static_design',clip:2},owner);const r=await settle(ctx.o,rev.id);
    expect(r.status).toBe('done');expect(ctx.calls.openai).toHaveLength(1);expect(ctx.calls.claude).toHaveLength(2);expect(item.media.image_urls[0]).toBe('https://cdn.example/slide-1.png');expect(item.media.image_urls[2]).toBe('https://cdn.example/slide-3.png');expect(item.media.image_urls[1]).not.toBe('https://cdn.example/slide-2.png');expect(item.history[0].snapshot.media.image_urls[1]).toBe('https://cdn.example/slide-2.png');expect(item.status).toBe('revision_approved');
  });
});

describe("owner rule: Manus rewrites a voice-over that OpenAI could not fix", () => {
  const BAD = { ...STORYBOARD, scenes: [1, 2, 3, 4].map((i) => ({ ...scene(i), spoken_text_ar: "لو بتفكر في إسبانيا خلينا نرتب خطوتك الجاية صح مع Elevay دلوقتي" })) };
  const BAD_FIX = { scenes: [1, 2, 3, 4].map((n) => ({ scene: n, spoken_text_ar: "لو بتفكر في إسبانيا خلينا نرتب خطوتك الجاية صح مع Elevay دلوقتي" })) };

  it("asks Manus once, waits without media, then continues with Manus's four lines and the saved storyboard", async () => {
    const ctx = setup([BAD, BAD_FIX, PASS]);
    const run = await ctx.o.create({ kind: "reel", request: "Manus voice-over fallback", user: marketer });
    let r = await settle(ctx.o, run.id);
    expect(r.status).toBe("waiting");
    expect(r.artifacts.voiceover_manus).toMatchObject({ status: "waiting" });
    expect(ctx.calls.openai).toHaveLength(0);
    expect(ctx.calls.openaiText).toHaveLength(2);
    const job = ctx.state.jobs.find((j) => j.id === r.artifacts.voiceover_manus.job);
    expect(job.payload.request).toMatch(/fully in Egyptian colloquial Arabic/);
    expect(job.payload.request).toMatch(/do not publish/);
    job.status = "done";
    job.result = { message: JSON.stringify({ scenes: sceneScripts }) };
    await ctx.o.tick(); // the heartbeat sees Manus's reply and re-queues the storyboard step
    await settle(ctx.o, run.id, ["running"]);
    await ctx.o.tick();
    r = await approveAndFinish(ctx, run.id);
    expect(r.status).toBe("done");
    expect(ctx.calls.openaiText).toHaveLength(2);
    expect(r.artifacts.brief.reel.storyboard.map((s) => s.spoken_text_ar)).toEqual(sceneScripts);
  });

  it("reads Manus replies as JSON, nested JSON text or four plain lines", () => {
    expect(parseManusVoiceoverLines({ scenes: sceneScripts })).toEqual(sceneScripts);
    expect(parseManusVoiceoverLines("Here you go: " + JSON.stringify({ scenes: sceneScripts }))).toEqual(sceneScripts);
    expect(parseManusVoiceoverLines(sceneScripts.map((l, i) => `${i + 1}. ${l}`).join("\n"))).toEqual(sceneScripts);
    expect(parseManusVoiceoverLines("no lines")).toBeNull();
  });
});

describe("owner rule: one week content file from OpenAI", () => {
  const types = ["static", "reel", "static", "reel", "static", "reel", "static"];
  const WEEK_PLAN = { rationale: "Mix for test", posts: types.map((type, i) => ({ type, date: "2026-11-0" + (i + 1), time: "19:00", program: "Portugal D7", pillar: "Family Security", audience: "Families", brief: `Idea ${i + 1}` })) };
  const WEEK_FILE = { posts: types.map((type, i) => type === "reel"
    ? { index: i + 1, type, topic: `Reel ${i + 1}`, pillar: "Family Security", program: "Portugal D7", caption_ar: CAPTION, music_direction: "Soft", final_edit_direction: "Clean joins", scenes: [1, 2, 3, 4].map(scene) }
    : { index: i + 1, type, topic: `Static ${i + 1}`, pillar: "Family Security", program: "Portugal D7", caption_ar: CAPTION, headline_en: "Plan your next chapter", image_prompt: "Arab family in Lisbon, elegant clothing and shoes, no text, no logo, no passports, no flags, no contact details", format: "1080x1350" }) };

  it("sends Claude's week plan to OpenAI once and hands each post its own part", async () => {
    const FINAL = { final: { rationale: "Council mix", posts: WEEK_PLAN.posts }, decision_log: [{ suggestion: "Stronger hook", from: "openai", adopted: true, why: "Better reach" }], summary: "Hooks sharpened." };
    const ctx = setup([WEEK_PLAN, OPENAI_REVIEW, FINAL, WEEK_FILE]);
    const run = await ctx.o.create({ kind: "weekly_plan", request: "Plan the week", options: { week: "2026-W45" }, user: owner });
    const first = await settle(ctx.o, run.id);
    expect(first.status).toBe("waiting"); // owner rule: always wait for Manus's council review
    const r = await throughCouncil(ctx, ctx.o, run.id);
    expect(r.steps.map((x) => x.action)).toEqual(["weekly_plan", "council_openai", "council_manus", "council_final", "week_content", "spawn_week"]);
    expect(r.artifacts.council.week_plan).toMatchObject({ final_used: "council", openai: { suggestions: ["Stronger hook"] }, manus: { suggestions: ["Lead with the family benefit"] } });
    expect(r.artifacts.week_plan.rationale).toBe("Council mix");
    const finalPrompt = ctx.calls.claude.find((c) => /You lead ELEVAY's AI council/.test(c.prompt)).prompt;
    expect(finalPrompt).toMatch(/Hook is soft/);
    expect(finalPrompt).toMatch(/Lead with the family benefit/);
    expect(ctx.calls.openaiText).toHaveLength(2);
    expect(ctx.calls.openaiText[0].prompt).toMatch(/AI council/);
    expect(ctx.calls.openaiText[1].prompt).toMatch(/Idea 1/);
    expect(ctx.calls.openaiText[1].prompt).toMatch(/cover 20 seconds/);
    expect(r.artifacts.week_content.missing).toEqual([]);
    const children = await Promise.all(r.artifacts.children.map((id) => ctx.o.get(id)));
    expect(children[1].options.prewritten.scenes.map((x) => x.spoken_text_ar)).toEqual(sceneScripts);
    expect(children[0].options.prewritten.headline_en).toBe("Plan your next chapter");
    let reel;
    for (let i = 0; i < 200; i++) { reel = await ctx.o.get(r.artifacts.children[1]); if (reel.artifacts?.brief?.reel) break; await ctx.o.tick(); await new Promise((res) => setTimeout(res, 3)); }
    expect(reel.artifacts.brief.reel.storyboard.map((x) => x.spoken_text_ar)).toEqual(sceneScripts);
    expect(ctx.calls.openaiText).toHaveLength(2); // council review + one week file; no separate storyboard request per reel
  });
});

describe("owner rule: Manus writes the week file when OpenAI cannot", () => {
  const types = ["static", "reel", "static", "reel", "static", "reel", "static"];
  const WEEK_PLAN = { rationale: "Mix", posts: types.map((type, i) => ({ type, date: "2026-11-0" + (i + 1), time: "19:00", program: "Portugal D7", pillar: "Family Security", audience: "Families", brief: `Idea ${i + 1}` })) };
  const FILE = { posts: types.map((type, i) => type === "reel"
    ? { index: i + 1, type, topic: "R", pillar: "Family Security", program: "Portugal D7", caption_ar: CAPTION, scenes: [1, 2, 3, 4].map(scene) }
    : { index: i + 1, type, topic: "S", pillar: "Family Security", program: "Portugal D7", caption_ar: CAPTION, headline_en: "Plan your next chapter", image_prompt: "Arab family, elegant clothing and shoes, no text, no logo" }) };

  it("asks Manus with the same instructions, waits, then starts production from Manus's file", async () => {
    const ctx = setup([WEEK_PLAN, OPENAI_REVIEW, { final: { posts: [] } }, { posts: [] }]); // invalid council final → draft kept
    const run = await ctx.o.create({ kind: "weekly_plan", request: "Plan", options: { week: "2026-W45" }, user: owner });
    let r = await throughCouncil(ctx, ctx.o, run.id);
    expect(r.artifacts.council.week_plan.final_used).toBe("draft");
    expect(r.status).toBe("waiting");
    expect(r.artifacts.children || []).toHaveLength(0);
    const job = ctx.state.jobs.find((j) => j.id === r.artifacts.week_manus.job);
    expect(job.payload.purpose).toBe("week_content_file");
    expect(job.payload.request).toMatch(/Idea 3/);
    job.status = "done"; job.result = { message: "```json\n" + JSON.stringify(FILE) + "\n```" };
    await ctx.o.tick();
    r = await settle(ctx.o, run.id);
    for (let i = 0; i < 50 && r.status !== "done"; i++) { await ctx.o.tick(); r = await settle(ctx.o, run.id); }
    expect(r.artifacts.week_content).toMatchObject({ written_by: "manus", missing: [] });
    expect(r.artifacts.children).toHaveLength(7);
  });
});

describe("a render that fails on the Mac while the reel waits", () => {
  it("fails the render step visibly (so Retry works) instead of leaving the reel stuck on Rendering", async () => {
    const ctx = setup([STORYBOARD, PASS], { externalRender: true });
    const run = await ctx.o.create({ kind: "reel", request: "Mac failure while waiting", user: marketer });
    let r = await settle(ctx.o, run.id);
    ctx.finishClips();
    for (let i = 0; i < 30; i++) { await ctx.o.tick(); r = await ctx.o.get(run.id); if (r.steps.find((s) => s.action === "compose_reel").status === "waiting") break; await new Promise((res) => setTimeout(res, 3)); }
    expect(r.steps.find((s) => s.action === "compose_reel").status).toBe("waiting");
    ctx.q.renderJobs.set("render-1", { status: "failed", error: "Scene 2 saved narration is too long" });
    for (let i = 0; i < 30; i++) { await ctx.o.tick(); r = await ctx.o.get(run.id); if (r.status === "failed") break; await new Promise((res) => setTimeout(res, 3)); }
    expect(r.status).toBe("failed");
    expect(r.steps.find((s) => s.action === "compose_reel")).toMatchObject({ status: "failed", error: expect.stringContaining("too long") });
  });
});

describe("owner rule: weekly ads review", () => {
  it("reviews 7- and 30-day Meta + CRM data and queues each action with its numbers for owner approval", async () => {
    const queued = [];
    const REVIEW = { summary: "Spain DNV costs 449 EGP per lead with 1 qualified lead in 30 days.", actions: [{ kind: "campaign_status", target_id: "120", target_name: "Spain DNV", status_to: "PAUSED", reason: "449 EGP per lead.", evidence: { d30: { spend: 40000, leads: 89, cpl: 449, qualified: 1, cost_per_qualified: 40000 } } }] };
    const ctx = setup([REVIEW]);
    ctx.o.__setMeta?.({});
    const meta = {
      adsReviewData: async () => ({ windows: { d7: { since: "2026-10-14", until: "2026-10-20" }, d30: { since: "2026-09-21", until: "2026-10-20" } }, campaigns: [{ id: "120", name: "Spain DNV", status: "ACTIVE", d7: { spend: 9000, leads: 20, cpl: 450, crmLeads: 20, qualified: 0, costPerQualified: null }, d30: { spend: 40000, leads: 89, cpl: 449, crmLeads: 85, qualified: 1, costPerQualified: 40000 } }], adsets: [], ads: [] }),
      adsSnapshot: async () => ({ mtd: 117000, dailyTotal: 3000, campaigns: [], adsets: [], cpl: {} }),
      enqueue: async (a, by) => { queued.push({ ...a, by }); return { id: queued.length, status: "pending", preview: a.preview }; },
    };
    const FINAL = { final: { summary: REVIEW.summary, actions: REVIEW.actions }, decision_log: [], summary: "Kept the pause." };
    const o = createOrchestrator({ q: ctx.q, mutate: async (_c, fn) => fn(ctx.state), loadState: async () => ({ state: ctx.state }), liveReport: async () => ({}), providers: { claude: async ({ prompt }) => { ctx.calls.claude.push({ prompt }); const data = /AI council/.test(prompt) ? FINAL : REVIEW; return { data, text: "" }; } }, E, R, meta });
    const run = await o.startAdsReview({ email: "autopilot", role: "owner" });
    const r = await throughCouncil(ctx, o, run.id);
    expect(r.status).toBe("done");
    expect(r.artifacts.council.ads.openai.assessment).toMatch(/unavailable/); // OpenAI not configured here: Manus and Claude continue
    expect(ctx.calls.claude[0].prompt).toMatch(/cost per QUALIFIED lead/);
    expect(ctx.calls.claude[0].prompt).toMatch(/Spain DNV/);
    expect(ctx.calls.claude.at(-1).prompt).toMatch(/Lead with the family benefit/);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: "campaign_status", status_to: "PAUSED", source: "weekly_ads_review", evidence: { d30: { cpl: 449 } } });
  });
});

describe("owner rule: AI council (Claude ⇄ OpenAI ⇄ Manus)", () => {
  it("selects the week's news only after OpenAI and Manus review Claude's shortlist", async () => {
    const SHORT = () => ({ selected: [{ id: ctxNews().find((n) => /Portugal/.test(n.headline)).id, why: "Threshold changed", angle: "What it means for families" }] });
    let greeceId = "";
    const FINAL = () => { return { final: { selected: [{ id: greeceId, why: "Manus: bigger impact", angle: "Plan early" }] }, decision_log: [{ suggestion: "Use the Greece item", from: "manus", adopted: true, why: "Larger audience" }], summary: "Switched to Greece." }; };
    const ctx = setup([SHORT, OPENAI_REVIEW, FINAL]);
    const ctxNews = () => ctx.state.news;
    E.addNews(ctx.state, [
      { headline: "Portugal D7 income update", country: "Portugal", program: "Portugal D7", what_changed: "Income threshold updated", source_url: "https://a.example/1", source_name: "A", confidence: "verified", published_date: "2026-10-20", effective_date: "2026-11-01" },
      { headline: "Greece Golden Visa zones", country: "Greece", program: "Greece Golden Visa", what_changed: "Zones revised", source_url: "https://a.example/2", source_name: "A", confidence: "verified", published_date: "2026-10-21", effective_date: "2026-12-01" },
    ], "claude");
    greeceId = ctx.state.news.find((n) => /Greece/.test(n.headline)).id;
    const run = await ctx.o.startNewsCouncil();
    const r = await throughCouncil(ctx, ctx.o, run.id);
    expect(r.status).toBe("done");
    expect(r.steps.map((x) => x.action)).toEqual(["news_shortlist", "council_openai", "council_manus", "council_final"]);
    const greece = ctx.state.news.find((n) => /Greece/.test(n.headline)), portugal = ctx.state.news.find((n) => /Portugal/.test(n.headline));
    expect(greece).toMatchObject({ selected: true, selected_by: "ai-council", why_selected: "Manus: bigger impact" });
    expect(portugal.selected).toBe(false);
    const job = ctx.state.jobs.find((j) => j.payload?.purpose === "council_review");
    expect(job.payload.request).toMatch(/OpenAI's review/);
    expect(job.payload.request).toMatch(/Do not publish anything/);
  });

  it("finalizes the monthly plan after both reviews and keeps Claude's draft when the final is unusable", async () => {
    const live = { };
    const DRAFT = { title: "November plan", body: "Draft body", budget_changes: [] };
    const ctx = setup([DRAFT, OPENAI_REVIEW, { final: { title: "November plan v2", body: "Council body", budget_changes: [{ campaign: "Spain DNV", change: "-20%", reason: "High CPL" }] }, decision_log: [], summary: "Tighter budget." }]);
    const run = await ctx.o.create({ kind: "plan", request: "", options: {}, user: owner });
    const r = await throughCouncil(ctx, ctx.o, run.id);
    expect(r.status).toBe("done");
    expect(r.artifacts.plan).toMatchObject({ title: "November plan v2", body: "Council body" });
    expect(ctx.state.plans.at(-1)?.title || ctx.state.plans[0]?.title).toMatch(/v2/);

    const ctx2 = setup([DRAFT, OPENAI_REVIEW, { final: { title: "" } }]);
    const run2 = await ctx2.o.create({ kind: "plan", request: "", options: {}, user: owner });
    const r2 = await throughCouncil(ctx2, ctx2.o, run2.id);
    expect(r2.artifacts.plan.title).toBe("November plan");
    expect(r2.artifacts.council.monthly_plan.final_used).toBe("draft");
  });
});

describe("owner rule: cinematographer shot sheet for every clip", () => {
  it("builds the Higgsfield animation prompt from the shot sheet with camera, lens, aperture, ISO, shutter and lighting", async () => {
    const { cinematicShotPrompt } = await import("./ai");
    const p = cinematicShotPrompt({ shot: { scene: "Arab family on a Valletta balcony at sunset", action: "0–2 s the father points; 2–4 s the children lean in; 4–5 s they smile", shot_type: "medium wide", camera_movement: "slow push-in", camera: "ARRI Alexa 35", lens: "Zeiss Supreme 35 mm", aperture: "T1.8", iso: "EI 640", shutter: "172.8° (1/50 s)", support: "slider", focus: "father's eyes", lighting: "low sun key from camera-left, white bounce fill, warm practical lanterns", color_atmosphere: "warm amber, soft haze", written_content: "none" } });
    for (const s of ["ANIMATION METHOD", "SCENE: Arab family on a Valletta balcony", "ACTION (5 seconds)", "CAMERA MOVE: slow push-in", "ARRI Alexa 35", "Zeiss Supreme 35 mm", "aperture T1.8", "EI 640", "1/50 s", "LIGHTING SETUP: low sun key", "WRITTEN CONTENT IN FRAME: none"]) expect(p).toContain(s);
    expect(p.length).toBeLessThanOrEqual(2300);
    const fallback = cinematicShotPrompt({ motion_summary: "slow dolly forward" });
    expect(fallback).toContain("CAMERA SETUP: ARRI Alexa Mini LF");
    expect(fallback).toContain("ACTION (5 seconds): slow dolly forward");
  });
});
