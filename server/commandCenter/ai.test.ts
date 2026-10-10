// @ts-nocheck
import { describe, expect, it } from "vitest";
import E from "./engine";
import R from "./rules";
import { createOrchestrator, extractJson, PIPELINES } from "./ai";

const CAPTION = `هل تفكر في مستقبل عائلتك في أوروبا؟

تقدم برامج الإقامة الأوروبية خيارات متعددة للعائلات المصرية والعربية التي تبحث عن الاستقرار وجودة الحياة والتعليم المتميز لأبنائها. في ELEVAY نرافقك منذ عام 1998 بخبرة واضحة وخطوات منظمة، بداية من دراسة ملفك وحتى استكمال جميع المتطلبات بدقة واحترافية.

نساعدك على فهم الشروط الحقيقية لكل برنامج، ومقارنة البدائل المتاحة وفق أهدافك وميزانيتك، مع شفافية كاملة في كل مرحلة. اختيار الإقامة المناسبة قرار مهم يستحق استشارة متخصصة ورؤية بعيدة المدى لعائلتك ومستقبلك المهني.

تخضع جميع الطلبات لموافقة الجهات المختصة وتختلف النتائج حسب الظروف الفردية لكل متقدم.

تواصل مع ELEVAY اليوم واحجز استشارتك الخاصة لتبدأ رحلتك بثقة.`;

const owner = { email: "owner@elevay.com", role: "owner" };
const marketer = { email: "marketer@elevay.com", role: "marketer" };
const scene = (i) => ({
  keyframe_prompt: `Arab couple in Lisbon, scene ${i}, modern elegant clothing and polished leather shoes, no text, no logo, no passports, no flags`,
  motion_prompt: "Slow cinematic dolly forward with restrained natural movement",
  spoken_text_ar: "عيلتك تستاهل خطة هادية في Portugal مع ELEVAY من البداية",
});
const STORYBOARD = { topic: "Lisbon", pillar: "Family Security", program: "Portugal D7", caption_ar: CAPTION, scenes: [1, 2, 3, 4].map(scene) };
const PASS = { pass: true, issues: [], scene_failures: [], non_scene_failures: [], verdict: "All supplied evidence complies." };
const failScene = (n, fix = "Replace the visible passport with a clean side table and keep the same people and wardrobe.") => ({ pass: false, issues: [`Scene ${n} has a visible visual compliance issue.`], scene_failures: [{ scene: n, issues: ["visible compliance issue"], fix }], non_scene_failures: [], verdict: "Repair only the named scene." });

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
  q.rows = rows;
  return q;
}

function setup(claudeAnswers, { autoClips = false, notify = true, voiceError = null } = {}) {
  const state = E.emptyState();
  // Unit fixtures drive one explicit run. The live scheduler covers calendar
  // autoplan separately; it must not consume mocked Claude responses here.
  state.settings.studio = { autoClips, autoplan: false };
  const calls = { claude: [], openai: [], hfSubmit: [], hfPoll: 0, voice: 0, render: [], notify: [] };
  let clipsDone = false, failedRequestId = null;
  const providers = {
    claude: async ({ prompt, images }) => {
      calls.claude.push({ prompt, images });
      const next = claudeAnswers.shift();
      const data = typeof next === "function" ? next(prompt) : next;
      return { text: JSON.stringify(data), data };
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
      return { parts: {}, final: { url: "https://cdn.example/final.mp4", seconds: 23.3, sha256: "f".repeat(64), music: false, mode: "cuts", peakRssBytes: 240_000_000, renderJobId: "render-1", qcFrames: Array.from({ length: 75 }, (_, i) => ({ url: `https://cdn.example/qc-${i}.jpg`, label: `Scene ${Math.min(4, Math.floor(i / 19) + 1)} frames ${i * 8 + 1}-${i * 8 + 8}` })) } };
    },
    videoFrames: async (_url, _times, evidence) => evidence.map((x) => ({ base64: "eA==", mediaType: "image/jpeg", label: x.label })),
    test: async () => ({}),
  };
  const q = memoryDb();
  const mutate = async (_ctx, fn) => fn(state);
  const o = createOrchestrator({ q, mutate, loadState: async () => ({ state }), liveReport: async () => ({ window: {}, ads: { total: { spend: 1000 } } }), providers, E, R, notifyFailure: notify ? async (payload) => calls.notify.push(payload) : undefined });
  return { o, q, state, calls, finishClips: () => { clipsDone = true; }, setClipsDone: (value) => { clipsDone = value; }, failRequest: (id) => { failedRequestId = id; } };
}

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
  expect(clips.status).toBe("needs_approval");
  await o.approve(runId, clips.n, owner);
  r = await settle(o, runId);
  expect(r.status).toBe("waiting");
  finishClips();
  await o.tick();
  return settle(o, runId, ["running", "queued", "waiting"]);
}

