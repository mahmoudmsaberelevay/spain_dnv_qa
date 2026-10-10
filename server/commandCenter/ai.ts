// @ts-nocheck
/*
 * AI Studio: the orchestrator that links Claude, OpenAI, Higgsfield and Manus.
 *
 *   Claude      → the conductor: routes requests, writes briefs/plans, and performs final visual checks
 *   OpenAI      → reel storyboards and Egyptian-Arabic narration, plus static designs and reel keyframes
 *   Higgsfield  → 4 × 5 s reel clips from the OpenAI keyframes (HF_API_KEY)
 *   Manus       → Meta and anything that needs its connectors, through the existing job queue
 *
 * Every run is a list of steps. Each step records the instruction sent to a model and
 * the answer it returned, so the team sees the conversation between the models.
 * Autopilot: every Saturday Claude plans next week's 7 posts (4 static + 3 reels) from the live
 * Meta + CRM data and the approved monthly plan, and starts their production; in the last week
 * of each month it drafts next month's plan.
 * OpenAI runs without approval. Higgsfield clips, Meta-changing Manus tasks, posts and plans need
 * the owner during the first weeks; once the 6-week / 90% first-pass gate is reached (autopublish
 * on), they run automatically. The kill switch (any rejection, compliance flag, rolling rate below
 * 85%) returns them to manual. Runs Manus starts are automatic. A weekly reel limit caps
 * Higgsfield spend, and Meta work stays inside the 200,000 EGP cap and 100 EGP max CPL.
 */
import { ELEVAY_LOCKED_VOICE_POLICY as ELEVAY_ARABIC_VOICE_DEFAULTS } from "../../shared/elevayVoicePolicy";
import crypto from "crypto";
import { ELEVAY_AGENTIC_DESIGN_STANDARD } from "@shared/elevayAgenticDesignStandard";
import { spawn } from "child_process";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { assetPath, CREATIVE_DIRECTION, programFactsFor, allProgramFacts, fullProgramSource, DELIVERY_CHECKLIST } from "./knowledge";

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
- Voice-over scripts: natural Egyptian Arabic (عامية مصرية: بنبدأ، معاك، علشان، محتاج، خلينا، تقدر), 8–13 words per 5-second scene, one idea per scene. Country names (Spain, Malta, Portugal, Greece, Canada, United Kingdom…) and the company name ELEVAY are written in English letters for correct pronunciation; everything else, including city names and program types, is written in Arabic. No other English words.
- Instagram/Facebook caption_ar is Modern Standard Arabic (العربية الفصحى), NOT Egyptian dialect. This is independent of the spoken Egyptian Arabic scene script.
- Positioning: a strategic global mobility advisory firm, never an immigration broker or "visa agent". Messaging pillars: Family Security, Global Mobility, Long-term Planning, Premium Service, Ethical Advisory.
${CREATIVE_DIRECTION}
${ELEVAY_AGENTIC_DESIGN_STANDARD}`;

// ------------------------------------------------------------------ reel media (voice + final edit)
async function binOf(name) {
  try { const m = await import("../mediaExecutables"); return (name === "ffprobe" ? m.FFPROBE_BIN : m.FFMPEG_BIN) || name; } catch { return name; }
}
/** Duration of a media file in seconds (ffprobe). */
export async function mediaSeconds(file: string) {
  const bin = await binOf("ffprobe");
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => { const v = parseFloat(out); code === 0 && Number.isFinite(v) ? resolve(v) : reject(new Error("Could not read media duration.")); });
  });
}
export const REEL = { scene: 5, fade: 0.3, outro: 3, maxVoice: 4.85, maxTempo: 1.12 };

// All reel encoding is owned by scripts/elevay-reel-render.mjs on an external disk-backed worker.
// Do not restore any web-process compose fallback: the container memory limit is shared with FFmpeg.
export const REEL_STAGES = ["seg0", "seg1", "seg2", "seg3", "outro", "audio", "final"] as const;
const REEL_THREADS = 1;

/** Wrap an English headline into at most 3 lines for the static design. */
export function wrapHeadline(text: string, max = 22) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + w).length <= max) lines[lines.length - 1] = last + " " + w; else lines.push(w);
  }
  if (lines.length > 3) throw new Error("The design headline is too long for three lines; Claude must shorten it.");
  return lines.join("\n");
}

/** The first real FFmpeg error line (the last lines are usually generic "nothing was written"). */
export function ffmpegReason(err: string) {
  const lines = String(err).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const real = lines.find((l) => !/Terminating thread|Nothing was written|Conversion failed|Error while (?:filtering|processing)|Task finished with error/i.test(l));
  return (real ? real + (lines.length > 1 ? " … " + lines[lines.length - 1] : "") : lines.slice(-2).join(" ")).slice(0, 400);
}
function runFfmpeg(args, timeoutMs = 240000) {
  return new Promise(async (resolve, reject) => {
    let bin = "ffmpeg";
    try { bin = (await import("../mediaExecutables")).FFMPEG_BIN || bin; } catch { /* system ffmpeg */ }
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Media composition timed out.")); }, timeoutMs);
    child.stderr.on("data", (d) => { err = (err + d).slice(-3000); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error("Media composition failed: " + ffmpegReason(err))); });
  });
}

/**
 * Final ELEVAY static: 1080×1080, the OpenAI photograph, a soft dark-navy fade for legibility,
 * the English headline in the official Apex Sans font and the exact official logo top-left.
 */
export async function composeElevayStatic(source: Buffer, headline: string, format = "1080x1080") {
  const [W, H] = format === "1080x1350" ? [1080, 1350] : [1080, 1080];
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "elevay-cc-static-"));
  try {
    const src = path.join(dir, "photo.png"), txt = path.join(dir, "headline.txt"), out = path.join(dir, "final.png");
    await Promise.all([fsp.writeFile(src, source), fsp.writeFile(txt, wrapHeadline(headline))]);
    const esc = (p) => p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
    const filter = [
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},format=rgba[base]`,
      `color=c=0x3D4750:s=${W}x${H},format=rgba,geq=r='61':g='71':b='80':a='if(gte(Y,${Math.round(H * 0.52)}),min(215,(Y-${Math.round(H * 0.52)})*0.42),0)'[shade]`,
      "[base][shade]overlay=0:0[toned]",
      `[toned]drawtext=fontfile='${esc(assetPath("ApexSansBook.ttf"))}':textfile='${esc(txt)}':fontcolor=0xFFFFFF:fontsize=66:line_spacing=16:x=80:y=h-th-96[texted]`,
      "[1:v]scale=118:-1:flags=lanczos[logo]",
      "[texted][logo]overlay=x=56:y=52:format=auto[out]",
    ].join(";");
    try {
      if (process.env.ELEVAY_TEXT_RASTER === "1") throw new Error("Filter not found (forced)");
      await runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-i", assetPath("elevay-logo.png"), "-filter_complex", filter, "-map", "[out]", "-frames:v", "1", out]);
    } catch (e) {
      // This server's FFmpeg has no drawtext filter: set the headline with the same font file in JavaScript instead.
      if (!/filter not found|no such filter/i.test(String(e?.message || e))) throw e;
      const { renderTextRGBA } = await import("./textRaster");
      const lines = wrapHeadline(headline).split("\n");
      const t = renderTextRGBA(await fsp.readFile(assetPath("ApexSansBook.ttf")), lines, 66, 16, W - 160);
      const raw = path.join(dir, "headline.rgba");
      await fsp.writeFile(raw, t.rgba);
      const rasterFilter = [
        filter.split(";")[0], filter.split(";")[1], "[base][shade]overlay=0:0[toned]",
        "[2:v]format=rgba[txt]", "[toned][txt]overlay=x=80:y=H-h-96:format=auto[texted]",
        "[1:v]scale=118:-1:flags=lanczos[logo]", "[texted][logo]overlay=x=56:y=52:format=auto[out]",
      ].join(";");
      await runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-i", assetPath("elevay-logo.png"), "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${t.width}x${t.height}`, "-i", raw, "-filter_complex", rasterFilter, "-map", "[out]", "-frames:v", "1", out]);
    }
    return await fsp.readFile(out);
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
}

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

export function makeProviders(fetcher = fetch, renderQueue = null) {
  async function claude({ system, prompt, images = [], maxTokens = 4000, json = true, repairing = false }) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set on elevay.vip.");
    const content = [...images.map((im) => (typeof im === "string" || im.url ? { type: "image", source: { type: "url", url: typeof im === "string" ? im : im.url } } : { type: "image", source: { type: "base64", media_type: im.mediaType || "image/jpeg", data: im.base64 } })), { type: "text", text: prompt }];
    const res = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL(), max_tokens: maxTokens, system, messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(180000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Claude: ${body?.error?.message || `HTTP ${res.status}`}`);
    const text = (body.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    if (!json) return { text, data: null, usage: body.usage || null, model: body.model || CLAUDE_MODEL() };
    try {
      return { text, data: extractJson(text), usage: body.usage || null, model: body.model || CLAUDE_MODEL() };
    } catch (e) {
      // One repair pass: the answer was cut off or had a broken quote. Ask again for valid JSON only.
      if (repairing) throw e;
      const cut = body.stop_reason === "max_tokens";
      const fix = await claude({
        system, maxTokens: Math.min(Math.round(maxTokens * (cut ? 1.6 : 1.2)), 12000), repairing: true,
        prompt: cut
          ? `${prompt}\n\nYour previous answer was cut off. Answer again, more concisely, as one valid JSON object only — no text before or after it.`
          : `This should be one valid JSON object but it does not parse (likely an unescaped quote or a missing comma). Return the same content as valid JSON only, nothing else. Escape any double quotes inside strings.\n\n${text}`,
      });
      return { ...fix, usage: body.usage || fix.usage };
    }
  }

  /**
   * OpenAI owns reel direction and every Egyptian-Arabic spoken script. This is
   * separate from image generation so a writing request can never switch voice,
   * language, or turn into a render request.
   */
  async function openaiText({ system, prompt, maxTokens = 4000, json = true }) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set on elevay.vip.");
    const model = process.env.ELEVAY_OPENAI_TEXT_MODEL || "gpt-5-mini";
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      max_completion_tokens: maxTokens,
    };
    if (json) body.response_format = { type: "json_object" };
    const res = await fetcher("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    });
    const response = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`OpenAI writing: ${response?.error?.message || `HTTP ${res.status}`}`);
    const text = String(response?.choices?.[0]?.message?.content || "");
    if (!text) throw new Error("OpenAI returned no reel direction.");
    return { text, data: json ? extractJson(text) : null, usage: response.usage || null, model: response.model || model };
  }

  async function openaiImage({ prompt, purpose }) {
    const { createElevayOpenAiKeyframe } = await import("../elevayOpenAiVisuals");
    return createElevayOpenAiKeyframe({ prompt, purpose });
  }

  /** Portrait 4:5 statics: OpenAI 1024×1536, cropped to 1080×1350 when composed. */
  async function openaiPortrait({ prompt }) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set on elevay.vip.");
    const { ELEVAY_OPENAI_VISUAL_MODEL, ELEVAY_OPENAI_VISUAL_QUALITY } = await import("../elevayOpenAiVisuals");
    const res = await fetcher("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: ELEVAY_OPENAI_VISUAL_MODEL, prompt, n: 1, size: "1024x1536", quality: ELEVAY_OPENAI_VISUAL_QUALITY, output_format: "png" }), signal: AbortSignal.timeout(300000) });
    if (!res.ok) throw new Error(`OpenAI image request returned HTTP ${res.status}.`);
    const body = await res.json();
    const b64 = body.data?.[0]?.b64_json;
    if (typeof b64 !== "string") throw new Error("OpenAI returned no image.");
    const bytes = Buffer.from(b64, "base64");
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const { storagePut } = await import("../storage");
    const stored = await storagePut(`marketing/command-center/openai/${sha256.slice(0, 24)}.png`, bytes, "image/png");
    const u = body.usage || {};
    const cost = Number.isFinite(u.input_tokens) && Number.isFinite(u.output_tokens) ? Math.ceil(((u.input_tokens * 5 + u.output_tokens * 30) / 1e6) * 1e4) / 1e4 : null;
    return { url: stored.url, sha256, width: 1024, height: 1536, measuredCostUsd: cost };
  }

  /** Three frames (start, middle, end) of a 5 s clip for Claude's frame-by-frame QC. */
  async function clipFrames(url) {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "elevay-cc-frames-"));
    try {
      const src = path.join(dir, "clip.mp4");
      await fsp.writeFile(src, Buffer.from(await (await fetcher(url)).arrayBuffer()));
      const out = [];
      for (const [i, t] of [0.3, 2.5, 4.6].entries()) {
        const f = path.join(dir, `f${i}.jpg`);
        await runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-ss", String(t), "-i", src, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", f]);
        out.push({ base64: (await fsp.readFile(f)).toString("base64"), mediaType: "image/jpeg" });
      }
      return out;
    } finally { await fsp.rm(dir, { recursive: true, force: true }); }
  }

  /** One take per scene with the ELEVAY voice clone configured on elevay.vip. */
  async function voiceScene(text) {
    const tts = await import("../elevenLabsTts");
    const r = await tts.generateElevayVideoVoiceOver(text);
    const bytes = Buffer.from(await (await fetcher(r.url)).arrayBuffer());
    return { url: r.url, sha256: r.sha256, bytes, script: r.script, voiceId: r.voiceId, model: r.model, languageCode: r.languageCode, dialect: r.dialect, requestId: r.requestId };
  }
  async function checkEgyptianScript(text) {
    const { prepareEgyptianReelNarration } = await import("@shared/elevayVideoNarration");
    return prepareEgyptianReelNarration(text);
  }
  // Deliberately no FFmpeg fallback in the web container. An external worker owns rendering.
  async function composeReel(input) { return composeReelStep(input); }
  async function composeReelStep(input) {
    if (!renderQueue) throw new Error("Waiting for render worker: no external queue adapter is configured.");
    return renderQueue.compose(input);
  }
  async function videoFrames(url, times, evidence = []) {
    if (!Array.isArray(evidence) || evidence.length < 77) throw new Error("Full-frame final review evidence is missing. Waiting for external render worker; no website decoding is allowed.");
    return evidence.map(e => ({ url: e.url, label: e.label }));
  }

  async function brandStatic(url, headline, format) {
    // Official ELEVAY font + exact official logo composited on the photograph (never AI-drawn).
    const { storagePut } = await import("../storage");
    const src = Buffer.from(await (await fetcher(url)).arrayBuffer());
    const bytes = await composeElevayStatic(src, headline, format);
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

  async function persistClip(url) {
    const { createWriteStream, createReadStream } = await import("node:fs");
    const { Readable, Transform } = await import("node:stream");
    const { pipeline } = await import("node:stream/promises");
    const { storagePutFile } = await import("../storage");
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "elevay-clip-store-"));
    try {
      const file = path.join(dir, "clip.mp4");
      const source = new URL(url);
      if (source.protocol !== "https:" || source.username || source.password || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[|172\.(1[6-9]|2\d|3[01])\.)/i.test(source.hostname)) throw new Error("Clip persistence requires a public HTTPS provider asset.");
      const response = await fetcher(url, { signal: AbortSignal.timeout(120000), redirect: "error" });
      if (!response.ok || !response.body) throw new Error("Completed clip could not be saved; no regeneration was started.");
      let size = 0;
      await pipeline(Readable.fromWeb(response.body), new Transform({transform(chunk, _, cb) { size += chunk.length; cb(size > 100 * 1024 * 1024 ? new Error("Clip exceeds storage size limit.") : null, chunk); }}), createWriteStream(file));
      const hash = crypto.createHash("sha256");
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      const sha256 = hash.digest("hex");
      const stored = await storagePutFile(`marketing/command-center/clips/${sha256}.mp4`, file, "video/mp4");
      return { url: stored.url, sha256 };
    } finally { await fsp.rm(dir, { recursive: true, force: true }); }
  }

  async function test() {
    const out = {};
    const k = (name) => !!process.env[name];
    out.claude = k("ANTHROPIC_API_KEY") ? await claude({ system: "Reply with OK.", prompt: "ping", maxTokens: 5, json: false }).then((r) => ({ ok: true, detail: r.model }), (e) => ({ ok: false, detail: e.message })) : { ok: false, detail: "ANTHROPIC_API_KEY is not set" };
    out.openai = k("OPENAI_API_KEY") ? await fetcher("https://api.openai.com/v1/models?limit=1", { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(20000) }).then((r) => ({ ok: r.ok, detail: r.ok ? "Key accepted" : `HTTP ${r.status}` }), (e) => ({ ok: false, detail: e.message })) : { ok: false, detail: "OPENAI_API_KEY is not set" };
    out.elevenlabs = k("ELEVENLABS_API_KEY") ? { ok: true, detail: "Key is set; ELEVAY voice clone checked on the first voice-over" } : { ok: false, detail: "ELEVENLABS_API_KEY is not set" };
    out.media = await new Promise(async (resolve) => {
      let bin = "ffmpeg";
      try { bin = (await import("../mediaExecutables")).FFMPEG_BIN || bin; } catch { /* system ffmpeg */ }
      const child = spawn(bin, ["-hide_banner", "-filters"], { stdio: ["ignore", "pipe", "ignore"] });
      let txt = ""; child.stdout.on("data", (d) => (txt += d));
      child.on("error", (e) => resolve({ ok: false, detail: "FFmpeg not available: " + e.message }));
      child.on("close", () => resolve({ ok: true, detail: / drawtext /.test(txt) ? "FFmpeg ready (headline text: built-in)" : "FFmpeg ready (headline text: JavaScript fallback, same font)" }));
    });
    out.higgsfield = k("HF_API_KEY") ? { ok: true, detail: "Key is set (checked when the first clip is submitted)" } : { ok: false, detail: "HF_API_KEY is not set" };
    return out;
  }

  return { claude, openaiText, openaiImage, openaiPortrait, brandStatic, clipFrames, voiceScene, checkEgyptianScript, composeReel, composeReelStep, videoFrames, higgsfieldSubmit, higgsfieldStatus, persistClip, test };
}

