// @ts-nocheck
/*
 * AI Studio: the orchestrator that links Claude, OpenAI, Higgsfield and Manus.
 *
 *   Claude      → the conductor: routes requests, writes briefs/storyboards/plans, checks visuals
 *   OpenAI      → static designs and reel keyframes (gpt-image, server key OPENAI_API_KEY)
 *   Higgsfield  → 4 × 5 s reel clips from the OpenAI keyframes (HF_API_KEY)
 *   Manus       → Meta and anything that needs its connectors, through the existing job queue
 *
 * Every run is a list of steps. Each step records the instruction sent to a model and
 * the answer it returned, so the team sees the conversation between the models.
 * Paid generation stops at an approval gate (OpenAI: marketer or owner; Higgsfield: owner).
 * Finished work lands in the weekly plan or monthly plan for the usual owner approval.
 * Nothing here publishes, spends ad budget or changes Meta.
 */
import crypto from "crypto";
import { ELEVAY_AGENTIC_DESIGN_STANDARD } from "@shared/elevayAgenticDesignStandard";

// ------------------------------------------------------------------ rules every model receives
export const ELEVAY_RULES = `
You work for ELEVAY (always written ELEVAY), a premium Citizenship & Residency by Investment consultancy founded in 1998, headquartered in Egypt. Tagline: EXPANDING YOUR FREEDOM.
Audience: Egyptian and Arab high-net-worth individuals, professionals and families.
Tone: professional, premium, trustworthy, educational, warm. Never exaggerate, never use fear, clickbait or fake urgency.
Hard rules:
- Never use the word "تأشيرة" or "فيزا" or "Visa"; always say "إقامة" / "Residency" (official program names may be quoted).
- Never guarantee approval, timelines or outcomes. No legal or tax advice; recommend a consultation.
- Captions: Modern Standard Arabic, 100–150 words, first line is a short hook (≤ 12 words), end with a call to action (تواصل مع ELEVAY / احجز استشارة), include a disclaimer such as "تخضع جميع الطلبات لموافقة الجهات المختصة وتختلف حسب الظروف الفردية".
- No phone numbers, emails, WhatsApp, URLs or QR codes in captions, images or videos.
- Text inside images is English only. People shown are Arab / Middle Eastern in modern elegant clothing. Never show passports, flags as hero objects, or an AI-drawn logo (the official logo is added afterwards).
- Reels: 4 clips × 5 s + 3 s white logo outro (23 s), no text inside the video.
- Voice-over scripts: Egyptian Arabic (عامية مصرية), but every country, city, program and company name in English letters (Spain, Portugal, Golden Visa program name only if official, ELEVAY) so the voice pronounces it correctly. 8–13 words per clip.
${ELEVAY_AGENTIC_DESIGN_STANDARD}`;

// ------------------------------------------------------------------ providers
const CLAUDE_MODEL = () => process.env.ELEVAY_CLAUDE_MODEL || "claude-sonnet-4-6";