describe("seven-step ELEVAY reel flow", () => {
  it("stops a failed voice step without a timeout retry, render or replacement and notifies once", async () => {
    const ctx = setup([STORYBOARD], { voiceError: "HTTP 503: approved voice unavailable" });
    const run = await ctx.o.create({kind:"reel",request:"Voice failure test",user:marketer});
    const r = await approveAndFinish(ctx, run.id);
    expect(r.status).toBe("failed");
    expect(r.steps.find(s=>s.action==="voice").status).toBe("failed");
    expect(ctx.calls.voice).toBe(1);
    expect(ctx.calls.render).toHaveLength(0);
    expect(ctx.calls.notify).toHaveLength(1);
  });
  it("uses exactly storyboard, keyframes, clips, voice, compose, one final Claude check, and weekly plan", async () => {
    expect(PIPELINES.reel.steps().map((s) => s.action)).toEqual(["reel_storyboard", "reel_keyframes", "clips", "voice", "compose_reel", "qc_final", "to_weekly_plan"]);
    expect(PIPELINES.static.steps().map((s) => s.action)).toContain("check_brief");
    expect(PIPELINES.static.steps().map((s) => s.action)).toContain("qc_visual");

    const ctx = setup([STORYBOARD, PASS]);
    const run = await ctx.o.create({ kind: "reel", request: "Portugal family reel", user: marketer });
    const result = await approveAndFinish(ctx, run.id);
    expect(result.status).toBe("done");
    expect(ctx.calls.openai).toHaveLength(4);
    expect(ctx.calls.hfSubmit).toHaveLength(4);
    expect(ctx.calls.voice).toBe(4);
    expect(ctx.calls.claude).toHaveLength(2); // storyboard + sole final QC
    expect(ctx.calls.claude[1].prompt).toMatch(/ALL supplied visual evidence/);
    expect(ctx.calls.claude[1].prompt).toMatch(/all 600 narrative frames/i);
    expect(ctx.calls.claude[1].prompt).toMatch(/Actual script sent/);
    expect(ctx.calls.claude[1].prompt).toMatch(/تأشيرة/);
    expect(result.artifacts.final).toMatchObject({ renderJobId: "render-1", peakRssBytes: 240_000_000 });
    expect(ctx.state.items.find((x) => x.item_id === result.artifacts.item_id)).toMatchObject({ status: "pending_approval" });
  });

  it("regenerates exactly named final-QC scenes, preserves voice takes, and reopens the manual owner gate", async () => {
    const ctx = setup([STORYBOARD, failScene(2), PASS]);
    const run = await ctx.o.create({ kind: "reel", request: "Portugal family reel", user: marketer });
    let r = await approveAndFinish(ctx, run.id);
    expect(r.status).toBe("awaiting_approval");
    expect(ctx.calls.openai).toHaveLength(5); // only Scene 2 keyframe
    expect(ctx.calls.hfSubmit).toHaveLength(4); // repair is gated, not silently submitted
    expect(ctx.calls.voice).toBe(4); // visual repair retains voice takes
    const clips = r.steps.find((s) => s.action === "clips");
    await expect(ctx.o.approve(run.id, clips.n, marketer)).rejects.toThrow(/owner/);
    ctx.setClipsDone(false);
    await ctx.o.approve(run.id, clips.n, owner);
    r = await settle(ctx.o, run.id);
    expect(r.status).toBe("waiting");
    expect(ctx.calls.hfSubmit).toHaveLength(5);
    expect(ctx.calls.hfSubmit[4].idempotencyKey).toMatch(/clip-2-/);
    ctx.finishClips();
    await ctx.o.tick();
    r = await settle(ctx.o, run.id, ["running", "queued", "waiting"]);
    expect(r.status).toBe("done");
    expect(ctx.calls.voice).toBe(4);
  });

  it("stops after two targeted repair rounds and notifies failure once", async () => {
    const ctx = setup([STORYBOARD, failScene(3), failScene(3), failScene(3)]);
    const run = await ctx.o.create({ kind: "reel", request: "Portugal family reel", user: marketer });
    let r = await approveAndFinish(ctx, run.id);
    for (let round = 0; round < 2; round++) {
      expect(r.status).toBe("awaiting_approval");
      const clips = r.steps.find((s) => s.action === "clips");
      await ctx.o.approve(run.id, clips.n, owner);
      r = await settle(ctx.o, run.id);
      await ctx.o.tick();
      r = await settle(ctx.o, run.id, ["running", "queued", "waiting"]);
    }
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
    expect(r.steps.map((s) => s.action)).toEqual(["reel_storyboard", "reel_keyframes", "clips", "voice", "compose_reel", "qc_final", "to_weekly_plan"]);
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
    const clips = r.steps.find((s) => s.action === "clips");
    await ctx.o.approve(run.id, clips.n, owner);
    r = await settle(ctx.o, run.id);
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
  it("changes only scene 3 narration and rerenders without regenerating a keyframe or clip", async()=>{
    const ctx=setup([STORYBOARD,PASS,{scenes:[{scene:3,spoken_text_ar:'خلينا نراجع ملفك في Portugal مع ELEVAY خطوة خطوة'}]},PASS]);
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