// ------------------------------------------------------------------ pipelines
const S = (provider, action, title, extra = {}) => ({ provider, action, title, status: "pending", ...extra });
export const PIPELINES = {
  carousel: { label: "Carousel revision", steps: () => [
    S("claude", "revise_content", "Apply owner-authorized carousel change"),
    S("openai", "carousel_slides", "Regenerate only affected carousel slides"),
    S("claude", "qc_carousel", "Claude checks the revised carousel and caption"),
    S("system", "to_weekly_plan", "Apply reviewed version to weekly plan"),
  ] },
  static: { label: "Static post", steps: () => [
    S("claude", "static_brief", "Claude writes the brief, caption and image direction"),
    S("system", "check_brief", "Brand and compliance check (Claude fixes blocks once)"),
    S("openai", "static_image", "OpenAI designs the static"),
    S("claude", "qc_visual", "Claude checks the design against the ELEVAY rules (redesigns up to 2 times)"),
    S("system", "to_weekly_plan", "Send to the weekly plan for owner approval"),
  ] },
  reel: { label: "Reel", steps: () => [
    S("openai", "reel_storyboard", "OpenAI writes the 4-scene storyboard, MSA caption and Egyptian Arabic voice-over"),
    S("openai", "reel_keyframes", "OpenAI creates the 4 keyframes (9:16)"),
    S("higgsfield", "clips", "Higgsfield animates 4 × 5 s clips", { gate: "owner" }),
    S("elevenlabs", "voice", "ELEVAY voice clone reads the Egyptian Arabic script, one take per scene"),
    S("system", "compose_reel", "External render worker combines clips, ELEVAY voice and 3 s white logo outro under OpenAI edit direction"),
    S("claude", "qc_final", "Claude performs the comprehensive finished-reel check"),
    S("system", "to_weekly_plan", "Send the finished reel to the weekly plan"),
  ] },
  weekly_plan: { label: "Weekly plan (automatic)", steps: () => [
    S("claude", "weekly_plan", "Claude plans the week's 7 posts from Meta + CRM results and the monthly plan"),
    S("system", "spawn_week", "Start production of the 4 statics and 3 reels"),
  ] },
  plan: { label: "Monthly plan from data", steps: () => [
    S("claude", "plan", "Claude drafts next month's plan from 6 months of Meta + CRM data"),
    S("system", "to_monthly_plan", "Send to the monthly plan for owner approval"),
  ] },
  meta: { label: "Meta campaign change", steps: () => [
    S("claude", "meta_plan", "Claude turns the request into Meta actions using live campaign data"),
    S("system", "queue_meta", "Queue them in the Meta tab (cap and CPL checked; owner approves until autopilot)"),
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
export function nextItemId(items, week = isoWeek(), planned = false) {
  const used = new Set(items.filter((i) => String(i.item_id).startsWith(week + "-")).map((i) => Number(i.item_id.slice(-2))));
  let n = planned ? 1 : Math.max(7, ...used) + 1;
  while (used.has(n)) n++;
  if (n > 99) throw new Error(`No free item number left in ${week}.`);
  return `${week}-${String(n).padStart(2, "0")}`;
}
/** Cairo calendar parts for scheduling. */
export function cairoParts(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, weekday: p.weekday, day: +p.day };
}
/** The week Saturday's planning is for: the ISO week that starts two days later. */
export function planningWeek(ms = Date.now()) { return isoWeek(new Date(ms + 2 * 86400000)); }
const WEEKDAY_DATES = (week) => { // Sunday..Saturday dates (Cairo) of the publishing week around that ISO week's Monday
  const [y, w] = week.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4)); const mon = new Date(jan4); mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (w - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setUTCDate(mon.getUTCDate() - 1 + i); return d.toISOString().slice(0, 10); });
};

function liveSummary(live) {
  if (!live) return "No live data available.";
  const pick = { window: live.window, alerts: live.alerts, adsTotal: live.ads?.total, campaigns: (live.ads?.campaigns || []).slice(0, 12).map((c) => ({ campaign: c.campaign, status: c.status, spend: Math.round(c.spend), leads: c.leads, cpl: c.cpl && Math.round(c.cpl), crmLeads: c.crmLeads, qualified: c.qualified, clients: c.clients })), crm30: live.crm, page: live.page && { views: live.page.views?.total, newLikes: live.page.newLikes?.total, unlikes: live.page.unlikes?.total }, analysis: live.analysis && { byMonth: live.analysis.byMonth, findings: live.analysis.findings, recommendations: live.analysis.recommendations, budgetSplit: live.analysis.budgetSplit, programs: live.analysis.programs?.slice(0, 8), unqualifiedReasons: live.analysis.unqualifiedReasons } };
  return clip(pick, 14000);
}

const RETIRED_REEL_ACTIONS = new Set(["check_brief", "qc_visual", "qc_clips"]);
const FINISHED_STEP_STATUSES = new Set(["done", "skipped", "needs_review"]);

/**
 * Existing runs are durable documents, not a disposable queue. Migrate reel documents by action
 * (rather than their old numeric index), so a keyframe, paid clip submission, voice take, owner
 * approval, and final output survive removing the intermediate reel-only QC steps.
 */