export function extractJson(text: string) {
  const s = String(text || "");
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : s;
  const start = body.search(/[{[]/);
  if (start < 0) throw new Error("The model did not return JSON.");
  for (let end = body.length; end > start; end--) {
    const ch = body[end - 1];
    if (ch !== "}" && ch !== "]") continue;
    try { return JSON.parse(body.slice(start, end)); } catch { /* keep shrinking */ }
  }
  throw new Error("The model returned invalid JSON.");
}

export function makeProviders(fetcher = fetch) {
  async function claude({ system, prompt, images = [], maxTokens = 4000, json = true }) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set on elevay.vip.");
    const content = [...images.map((url) => ({ type: "image", source: { type: "url", url } })), { type: "text", text: prompt }];
    const res = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL(), max_tokens: maxTokens, system, messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(180000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Claude: ${body?.error?.message || `HTTP ${res.status}`}`);
    const text = (body.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    return { text, data: json ? extractJson(text) : null, usage: body.usage || null, model: body.model || CLAUDE_MODEL() };
  }

  async function openaiImage({ prompt, purpose }) {
    const { createElevayOpenAiKeyframe } = await import("../elevayOpenAiVisuals");
    return createElevayOpenAiKeyframe({ prompt, purpose });
  }

  async function brandStatic(url) {
    // Composite the official ELEVAY logo on the generated static (never an AI-drawn logo).
    const [{ applyOfficialElevayLogoToStatic }, { storagePut }] = await Promise.all([import("../elevayBrandMedia"), import("../storage")]);
    const src = Buffer.from(await (await fetcher(url)).arrayBuffer());
    const { bytes } = await applyOfficialElevayLogoToStatic(src);
    const sha = crypto.createHash("sha256").update(bytes).digest("hex");
    return (await storagePut(`marketing/command-center/static/${sha.slice(0, 24)}.png`, bytes, "image/png")).url;
  }

  async function higgsfieldSubmit({ runId, stepId, idempotencyKey, prompt, keyframe }) {
    const { submitElevayHiggsfieldProClip } = await import("../elevayHiggsfieldProTransport");
    return submitElevayHiggsfieldProClip(
      { ownerReviewedRunId: runId, persistedStepId: stepId, alreadyPersistedBeforeNetwork: true, idempotencyKey, prompt, keyframe: { trustedCdnUrl: keyframe.url, sha256: keyframe.sha256, width: 864, height: 1536 } },
      { trustedKeyframeCdnOrigins: [new URL(keyframe.url).origin] },
    );
  }

  async function higgsfieldStatus({ requestId, statusUrl }) {
    const { pollElevayHiggsfieldProClipStatus } = await import("../elevayHiggsfieldProTransport");
    return pollElevayHiggsfieldProClipStatus({ requestId, statusUrl });
  }

  async function test() {
    const out = {};
    const k = (name) => !!process.env[name];
    out.claude = k("ANTHROPIC_API_KEY") ? await claude({ system: "Reply with OK.", prompt: "ping", maxTokens: 5, json: false }).then((r) => ({ ok: true, detail: r.model }), (e) => ({ ok: false, detail: e.message })) : { ok: false, detail: "ANTHROPIC_API_KEY is not set" };
    out.openai = k("OPENAI_API_KEY") ? await fetcher("https://api.openai.com/v1/models?limit=1", { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(20000) }).then((r) => ({ ok: r.ok, detail: r.ok ? "Key accepted" : `HTTP ${r.status}` }), (e) => ({ ok: false, detail: e.message })) : { ok: false, detail: "OPENAI_API_KEY is not set" };
    out.higgsfield = k("HF_API_KEY") ? { ok: true, detail: "Key is set (checked when the first clip is submitted)" } : { ok: false, detail: "HF_API_KEY is not set" };
    return out;
  }

  return { claude, openaiImage, brandStatic, higgsfieldSubmit, higgsfieldStatus, test };
}

// ------------------------------------------------------------------ pipelines
const S = (provider, action, title, extra = {}) => ({ provider, action, title, status: "pending", ...extra });
export const PIPELINES = {
  static: { label: "Static post", steps: () => [
    S("claude", "static_brief", "Claude writes the brief, caption and image direction"),
    S("system", "check_brief", "Brand and compliance check (Claude fixes blocks once)"),
    S("openai", "static_image", "OpenAI designs the static", { gate: "marketer" }),
    S("claude", "qc_visual", "Claude checks the design against the ELEVAY rules"),
    S("system", "to_weekly_plan", "Send to the weekly plan for owner approval"),
  ] },
  reel: { label: "Reel", steps: () => [
    S("claude", "reel_storyboard", "Claude writes the 4-scene storyboard, caption and Egyptian Arabic voice-over"),
    S("system", "check_brief", "Brand and compliance check (Claude fixes blocks once)"),
    S("openai", "reel_keyframes", "OpenAI creates the 4 keyframes (9:16)", { gate: "marketer" }),
    S("claude", "qc_visual", "Claude checks the keyframes against the ELEVAY rules"),
    S("higgsfield", "clips", "Higgsfield animates 4 × 5 s clips", { gate: "owner" }),
    S("system", "to_weekly_plan", "Send clips to the weekly plan (voice-over and final edit follow)"),
  ] },
  plan: { label: "Monthly plan from data", steps: () => [
    S("claude", "plan", "Claude drafts next month's plan from 6 months of Meta + CRM data"),
    S("system", "to_monthly_plan", "Send to the monthly plan for owner approval"),
  ] },
  manus: { label: "Manus task", steps: () => [
    S("claude", "manus_brief", "Claude turns the request into clear instructions for Manus"),
    S("manus", "job", "Manus does the work with its connectors"),
    S("claude", "summarize", "Claude summarises what Manus did"),
  ] },
  answer: { label: "Question", steps: () => [S("claude", "answer", "Claude answers using live Meta + CRM data")] },
  request: { label: "Request (Claude routes it)", steps: () => [S("claude", "route", "Claude decides which models should do this")] },
};

// ------------------------------------------------------------------ helpers
const nowIso = () => new Date().toISOString();
const clip = (s, n = 4000) => { const t = typeof s === "string" ? s : JSON.stringify(s, null, 1); return t && t.length > n ? t.slice(0, n) + "…" : t; };
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}
export function nextItemId(items, week = isoWeek()) {
  const used = items.filter((i) => String(i.item_id).startsWith(week + "-")).map((i) => Number(i.item_id.slice(-2)));
  const n = Math.max(7, ...used) + 1;
  if (n > 99) throw new Error(`No free item number left in ${week}.`);
  return `${week}-${String(n).padStart(2, "0")}`;
}
function liveSummary(live) {
  if (!live) return "No live data available.";
  const pick = { window: live.window, alerts: live.alerts, adsTotal: live.ads?.total, campaigns: (live.ads?.campaigns || []).slice(0, 12).map((c) => ({ campaign: c.campaign, status: c.status, spend: Math.round(c.spend), leads: c.leads, cpl: c.cpl && Math.round(c.cpl), crmLeads: c.crmLeads, qualified: c.qualified, clients: c.clients })), crm30: live.crm, page: live.page && { views: live.page.views?.total, newLikes: live.page.newLikes?.total, unlikes: live.page.unlikes?.total }, analysis: live.analysis && { byMonth: live.analysis.byMonth, findings: live.analysis.findings, recommendations: live.analysis.recommendations, budgetSplit: live.analysis.budgetSplit, programs: live.analysis.programs?.slice(0, 8), unqualifiedReasons: live.analysis.unqualifiedReasons } };
  return clip(pick, 14000);
}

// ------------------------------------------------------------------ orchestrator
/**
 * deps: { q, mutate, loadState, liveReport, providers, E, R }
 *   q(sql, args)         database
 *   mutate(ctx, fn)      Command Center state transaction
 *   liveReport(false)    cached live Meta + CRM report
 */
export function createOrchestrator(deps) {
  const { q, providers, E, R } = deps;
  const running = new Set();

  async function ensureTable() {
    await q("CREATE TABLE IF NOT EXISTS ec_ai_runs (id INT AUTO_INCREMENT PRIMARY KEY, created_at BIGINT NOT NULL, status VARCHAR(24) NOT NULL, ver INT NOT NULL DEFAULT 0, doc LONGTEXT NOT NULL, INDEX ec_ai_runs_status (status))");
  }
  async function get(id) {
    const r = (await q("SELECT id, ver, doc FROM ec_ai_runs WHERE id=?", [id]))[0];
    return r ? { run: { ...JSON.parse(r.doc), id: r.id }, ver: r.ver } : null;
  }
  async function save(run, ver) {
    run.updated_at = nowIso();
    const res = await q("UPDATE ec_ai_runs SET doc=?, status=?, ver=ver+1 WHERE id=? AND ver=?", [JSON.stringify(run), run.status, run.id, ver]);
    if (res.affectedRows !== 1) throw new Error("The run changed while saving.");
    return ver + 1;
  }
  async function list(limit = 40) {
    const rows = await q("SELECT id, doc FROM ec_ai_runs ORDER BY id DESC LIMIT ?", [limit]);
    return rows.map((r) => ({ ...JSON.parse(r.doc), id: r.id }));
  }

  async function create({ kind, request, options = {}, user }) {
    if (!PIPELINES[kind]) throw new Error("Unknown run type.");
    const text = String(request || "").trim().slice(0, 4000);
    if (!text && kind !== "plan") throw new Error("Describe what you need.");
    const run = { kind, title: (text || PIPELINES[kind].label).slice(0, 120), request: text, options, status: "queued", steps: PIPELINES[kind].steps(), messages: [], artifacts: {}, created_by: user.email, created_at: nowIso() };
    run.steps.forEach((s, i) => (s.n = i + 1));
    const res = await q("INSERT INTO ec_ai_runs (created_at, status, doc) VALUES (?, ?, ?)", [Date.now(), run.status, JSON.stringify(run)]);
    const id = res.insertId;
    kick(id);
    return { ...run, id };
  }

  function kick(id) {
    if (running.has(id)) return;
    running.add(id);
    advance(id).catch(() => { /* recorded on the run */ }).finally(() => running.delete(id));
  }

  function log(run, from, to, text) { run.messages.push({ at: nowIso(), from, to, text: clip(text, 6000) }); if (run.messages.length > 120) run.messages.splice(0, run.messages.length - 120); }

  async function advance(id) {
    let g = await get(id);
    if (!g) return;
    let { run, ver } = g;
    for (let guard = 0; guard < 20; guard++) {
      if (["done", "failed", "cancelled"].includes(run.status)) return;
      const step = run.steps.find((s) => !["done", "skipped"].includes(s.status));
      if (!step) { run.status = "done"; run.finished_at = nowIso(); await save(run, ver); return; }
      if (step.status === "failed") { run.status = "failed"; await save(run, ver); return; }
      if (step.gate && !step.approved_by) { step.status = "needs_approval"; run.status = "awaiting_approval"; await save(run, ver); return; }
      if (step.status === "waiting") {
        const r = await poll(run, step);
        if (!r) { run.status = "waiting"; ver = await save(run, ver); return; }
        step.status = "done"; step.ended_at = nowIso(); ver = await save(run, ver); continue;
      }
      step.status = "running"; step.started_at = step.started_at || nowIso(); step.error = null; run.status = "running";
      ver = await save(run, ver);
      try {
        const r = await execute(run, step);
        step.status = r === "waiting" ? "waiting" : "done";
        if (step.status === "done") step.ended_at = nowIso();
      } catch (e) {
        step.status = "failed"; step.error = String(e?.message || e); step.ended_at = nowIso();
        log(run, step.provider, "studio", "Failed: " + step.error);
        run.status = "failed";
      }
      ver = await save(run, ver);
    }
  }

  // ---------------------------------------------------------------- step executors
  async function askClaude(run, step, prompt, opts = {}) {
    log(run, "studio", "claude", opts.note || prompt);
    const r = await providers.claude({ system: ELEVAY_RULES, prompt, ...opts });
    log(run, "claude", "studio", r.data ? clip(r.data) : r.text);
    step.output = r.data ?? r.text;
    return r;
  }

  async function execute(run, step) {
    const A = run.artifacts, opts = run.options || {};
    switch (`${step.provider}.${step.action}`) {
      case "claude.route": {
        const r = await askClaude(run, step, `A team member asked the ELEVAY AI Studio:\n"""${run.request}"""\n\nDecide who should handle it. Options:\n- "static": a static social post (OpenAI designs it)\n- "reel": a reel/video (OpenAI keyframes + Higgsfield clips + ELEVAY voice)\n- "plan": a marketing plan built from Meta + CRM data\n- "manus": anything that needs Meta (campaigns, posting, comments, messages, reports) or other connected platforms\n- "answer": a question you can answer from the live Meta + CRM data\nReturn JSON: {"route": one of the options, "why": short reason, "request": the request rewritten clearly for that pipeline}.`, { maxTokens: 600 });
        const route = PIPELINES[r.data?.route] && r.data.route !== "request" ? r.data.route : "answer";
        run.kind = route; run.request = String(r.data?.request || run.request);
        const fresh = PIPELINES[route].steps();
        run.steps = [step, ...fresh]; run.steps.forEach((s, i) => (s.n = i + 1));
        log(run, "studio", "team", `Routed to ${PIPELINES[route].label}: ${r.data?.why || ""}`);
        return;
      }
      case "claude.answer": {
        const live = await deps.liveReport(false).catch(() => null);
        const r = await askClaude(run, step, `Live ELEVAY Meta + CRM data (JSON):\n${liveSummary(live)}\n\nQuestion from the team:\n"""${run.request}"""\n\nAnswer in clear English (Arabic if the question is in Arabic), with numbers from the data. Say when the data does not cover something. Return JSON: {"answer": "..."}`, { note: `Question with live data attached: ${run.request}`, maxTokens: 2500 });
        A.answer = r.data?.answer || r.text;
        return;
      }
      case "claude.static_brief": {
        const r = await askClaude(run, step, `Write one ELEVAY static Instagram/Facebook post for this request:\n"""${run.request}"""\n${opts.program ? "Program: " + opts.program + "\n" : ""}Return JSON:\n{"topic": "...", "pillar": one of ["Family Security","Global Mobility","Long-term Planning","Premium Service","Ethical Advisory"], "program": "...", "headline_en": "English headline for inside the design, max 7 words, sentence case", "caption_ar": "MSA caption following every rule", "image_prompt": "Detailed English scene for the image model: setting, Arab/Middle Eastern people and clothing, light, composition with clear space top-left for the official logo, and the exact headline text to render. Must say no logo and no other text, no passports, no flags, no contact details.", "format": "1080x1080"}`);
        A.brief = { type: "static", topic: r.data.topic, pillar: r.data.pillar, program: r.data.program, caption_ar: r.data.caption_ar, disclaimer_used: "", design: { format: "1080x1080", headline_en: r.data.headline_en, image_prompt: r.data.image_prompt }, talent: { mode: "none" }, publish: { channel: "both", datetime_cairo: opts.datetime_cairo || "" } };
        return;
      }
      case "claude.reel_storyboard": {
        const r = await askClaude(run, step, `Write one ELEVAY reel for this request:\n"""${run.request}"""\n${opts.program ? "Program: " + opts.program + "\n" : ""}Return JSON:\n{"topic": "...", "pillar": "...", "program": "...", "caption_ar": "MSA caption following every rule", "music_direction": "royalty-free mood", "scenes": [4 × {"keyframe_prompt": "Detailed English 9:16 photo description of the first frame: setting, Arab/Middle Eastern people, elegant clothing incl. footwear, light. No text, no logo, no passports, no flags.", "motion_prompt": "English camera and subject motion for 5 seconds, subtle and cinematic, no speech, no text", "spoken_text_ar": "Egyptian Arabic voice-over for this clip, 8–13 words, country/company/program names in English letters"}]}`, { maxTokens: 5000 });
        const scenes = (r.data.scenes || []).slice(0, 4);
        if (scenes.length !== 4) throw new Error("Claude did not return 4 scenes.");
        A.brief = { type: "reel", topic: r.data.topic, pillar: r.data.pillar, program: r.data.program, caption_ar: r.data.caption_ar, disclaimer_used: "", talent: { mode: "voiceover_elevay_vip", voice_source: "elevay_vip_module", speech_language: "egyptian_arabic" }, reel: { storyboard: scenes.map((s, i) => ({ clip: i + 1, keyframe_prompt: s.keyframe_prompt, motion_prompt: s.motion_prompt, spoken_text_ar: s.spoken_text_ar, delivery_direction_en: "Calm, warm, premium advisory tone" })), music_direction: r.data.music_direction || "Soft cinematic, royalty-free", duration_s: 23 }, publish: { channel: "both", datetime_cairo: opts.datetime_cairo || "" } };
        return;
      }
      case "system.check_brief": {
        let check = R.checkBrief(A.brief);
        log(run, "studio", "studio", check.pass ? `Compliance check passed (${check.warnings.length} warning(s)).` : `Compliance check blocked: ${check.blocks.map((b) => b.label).join(" ")}`);
        if (!check.pass) {
          const r = await askClaude(run, step, `Your ELEVAY brief failed these blocking checks:\n${check.blocks.map((b) => "- " + b.label).join("\n")}\nWarnings:\n${check.warnings.map((b) => "- " + b.label).join("\n")}\n\nBrief:\n${JSON.stringify(A.brief)}\n\nReturn the corrected brief as JSON with exactly the same structure.`, { maxTokens: 5000 });
          A.brief = { ...A.brief, ...r.data, type: A.brief.type };
          check = R.checkBrief(A.brief);
          if (!check.pass) throw new Error("Still blocked after one fix: " + check.blocks.map((b) => b.label).join(" "));
        }
        step.output = { pass: true, warnings: check.warnings.map((w) => w.label) };
        return;
      }
      case "openai.static_image": {
        const d = A.brief.design;
        const prompt = `${d.image_prompt}\n\nRender this English headline exactly, cleanly, in a refined sans-serif, sentence case: "${d.headline_en}". Square 1:1 premium editorial social post. Leave the top-left corner clear for the official logo; do not draw any logo. No other text.\n\nDesign rules: ${ELEVAY_AGENTIC_DESIGN_STANDARD.replace(/\s+/g, " ").slice(0, 1800)}`.slice(0, 3990);
        log(run, "studio", "openai", prompt);
        const img = await providers.openaiImage({ prompt, purpose: "static_post" });
        let url = img.url;
        try { url = await providers.brandStatic(img.url); log(run, "studio", "studio", "Official ELEVAY logo composited."); }
        catch (e) { log(run, "studio", "studio", "Logo could not be composited automatically: " + e.message); }
        A.images = [{ url, raw_url: img.url, sha256: img.sha256, cost_usd: img.measuredCostUsd }];
        log(run, "openai", "studio", `Design ready (${img.width}×${img.height}${img.measuredCostUsd ? `, about $${img.measuredCostUsd}` : ""}).`);
        step.output = { images: A.images.map((i) => i.url) };
        return;
      }
      case "openai.reel_keyframes": {
        A.keyframes = A.keyframes || [];
        const sb = A.brief.reel.storyboard;
        for (let i = A.keyframes.length; i < 4; i++) {
          const prompt = `${sb[i].keyframe_prompt}\n\nVertical 9:16 cinematic premium photograph, first frame of a 5-second clip. No text, no logo, no passports, no flags.\n\nDesign rules: ${ELEVAY_AGENTIC_DESIGN_STANDARD.replace(/\s+/g, " ").slice(0, 2000)}`.slice(0, 3990);
          log(run, "studio", "openai", `Keyframe ${i + 1}: ${sb[i].keyframe_prompt}`);
          const img = await providers.openaiImage({ prompt, purpose: "reel_keyframe" });
          A.keyframes.push({ url: img.url, sha256: img.sha256, cost_usd: img.measuredCostUsd });
          log(run, "openai", "studio", `Keyframe ${i + 1} ready.`);
        }
        step.output = { keyframes: A.keyframes.map((k) => k.url) };
        return;
      }
      case "claude.qc_visual": {
        const imgs = run.kind === "reel" ? A.keyframes.map((k) => k.url) : A.images.map((i) => i.url);
        const r = await askClaude(run, step, `Check ${imgs.length > 1 ? "these " + imgs.length + " images" : "this image"} for ELEVAY (${run.kind === "reel" ? "reel keyframes, no text allowed" : `static post, the only text must be: "${A.brief.design.headline_en}"`}). Check: people are Arab/Middle Eastern in elegant clothing incl. footwear; no passports, flags, seals, contact details, URLs, QR codes; no AI-drawn logo; palette and premium editorial look; text spelling; anatomy. Return JSON: {"pass": true/false, "issues": ["..."], "per_image": [{"index": 1, "pass": true/false, "issues": ["..."]}]}`, { images: imgs, note: `Visual QC of ${imgs.length} image(s)`, maxTokens: 1500 });
        A.qc = r.data;
        if (r.data && r.data.pass === false) log(run, "studio", "team", "Claude flagged issues. Review them before approving the next step: " + (r.data.issues || []).join("; "));
        return;
      }
      case "higgsfield.clips": {
        A.clips = A.clips || [];
        const sb = A.brief.reel.storyboard;
        for (let i = A.clips.length; i < 4; i++) {
          const key = `ec-${run.id}-clip-${i + 1}-${A.keyframes[i].sha256.slice(0, 12)}`;
          log(run, "studio", "higgsfield", `Clip ${i + 1}: ${sb[i].motion_prompt}`);
          const r = await providers.higgsfieldSubmit({ runId: run.id, stepId: step.n, idempotencyKey: key, prompt: sb[i].motion_prompt, keyframe: A.keyframes[i] });
          A.clips.push({ requestId: r.requestId, statusUrl: r.statusUrl, state: "queued", url: null });
        }
        log(run, "higgsfield", "studio", "4 clips queued.");
        return "waiting";
      }
      case "system.to_weekly_plan": {
        const media = run.kind === "reel" ? { clips: A.clips.map((c) => c.url), keyframes: A.keyframes.map((k) => k.url) } : { image_url: A.images[0].url };
        let itemId;
        const r = await deps.mutate({}, (st) => {
          itemId = nextItemId(st.items, opts.week || undefined);
          return E.upsertBrief(st, { ...A.brief, item_id: itemId, status: "pending_approval", media, produced_by: { studio_run: run.id, claude: true, openai: true, higgsfield: run.kind === "reel" }, qc: { reviewer: "claude", pass: A.qc?.pass ?? null, issues: A.qc?.issues || [] } }, "ai-studio");
        });
        if (r && r.ok === false) throw new Error(r.error);
        A.item_id = itemId;
        log(run, "studio", "team", `Added to the weekly plan as ${itemId} for approval.${run.kind === "reel" ? " Voice-over and the final 23 s edit follow in the next step of the pipeline." : ""}`);
        return;
      }
      case "claude.plan": {
        const live = await deps.liveReport(false);
        const month = (() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 1, 1); return d.toISOString().slice(0, 7); })();
        const r = await askClaude(run, step, `Live ELEVAY Meta + CRM data (last 30 days and 6 months, JSON):\n${liveSummary(live)}\n\n${run.request ? "Team note: " + run.request + "\n\n" : ""}Write ELEVAY's marketing plan for ${month}. Goal: more qualified leads and clients at lower cost per qualified lead, within the 200,000 EGP monthly cap and 100 EGP max CPL. Cover: what worked and what didn't (with numbers), budget split by campaign/program, audiences and lead-form changes to cut unqualified leads, content themes for the 7 weekly posts (4 static + 3 reels), tests to run, and KPIs. Budget changes are proposals for the owner, not actions. Return JSON: {"title": "...", "body": "the full plan in clear English with headings", "budget_changes": [{"campaign": "...", "change": "...", "reason": "..."}]}`, { note: `Plan request for ${month} with live data attached`, maxTokens: 6000 });
        A.plan = { month, title: r.data.title, body: r.data.body, budget_changes: r.data.budget_changes || [] };
        return;
      }
      case "system.to_monthly_plan": {
        const r = await deps.mutate({}, (st) => E.addPlan(st, { ...A.plan, source: "ai-studio", studio_run: run.id }, "ai-studio"));
        if (r && r.ok === false) throw new Error(r.error);
        log(run, "studio", "team", `Plan for ${A.plan.month} sent to the Monthly plan tab for owner approval.`);
        return;
      }
      case "claude.manus_brief": {
        const r = await askClaude(run, step, `Turn this ELEVAY team request into precise instructions for Manus, an agent that operates Meta Business Suite and other platforms:\n"""${run.request}"""\nInclude: goal, exact steps, what must NOT be done (no spend above the 200,000 EGP monthly cap, no CPL above 100 EGP, nothing published or sent without owner approval unless the request says it was approved), and what to report back. Return JSON: {"instructions": "...", "needs_owner_approval": true/false, "why": "..."}`, { maxTokens: 1500 });
        A.manus = { instructions: r.data.instructions, needs_owner_approval: !!r.data.needs_owner_approval };
        const next = run.steps.find((s) => s.action === "job");
        if (next && A.manus.needs_owner_approval) { next.gate = "owner"; log(run, "studio", "team", "This changes something on Meta, so the owner must approve before Manus starts. " + (r.data.why || "")); }
        return;
      }
      case "manus.job": {
        let jobId;
        const r = await deps.mutate({}, (st) => { const j = E.enqueueJob(st, "custom", { request: A.manus.instructions, requested_by: run.created_by, studio_run: run.id, approved_by: step.approved_by || null }, "ai-studio"); jobId = j.id; return { ok: true }; });
        if (r && r.ok === false) throw new Error(r.error);
        A.manus_job = jobId;
        log(run, "studio", "manus", `Job ${jobId}: ${A.manus.instructions}`);
        return "waiting";
      }
      case "claude.summarize": {
        const r = await askClaude(run, step, `Manus finished this job for ELEVAY.\nInstructions: ${A.manus.instructions}\nResult: ${clip(A.manus_result, 8000)}\nSummarise for the marketing team in 3–6 bullet points, flag anything that needs a decision. Return JSON: {"summary": "..."}`, { maxTokens: 1200 });
        A.answer = r.data.summary;
        return;
      }
      default:
        throw new Error(`No executor for ${step.provider}.${step.action}`);
    }
  }

  // Returns true when the waiting step is finished.
  async function poll(run, step) {
    const A = run.artifacts;
    if (step.provider === "higgsfield") {
      for (const c of A.clips) {
        if (c.state === "completed") continue;
        const s = await providers.higgsfieldStatus(c).catch((e) => ({ state: c.state, error: e.message }));
        if (s.state !== c.state) log(run, "higgsfield", "studio", `Clip ${A.clips.indexOf(c) + 1}: ${s.state}`);
        c.state = s.state; if (s.videoUrl) c.url = s.videoUrl;
        if (["failed", "nsfw", "canceled"].includes(s.state)) { step.status = "failed"; step.error = `Clip ${A.clips.indexOf(c) + 1} ${s.state}. Retry creates a new clip.`; return false; }
      }
      return A.clips.every((c) => c.state === "completed");
    }
    if (step.provider === "manus") {
      const { state } = await deps.loadState();
      const j = state.jobs.find((x) => x.id === A.manus_job);
      if (!j) return false;
      if (j.status === "failed") { step.status = "failed"; step.error = "Manus job failed: " + clip(j.result?.error || "", 300); return false; }
      if (j.status !== "done") return false;
      A.manus_result = j.result || j.manus?.message || "done";
      log(run, "manus", "studio", clip(A.manus_result, 3000));
      return true;
    }
    return true;
  }

  async function approve(id, stepN, user) {
    const g = await get(id);
    if (!g) throw new Error("Run not found.");
    const step = g.run.steps.find((s) => s.n === Number(stepN));
    if (!step || step.status !== "needs_approval") throw new Error("That step is not waiting for approval.");
    if (step.gate === "owner" && user.role !== "owner") throw new Error("Only the owner can approve this step.");
    if (user.role === "viewer") throw new Error("Viewers cannot approve.");
    step.approved_by = user.email; step.approved_at = nowIso(); step.status = "pending"; g.run.status = "queued";
    log(g.run, user.email, "studio", `Approved: ${step.title}`);
    await save(g.run, g.ver);
    kick(id);
  }

  async function retry(id, user) {
    const g = await get(id);
    if (!g) throw new Error("Run not found.");
    const step = g.run.steps.find((s) => s.status === "failed");
    if (!step) throw new Error("Nothing to retry.");
    if (step.provider === "higgsfield") {
      if (user.role !== "owner") throw new Error("Only the owner can retry paid Higgsfield clips.");
      g.run.artifacts.clips = (g.run.artifacts.clips || []).filter((c) => c.state === "completed" || c.state === "queued" || c.state === "in_progress");
    }
    step.status = "pending"; step.error = null; g.run.status = "queued";
    log(g.run, user.email, "studio", `Retry: ${step.title}`);
    await save(g.run, g.ver);
    kick(id);
  }

  async function cancel(id, user) {
    const g = await get(id);
    if (!g) throw new Error("Run not found.");
    g.run.status = "cancelled"; log(g.run, user.email, "studio", "Cancelled.");
    await save(g.run, g.ver);
  }

  /** Background tick: resume waiting runs (Higgsfield clips, Manus jobs). */
  async function tick() {
    const rows = await q("SELECT id, status, doc FROM ec_ai_runs WHERE status IN ('waiting','queued','running') ORDER BY id LIMIT 30");
    for (const r of rows) {
      if (r.status !== "running") { kick(r.id); continue; }
      if (running.has(r.id)) continue;
      // A step that was running when the server restarted: never re-run paid work silently.
      const doc = JSON.parse(r.doc);
      if (Date.now() - Date.parse(doc.updated_at || doc.created_at) < 10 * 60 * 1000) continue;
      const g = await get(r.id);
      const step = g.run.steps.find((s) => s.status === "running");
      if (step) { step.status = "failed"; step.error = "Interrupted (server restart). Press Retry to run this step again."; }
      g.run.status = "failed";
      await save(g.run, g.ver).catch(() => {});
    }
  }

  return { ensureTable, create, list, get: async (id) => (await get(id))?.run || null, approve, retry, cancel, tick, test: () => providers.test() };
}
