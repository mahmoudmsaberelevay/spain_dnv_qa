// @ts-nocheck
/**
 * External ELEVAY final-render worker.
 *
 * This process intentionally has no MySQL, storage, Meta or AI-provider access.
 * It receives a restricted worker token, leases one saved-input job over HTTPS,
 * composes it locally, then streams individual artifacts to the server-side bridge.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { renderReel, shaFile } from "./elevay-reel-render.mjs";

const args = process.argv.slice(2);
const once = args.includes("--once");
const root = process.env.ELEVAY_RENDER_WORK_DIR || path.join(os.homedir(), ".elevay-render-worker", "work");
const baseUrl = String(process.env.ELEVAY_RENDER_BRIDGE_URL || "").replace(/\/+$/, "");
const token = String(process.env.ELEVAY_RENDER_WORKER_TOKEN || "").trim();
const workerId = String(process.env.ELEVAY_RENDER_WORKER_ID || `${os.hostname()}-${crypto.randomBytes(6).toString("hex")}`)
  .replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
const POLL_MS = 5_000;
const RENEW_MS = 30_000;

function cleanError(value: unknown) {
  return String(value || "Render worker error")
    .replace(/https?:\/\/\S+/gi, "[asset]")
    .replace(/bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 1800);
}
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function requireConfig() {
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("ELEVAY_RENDER_BRIDGE_URL must be an HTTPS endpoint.");
  if (!token) throw new Error("ELEVAY_RENDER_WORKER_TOKEN is required.");
  if (process.env.DATABASE_URL || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SECRET_ACCESS_KEY || process.env.OPENAI_API_KEY || process.env.HF_API_KEY || process.env.ELEVENLABS_API_KEY || process.env.ANTHROPIC_API_KEY) {
    throw new Error("This bridge worker must not be configured with database, storage, Meta, or AI-provider credentials.");
  }
}
function headers(extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${token}`, "X-Render-Worker-Id": workerId, ...extra };
}
async function jsonRequest(method: string, pathname: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { ...headers(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(cleanError(data?.error || `Bridge HTTP ${response.status}`)), { status: response.status });
  return data;
}
async function uploadArtifact(jobId: string, leaseId: string, kind: string, file: string, mime: string, index?: number) {
  const sha256 = await shaFile(file);
  const bytes = Number((await fsp.stat(file)).size);
  const response = await fetch(`${baseUrl}/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(kind)}`, {
    method: "POST",
    headers: headers({
      "Content-Type": mime,
      "Content-Length": String(bytes),
      "X-Render-Worker-Lease": leaseId,
      "X-Artifact-Sha256": sha256,
      ...(index ? { "X-Artifact-Index": String(index) } : {}),
    }),
    body: Readable.toWeb(fs.createReadStream(file)) as any,
    duplex: "half",
    signal: AbortSignal.timeout(10 * 60_000),
  } as any);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw Object.assign(new Error(cleanError(data?.error || `Artifact upload failed (${response.status})`)), { status: response.status });
  return data.artifact;
}

async function qcSheets(file: string, directory: string) {
  const pattern = path.join(directory, "qc-%03d.jpg");
  const ffmpeg = process.env.ELEVAY_FFMPEG_BIN || "ffmpeg";
  const run = (ffArgs: string[], timeout = 180_000) => new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg, ffArgs, { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, ELEVAY_REEL_THREADS: "1", OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1" } });
    let error = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.stderr.on("data", (chunk) => { error = (error + chunk).slice(-1000); });
    child.on("error", reject);
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Final frame-sheet extraction failed: ${cleanError(error)}`)); });
  });
  await run(["-y", "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", file, "-vf", "trim=duration=20,fps=30,scale=360:640:flags=bicubic,tile=4x2:nb_frames=8", "-frames:v", "75", "-q:v", "3", "-threads", "1", "-filter_threads", "1", pattern]);
  const sheets = (await fsp.readdir(directory)).filter((name) => /^qc-\d+\.jpg$/.test(name)).sort().map((name) => path.join(directory, name));
  if (sheets.length !== 75) throw new Error("All 600 narrative frames must be represented in 75 QC sheets.");
  for (const [offset, time] of [20.1, 22.8].entries()) {
    const frame = path.join(directory, `outro-qc-${offset + 1}.jpg`);
    await run(["-y", "-hide_banner", "-loglevel", "error", "-threads", "1", "-ss", String(time), "-i", file, "-frames:v", "1", "-vf", "scale=540:960", "-threads", "1", "-filter_threads", "1", frame]);
    sheets.push(frame);
  }
  return sheets;
}

async function cleanOldWork() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60_000;
  await fsp.mkdir(root, { recursive: true });
  for (const item of await fsp.readdir(root, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const dir = path.join(root, item.name);
    const stat = await fsp.stat(dir).catch(() => null);
    if (stat && stat.mtimeMs < cutoff) await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function processJob(leased: any) {
  const job = leased.job;
  const leaseId = leased.lease.id;
  const directory = path.join(root, job.id);
  await fsp.mkdir(directory, { recursive: true });
  let leaseLost = false;
  const renew = async () => {
    try { await jsonRequest("POST", `/jobs/${encodeURIComponent(job.id)}/renew`, { workerId, leaseId }); }
    catch (error) { leaseLost = true; throw error; }
  };
  const heartbeat = setInterval(() => { renew().catch(() => {}); }, RENEW_MS);
  const requireLease = () => { if (leaseLost) throw new Error("Render lease lost; stopping without overwriting another worker."); };
  try {
    console.log(`Render #${job.runId}: leased; saved inputs only; threads=1.`);
    await jsonRequest("POST", `/jobs/${encodeURIComponent(job.id)}/progress`, { workerId, leaseId, stage: "rendering", metrics: { method: `external ${process.platform} worker; FFmpeg one thread`, threads: 1 } });
    const rendered = await renderReel({
      manifest: job.manifest,
      directory,
      savedParts: job.parts || {},
      onPart: async ({ name, file, type }) => {
        requireLease();
        const artifact = await uploadArtifact(job.id, leaseId, name, file, type);
        console.log(`Render #${job.runId}: ${name} stored.`);
        return artifact;
      },
      onProgress: async ({ stage, parts, metrics }) => {
        requireLease();
        await jsonRequest("POST", `/jobs/${encodeURIComponent(job.id)}/progress`, { workerId, leaseId, stage, parts, metrics });
      },
    });
    requireLease();
    await uploadArtifact(job.id, leaseId, "final", rendered.final.file, "video/mp4");
    await jsonRequest("POST", `/jobs/${encodeURIComponent(job.id)}/progress`, { workerId, leaseId, stage: "final visual evidence", metrics: rendered.final.metrics });
    const evidence = await qcSheets(rendered.final.file, directory);
    for (let index = 0; index < evidence.length; index++) {
      requireLease();
      await uploadArtifact(job.id, leaseId, "qc", evidence[index], "image/jpeg", index + 1);
      if ((index + 1) % 15 === 0) console.log(`Render #${job.runId}: ${index + 1}/77 QC sheets stored.`);
    }
    requireLease();
    const { file, ...final } = rendered.final;
    await jsonRequest("POST", `/jobs/${encodeURIComponent(job.id)}/complete`, { workerId, leaseId, final });
    console.log(`Render #${job.runId}: done; 23-second final edit returned for Claude QC.`);
    await fsp.rm(directory, { recursive: true, force: true });
  } catch (error) {
    const message = cleanError(error);
    if (!leaseLost && (error as any)?.status !== 409) {
      try { await jsonRequest("POST", `/jobs/${encodeURIComponent(job.id)}/fail`, { workerId, leaseId, stage: "rendering", error: message }); }
      catch { /* A stale or unavailable bridge must not be overwritten by this worker. */ }
    }
    throw error;
  } finally { clearInterval(heartbeat); }
}

async function main() {
  requireConfig();
  await cleanOldWork();
  await jsonRequest("GET", "/health");
  console.log(`ELEVAY render bridge connected as ${workerId}; one job at a time.`);
  do {
    try {
      const leased = await jsonRequest("POST", "/lease", { workerId });
      if (leased?.job) await processJob(leased);
      else if (!once) await sleep(POLL_MS);
    } catch (error) {
      console.error(`Render worker: ${cleanError(error)}`);
      if (once) throw error;
      await sleep(POLL_MS);
    }
  } while (!once);
}

main().catch((error) => { console.error(`Worker failed: ${cleanError(error)}`); process.exitCode = 1; });