function migrateReelPipeline(run) {
  if (run?.kind !== "reel" || !Array.isArray(run.steps)) return false;
  const revisionStep = run.steps.find(s => s.action === "revise_content");
  const wanted = revisionStep ? [revisionStep, ...PIPELINES.reel.steps()] : PIPELINES.reel.steps();
  const oldActions = run.steps.map((s) => s?.action);
  const current = wanted.length === run.steps.length && wanted.every((s, i) => oldActions[i] === s.action && run.steps[i]?.provider === s.provider && run.steps[i]?.title === s.title);
  if (current) return false;

  const byAction = new Map(run.steps.filter(Boolean).map((s) => [s.action, s]));
  const retiredFailure = run.steps.some((s) => RETIRED_REEL_ACTIONS.has(s?.action) && s.status === "failed");
  run.steps = wanted.map((fresh, i) => {
    const saved = byAction.get(fresh.action);
    const next = saved ? { ...fresh, ...saved, provider: fresh.provider, action: fresh.action, title: fresh.title } : fresh;
    // A legacy QC block skipped downstream work. Those retired checks no longer control reels.
    if (next.status === "skipped" && /keyframe|design QC|paid clips|visual QC|clip QC/i.test(String(next.error || ""))) {
      next.status = "pending";
      next.error = null;
    }
    next.n = i + 1;
    return next;
  });
  if (retiredFailure && run.status === "failed") run.status = "queued";
  return true;
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
    if (!r) return null;
    const run = { ...JSON.parse(r.doc), id: r.id };
    const migrated = migrateReelPipeline(run);
    return { run, ver: r.ver, migrated };
  }
  async function save(run, ver) {
    run.updated_at = nowIso();
    if (run.options?.sandboxOnly && ["running", "queued", "waiting"].includes(run.status)) run.status = `sandbox_${run.status}`;
    const res = await q("UPDATE ec_ai_runs SET doc=?, status=?, ver=ver+1 WHERE id=? AND ver=?", [JSON.stringify(run), run.status, run.id, ver]);
    if (res.affectedRows !== 1) throw new Error("The run changed while saving.");
    return ver + 1;
  }
  async function list(limit = 40) {
    const rows = await q("SELECT id, doc FROM ec_ai_runs ORDER BY id DESC LIMIT ?", [limit]);
    return rows.map((r) => {
      const run = { ...JSON.parse(r.doc), id: r.id };
      migrateReelPipeline(run);
      return run;
    });
  }

  /** Notify once only; notification failures must never conceal the saved run state. */
  async function notifyFailureOnce(run, reason) {
    if (!deps.notifyFailure || run.failure_notified_at) return;
    run.failure_notified_at = nowIso();
    try { await deps.notifyFailure({ runId: run.id, kind: run.kind, title: run.title, stepName: run.steps.find(s => ["failed", "needs_review"].includes(s.status))?.title, reason, status: run.status, artifacts: run.artifacts }); }
    catch (e) { run.failure_notification_error = clip(String(e?.message || e), 300); }
  }

  async function saveCheckpoint(run, ver, note) {
    if (note) log(run, "studio", "studio", note);
    return save(run, ver);
  }

  async function create({ kind, request, options = {}, user, initialArtifacts, initialSteps }) {
    if (!PIPELINES[kind]) throw new Error("Unknown run type.");
    const text = String(request || "").trim().slice(0, 4000);
    if (!text && kind !== "plan") throw new Error("Describe what you need.");
    if (options.sandboxOnly && !deps.allowSandboxRuns) throw new Error("Sandbox-only runs require an explicitly authorized finite worker.");
    if (options.revision && user.role !== "owner") throw new Error("Only the owner can authorize an automatic content revision.");
    if (options.revision) options = { ...options, revision: { ...options.revision, authorizedBy: user.email } };
    const run = { kind, title: (text || PIPELINES[kind].label).slice(0, 120), request: text, options, status: "queued", steps: PIPELINES[kind].steps(), messages: [], artifacts: {}, created_by: user.email, created_at: nowIso() };
    if (initialArtifacts) run.artifacts = structuredClone(initialArtifacts);
    if (initialSteps) run.steps = structuredClone(initialSteps);
    run.steps.forEach((s, i) => (s.n = i + 1));
    if (options.revision) for (const s of run.steps) if (s.gate === "owner") { s.approved_by = user.email; s.approved_at = nowIso(); }
    if (options.sandboxOnly) run.status = "sandbox_queued";
    const res = await q("INSERT INTO ec_ai_runs (created_at, status, doc) VALUES (?, ?, ?)", [Date.now(), run.status, JSON.stringify(run)]);
    const id = res.insertId;
    if (options.revision?.jobId) {
      const bound = await deps.mutate({}, st => {
        const job = st.jobs.find(j=>j.id === options.revision.jobId && j.type === "revise_item" && j.payload?.owner_authorized === true && j.payload.item_id === options.revision.itemId && Number(j.payload.base_version) === Number(options.revision.baseVersion));
        if (!job || (job.payload.run_id && String(job.payload.run_id) !== String(id))) return {ok:false,error:"Durable revision job could not be bound."};
        job.payload.run_id = String(id); job.status = "in_progress"; job.manus = {...job.manus,push_attempted:true};
        return {ok:true};
      });
      if (bound?.ok === false) { const saved = await get(id); saved.run.status = "failed"; saved.run.steps[0].status="failed"; saved.run.steps[0].error=bound.error; await save(saved.run,saved.ver); throw new Error(bound.error); }
    }
    kick(id);
    return { ...run, id };
  }

  // Run a few at a time: seven runs at once (four images + three reels) is too much for the web server.
  const MAX_ACTIVE = Math.max(1, Number(process.env.ELEVAY_STUDIO_CONCURRENCY) || 2);
  function kick(id) {
    if (running.has(id) || running.size >= MAX_ACTIVE) return; // the 45-second tick starts it later
    running.add(id);
    advance(id).catch(() => { /* recorded on the run */ }).finally(() => running.delete(id));
  }

  function log(run, from, to, text) { run.messages.push({ at: nowIso(), from, to, text: clip(text, 6000) }); if (run.messages.length > 120) run.messages.splice(0, run.messages.length - 120); }

  async function advance(id) {
    let g = await get(id);
    if (!g) return;
    let { run, ver } = g;
    if (run.options?.sandboxOnly && !deps.allowSandboxRuns) return;
    if (g.migrated) ver = await save(run, ver);
    for (let guard = 0; guard < 40; guard++) {
      if (["done", "failed", "cancelled", "needs_review"].includes(run.status)) return;
      const step = run.steps.find((s) => !["done", "skipped", "needs_review"].includes(s.status));
      if (!step) { run.status = "done"; run.finished_at = nowIso(); await save(run, ver); return; }
      if (step.status === "failed") { run.status = "failed"; await notifyFailureOnce(run, step.error || `${step.title} failed.`); await save(run, ver); return; }
      if (step.gate && !step.approved_by) {
        const auto = run.options?.revision?.authorizedBy || await autoApproval(run, step);
        if (auto) { step.approved_by = auto; step.approved_at = nowIso(); log(run, "studio", "team", `Approved automatically (${auto}): ${step.title}`); }
        else { step.status = "needs_approval"; run.status = "awaiting_approval"; await save(run, ver); return; }
      }
      if (step.status === "waiting") {
        const r = await poll(run, step, async (note) => { ver = await saveCheckpoint(run, ver, note); });
        if (!r) {
          if (step.status === "failed") {
            run.status = "failed";
            await notifyFailureOnce(run, step.error || `${step.title} failed.`);
          } else run.status = "waiting";
          ver = await save(run, ver);
          return;
        }
        step.status = "done"; step.ended_at = nowIso(); ver = await save(run, ver); continue;
      }
      step.status = "running"; step.started_at = step.started_at || nowIso(); step.error = null; run.status = "running";
      ver = await save(run, ver);
      try {
        const r = await execute(run, step, async (note) => { ver = await saveCheckpoint(run, ver, note); });
        if (r === "needs_review") {
          step.status = "needs_review";
          step.ended_at = nowIso();
          run.status = "needs_review";
          await notifyFailureOnce(run, step.error || `${step.title} needs manual review.`);
          ver = await save(run, ver);
          return;
        }
        step.status = r === "waiting" ? "waiting" : r === "rewind" ? "pending" : "done";
        if (step.status === "done") step.ended_at = nowIso();
      } catch (e) {
        const msg = String(e?.message || e);
        // Optimistic locking means another worker already saved a newer durable state. Never
        // overwrite it or report a false failure; the regular tick resumes from that state.
        if (msg === "The run changed while saving.") return;
        // An image or Claude call that timed out is retried once by itself before the run is marked failed.
        if (/timed? ?out|aborted|ETIMEDOUT|ECONNRESET|socket hang up|HTTP 5\d\d/i.test(msg) && !["higgsfield", "elevenlabs"].includes(step.provider) && !step.timeout_retried) {
          step.timeout_retried = true; step.status = "pending"; step.error = null;
          log(run, step.provider, "studio", `Timed out (${msg}); trying once more.`);
          ver = await save(run, ver);
          continue;
        }
        step.status = "failed"; step.error = msg; step.ended_at = nowIso();
        log(run, step.provider, "studio", "Failed: " + step.error);
        run.status = "failed";
        await notifyFailureOnce(run, msg);
      }
      ver = await save(run, ver);
    }
  }

  // ---------------------------------------------------------------- automation rules
  async function autopilotOn() {
    const { state } = await deps.loadState();
    return { on: !!state.settings.autopublish?.enabled, state };
  }
  async function reelsThisWeek() {
    const rows = await q("SELECT id, doc FROM ec_ai_runs ORDER BY id DESC LIMIT ?", [200]);
    const since = Date.now() - 7 * 86400000;
    return rows.map((r) => JSON.parse(r.doc)).filter((r) => Date.parse(r.created_at) >= since && r.steps.some((s) => s.provider === "higgsfield" && s.approved_by)).length;
  }
  /** Returns who approved automatically, or null when a person must approve. */
  async function autoApproval(run, step) {
    const { on, state } = await autopilotOn();
    const autoClips = step.provider === "higgsfield" && state.settings.studio?.autoClips !== false;
    const why = run.options?.auto ? "Manus request" : on ? "autopilot: 6-week 90% gate reached" : autoClips ? "owner setting: make clips automatically" : null;
    if (!why) return null;
    if (step.provider === "higgsfield") {
      const limit = Number(state.settings.studio?.reelLimitPerWeek ?? 6);
      if ((await reelsThisWeek()) >= limit) { log(run, "studio", "team", `Weekly reel limit (${limit}) reached, so the owner must approve these clips.`); return null; }
    }
    return why;
  }

  // ---------------------------------------------------------------- step executors
  function strictQcPrompt(what) {
    return `You are ELEVAY's strict design reviewer. Review ${what}.\nFail an image only for a clear, visible breach of a rule below. Small imperfections that a viewer would not notice at phone size (a slight fold, a faint perspective lean) are notes in \"issues\", not a fail. When you do fail an image, say exactly what to change.\n\nELEVAY delivery checklist:\n${clip(DELIVERY_CHECKLIST(), 3000)}\n\nCheck in particular: every person Arab/Middle Eastern; complete elegant outfit head to toe; suits and formal wear with polished formal shoes or loafers (no sandals, slippers, sneakers); in smart-casual scenes clean leather loafers of any colour are fine and children may wear clean trainers; no keffiyeh/turban/ghutra or random accessories; natural anatomy, hands, faces and grounded feet; no passports, flags, seals, stamps, documents, QR codes, phone numbers, URLs; no AI-drawn logo or brand mark; no stray or misspelled text; ELEVAY palette and warm premium editorial look (no neon, harsh black, fake HDR, clutter, frames or geometric shapes); realistic European architecture.\n\nReturn JSON: {"pass": true/false, "issues": ["short summary"], "per_image": [{"index": 1, "pass": true/false, "issues": ["..."], "fix": "one sentence telling the image model what to change"}]}`;
  }
  /** Applies a strict QC verdict: redo only failing items, up to maxRedo times; then block. */
  function applyQc(run, step, data, count, redoAction, maxRedo) {
    const A = run.artifacts;
    const per = Array.isArray(data?.per_image) ? data.per_image : [];
    const failing = per.filter((p) => p && p.pass === false && p.index >= 1 && p.index <= count).map((p) => p.index - 1);
    if (data?.pass === false && !failing.length) for (let i = 0; i < count; i++) failing.push(i);
    const key = step.action + "_attempts";
    A[key] = A[key] || 0;
    A.qc = { pass: !failing.length, issues: data?.issues || [], per_image: per, step: step.action, attempts: A[key] };
    if (!failing.length) { log(run, "studio", "team", `${step.action === "qc_clips" ? "Clip" : "Design"} QC passed${A[key] ? ` after ${A[key]} redo(s)` : ""}.`); return; }
    if (A[key] >= maxRedo) {
      A.qc_blocked = true;
      log(run, "studio", "team", `Still failing after ${A[key]} redo(s): ${(data?.issues || []).join("; ")}. It goes to the owner marked QC failed and will not be approved or published automatically.`);
      if (step.action === "qc_visual" && run.kind === "reel") for (const s2 of run.steps) if (["clips", "qc_clips", "voice", "compose_reel", "qc_final"].includes(s2.action) && s2.status === "pending") { s2.status = "skipped"; s2.error = "Skipped: keyframes failed design QC, so no paid clips were made."; }
      return;
    }
    A[key]++;
    A.qc_attempts = (A.qc_attempts || 0) + 1;
    const fixes = per.filter((p) => failing.includes(p.index - 1)).map((p) => `${count > 1 ? `#${p.index}: ` : ""}${p.fix || (p.issues || []).join("; ")}`);
    log(run, "studio", "team", `QC failed ${failing.map((i) => "#" + (i + 1)).join(", ")}: ${fixes.join(" | ") || (data?.issues || []).join("; ")}. Redoing only those (redo ${A[key]} of ${maxRedo}).`);
    if (redoAction === "openai.static_image") A.fix = fixes.join(" ") || (data?.issues || []).join("; ");
    if (redoAction === "openai.reel_keyframes") { A.fixByIndex = A.fixByIndex || {}; for (const i of failing) { A.fixByIndex[i] = (per.find((p) => p.index === i + 1)?.fix) || ""; A.keyframes[i] = null; } }
    if (redoAction === "higgsfield.clips") for (const i of failing) A.clips[i] = null;
    const target = run.steps.find((s2) => `${s2.provider}.${s2.action}` === redoAction);
    target.status = "pending"; target.output = null;
    return "rewind";
  }

  async function askClaude(run, step, prompt, opts = {}) {
    log(run, "studio", "claude", opts.note || prompt);
    const r = await providers.claude({ system: ELEVAY_RULES, prompt, ...opts });
    log(run, "claude", "studio", r.data ? clip(r.data) : r.text);
    step.output = r.data ?? r.text;
    return r;
  }

  async function askOpenAi(run, step, prompt, opts = {}) {
    if (typeof providers.openaiText !== "function") throw new Error("OpenAI reel-writing provider is not configured.");
    log(run, "studio", "openai", opts.note || prompt);
    const r = await providers.openaiText({ system: ELEVAY_RULES, prompt, ...opts });
    log(run, "openai", "studio", r.data ? clip(r.data) : r.text);
    step.output = r.data ?? r.text;
    return r;
  }

  async function execute(run, step, checkpoint = async () => {}) {
    const A = run.artifacts, opts = run.options || {};
    switch (`${step.provider}.${step.action}`) {
      case "claude.route": {
        const r = await askClaude(run, step, `A team member asked the ELEVAY AI Studio:\n"""${run.request}"""\n\nDecide who should handle it. Options:\n- "static": a static social post (OpenAI designs it)\n- "reel": a reel/video (OpenAI keyframes + Higgsfield clips + ELEVAY voice)\n- "plan": a marketing plan built from Meta + CRM data\n- "meta": a change to Meta ad campaigns: pause or activate, change a daily budget, or create a new lead campaign
- "manus": anything else that needs another platform or manual work in Meta Business Suite\n- "answer": a question you can answer from the live Meta + CRM data\nReturn JSON: {"route": one of the options, "why": short reason, "request": the request rewritten clearly for that pipeline}.`, { maxTokens: 600 });
        const route = PIPELINES[r.data?.route] && r.data.route !== "request" ? r.data.route : "answer";
        run.kind = route; run.request = String(r.data?.request || run.request);
        const fresh = PIPELINES[route].steps();
        run.steps = [step, ...fresh]; run.steps.forEach((s, i) => (s.n = i + 1));
        log(run, "studio", "team", `Routed to ${PIPELINES[route].label}: ${r.data?.why || ""}`);
        return;
      }
      case "claude.answer": {
        const live = await deps.liveReport(false).catch(() => null);
        const src = fullProgramSource(run.request);
        const r = await askClaude(run, step, `${src ? "Approved ELEVAY program source (use it for program questions):\n" + clip(src, 30000) + "\n\n" : programFactsFor(run.request) + "\n\n"}Live ELEVAY Meta + CRM data (JSON):\n${liveSummary(live)}\n\nQuestion from the team:\n"""${run.request}"""\n\nAnswer in clear English (Arabic if the question is in Arabic), with numbers from the data. Say when the data does not cover something. Return JSON: {"answer": "..."}`, { note: `Question with live data attached: ${run.request}`, maxTokens: 2500 });
        A.answer = r.data?.answer || r.text;
        return;
      }
      case "claude.static_brief": {
        const r = await askClaude(run, step, `${programFactsFor(run.request + " " + (opts.program || ""))}\n\nWrite one ELEVAY static Instagram/Facebook post for this request:\n"""${run.request}"""\n${opts.program ? "Program: " + opts.program + "\n" : ""}Return JSON:\n{"topic": "...", "pillar": one of ["Family Security","Global Mobility","Long-term Planning","Premium Service","Ethical Advisory"], "program": "...", "headline_en": "English headline for inside the design, 3–7 words (max 55 characters), sentence case, no Visa/guarantee wording", "caption_ar": "MSA caption following every rule", "image_prompt": "Detailed English scene for the image model: setting, Arab/Middle Eastern people and clothing, light, complete elegant outfits incl. footwear, natural light, diagonal/asymmetric composition with a calm top-left area and a calm lower third. Must say: no text, no logo, no passports, no flags, no contact details.", "format": "1080x1350 (4:5, default, best reach) or 1080x1080 (1:1)"}`);
        A.brief = { type: "static", topic: r.data.topic, pillar: r.data.pillar, program: r.data.program, caption_ar: r.data.caption_ar, disclaimer_used: "", design: { format: /1080x1080/.test(String(r.data.format)) && !/1350/.test(String(r.data.format)) ? "1080x1080" : "1080x1350", headline_en: r.data.headline_en, image_prompt: r.data.image_prompt }, talent: { mode: "none" }, publish: { channel: "both", datetime_cairo: opts.datetime_cairo || "" } };
        return;
      }
      case "openai.reel_storyboard": {
        const r = await askOpenAi(run, step, `${programFactsFor(run.request + " " + (opts.program || ""))}\n\nWrite one ELEVAY reel for this request:\n"""${run.request}"""\n${opts.program ? "Program: " + opts.program + "\n" : ""}Return JSON:\n{"topic": "...", "pillar": "...", "program": "...", "caption_ar": "MSA caption following every rule", "music_direction": "royalty-free mood", "final_edit_direction": "one concise editing direction for the external renderer: pacing, clean scene joins and narration placement only; never request text, logo changes or outro changes", "scenes": [4 scenes in order hook → explanation → trust → realistic outcome, each {"keyframe_prompt": "Detailed English 9:16 photo description of the first frame: setting, Arab/Middle Eastern people, elegant clothing incl. footwear, light. No text, no logo, no passports, no flags.", "motion_prompt": "English camera and subject motion for 5 seconds, subtle and cinematic, no speech, no text", "spoken_text_ar": "natural Egyptian Arabic voice-over for this scene, 8–13 words; ONLY country names and ELEVAY in English letters, everything else in Arabic"}]}`, { maxTokens: 5000 });
        const scenes = (r.data.scenes || []).slice(0, 4);
        if (scenes.length !== 4) throw new Error("OpenAI did not return 4 scenes.");
        const invalid = [];
        for (let i = 0; i < 4; i++) { try { if (!scenes[i].spoken_text_ar) throw new Error("Missing spoken line"); await providers.checkEgyptianScript(scenes[i].spoken_text_ar); } catch { invalid.push(i); } }
        if (invalid.length) {
          const fixed = await askOpenAi(run, step, `Your storyboard is accepted visually, but scene(s) ${invalid.map(i=>i+1).join(",")} have missing or non-Egyptian spoken scripts. Rewrite ONLY these scripts, 7–10 words each, natural Egyptian Arabic, with a clear Egyptian marker such as خلينا، تقدر، بنراجع، معاك، علشان، دلوقتي. Country names and ELEVAY English only, no guarantees or تأشيرة. Leave all visuals unchanged. Current scenes:\n${JSON.stringify(scenes)}\nReturn JSON {"scenes":[{"scene":1,"spoken_text_ar":"..."}]} for ONLY the specified scenes.`, { maxTokens: 1000 });
          for (const s of fixed.data?.scenes || []) if (invalid.includes(s.scene - 1)) scenes[s.scene - 1].spoken_text_ar = s.spoken_text_ar;
        }
        for (const s of scenes) { if (!s.keyframe_prompt || !s.motion_prompt || !s.spoken_text_ar) throw new Error("Storyboard is incomplete; no generation started."); await providers.checkEgyptianScript(s.spoken_text_ar); }
        A.brief = { type: "reel", topic: r.data.topic, pillar: r.data.pillar, program: r.data.program, caption_ar: r.data.caption_ar, disclaimer_used: "", talent: { mode: "voiceover_elevay_vip", voice_source: "elevay_vip_module", speech_language: "egyptian_arabic" }, reel: { storyboard: scenes.map((s, i) => ({ clip: i + 1, keyframe_prompt: s.keyframe_prompt, motion_prompt: s.motion_prompt, spoken_text_ar: s.spoken_text_ar, delivery_direction_en: "Calm, warm, premium advisory tone" })), music_direction: r.data.music_direction || "Soft cinematic, royalty-free", final_edit_direction: String(r.data.final_edit_direction || "Clean direct joins, narration starts with each scene, and a quiet white logo outro.").slice(0, 600), duration_s: 23 }, publish: { channel: "both", datetime_cairo: opts.datetime_cairo || "" } };
        return;
      }
      case "claude.revise_content": {
        const rev = opts.revision;
        if (!rev?.authorizedBy) throw new Error("Revision authorization is missing.");
        const scope = rev.scope;
        const selected = rev.clip ? [Number(rev.clip) - 1] : Array.from({length:run.kind === "carousel" ? A.brief.carousel.slides.length : 4}, (_, i)=>i);
        const instructions = scope === "caption" ? 'Return {"caption_ar":"revised MSA caption"} only.' : scope === "schedule" ? 'Return {"datetime_cairo":"YYYY-MM-DDTHH:mm"} only. Preserve the original channel; timezone Africa/Cairo.' : scope === "voice" ? `Return {"scenes":[{"scene":1,"spoken_text_ar":"Egyptian Arabic revised line"}]} for exactly scenes ${selected.map(i=>i+1).join(",")}. Preserve every visual description.` : scope === "reel_clip" ? `Return {"scenes":[{"scene":1,"keyframe_prompt":"complete corrected frame prompt","motion_prompt":"complete corrected motion prompt"}]} for exactly scenes ${selected.map(i=>i+1).join(",")}. Preserve spoken lines.` : run.kind === "carousel" ? `Return {"slides":[{"slide":1,"image_prompt":"revised complete photograph prompt","headline_en":"English headline"}]} for exactly slides ${selected.map(i=>i+1).join(",")}. Preserve all other slides and caption.` : 'Return {"design":{"image_prompt":"complete revised image prompt","headline_en":"revised English headline"}} only. Preserve caption, schedule and other fields.';
        const writer = scope === "voice" ? askOpenAi : askClaude;
        const r = await writer(run, step, `Owner-authorized targeted change. Scope: ${scope}. Request: ${rev.request}. Current brief:\n${JSON.stringify(A.brief)}\nChange ONLY the stated scope. ${instructions}`, { maxTokens: 4000 });
        const d = r.data;
        if (scope === "caption") { if (typeof d?.caption_ar !== "string" || !d.caption_ar.trim()) throw new Error("Revised caption missing."); A.brief.caption_ar = d.caption_ar; }
        else if (scope === "schedule") { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d?.datetime_cairo || "")) throw new Error("Revised Cairo schedule is invalid."); A.brief.publish = { ...A.brief.publish, datetime_cairo: d.datetime_cairo }; }
        else if (["voice", "reel_clip"].includes(scope)) {
          if (!Array.isArray(d?.scenes) || d.scenes.length !== selected.length || new Set(d.scenes.map(s=>s.scene)).size !== selected.length || d.scenes.some(s=>!selected.includes(s.scene-1))) throw new Error("Revision did not identify exactly the requested scene slots.");
          for (const sc of d.scenes) { const i = sc.scene - 1;
            if (scope === "voice") { if (!sc.spoken_text_ar) throw new Error("Revised voice script missing."); A.brief.reel.storyboard[i].spoken_text_ar = sc.spoken_text_ar; A.voices[i] = null; }
            else { if (!sc.keyframe_prompt || !sc.motion_prompt) throw new Error("Revised scene prompts missing."); Object.assign(A.brief.reel.storyboard[i], { keyframe_prompt: sc.keyframe_prompt, motion_prompt: sc.motion_prompt }); A.keyframes[i] = null; A.clips[i] = null; if (A.compose?.parts) delete A.compose.parts[`seg${i}`]; }
          }
          if (A.compose?.parts) { delete A.compose.parts.final; if (scope === "voice") delete A.compose.parts.audio; }
          delete A.final;
        } else if (run.kind === "carousel") {
          if (!Array.isArray(d?.slides) || d.slides.length !== selected.length || new Set(d.slides.map(s=>s.slide)).size !== selected.length || d.slides.some(s=>!selected.includes(s.slide-1))) throw new Error("Carousel revision must name exactly the selected slide(s).");
          A.slideTargets = selected;
          for (const slide of d.slides) { if (!slide.image_prompt || !slide.headline_en) throw new Error("Revised slide fields missing."); Object.assign(A.brief.carousel.slides[slide.slide-1], { image_prompt:slide.image_prompt, headline_en:slide.headline_en }); }
        } else { if (!d?.design?.image_prompt || !d?.design?.headline_en) throw new Error("Revised static design missing."); A.brief.design = { ...A.brief.design, ...d.design }; A.images = []; }
        step.output = { scope, changed: rev.request };
        return;
      }
      case "openai.carousel_slides": {
        A.images = A.images || [];
        for (const i of A.slideTargets || []) {
          const slide = A.brief.carousel.slides[i];
          const prompt = `${slide.image_prompt}\n\nPremium Arab/Middle Eastern modern elegant subjects, no traditional headwear, complete formal footwear. No text, logos, passports, flags, contacts or guarantees. Preserve the requested carousel's visual identity and composition.`;
          const img = A.brief.carousel.format === "1080x1080" ? await providers.openaiImage({prompt,purpose:"static_post"}) : await providers.openaiPortrait({prompt});
          const url = await providers.brandStatic(img.url,slide.headline_en,A.brief.carousel.format || "1080x1350");
          slide.image_url = url; A.images[i] = {url,sha256:img.sha256,cost_usd:img.measuredCostUsd};
          await checkpoint(`Saved revised carousel slide ${i+1}; unaffected slides reused.`);
        }
        return;
      }
      case "claude.qc_carousel": {
        const urls = A.images.map(i=>i?.url);
        if (!urls.length || urls.some(u=>!u)) throw new Error("Complete carousel slide media is required for final QC.");
        const r = await askClaude(run,step,`Final ELEVAY review of the COMPLETE updated carousel. Inspect every slide for approved exact logo, English-only design text, modern elegant Arab people, uncovered hair, polished appropriate footwear, anatomy, visual consistency, no passports, contact details, flags or guarantees. Caption must be MSA and compliant. Current full brief:\n${JSON.stringify(A.brief)}\nReturn JSON {"pass":true|false,"issues":["..."],"verdict":"..."}. Fail closed on uncertainty.`,{images:urls,maxTokens:2000});
        const check = R.checkBrief(A.brief);
        A.qc = {...r.data,pass:r.data?.pass === true && check.pass,issues:[...(r.data?.issues||[]),...check.blocks.map(b=>b.label)]};
        if (!A.qc.pass) { step.error = A.qc.issues.join("; ") || "Carousel needs review."; return "needs_review"; }
        return;
      }
      case "system.check_brief": {
        // Mechanical fixes first, so a missing detail never costs a Claude round or fails the run.
        if (A.brief.design?.image_prompt) A.brief.design.image_prompt = R.withFootwear(A.brief.design.image_prompt);
        for (const sc of A.brief.reel?.storyboard || []) { sc.keyframe_prompt = R.withFootwear(sc.keyframe_prompt); if (sc.motion_prompt) sc.motion_prompt = R.cleanMotion(sc.motion_prompt); }
        let check = R.checkBrief(A.brief);
        log(run, "studio", "studio", check.pass ? `Compliance check passed (${check.warnings.length} warning(s)).` : `Compliance check blocked: ${check.blocks.map((b) => b.label).join(" ")}`);
        if (!check.pass) {
          const r = await askClaude(run, step, `Your ELEVAY brief failed these blocking checks:\n${check.blocks.map((b) => "- " + b.label).join("\n")}\nWarnings:\n${check.warnings.map((b) => "- " + b.label).join("\n")}\n\nBrief:\n${JSON.stringify(A.brief)}\n\nReturn the corrected brief as JSON with exactly the same structure.`, { maxTokens: 5000 });
          A.brief = { ...A.brief, ...r.data, type: A.brief.type };
          if (A.brief.design?.image_prompt) A.brief.design.image_prompt = R.withFootwear(A.brief.design.image_prompt);
          for (const sc of A.brief.reel?.storyboard || []) { sc.keyframe_prompt = R.withFootwear(sc.keyframe_prompt); if (sc.motion_prompt) sc.motion_prompt = R.cleanMotion(sc.motion_prompt); }
          check = R.checkBrief(A.brief);
          if (!check.pass) throw new Error("Still blocked after one fix: " + check.blocks.map((b) => b.label).join(" "));
        }
        step.output = { pass: true, warnings: check.warnings.map((w) => w.label) };
        return;
      }
      case "openai.static_image": {
        const d = A.brief.design;
        const portrait = d.format === "1080x1350";
        const fix = A.fix ? `\n\nCorrections from the ELEVAY design review (must be fixed): ${A.fix}` : "";
        const prompt = `${d.image_prompt}${fix}\n\n${portrait ? "Portrait 4:5" : "Square 1:1"} premium editorial photograph for a social post. Do not render any text, letters, numbers, logo or logo-like mark: the English headline (Apex Sans) and the exact official ELEVAY logo are added afterwards. Keep the top-left area calm and uncluttered for the logo and the lower third calm and darker for the headline. Diagonal, asymmetric composition; no frames or geometric shapes. Footwear for everyone in frame, clearly visible: men in polished dark-brown or black leather loafers or oxfords (never white or canvas shoes); women in closed elegant leather flats, pumps or block heels (no mules or sandals); children in clean leather shoes or simple dark trainers.\n\n${CREATIVE_DIRECTION.replace(/\s+/g, " ").slice(0, 2300)}`.slice(0, 3990);
        log(run, "studio", "openai", prompt);
        const img = portrait ? await providers.openaiPortrait({ prompt }) : await providers.openaiImage({ prompt, purpose: "static_post" });
        const url = await providers.brandStatic(img.url, d.headline_en, d.format);
        log(run, "studio", "studio", "Headline set in Apex Sans and the official ELEVAY logo composited.");
        A.images = [{ url, raw_url: img.url, sha256: img.sha256, cost_usd: img.measuredCostUsd }];
        log(run, "openai", "studio", `Design ready (${d.format}${A.qc_attempts ? `, redesign ${A.qc_attempts}` : ""}${img.measuredCostUsd ? `, about $${img.measuredCostUsd}` : ""}).`);
        step.output = { images: A.images.map((i) => i.url) };
        return;
      }
      case "openai.reel_keyframes": {
        A.keyframes = A.keyframes || [];
        const sb = A.brief.reel.storyboard;
        for (let i = 0; i < 4; i++) {
          if (A.keyframes[i]) continue;
          const fix = A.fixByIndex?.[i] ? `\n\nCorrections from the ELEVAY design review (must be fixed): ${A.fixByIndex[i]}` : "";
          const prompt = `${sb[i].keyframe_prompt}${fix}\n\nComplete realistic outfits; Arab/Middle Eastern people only. All hair uncovered: no hijabs, scarves, turbans, keffiyeh, ghutra, shemagh, headwear or traditional accessories. Modern Western elegant clothing only. Footwear for everyone in frame, clearly visible: men in polished dark-brown or black leather loafers or oxfords (never white or canvas shoes); women in closed elegant leather flats, pumps or block heels (no mules or sandals); children in clean leather shoes or simple dark trainers.\n\nVertical 9:16 cinematic premium photograph, first frame of a 5-second clip. No text, no logo, no passports, no flags.\n\nDesign rules: ${ELEVAY_AGENTIC_DESIGN_STANDARD.replace(/\s+/g, " ").slice(0, 1800)}`.slice(0, 3990);
          log(run, "studio", "openai", `Keyframe ${i + 1}: ${sb[i].keyframe_prompt}`);
          const img = await providers.openaiImage({ prompt, purpose: "reel_keyframe" });
          A.keyframes[i] = { url: img.url, sha256: img.sha256, cost_usd: img.measuredCostUsd };
          log(run, "openai", "studio", `Keyframe ${i + 1} ready.`);
          await checkpoint(`Checkpoint saved: keyframe ${i + 1}.`);
        }
        step.output = { keyframes: A.keyframes.map((k) => k.url) };
        return;
      }
      case "claude.qc_visual": {
        const reel = run.kind === "reel";
        const imgs = reel ? A.keyframes.map((k) => k.url) : A.images.map((i) => i.url);
        const r = await askClaude(run, step, strictQcPrompt(reel ? `${imgs.length} reel keyframes (no text or logo allowed anywhere)` : `one finished static post. The only text allowed is the English headline "${A.brief.design.headline_en}" in Apex Sans, and the only logo is the official origami-bird mark in a corner`) + (opts.revision ? `\nThis is the FINAL review of an owner-authorized ${opts.revision.scope} revision. Also check the revised MSA caption, country names, disclaimer, no banned words or guarantees, and intended Cairo schedule. Complete revised brief:\n${JSON.stringify(A.brief)}` : ""), { images: imgs, note: `Strict design QC of ${imgs.length} image(s), attempt ${(A.qc_attempts || 0) + 1}`, maxTokens: 2000 });
        if (opts.revision) {
          const check = R.checkBrief(A.brief);
          if (!check.pass) { A.qc = { ...r.data, pass:false, issues:[...(r.data?.issues||[]),...check.blocks.map(b=>b.label)] }; step.error=A.qc.issues.join("; "); return "needs_review"; }
          if (opts.noSceneRegeneration && r.data?.pass !== true) { A.qc = { ...r.data, pass:false }; step.error=(A.qc.issues||[]).join("; ")||"Final review requires attention; no unaffected media regenerated."; return "needs_review"; }
        }
        return applyQc(run, step, r.data, imgs.length, reel ? "openai.reel_keyframes" : "openai.static_image", reel ? 3 : 2);
      }
      case "claude.qc_clips": {
        const frames = [];
        for (const c of A.clips) frames.push(await providers.clipFrames(c.url));
        const r = await askClaude(run, step, strictQcPrompt(`4 reel clips; for each clip you get 3 frames (start, middle, end) in order, so images 1–3 are clip 1, 4–6 clip 2, 7–9 clip 3, 10–12 clip 4. Report per CLIP (index 1–4). Also check continuity inside each clip: no wardrobe or footwear changes, no objects appearing or vanishing, no warped faces, hands or architecture, physically believable motion`), { images: frames.flat(), note: "Frame-by-frame QC of the 4 clips", maxTokens: 2000 });
        return applyQc(run, step, r.data, 4, "higgsfield.clips", 1);
      }
      case "higgsfield.clips": {
        A.clips = A.clips || [];
        const sb = A.brief.reel.storyboard;
        for (let i = 0; i < 4; i++) {
          if (A.clips[i]) continue;
          const retryIndex = Number(A.clipRetryByIndex?.[i] || 0);
          const key = `ec-${run.id}-clip-${i + 1}-${A.keyframes[i].sha256.slice(0, 12)}-r${retryIndex}`;
          log(run, "studio", "higgsfield", `Clip ${i + 1}: ${sb[i].motion_prompt}`);
          const r = await providers.higgsfieldSubmit({ runId: run.id, stepId: step.n, idempotencyKey: key, prompt: sb[i].motion_prompt, keyframe: A.keyframes[i] });
          A.clips[i] = { requestId: r.requestId, statusUrl: r.statusUrl, state: "queued", url: null };
          await checkpoint(`Checkpoint saved: clip ${i + 1} submitted.`);
        }
        log(run, "higgsfield", "studio", A.qc_clips_attempts ? "Replacement clips queued." : "4 clips queued.");
        return "waiting";
      }
      case "elevenlabs.voice": {
        const sb = A.brief.reel.storyboard;
        await providers.checkEgyptianScript(sb.map((c) => c.spoken_text_ar).join(" ")); // whole script must be natural Egyptian Arabic
        A.voices = A.voices || [];
        for (let i = 0; i < 4; i++) {
          if (A.voices[i]) {
            if (A.voices[i].voiceId !== ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId || A.voices[i].languageCode !== "ar") throw new Error(`Scene ${i + 1} saved voice provenance is missing or mismatched. Owner attention is required; no fallback or automatic replacement.`);
            continue;
          }
          log(run, "studio", "elevenlabs", `Scene ${i + 1}: ${sb[i].spoken_text_ar}`);
          const v = await providers.voiceScene(sb[i].spoken_text_ar);
          if (v.voiceId !== ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId || v.languageCode !== "ar") throw new Error("The voice provider returned unexpected voice/language provenance. Step stopped; no alternate voice accepted.");
          A.voices[i] = { url: v.url, sha256: v.sha256, script: v.script || sb[i].spoken_text_ar, voiceId: v.voiceId, model: v.model, languageCode: v.languageCode, dialect: v.dialect, requestId: v.requestId };
          await checkpoint(`Checkpoint saved: ELEVAY voice take ${i + 1}.`);
        }
        log(run, "elevenlabs", "studio", "4 voice takes ready (ELEVAY voice clone).");
        return;
      }
      case "system.compose_reel": {
        if (!A.voices || A.voices.length !== 4 || A.voices.some(v => v?.voiceId !== ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId || v?.languageCode !== "ar")) {
          throw new Error("Voice provenance needs owner attention: all four saved takes must verify the approved ELEVAY_VOICE_ID and Arabic language. No render or automatic regeneration was started.");
        }
        const music = (process.env.ELEVAY_REEL_MUSIC_URLS || "").split(",").map((x) => x.trim()).filter(Boolean);
        const musicUrl = music.length ? music[run.id % music.length] : null;
        try {
          if (!providers.composeReelStep) throw new Error("Reel render adapter is not configured. Waiting for render worker is required; in-process rendering is disabled.");
          A.compose = A.compose || { parts: {}, mode: "cuts" };
          const s = await providers.composeReelStep({ runId: run.id, clipUrls: A.clips.map((c) => c.url), voiceUrls: A.voices.map((v) => v.url), musicUrl, parts: A.compose.parts, mode: A.compose.mode, editDirection: A.brief.reel.final_edit_direction });
          A.compose.parts = s.parts || A.compose.parts;
          if (s.pending) {
            A.compose.jobId = s.jobId || A.compose.jobId || null;
            A.compose.waitReason = s.waitReason || "Waiting for render worker";
            step.output = { pending: true, jobId: A.compose.jobId, waitReason: A.compose.waitReason };
            log(run, "studio", "team", A.compose.waitReason);
            return "waiting";
          }
          if (!s.final) throw new Error("Render adapter returned neither a pending job nor a final reel.");
          const fin = s.final;
          A.final = { ...fin, joined: fin.mode, renderJobId: fin.renderJobId || A.compose.jobId || null };
          A.compose.waitReason = null;
          if (fin.musicDropped) log(run, "studio", "team", `The music track could not be mixed (${fin.musicDropped.slice(0, 160)}), so the reel was finished with the voice-over only.`);
          log(run, "studio", "team", `Final reel ready: ${Number(fin.seconds).toFixed(1)} s, 1080×1920, ELEVAY voice${fin.music ? " + licensed music" : ""}, white logo outro.`);
          return;
        } catch (e) {
          if (e?.tooLong === undefined || A.voice_fixed || opts.preserveVoiceTakes) {
            if (e?.tooLong !== undefined && opts.preserveVoiceTakes) {
              step.error = `Scene ${Number(e.tooLong) + 1} voice-over is too long; preserved voice takes were requested, so it needs manual review.`;
              return "needs_review";
            }
            throw e;
          }
          // A scene's narration is too long for 5 s: Claude shortens that line once, then the voice is redone.
          const i = e.tooLong; A.voice_fixed = true;
          const r = await askOpenAi(run, step, `This Egyptian Arabic voice-over line for scene ${i + 1} is too long to fit in 5 seconds: "${A.brief.reel.storyboard[i].spoken_text_ar}". Rewrite it in 7–10 words, natural Egyptian Arabic, same idea, country names and ELEVAY in English letters only, everything else in Arabic. Return JSON: {"line": "..."}`, { maxTokens: 300 });
          A.brief.reel.storyboard[i].spoken_text_ar = String(r.data.line || "").trim();
          A.voices[i] = null;
          if (A.compose?.parts) { delete A.compose.parts.audio; delete A.compose.parts.final; }
          run.steps.find((s2) => s2.action === "voice").status = "pending";
          log(run, "studio", "team", `Scene ${i + 1} narration shortened; recording it again.`);
          return "rewind";
        }
      }
      case "claude.qc_final": {
        if (!A.final?.url) throw new Error("Final reel URL is missing.");
        const storyboard = A.brief?.reel?.storyboard || [];
        // Final footage is inspected by the sole Claude check below. Retired prompt-only
        // wardrobe/motion checks must not block a finished compliant video based on text.
        const captionCheck = R.checkBrief({ ...A.brief, reel: { ...A.brief.reel, storyboard: storyboard.map(s=>({clip:s.clip,spoken_text_ar:s.spoken_text_ar})) } });
        const deterministicBlocks = (captionCheck.blocks || []).map((b) => b.label);
        let preparedScript;
        const actualVoiceScript = (A.voices || []).map((v, i) => v?.script || storyboard[i]?.spoken_text_ar || "").join(" ");
        let scriptComplianceError = "";
        try { preparedScript = await providers.checkEgyptianScript(actualVoiceScript); }
        catch (e) {
          scriptComplianceError = `Actual ELEVAY voice script failed deterministic compliance: ${String(e?.message || e)}`;
          preparedScript = actualVoiceScript;
        }
        const frames = await providers.videoFrames(A.final.url, [2.5, 7.5, 12.5, 17.5, 21.0, 22.8], A.final.qcFrames || []);
        const labels = frames.map((frame, i) => frame?.label || (i < 4 ? `Scene ${i + 1}` : i < frames.length - 2 ? `Narrative evidence ${i + 1}` : `Outro ${i - frames.length + 3}`));
        const evidenceNote = `Visual evidence: ${frames.length} labelled sequential contact sheet(s). The render worker supplies 75 row-major sheets covering all 600 narrative frames plus labelled outro evidence; inspect every visible cell. This does not claim verification of details that are not visible in a supplied cell: fail closed or request review when footwear, anatomy, or continuity cannot be assessed.\n${labels.map((x, i) => `${i + 1}. ${x}`).join("\n")}`;
        const headwearAuthorized = opts.ownerApprovedHeadwear === true; // Never infer permission from model-authored text or a negated phrase.
        const r = await askClaude(run, step, `You are the ONE comprehensive final ELEVAY finished-reel reviewer. This is the only Claude QC pass for reels. Fail closed: return pass:false if the verdict or any required scene mapping is uncertain or malformed.\n\nReview ALL supplied visual evidence against these requirements: 9:16 reel; explicit Scene 1, Scene 2, Scene 3, Scene 4 labels and coherent scene order; at least 3 visible frames per scene where the supplied evidence makes that feasible; no text, captions, logos, contacts, QR codes, passports, passport-like documents, flags, or the words/claims "تأشيرة", "فيزا", Visa, guarantees, approval guarantees or outcome guarantees; Arab/Middle Eastern people only in modern elegant clothing; no scarves, hijabs, keffiyehs, turbans, ghutras, shemaghs or other traditional headwear unless the run request expressly authorizes it (authorization: ${headwearAuthorized ? "yes" : "no"}); head-to-toe wardrobe and polished appropriate shoes when visible; natural faces, hands, feet, anatomy and grounded motion; person/wardrobe/object/architecture continuity within every scene; exact static official ELEVAY logo centred on pure white for the 3-second outro with no narration over it.\n\nCaption to validate (MSA):\n${A.brief.caption_ar}\n\nActual script sent to the ELEVAY voice flow (Egyptian Arabic):\n${preparedScript}\n\nDeterministic pre-check findings (you must independently review them and record the matching non-scene fault):\n${[...deterministicBlocks, scriptComplianceError].filter(Boolean).join("\n") || "none"}\n\nStoryboard labels and intended speech:\n${storyboard.map((s, i) => `Scene ${i + 1}: ${s.spoken_text_ar || "(missing)"}`).join("\n")}\n\n${evidenceNote}\n\nReturn EXACT JSON only: {"pass":true|false,"issues":["..."],"scene_failures":[{"scene":1|2|3|4,"issues":["..."],"fix":"exact keyframe correction"}],"non_scene_failures":["caption"|"outro"|"voice_script"|"unknown"],"verdict":"short explanation"}. Scene failures must name exact scenes 1..4. Do not use image indexes.`, { images: frames, note: `Comprehensive final reel QC (${frames.length} evidence sheet(s))`, maxTokens: 4000 });
        const data = r.data;
        const sceneFailures = Array.isArray(data?.scene_failures) ? data.scene_failures : null;
        const validSceneFailures = sceneFailures && sceneFailures.every((f) => Number.isInteger(f?.scene) && f.scene >= 1 && f.scene <= 4 && Array.isArray(f.issues) && f.issues.length && typeof f.fix === "string" && f.fix.trim());
        const nonScene = Array.isArray(data?.non_scene_failures) ? data.non_scene_failures.filter(Boolean) : null;
        const malformed = !data || typeof data.pass !== "boolean" || !Array.isArray(data.issues) || !Array.isArray(sceneFailures) || !Array.isArray(nonScene) || !validSceneFailures;
        const deterministicFailure = deterministicBlocks.length > 0 || !!scriptComplianceError;
        const failed = malformed || deterministicFailure || data.pass === false || sceneFailures.length > 0 || nonScene.length > 0;
        A.final_qc = { pass: !failed, invalid: malformed, issues: malformed ? ["Final Claude QC returned an invalid or incomplete fail-closed verdict."] : [...data.issues, ...deterministicBlocks, ...(scriptComplianceError ? [scriptComplianceError] : [])], scene_failures: sceneFailures || [], non_scene_failures: nonScene || [], evidence_labels: labels };
        if (!failed) { log(run, "studio", "team", "Final reel passed the comprehensive ELEVAY review."); return; }
        const issues = A.final_qc.issues.join("; ") || "Final review failed.";
        const targeted = (sceneFailures || []).map((f) => f.scene);
        if (malformed || deterministicFailure || !targeted.length || (nonScene || []).length || opts.noSceneRegeneration || Number(A.repair_rounds || 0) >= 2) {
          step.error = malformed ? "Final QC verdict was malformed; manual review is required." : deterministicFailure ? "Caption or actual voice script compliance failed; manual review is required without arbitrary scene regeneration." : (nonScene || []).length ? `Final QC found non-scene fault(s): ${(nonScene || []).join(", ")}; manual review is required without arbitrary scene regeneration.` : opts.noSceneRegeneration ? "Final QC failed; this run forbids scene regeneration and needs manual review." : "Final QC exhausted two targeted repair rounds; manual review is required.";
          log(run, "studio", "team", step.error + " " + issues);
          return "needs_review";
        }
        A.repair_rounds = Number(A.repair_rounds || 0) + 1;
        A.final_qc.repair_rounds = A.repair_rounds;
        A.fixByIndex = A.fixByIndex || {};
        for (const failure of sceneFailures) {
          const i = failure.scene - 1;
          A.fixByIndex[i] = failure.fix;
          A.keyframes[i] = null;
          A.clips[i] = null;
          // Visual repairs preserve approved/generated ELEVAY voice takes.
          if (A.compose?.parts) { delete A.compose.parts[`seg${i}`]; delete A.compose.parts.final; }
        }
        delete A.final;
        const keyframes = run.steps.find((s) => s.action === "reel_keyframes");
        const clips = run.steps.find((s) => s.action === "clips");
        const compose = run.steps.find((s) => s.action === "compose_reel");
        keyframes.status = "pending"; keyframes.output = null;
        clips.status = "pending"; clips.output = null;
        // Respect an explicitly manual owner gate: repair never carries forward a previous approval.
        delete clips.approved_by; delete clips.approved_at;
        compose.status = "pending"; compose.output = null;
        log(run, "studio", "team", `Final QC repair ${A.repair_rounds} of 2: regenerate exactly scene(s) ${targeted.join(", ")} keyframe(s), then those clips; preserve all voice takes.`);
        return "rewind";
      }
      case "system.to_weekly_plan": {
        const media = run.kind === "reel" ? { video_url: A.final?.url || null, clips: (A.clips || []).filter(Boolean).map((c) => c.url).filter(Boolean), keyframes: A.keyframes.filter(Boolean).map((k) => k.url), voice: (A.voices || []).filter(Boolean).map((v) => v.url), duration_s: A.final?.seconds || null } : run.kind === "carousel" ? { image_urls:A.images.map(i=>i.url) } : { image_url: A.images[0].url };
        let itemId;
        let auto = false;
        const r = await deps.mutate({}, (st) => {
          if (opts.revision) {
            itemId = opts.revision.itemId;
            const finalQc = run.kind === "reel" ? A.final_qc : A.qc;
            if (!finalQc?.pass) return { ok: false, error: "A revised item cannot replace the current version without final Claude QC." };
            return E.applyReviewedRevision(st, itemId, { ...A.brief, media, produced_by: { studio_run: run.id, claude: true, openai: true, higgsfield: run.kind === "reel" }, qc: { ...finalQc, reviewer: "claude" } }, { actor: opts.revision.authorizedBy, request: opts.revision.request || run.request, scope: opts.revision.scope, clip:opts.revision.clip, runId: run.id, baseVersion: opts.revision.baseVersion, finalQc });
          }
          itemId = A.item_id && st.items.some((i) => i.item_id === A.item_id) ? A.item_id : opts.item_id && !st.items.some((i) => i.item_id === opts.item_id) ? opts.item_id : nextItemId(st.items, opts.week || undefined, !!opts.planned);
          const up = E.upsertBrief(st, { ...A.brief, item_id: itemId, status: A.qc_blocked ? "qc_failed" : "pending_approval", media, produced_by: { studio_run: run.id, claude: true, openai: true, higgsfield: run.kind === "reel" }, qc: { reviewer: "claude", pass: A.qc_blocked ? false : (A.final_qc?.pass ?? A.qc?.pass ?? null), issues: A.final_qc?.issues || A.qc?.issues || [], blocked: !!A.qc_blocked } }, "ai-studio");
          if (up.ok === false) return up;
          // Autopilot approves clean items itself; they do not count toward the human first-pass rate.
          auto = false;
          if (st.settings.autopublish?.enabled && !opts.manualReviewOnly && up.item.status === "pending_approval" && !A.qc_blocked && A.qc?.pass === true && (run.kind !== "reel" || A.final_qc?.pass === true)) {
            const d = E.decideItem(st, itemId, "approve", {}, "autopilot", "owner");
            if (d.ok !== false) { Object.assign(up.item, { auto_approved: true, first_pass: null, presented_at: null }); auto = true; }
          }
          return up;
        });
        if (r && r.ok === false) throw new Error(r.error);
        A.item_id = itemId;
        log(run, "studio", "team", opts.revision ? `Replaced ${itemId} with an owner-authorized reviewed revision. All previous versions retained; no Meta scheduling or publishing triggered.` : A.qc_blocked ? `Added as ${itemId} marked QC failed; the owner decides.` : auto ? `Added as ${itemId} and approved by autopilot; Manus schedules it.` : `Added to the weekly plan as ${itemId} for approval.`);
        return;
      }
      case "claude.weekly_plan": {
        const live = await deps.liveReport(false).catch(() => null);
        const { state } = await deps.loadState();
        const week = opts.week || planningWeek();
        const days = WEEKDAY_DATES(week);
        const monthPlan = state.plans.find((p) => p.status === "approved");
        const news = state.news.filter((n) => n.selected || n.confidence === "verified").slice(0, 8).map((n) => ({ headline: n.headline, country: n.country, program: n.program, angle: n.marketing_angle }));
        const recent = state.items.slice(-21).map((i) => ({ id: i.item_id, type: i.type, topic: i.topic, program: i.program, status: i.status }));
        const r = await askClaude(run, step, `Plan ELEVAY's social content for ${week} (Sunday ${days[0]} to Saturday ${days[6]}, Cairo).

Goal: more qualified leads and signed clients at lower cost per qualified lead, plus views and page likes.

Live Meta + CRM data:
${liveSummary(live)}

Approved monthly plan:
${monthPlan ? clip(monthPlan.body, 5000) : "none yet"}

Verified news to use where relevant:
${JSON.stringify(news)}

Recent posts (avoid repeating):
${JSON.stringify(recent)}

Today is ${cairoParts().date}; never schedule a date before today or after ${days[6]} (if fewer days remain, use two slots per day).\n\nApproved program sources (programs with confirmed facts):\n${allProgramFacts()}\nELEVAY also offers Portugal D7/D8/D2/Golden Visa, Greece Golden Visa, UK Expansion Worker, Canada Skilled Migration and Caribbean Citizenship by Investment; for those, plan benefit-led posts without figures until approved sources exist.\n\nReturn JSON: {"rationale": "2–4 sentences on why this mix", "posts": [exactly 7 items, exactly 4 with "type":"static" and 3 with "type":"reel": {"type": "static"|"reel", "date": "YYYY-MM-DD within the week", "time": "HH:MM Cairo, evening slots perform best unless the data says otherwise", "program": "...", "pillar": "...", "audience": "...", "brief": "2–3 sentences: the angle, the scene, the message and the call to action"}]}`, { note: `Weekly plan for ${week} with live data, monthly plan and news attached`, maxTokens: 4000 });
        const posts = (r.data.posts || []).slice(0, 7);
        const statics = posts.filter((p) => p.type === "static").length, reels = posts.filter((p) => p.type === "reel").length;
        if (posts.length !== 7 || statics !== 4 || reels !== 3) throw new Error(`Claude returned ${statics} statics and ${reels} reels instead of 4 and 3.`);
        A.week_plan = { week, rationale: r.data.rationale, posts };
        return;
      }
      case "system.spawn_week": {
        const { week, posts } = A.week_plan;
        A.children = A.children || [];
        for (let i = A.children.length; i < posts.length; i++) {
          const p = posts[i];
          const child = await create({ kind: p.type === "reel" ? "reel" : "static", request: `${p.brief}\nAudience: ${p.audience || ""}`, options: { program: p.program || "", datetime_cairo: p.date && p.time ? `${p.date}T${p.time}` : "", week, item_id: `${week}-${String(i + 1).padStart(2, "0")}`, planned: true, parent: run.id, auto: !!opts.auto }, user: { email: "autopilot", role: "owner" } });
          A.children.push(child.id);
        }
        log(run, "studio", "team", `Started ${posts.length} runs for ${week}: ${A.children.map((c) => "#" + c).join(", ")}.`);
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
        let auto = false;
        const r = await deps.mutate({}, (st) => {
          const added = E.addPlan(st, { ...A.plan, source: "ai-studio", studio_run: run.id }, "ai-studio");
          if (added.ok && st.settings.autopublish?.enabled) { E.decidePlan(st, added.plan.id, "approve", "Approved by autopilot (6-week gate reached)", "autopilot", "owner"); auto = true; }
          return added;
        });
        if (r && r.ok === false) throw new Error(r.error);
        log(run, "studio", "team", auto ? `Plan for ${A.plan.month} approved by autopilot.` : `Plan for ${A.plan.month} sent to the Monthly plan tab for owner approval.`);
        return;
      }
      case "claude.meta_plan": {
        if (!deps.meta) throw new Error("Meta actions are not available.");
        const snap = await deps.meta.adsSnapshot();
        const forms = await deps.meta.leadForms().catch(() => []);
        const { state } = await deps.loadState();
        const designs = state.items.filter((i) => ["approved", "scheduled", "published"].includes(i.status) && i.media?.image_url).slice(-12).map((i) => ({ item_id: i.item_id, topic: i.topic, program: i.program, headline: i.design?.headline_en, image_url: i.media.image_url, caption_ar: clip(i.caption_ar, 500) }));
        const r = await askClaude(run, step, `${programFactsFor(run.request)}\n\nELEVAY Meta ad account now (EGP): month-to-date spend ${Math.round(snap.mtd)}, active daily budgets ${Math.round(snap.dailyTotal)}/day; monthly cap ${state.settings.monthlyAdCapEgp}, max CPL ${state.settings.maxCplEgp}.\nCampaigns: ${JSON.stringify(snap.campaigns.slice(0, 40).map((c) => ({ id: c.id, name: c.name, status: c.status, daily_budget_egp: c.daily, cpl30: snap.cpl[c.id] ? Math.round(snap.cpl[c.id]) : null })))}\nLead forms: ${JSON.stringify(forms.map((f) => ({ id: f.id, name: f.name })))}\nApproved designs: ${JSON.stringify(designs)}\n\nTeam request: """${run.request}"""\n\nTurn it into Meta actions. Allowed kinds:\n- {"kind":"campaign_status","target_id":"<campaign or ad set id>","target_name":"...","status_to":"ACTIVE"|"PAUSED","reason":"..."}\n- {"kind":"campaign_budget","target_id":"...","target_name":"...","daily_budget_egp":number,"reason":"..."}\n- {"kind":"create_campaign","campaign":{"name":"...","daily_budget_egp":number,"countries":["EG"],"age_min":28,"age_max":60,"form_id":"<lead form id>","image_url":"<approved design image_url>","message":"Arabic ad text (MSA, rules apply, no Visa/guarantee/contact details)","headline":"short English headline","item_id":"..."},"reason":"..."} (created paused)\nNever exceed the monthly cap or raise budget on a campaign above the max CPL. Use only ids from the lists. Return JSON: {"actions": [...], "note": "what you did and anything you could not do"}`, { note: `Meta plan for: ${run.request}`, maxTokens: 2500 });
        A.meta_actions = Array.isArray(r.data?.actions) ? r.data.actions.slice(0, 10) : [];
        A.answer = r.data?.note || "";
        if (!A.meta_actions.length) log(run, "studio", "team", "No Meta action needed: " + (r.data?.note || ""));
        return;
      }
      case "system.queue_meta": {
        const { cleanMetaAction } = await import("./meta");
        A.meta_queued = [];
        for (const raw of A.meta_actions || []) {
          try {
            const a = await deps.meta.enqueue({ ...cleanMetaAction(raw, R), studio_run: run.id }, run.options?.auto ? "manus" : `ai-studio (${run.created_by})`);
            A.meta_queued.push({ id: a.id, status: a.status, preview: a.preview, reason: a.check?.reason || null });
            log(run, "studio", "team", `Meta action #${a.id} ${a.status === "done" ? "done (autopilot)" : a.status === "blocked" ? "refused: " + a.check?.reason : "waiting for the owner in the Meta tab"}: ${a.preview}`);
          } catch (e) { log(run, "studio", "team", "Skipped an invalid action: " + e.message); }
        }
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
  async function poll(run, step, checkpoint = async () => {}) {
    const A = run.artifacts;
    if (step.action === "compose_reel") {
      if (!A.voices || A.voices.length !== 4 || A.voices.some(v => v?.voiceId !== ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId || v?.languageCode !== "ar")) {
        step.status = "failed";
        step.error = "Saved voice provenance is missing or mismatched. Render polling stopped; no automatic replacement voice was used.";
        return false;
      }
      if (!providers.composeReelStep) { step.status = "failed"; step.error = "Reel render adapter is not configured; no local renderer will be used."; return false; }
      const music = (process.env.ELEVAY_REEL_MUSIC_URLS || "").split(",").map((x) => x.trim()).filter(Boolean);
      const musicUrl = music.length ? music[run.id % music.length] : null;
      const C = A.compose || (A.compose = { parts: {}, mode: "cuts" });
      const s = await providers.composeReelStep({ runId: run.id, clipUrls: A.clips.map((c) => c.url), voiceUrls: A.voices.map((v) => v.url), musicUrl, parts: C.parts || {}, mode: C.mode || "cuts", jobId: C.jobId });
      C.parts = s.parts || C.parts;
      if (s.pending) {
        C.jobId = s.jobId || C.jobId || null;
        C.waitReason = s.waitReason || "Waiting for render worker";
        step.output = { pending: true, jobId: C.jobId, waitReason: C.waitReason };
        await checkpoint(C.waitReason);
        return false;
      }
      if (!s.final) { step.status = "failed"; step.error = "Render adapter returned neither pending nor final output."; return false; }
      const fin = s.final;
      A.final = { ...fin, joined: fin.mode, renderJobId: fin.renderJobId || C.jobId || null };
      C.waitReason = null;
      log(run, "studio", "team", `Final reel ready: ${Number(fin.seconds).toFixed(1)} s, 1080×1920, ELEVAY voice${fin.music ? " + licensed music" : ""}, white logo outro.`);
      await checkpoint("Checkpoint saved: render worker final output.");
      return true;
    }
    if (step.provider === "higgsfield") {
      for (const c of A.clips || []) {
        if (!c) continue;
        if (c.state === "completed" && c.permanent) continue;
        const s = await providers.higgsfieldStatus(c).catch((e) => ({ state: c.state, error: e.message }));
        if (s.state !== c.state) log(run, "higgsfield", "studio", `Clip ${A.clips.indexOf(c) + 1}: ${s.state}`);
        c.state = s.state; if (s.videoUrl) c.url = s.videoUrl;
        if (c.state === "completed" && c.url && providers.persistClip && !c.permanent) { const stored = await providers.persistClip(c.url); c.provider_url = c.url; c.url = stored.url; c.sha256 = stored.sha256; c.permanent = true; }
        await checkpoint(`Checkpoint saved: clip ${A.clips.indexOf(c) + 1} ${c.state}.`);
        if (["failed", "nsfw", "canceled"].includes(s.state)) { step.status = "failed"; step.error = `Clip ${A.clips.indexOf(c) + 1} ${s.state}. Retry creates a new clip.`; return false; }
      }
      return (A.clips || []).length === 4 && A.clips.every((c) => c?.state === "completed");
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
      const clips = g.run.artifacts.clips || [];
      g.run.artifacts.clipRetryByIndex = g.run.artifacts.clipRetryByIndex || {};
      // Never filter: slot i is Scene i. A filtered retry can animate scene 2 from scene 1's keyframe.
      g.run.artifacts.clips = Array.from({ length: 4 }, (_, i) => {
        const c = clips[i];
        if (c && ["completed", "queued", "in_progress"].includes(c.state)) return c;
        if (c) g.run.artifacts.clipRetryByIndex[i] = Number(g.run.artifacts.clipRetryByIndex[i] || 0) + 1;
        return null;
      });
    }
    step.status = "pending"; step.error = null; g.run.status = "queued";
    log(g.run, user.email, "studio", `Retry: ${step.title}`);
    await save(g.run, g.ver);
    kick(id);
  }

  /** A reel stopped by keyframe QC: redo the failing keyframes and carry on to clips, voice and the edit. */
  async function redo(id, user) {
    const g = await get(id);
    if (!g) throw new Error("Run not found.");
    const run = g.run, A = run.artifacts;
    if (run.kind !== "reel" || !A.qc_blocked || !run.steps.some((s2) => s2.status === "skipped")) throw new Error("Only a reel stopped by the design check can be made again.");
    const per = Array.isArray(A.qc?.per_image) ? A.qc.per_image : [];
    A.fixByIndex = A.fixByIndex || {};
    for (const p of per) if (p && p.pass === false && p.index >= 1 && p.index <= 4) { A.keyframes[p.index - 1] = null; A.fixByIndex[p.index - 1] = p.fix || (p.issues || []).join("; "); }
    if (!per.some((p) => p && p.pass === false)) A.keyframes = [];
    A.qc_blocked = false; A.qc = null; A.qc_visual_attempts = 0;
    let from = false;
    for (const s2 of run.steps) {
      if (s2.action === "reel_keyframes") from = true;
      if (from) { s2.status = "pending"; s2.error = null; s2.output = null; delete s2.approved_by; delete s2.approved_at; }
    }
    run.status = "queued";
    log(run, user.email, "studio", "Make the reel again: redoing the failing keyframes, then clips, voice and the edit.");
    await save(run, g.ver);
    kick(id);
  }

  async function cancel(id, user) {
    const g = await get(id);
    if (!g) throw new Error("Run not found.");
    g.run.status = "cancelled"; log(g.run, user.email, "studio", "Cancelled.");
    await save(g.run, g.ver);
  }

  async function reviseItem(itemId, body, user) {
    if (user.role !== "owner") throw new Error("Only the owner can directly authorize a content revision.");
    const { state } = await deps.loadState();
    const item = state.items.find(i => i.item_id === itemId);
    if (!item) throw new Error("Content item not found.");
    const request = String(body.comment || body.request || "").trim();
    if (!request) throw new Error("Describe the requested change.");
    const guessed = R.classifyChange(request, item);
    const scope = body.scope || guessed.scope;
    const valid = ["all", "whole_concept", "caption", "schedule", "voice", "reel_clip", "static_design"];
    if (!valid.includes(scope)) throw new Error("Unsupported revision scope.");
    const clipNumber = Number(body.clip || guessed.clip || 0) || null;
    if (clipNumber && (!Number.isInteger(clipNumber) || clipNumber < 1 || (item.type !== "carousel" && clipNumber > 4))) throw new Error("Scene number must be 1..4 (or an existing carousel slide).");
    if (item.type === "carousel" && ["all","whole_concept","voice","reel_clip"].includes(scope)) throw new Error("Carousel changes must identify caption, schedule or design/slide scope.");
    if (item.type !== "reel" && ["voice", "reel_clip"].includes(scope)) throw new Error("Scene/voice scope requires a reel.");
    const revision = { itemId, baseVersion: item.version, scope, request, clip: clipNumber, authorizedBy: user.email };
    const options = { week: itemId.slice(0, 8), program: item.program, datetime_cairo: item.publish?.datetime_cairo || "", revision, manualReviewOnly: true, noSceneRegeneration: ["caption", "schedule", "voice"].includes(scope) };
    const persistAuthority = async () => {
      const result = await deps.mutate({}, st => E.decideItem(st,itemId,"request_changes",{comment:request,scope:scope === "all" ? "whole_concept" : scope,clip:clipNumber},user.email,"owner"));
      if (result?.ok === false) throw new Error(result.error);
      const job = result?.job || result?.item?.revision?.job_id && (await deps.loadState()).state.jobs.find(j=>j.id===result.item.revision.job_id);
      const fallback = job || (await deps.loadState()).state.jobs.find(j=>j.type==="revise_item" && j.payload?.item_id===itemId && j.payload?.owner_authorized && Number(j.payload.base_version)===Number(revision.baseVersion) && !j.payload.run_id);
      if (!fallback) throw new Error("The owner revision job was not persisted.");
      revision.jobId = fallback.id;
    };
    if (["all", "whole_concept"].includes(scope)) { await persistAuthority(); return create({kind:item.type,request,options,user}); }
    const sourceId = item.produced_by?.studio_run;
    const source = sourceId && await get(sourceId);
    if (!source?.run?.artifacts?.brief && item.type !== "carousel") throw new Error("Saved production artifacts are unavailable; targeted revision stopped without full regeneration.");
    const A = structuredClone(source?.run?.artifacts || {});
    A.brief = structuredClone(item); delete A.brief.history; delete A.brief.owner_comments;
    A.item_id = itemId; delete A.qc; delete A.final_qc; delete A.qc_blocked; delete A.fix; delete A.fixByIndex;
    if (item.type === "carousel") {
      const slides = item.carousel?.slides || item.design?.slides;
      const urls = item.media?.image_urls || (Array.isArray(item.media?.slides) ? item.media.slides.map(s=>typeof s==="string"?s:s.image_url) : []);
      if (!Array.isArray(slides) || !slides.length || slides.some((s,i)=>!s.image_prompt||!s.headline_en||!(s.image_url||urls[i]))) throw new Error("Legacy carousel lacks durable per-slide prompts/media; no unrelated regeneration was started.");
      if (clipNumber && clipNumber>slides.length) throw new Error("Slide index exceeds the carousel length.");
      A.brief.carousel = {...(item.carousel||{}),format:item.carousel?.format||item.design?.format||"1080x1350",slides:slides.map((s,i)=>({...s,slide:i+1,image_url:s.image_url||urls[i]}))};
      A.images = A.brief.carousel.slides.map(s=>({url:s.image_url}));
      const steps = PIPELINES.carousel.steps().map(s=>({...s,status:s.action==="carousel_slides"&&scope!=="static_design"?"done":"pending"}));
      await persistAuthority();
      return create({kind:"carousel",request,options,user,initialArtifacts:A,initialSteps:steps});
    }
    const full = PIPELINES[item.type].steps();
    const active = new Set(item.type === "reel" ? ["qc_final", "to_weekly_plan"] : ["qc_visual", "to_weekly_plan"]);
    if (scope === "reel_clip") for (const action of ["reel_keyframes", "clips", "compose_reel"]) active.add(action);
    if (scope === "voice") for (const action of ["voice", "compose_reel"]) active.add(action);
    if (scope === "static_design") for (const action of ["static_image", "check_brief"]) active.add(action);
    const steps = [S("claude", "revise_content", "Apply owner-authorized targeted change"), ...full.map(s=>({...s,status:active.has(s.action)?"pending":"done"}))];
    await persistAuthority();
    return create({kind:item.type,request,options,user,initialArtifacts:A,initialSteps:steps});
  }

  /**
   * Autopilot schedule (Cairo): Saturday from 09:00 → next week's plan; from the 25th → next
   * month's plan. Also opens the autopublish gate the first time it is reached.
   */
  async function autopilot(nowMs = Date.now()) {
    const { state } = await deps.loadState();
    const st = state.settings;
    const ap = st.autopublish || {};
    if (!ap.enabled && !ap.enabledAt && !ap.disabledAt && R.approvalStats(state.items, st).gateEligible) {
      await deps.mutate({}, (s2) => E.enableAutopublish(s2, "autopilot", "owner"));
    }
    if (ap.enabled) {
      // Friday action plan items: approve automatically; decideAction still refuses anything that breaks the cap.
      const pending = state.actions.filter((x) => x.status === "pending").map((x) => x.id);
      if (pending.length) await deps.mutate({}, (s2) => { for (const id of pending) { const r = E.decideAction(s2, id, "approve", { comment: "Approved by autopilot (6-week gate reached)" }, "autopilot", "owner"); if (r.ok === false) E.audit(s2, "autopilot", "action.left_for_owner", id, r.error); } return { ok: true }; });
    }
    if (st.studio?.autoplan === false) return;
    const c = cairoParts(nowMs);
    if (c.weekday === "Sat" && c.hour >= 9) await startWeekly(planningWeek(nowMs), { email: "autopilot", role: "owner" }).catch(() => {});
    if (c.day >= 25) {
      const d = new Date(nowMs); d.setUTCMonth(d.getUTCMonth() + 1, 1);
      await startMonthly(d.toISOString().slice(0, 7), { email: "autopilot", role: "owner" }).catch(() => {});
    }
  }
  async function claimOnce(key) {
    const res = await q("INSERT IGNORE INTO ec_kv (name, value) VALUES (?, ?)", [key, nowIso()]);
    return res.affectedRows === 1;
  }
  async function startWeekly(week = planningWeek(), user) {
    if (!(await claimOnce(`autoplan_week_${week}`))) throw new Error(`The plan for ${week} was already started.`);
    return create({ kind: "weekly_plan", request: `Weekly content plan ${week}`, options: { week }, user });
  }
  async function startMonthly(month, user) {
    if (!(await claimOnce(`autoplan_month_${month}`))) throw new Error(`The plan for ${month} was already started.`);
    return create({ kind: "plan", request: "", options: { month }, user });
  }

  /** Background tick: resume waiting runs (Higgsfield clips, Manus jobs). */
  async function tick() {
    await autopilot().catch(() => {});
    const rows = await q("SELECT id, status, doc FROM ec_ai_runs WHERE status IN ('waiting','queued','running') ORDER BY id LIMIT 30");
    for (const r of rows) {
      if (r.status !== "running") { kick(r.id); continue; }
      if (running.has(r.id)) continue;
      // A step that was running when the server restarted: never re-run paid work silently.
      const doc = JSON.parse(r.doc);
      const composing = doc.steps?.some((s) => s.status === "running" && s.action === "compose_reel");
      if (Date.now() - Date.parse(doc.updated_at || doc.created_at) < (composing ? 6 : 15) * 60 * 1000) continue;
      const g = await get(r.id);
      const step = g.run.steps.find((s) => s.status === "running");
      // Cheap planning/image steps and external render polling can resume automatically.
      // up to 3 times (back-to-back publishes restart the server more than once).
      // Higgsfield clips (the expensive step) are never re-submitted without a person pressing Retry.
      let resumes = Number(step?.auto_resumes || (step?.auto_resumed ? 1 : 0));
      if (step?.action === "compose_reel" && g.run.artifacts.compose) {
        const C = g.run.artifacts.compose, done = Object.keys(C.parts || {}).length;
        if (done > Number(C.done_at_resume ?? -1)) resumes = 0; // it made progress since the last restart
        C.done_at_resume = done;
        // The join is the only heavy piece: if it brought the server down, join with straight cuts instead.
        if (REEL_STAGES.every((k) => k === "final" || C.parts?.[k]) && C.mode !== "cuts") { C.join_crashes = Number(C.join_crashes || 0) + 1; if (C.join_crashes >= 1) C.mode = "cuts"; }
      }
      if (step && !["higgsfield", "elevenlabs"].includes(step.provider) && resumes < 3) {
        step.status = "pending"; step.auto_resumes = resumes + 1; step.auto_resumed = true; g.run.status = "queued";
        log(g.run, "studio", "team", `Resumed automatically after a server restart: ${step.title}`);
        await save(g.run, g.ver).catch(() => {});
        continue;
      }
      if (step) {
        step.status = "failed";
        step.error = step.action === "compose_reel" && resumes >= 3
          ? "The server restarted every time it tried this final edit, so it is most likely running out of memory while rendering the reel. Ask Manus to give the server more memory (or set ELEVAY_REEL_THREADS=1), then press Retry."
          : "Interrupted (server restart). Press Retry to run this step again.";
      }
      g.run.status = "failed";
      await notifyFailureOnce(g.run, step?.error || "Interrupted (server restart).");
      await save(g.run, g.ver).catch(() => {});
    }
  }

  return { ensureTable, create, reviseItem, list, autopilot, startWeekly, startMonthly, get: async (id) => (await get(id))?.run || null, resume: async (id) => { const g = await get(id); if (!g) throw new Error("Run not found."); if (g.run.options?.sandboxOnly && !deps.allowSandboxRuns) throw new Error("Sandbox run cannot execute on the website."); kick(id); }, approve, retry, redo, cancel, tick, test: () => providers.test() };
}
