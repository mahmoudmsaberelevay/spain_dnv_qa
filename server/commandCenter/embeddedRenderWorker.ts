// @ts-nocheck
/**
 * Optional render worker inside the website process, for when the website server has been given enough
 * memory. It runs the same single-threaded, disk-backed worker as scripts/elevay-render-worker.ts, one job
 * at a time, and only starts when BOTH are true:
 *   - ELEVAY_EMBEDDED_RENDER=1 is set, and
 *   - the server's memory limit is at least ELEVAY_EMBEDDED_RENDER_MIN_MB (default 2048 MB).
 * Otherwise jobs keep waiting for an external worker, and the Command Center says why.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MIN_MB = Math.max(512, Number(process.env.ELEVAY_EMBEDDED_RENDER_MIN_MB) || 2048);
export const embeddedRender = { enabled: false, reason: "", memoryMb: 0, running: false, lastError: "" };

/** Effective memory limit in MB: the container (cgroup) limit when there is one, else machine RAM. */
export function memoryLimitMb() {
  let limit = os.totalmem();
  for (const f of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try {
      const v = fs.readFileSync(f, "utf8").trim();
      if (/^\d+$/.test(v)) limit = Math.min(limit, Number(v));
    } catch { /* not present */ }
  }
  return Math.floor(limit / 1048576);
}

export function embeddedRenderStatus() {
  if (embeddedRender.enabled) return embeddedRender.running ? "The website is rendering this reel" : "Queued for the website renderer";
  return `Waiting for render worker (${embeddedRender.reason})`;
}

export async function startEmbeddedRenderWorker(q, { log = console.log } = {}) {
  embeddedRender.memoryMb = memoryLimitMb();
  if (process.env.ELEVAY_EMBEDDED_RENDER !== "1") { embeddedRender.reason = "website rendering is switched off; no external worker has picked it up"; return embeddedRender; }
  if (embeddedRender.memoryMb < MIN_MB) { embeddedRender.reason = `website rendering needs at least ${MIN_MB} MB but this server has ${embeddedRender.memoryMb} MB`; log(`[render] Embedded renderer not started: ${embeddedRender.reason}.`); return embeddedRender; }
  // Same FFmpeg the website already packages; the render module reads this when it loads.
  try { const m = await import("../mediaExecutables"); if (!process.env.ELEVAY_FFMPEG_BIN && m.FFMPEG_BIN) process.env.ELEVAY_FFMPEG_BIN = m.FFMPEG_BIN; if (!process.env.ELEVAY_FFPROBE_BIN && m.FFPROBE_BIN) process.env.ELEVAY_FFPROBE_BIN = m.FFPROBE_BIN; } catch { /* system ffmpeg */ }
  const { renderReel } = await import("../../scripts/elevay-reel-render.mjs");
  const { createRenderWorker } = await import("./renderWorkerCore");
  const root = process.env.ELEVAY_RENDER_WORK_DIR || path.join(os.tmpdir(), "elevay-embedded-render");
  const worker = createRenderWorker({ q, root, renderReel, log: (m) => log(`[render] ${m}`), logError: (m) => log(`[render] ${m}`) });
  embeddedRender.enabled = true; embeddedRender.reason = "";
  log(`[render] Embedded renderer started (${embeddedRender.memoryMb} MB available, one reel at a time).`);
  const loop = async () => {
    if (embeddedRender.running) return;
    embeddedRender.running = true;
    try {
      while (await worker.runNext()) { await fsp.rm(root, { recursive: true, force: true }).catch(() => {}); }
      embeddedRender.lastError = "";
    } catch (e) { embeddedRender.lastError = String(e?.message || e).slice(0, 300); log(`[render] ${embeddedRender.lastError}`); }
    finally { embeddedRender.running = false; await fsp.rm(root, { recursive: true, force: true }).catch(() => {}); }
  };
  setInterval(() => { loop(); }, 15000).unref?.();
  loop();
  return embeddedRender;
}
