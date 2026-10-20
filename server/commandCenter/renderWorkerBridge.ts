// @ts-nocheck
/**
 * Narrow, worker-only bridge for the external ELEVAY final-render process.
 *
 * The worker receives only saved HTTPS media inputs, a short-lived job lease and
 * its own bearer credential. It never receives a CRM database, storage provider,
 * Meta or AI-provider credential. MP4/JPEG artifacts are streamed to a temporary
 * file here and uploaded to managed storage from the server process.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import mysql from "mysql2/promise";
import { storagePutFile } from "../storage";
import { ENV } from "../_core/env";
import { notifyAiFailure } from "./alerts";

const LEASE_MS = 15 * 60_000;
const RETRY_DELAY_MS = 2 * 60_000;
const WORKER_ONLINE_MS = 150_000;
const WORKER_OFFLINE_ALERT_MS = 30 * 60_000;
/** This is deliberately a stable machine identity, not a secret. */
const DEFAULT_ALLOWED_WORKER_ID = "mahmouds-macbook-pro-render-worker";
const DEFAULT_WORKER_NAME = "Mahmoud's MacBook Pro";
const MAX_QC_FRAMES = 77;
const ARTIFACTS = {
  seg0: { type: "video/mp4", maxBytes: 120 * 1024 * 1024, extension: "mp4" },
  seg1: { type: "video/mp4", maxBytes: 120 * 1024 * 1024, extension: "mp4" },
  seg2: { type: "video/mp4", maxBytes: 120 * 1024 * 1024, extension: "mp4" },
  seg3: { type: "video/mp4", maxBytes: 120 * 1024 * 1024, extension: "mp4" },
  outro: { type: "video/mp4", maxBytes: 100 * 1024 * 1024, extension: "mp4" },
  audio: { type: "audio/mp4", maxBytes: 32 * 1024 * 1024, extension: "m4a" },
  final: { type: "video/mp4", maxBytes: 320 * 1024 * 1024, extension: "mp4" },
  qc: { type: "image/jpeg", maxBytes: 6 * 1024 * 1024, extension: "jpg" },
};
const PART_NAMES = new Set(["seg0", "seg1", "seg2", "seg3", "outro", "audio"]);
const SAFE_STAGES = new Set([
  "queued", "rendering", "normalize scene 1", "normalize scene 2", "normalize scene 3", "normalize scene 4",
  "fixed ELEVAYEXTRO.mov outro", "voice and music audio mix", "stream-copy concat", "final audio mux (no video encoding)",
  "final visual evidence", "uploading artifacts", "done", "retry_wait",
]);

export class RenderWorkerBridgeError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function timingSafeEqual(a: unknown, b: unknown) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cleanError(value: unknown) {
  return String(value || "Render worker error")
    .replace(/https?:\/\/\S+/gi, "[asset]")
    .replace(/bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 1800);
}

function isWorkerId(value: unknown) {
  return /^[A-Za-z0-9._-]{8,80}$/.test(String(value || ""));
}

function workerIdSetting(value: unknown) {
  const id = String(value || DEFAULT_ALLOWED_WORKER_ID).trim();
  return isWorkerId(id) ? id : DEFAULT_ALLOWED_WORKER_ID;
}

function isLeaseId(value: unknown) {
  return /^[A-Za-z0-9_-]{24,96}$/.test(String(value || ""));
}

function leaseKey(workerId: string, leaseId: string) {
  return crypto.createHash("sha256").update(`${workerId}:${leaseId}`).digest("hex");
}

function sha256File(file: string) {
  return new Promise<string>((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const r = fs.createReadStream(file);
    r.on("data", (chunk) => h.update(chunk));
    r.on("error", reject);
    r.on("end", () => resolve(h.digest("hex")));
  });
}

async function verifyArtifactSignature(file: string, type: string) {
  const handle = await fsp.open(file, "r");
  try {
    const prefix = Buffer.alloc(16);
    const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
    if (type === "image/jpeg" && !(bytesRead >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff)) {
      throw new RenderWorkerBridgeError(415, "Artifact content does not match image/jpeg.");
    }
    if ((type === "video/mp4" || type === "audio/mp4") && !(bytesRead >= 8 && prefix.subarray(4, 8).equals(Buffer.from("ftyp")))) {
      throw new RenderWorkerBridgeError(415, "Artifact content does not match an MP4 container.");
    }
  } finally { await handle.close(); }
}

function artifactRule(kind: string, index?: unknown) {
  if (!(kind in ARTIFACTS)) throw new RenderWorkerBridgeError(400, "Unsupported artifact kind.");
  if (kind === "qc") {
    const n = Number(index);
    if (!Number.isInteger(n) || n < 1 || n > MAX_QC_FRAMES) throw new RenderWorkerBridgeError(400, "QC artifact index is invalid.");
    return { ...ARTIFACTS.qc, index: n };
  }
  if (index !== undefined && index !== null && String(index) !== "") throw new RenderWorkerBridgeError(400, "Only QC artifacts accept an index.");
  return ARTIFACTS[kind];
}

function qcLabel(index: number) {
  if (index <= 75) {
    const first = (index - 1) * 8 + 1;
    const last = first + 7;
    return `Sheet ${index}: chronological frames ${first}–${last}, row-major, t=${((first - 1) / 30).toFixed(3)}–${((last - 1) / 30).toFixed(3)} s. Scene = floor(t/5)+1.`;
  }
  return `Outro frame at ${index === 76 ? "20.1" : "22.8"}s: exact official logo centered on pure white; no narration here.`;
}

function assetUrl(value: unknown) {
  const s = String(value || "");
  return /^https:\/\/[\w.-]+(?:\/[^\s]*)?$/i.test(s) ? s : null;
}

function safeMetrics(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const positive = (v: unknown, max: number) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= max ? Number(v) : 0;
  const stages = Array.isArray(input.stages) ? input.stages.slice(-20).map((s) => ({
    stage: String((s as any)?.stage || "").slice(0, 80),
    seconds: positive((s as any)?.seconds, 3600),
    code: Number.isInteger(Number((s as any)?.code)) ? Number((s as any)?.code) : null,
    signal: (s as any)?.signal ? String((s as any).signal).slice(0, 32) : null,
  })) : [];
  return {
    method: String(input.method || "external worker measurement").slice(0, 160),
    peakRssBytes: positive(input.peakRssBytes, 32 * 1024 * 1024 * 1024),
    peakFfmpegRssBytes: positive(input.peakFfmpegRssBytes, 32 * 1024 * 1024 * 1024),
    threads: Number(input.threads) === 1 ? 1 : 1,
    stages,
  };
}

function safeProgressMetadata(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const raw = Array.isArray(input.rawVoiceSeconds) ? input.rawVoiceSeconds.slice(0, 4).map(Number) : [];
  const legacy = Number(input.narrationTargetSeconds) === 18 && Number(input.narrationSceneSeconds) === 4.5;
  const current = Number(input.narrationTargetSeconds) === 20 && Number(input.narrationSceneSeconds) === 5;
  return {
    music: input.music === true,
    musicDropped: input.musicDropped ? cleanError(input.musicDropped).slice(0, 240) : null,
    narrationTargetSeconds: current ? 20 : legacy ? 18 : undefined,
    narrationSceneSeconds: current ? 5 : legacy ? 4.5 : undefined,
    rawVoiceSeconds: raw.length === 4 && raw.every((n) => Number.isFinite(n) && n > 0.2 && n < 12) ? raw : undefined,
    appliedVoiceTempos: Array.isArray(input.appliedVoiceTempos) && input.appliedVoiceTempos.length === 4 && input.appliedVoiceTempos.every((n: unknown) => Number.isFinite(Number(n)) && Number(n) >= 0.8 && Number(n) <= 1.12 + 0.0001) ? input.appliedVoiceTempos.map(Number) : undefined,
    voicePaddingSeconds: Array.isArray(input.voicePaddingSeconds) && input.voicePaddingSeconds.length === 4 && input.voicePaddingSeconds.every((n: unknown) => Number.isFinite(Number(n)) && Number(n) >= 0 && Number(n) <= 5) ? input.voicePaddingSeconds.map(Number) : undefined,
  };
}

function safeManifest(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const clips = Array.isArray(input.clipUrls) ? input.clipUrls.map(assetUrl) : [];
  const voices = Array.isArray(input.voiceUrls) ? input.voiceUrls.map(assetUrl) : [];
  const outroUrl = assetUrl(input.outroUrl);
  if (clips.length !== 4 || clips.some((x) => !x) || voices.length !== 4 || voices.some((x) => !x) || !outroUrl) {
    throw new RenderWorkerBridgeError(409, "Queued job has no valid saved render inputs.");
  }
  const legacy = Number(input.narrationTargetSeconds) === 18 && Number(input.narrationSceneSeconds) === 4.5;
  const current = Number(input.narrationTargetSeconds) === 20 && Number(input.narrationSceneSeconds) === 5;
  if (!legacy && !current) {
    throw new RenderWorkerBridgeError(409, "Queued job does not meet the locked narration contract.");
  }
  return {
    version: String(input.version || "").slice(0, 100),
    runId: Number(input.runId),
    clipUrls: clips,
    voiceUrls: voices,
    musicUrl: assetUrl(input.musicUrl),
    outroUrl,
    editDirection: typeof input.editDirection === "string" ? input.editDirection.slice(0, 600) : null,
    threads: 1,
    width: 1080,
    height: 1920,
    fps: 30,
    sceneSeconds: 5,
    outroSeconds: 3,
    narrationTargetSeconds: current ? 20 : 18,
    narrationSceneSeconds: current ? 5 : 4.5,
  };
}

function safeParts(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  for (const name of PART_NAMES) {
    const url = assetUrl(input[name]);
    if (url) out[name] = url;
  }
  if (typeof input._version === "string") out._version = input._version.slice(0, 100);
  Object.assign(out, Object.fromEntries(Object.entries(safeProgressMetadata(input)).filter(([, v]) => v !== undefined && v !== null)));
  return out;
}

function parseDoc(row: any) {
  try { return JSON.parse(String(row?.doc || "{}")); }
  catch { throw new RenderWorkerBridgeError(409, "Queued job data is invalid."); }
}

function header(req: any, name: string) {
  const v = req.headers?.[name.toLowerCase()];
  return Array.isArray(v) ? String(v[0] || "") : String(v || "");
}

/** Server-side bridge implementation. It intentionally knows nothing about CRM leads, Meta or providers. */
export function createRenderWorkerBridge({
  q,
  // The managed worker credential is intentionally resolved during each server bootstrap.
  token = ENV.renderWorkerToken,
  now = () => Date.now(),
  putFile = storagePutFile,
  notifyFailure = notifyAiFailure,
}: any) {
  let ensurePromise: Promise<any> | null = null;
  const rate = new Map<string, number[]>();
  const activeUploads = new Set<string>();

  function authenticate(authorization: unknown) {
    const value = String(authorization || "");
    return value.startsWith("Bearer ") && timingSafeEqual(value.slice(7).trim(), token);
  }

  function limit(scope: string, max: number, windowMs: number) {
    const t = now();
    const values = (rate.get(scope) || []).filter((v) => v > t - windowMs);
    if (values.length >= max) throw new RenderWorkerBridgeError(429, "Worker request rate limit reached.");
    values.push(t); rate.set(scope, values);
  }

  async function ensure() {
    return ensurePromise ??= (async () => {
      await q(`CREATE TABLE IF NOT EXISTS ec_render_jobs (
      id VARCHAR(64) PRIMARY KEY, run_id INT NOT NULL, status VARCHAR(24) NOT NULL,
      created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, lease_until BIGINT NOT NULL DEFAULT 0,
      lease_owner VARCHAR(64), attempts INT NOT NULL DEFAULT 0, doc LONGTEXT NOT NULL,
      INDEX ec_render_status (status, created_at))`);
      await q(`CREATE TABLE IF NOT EXISTS ec_render_workers (
        id VARCHAR(80) PRIMARY KEY, display_name VARCHAR(160) NOT NULL,
        hostname VARCHAR(120) NOT NULL, mac_user VARCHAR(120) NOT NULL,
        renderer_version INT NULL, last_seen BIGINT NOT NULL DEFAULT 0,
        current_job_id VARCHAR(64) NULL, offline_alert_at BIGINT NOT NULL DEFAULT 0,
        updated_at BIGINT NOT NULL)`).catch(() => {});
      const id = allowedWorkerId();
      await q("INSERT IGNORE INTO ec_render_workers (id,display_name,hostname,mac_user,renderer_version,last_seen,current_job_id,offline_alert_at,updated_at) VALUES (?,?,?,?,NULL,0,NULL,0,?)", [id, DEFAULT_WORKER_NAME, "Mahmouds-MacBook-Pro", "mahmoudsaber", now()]).catch(() => {});
    })();
  }

  const allowedWorkerId = () => workerIdSetting(process.env.ELEVAY_RENDER_ALLOWED_WORKER_ID);
  function assertAllowedWorker(workerId: string) {
    if (!isWorkerId(workerId) || !timingSafeEqual(workerId, allowedWorkerId())) {
      throw new RenderWorkerBridgeError(403, "This bridge is reserved for Mahmoud's MacBook Pro.");
    }
  }
  async function touchWorker(workerId: string, rendererVersion?: unknown, currentJobId?: string) {
    const version = Number.isFinite(Number(rendererVersion)) ? Number(rendererVersion) : null;
    const t = now();
    if (currentJobId) {
      await q("INSERT INTO ec_render_workers (id,display_name,hostname,mac_user,renderer_version,last_seen,current_job_id,offline_alert_at,updated_at) VALUES (?,?,?,?,?,?,?,0,?) ON DUPLICATE KEY UPDATE renderer_version=COALESCE(VALUES(renderer_version),renderer_version),last_seen=VALUES(last_seen),current_job_id=VALUES(current_job_id),updated_at=VALUES(updated_at)", [workerId, DEFAULT_WORKER_NAME, "Mahmouds-MacBook-Pro", "mahmoudsaber", version, t, currentJobId, t]).catch(() => {});
    } else {
      await q("INSERT INTO ec_render_workers (id,display_name,hostname,mac_user,renderer_version,last_seen,current_job_id,offline_alert_at,updated_at) VALUES (?,?,?,?,?,?,NULL,0,?) ON DUPLICATE KEY UPDATE renderer_version=COALESCE(VALUES(renderer_version),renderer_version),last_seen=VALUES(last_seen),updated_at=VALUES(updated_at)", [workerId, DEFAULT_WORKER_NAME, "Mahmouds-MacBook-Pro", "mahmoudsaber", version, t, t]).catch(() => {});
    }
  }
  async function clearWorkerJob(workerId: string) {
    await q("UPDATE ec_render_workers SET current_job_id=NULL,last_seen=?,updated_at=? WHERE id=?", [now(), now(), workerId]).catch(() => {});
  }

  async function leased(jobId: string, workerId: string, leaseId: string) {
    if (!/^[a-z0-9-]{8,64}$/i.test(jobId)) throw new RenderWorkerBridgeError(400, "Job identifier is invalid.");
    if (!isLeaseId(leaseId)) throw new RenderWorkerBridgeError(400, "Worker lease credentials are invalid.");
    assertAllowedWorker(workerId);
    const rows = await q("SELECT * FROM ec_render_jobs WHERE id=? LIMIT 1", [jobId]);
    const row = rows[0];
    if (!row) throw new RenderWorkerBridgeError(404, "Render job not found.");
    if (row.status !== "running" || Number(row.lease_until) <= now() || !timingSafeEqual(row.lease_owner, leaseKey(workerId, leaseId))) {
      throw new RenderWorkerBridgeError(409, "Render lease is no longer active.");
    }
    const doc = parseDoc(row);
    if (!doc.lease || !timingSafeEqual(doc.lease.id, leaseId) || !timingSafeEqual(doc.lease.workerId, workerId)) {
      throw new RenderWorkerBridgeError(409, "Render lease is no longer active.");
    }
    return { row, doc, key: leaseKey(workerId, leaseId) };
  }

  async function quarantineInvalidManifest(row: any, doc: any, reason: unknown) {
    const error = `Queued render job is invalid and was not sent to a worker: ${cleanError(reason)}`;
    doc.error = error;
    doc.stage = "invalid_manifest";
    doc.invalidManifestAt = now();
    doc.lastFailure = { at: now(), stage: "queued render inputs", error };
    try { doc.notification = await notifyFailure({ runId: row.run_id, stepName: "Final edit — saved render inputs", reason: error }); }
    catch { doc.notification = false; }
    await q("UPDATE ec_render_jobs SET status='failed',doc=?,updated_at=?,lease_until=0,lease_owner=NULL WHERE id=? AND status IN ('pending','running')", [JSON.stringify(doc), now(), row.id]);
  }

  /** Lowest renderer version that may take jobs (3 = the voice-over fix). Older or unversioned Macs wait. */
  const requiredRenderer = () => Math.max(0, Number(process.env.ELEVAY_RENDER_MIN_RENDERER_VERSION ?? 6) || 0);
  const workersSeen = new Map<string, { rendererVersion: number | null; at: number; outdated: boolean }>();
  async function lease(workerId: string, rendererVersion?: unknown) {
    await ensure();
    // The Mac worker polls every 5 s while idle (180 requests per 15 minutes); the old cap of 90 refused
    // half of them and kept it in a permanent "rate limit" loop. Allow normal polling with headroom.
    limit("lease", 400, 15 * 60_000);
    assertAllowedWorker(workerId);
    const version = Number.isFinite(Number(rendererVersion)) && rendererVersion !== null && rendererVersion !== undefined && rendererVersion !== "" ? Number(rendererVersion) : null;
    const outdated = version === null || version < requiredRenderer();
    workersSeen.set(workerId, { rendererVersion: version, at: now(), outdated });
    await touchWorker(workerId, version);
    // Only Macs running the current renderer get work; an outdated Mac keeps polling and simply waits.
    if (outdated) return { ok: true, job: null, outdated: true, requiredVersion: requiredRenderer() };
    // Owner switch: worker names in ELEVAY_RENDER_WORKERS_PAUSED (comma-separated) get no new jobs, e.g. a Mac
    // still running an outdated renderer until someone can restart it. Other workers keep rendering.
    if (String(process.env.ELEVAY_RENDER_WORKERS_PAUSED || "").split(",").map((x) => x.trim()).filter(Boolean).includes(workerId)) return { ok: true, job: null, paused: true };
    // One Mac may accidentally have a stale manual process alongside its
    // LaunchAgent. A worker identity can own only one unexpired lease so the
    // second process stays idle instead of rendering multiple reels at once.
    const active = await q("SELECT id FROM ec_render_jobs WHERE status='running' AND lease_until>? AND JSON_UNQUOTE(JSON_EXTRACT(doc,'$.lease.workerId'))=? LIMIT 1", [now(), workerId]);
    if (active[0]) return { ok: true, job: null };
    // Legacy queue rows can pre-date the fixed-outro contract. Quarantine a
    // bounded batch rather than handing an unusable job to the Mac forever.
    for (let retry = 0; retry < 20; retry++) {
      const t = now();
      const rows = await q("SELECT * FROM ec_render_jobs WHERE ((status='pending' AND lease_until<=?) OR (status='running' AND lease_until<?)) ORDER BY created_at LIMIT 1", [t, t]);
      const row = rows[0];
      if (!row) return { ok: true, job: null };
      const doc = parseDoc(row);
      let manifest;
      try { manifest = safeManifest(doc.manifest); }
      catch (error) { await quarantineInvalidManifest(row, doc, error); continue; }
      const leaseId = crypto.randomBytes(24).toString("base64url");
      const owner = leaseKey(workerId, leaseId);
      const leaseUntil = t + LEASE_MS;
      doc.lease = { id: leaseId, workerId, issuedAt: t };
      doc.stage = "rendering";
      doc.error = null;
      const update = await q("UPDATE ec_render_jobs SET status='running',lease_owner=?,lease_until=?,attempts=attempts+1,doc=?,updated_at=? WHERE id=? AND ((status='pending' AND lease_until<=?) OR (status='running' AND lease_until<?))", [owner, leaseUntil, JSON.stringify(doc), t, row.id, t, t]);
      if (Number(update.affectedRows) !== 1) continue;
      await touchWorker(workerId, version, row.id);
      return {
        ok: true,
        job: { id: row.id, runId: Number(row.run_id), manifest, parts: safeParts(doc.parts) },
        lease: { id: leaseId, expiresAt: leaseUntil, attempt: Number(row.attempts || 0) + 1 },
      };
    }
    return { ok: true, job: null };
  }

  async function renew(jobId: string, workerId: string, leaseId: string) {
    await ensure();
    limit("renew", 180, 15 * 60_000);
    const current = await leased(jobId, workerId, leaseId);
    const leaseUntil = now() + LEASE_MS;
    const update = await q("UPDATE ec_render_jobs SET lease_until=?,updated_at=? WHERE id=? AND status='running' AND lease_owner=? AND lease_until>?", [leaseUntil, now(), jobId, current.key, now()]);
    if (Number(update.affectedRows) !== 1) throw new RenderWorkerBridgeError(409, "Render lease is no longer active.");
    await touchWorker(workerId, undefined, jobId);
    return { ok: true, leaseUntil };
  }

  async function progress(jobId: string, workerId: string, leaseId: string, input: any) {
    await ensure();
    // A legitimate final render reports every one of its 77 QC sheets and
    // artifacts. Scope this high-volume callback to the leased job so a
    // completed reel cannot exhaust the next reel's allowance, while keeping
    // the same per-job flood protection.
    limit(`progress:${jobId}`, 180, 15 * 60_000);
    const current = await leased(jobId, workerId, leaseId);
    const stage = SAFE_STAGES.has(String(input?.stage || "")) ? String(input.stage) : "rendering";
    const metadata = safeProgressMetadata(input?.parts);
    current.doc.parts = { ...(current.doc.parts || {}), ...Object.fromEntries(Object.entries(metadata).filter(([, v]) => v !== undefined && v !== null)) };
    current.doc.metrics = safeMetrics(input?.metrics);
    current.doc.stage = stage;
    const update = await q("UPDATE ec_render_jobs SET doc=?,updated_at=? WHERE id=? AND status='running' AND lease_owner=? AND lease_until>?", [JSON.stringify(current.doc), now(), jobId, current.key, now()]);
    if (Number(update.affectedRows) !== 1) throw new RenderWorkerBridgeError(409, "Render lease is no longer active.");
    await touchWorker(workerId, undefined, jobId);
    return { ok: true };
  }

  async function commitArtifact(jobId: string, workerId: string, leaseId: string, input: any) {
    await ensure();
    const kind = String(input?.kind || "");
    const rule = artifactRule(kind, input?.index);
    const url = assetUrl(input?.url);
    const sha256 = /^[a-f0-9]{64}$/i.test(String(input?.sha256 || "")) ? String(input.sha256).toLowerCase() : null;
    const bytes = Number(input?.bytes);
    if (!url || !sha256 || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > rule.maxBytes || input?.mime !== rule.type) {
      throw new RenderWorkerBridgeError(400, "Artifact metadata is invalid.");
    }
    const current = await leased(jobId, workerId, leaseId);
    current.doc.parts = current.doc.parts || {};
    current.doc.artifacts = current.doc.artifacts || {};
    const record = { url, sha256, bytes, mime: rule.type, storedAt: now() };
    if (kind === "qc") {
      current.doc.evidence = current.doc.evidence || {};
      current.doc.evidence[String(rule.index)] = { ...record, label: qcLabel(rule.index) };
    } else {
      current.doc.parts[kind] = url;
      current.doc.artifacts[kind] = record;
    }
    current.doc.stage = kind === "final" ? "final visual evidence" : "uploading artifacts";
    const update = await q("UPDATE ec_render_jobs SET doc=?,updated_at=? WHERE id=? AND status='running' AND lease_owner=? AND lease_until>?", [JSON.stringify(current.doc), now(), jobId, current.key, now()]);
    if (Number(update.affectedRows) !== 1) throw new RenderWorkerBridgeError(409, "Render lease is no longer active.");
    return { ok: true, artifact: kind === "qc" ? { kind, index: rule.index, url } : { kind, url } };
  }

  async function complete(jobId: string, workerId: string, leaseId: string, input: any) {
    await ensure();
    limit("complete", 30, 15 * 60_000);
    const current = await leased(jobId, workerId, leaseId);
    const final = input?.final && typeof input.final === "object" ? input.final : {};
    const uploaded = current.doc.artifacts?.final;
    const evidence = current.doc.evidence || {};
    if (!uploaded || !current.doc.parts?.final || !/^[a-f0-9]{64}$/i.test(String(final.sha256 || "")) || !timingSafeEqual(uploaded.sha256, String(final.sha256).toLowerCase())) {
      throw new RenderWorkerBridgeError(400, "The uploaded final MP4 is missing or does not match its declared SHA-256.");
    }
    const qcFrames = Array.from({ length: MAX_QC_FRAMES }, (_, index) => evidence[String(index + 1)]).filter(Boolean);
    if (qcFrames.length !== MAX_QC_FRAMES) throw new RenderWorkerBridgeError(400, "All 75 narrative QC sheets and 2 outro frames are required before completion.");
    const seconds = Number(final.seconds);
    const manifest = safeManifest(current.doc.manifest);
    if (!Number.isFinite(seconds) || Math.abs(seconds - 23) > 0.05 || final.mode !== "cuts" || Number(final.narrationTargetSeconds) !== manifest.narrationTargetSeconds || Number(final.narrationSceneSeconds) !== manifest.narrationSceneSeconds) {
      throw new RenderWorkerBridgeError(400, "Final render does not meet the locked 23-second ELEVAY output contract.");
    }
    const rawVoiceSeconds = Array.isArray(final.rawVoiceSeconds) ? final.rawVoiceSeconds.slice(0, 4).map(Number) : [];
    if (rawVoiceSeconds.length !== 4 || rawVoiceSeconds.some((n) => !Number.isFinite(n) || n <= 0.2 || n > 12)) throw new RenderWorkerBridgeError(400, "Final render voice timing metadata is invalid.");
    const cleanFinal = {
      url: current.doc.parts.final,
      seconds,
      sha256: uploaded.sha256,
      music: final.music === true,
      musicDropped: final.musicDropped ? cleanError(final.musicDropped).slice(0, 240) : null,
      mode: "cuts",
      narrationTargetSeconds: manifest.narrationTargetSeconds,
      narrationSceneSeconds: manifest.narrationSceneSeconds,
      spokenNarrationSeconds: manifest.narrationTargetSeconds,
      rawVoiceSeconds,
      peakRssBytes: safeMetrics(final.metrics || final).peakRssBytes,
      peakFfmpegRssBytes: safeMetrics(final.metrics || final).peakFfmpegRssBytes,
      metrics: safeMetrics(final.metrics || final),
      qcFrames: qcFrames.map(({ url, label }) => ({ url, label })),
    };
    current.doc.final = cleanFinal;
    current.doc.metrics = cleanFinal.metrics;
    current.doc.stage = "done";
    current.doc.completedAt = now();
    delete current.doc.lease;
    const update = await q("UPDATE ec_render_jobs SET status='done',doc=?,updated_at=?,lease_until=0,lease_owner=NULL WHERE id=? AND status='running' AND lease_owner=? AND lease_until>?", [JSON.stringify(current.doc), now(), jobId, current.key, now()]);
    if (Number(update.affectedRows) !== 1) throw new RenderWorkerBridgeError(409, "Render lease is no longer active.");
    await clearWorkerJob(workerId);
    return { ok: true, final: { seconds, sha256: uploaded.sha256 } };
  }

  async function fail(jobId: string, workerId: string, leaseId: string, input: any) {
    await ensure();
    limit("fail", 30, 15 * 60_000);
    const current = await leased(jobId, workerId, leaseId);
    const error = cleanError(input?.error);
    const stage = SAFE_STAGES.has(String(input?.stage || "")) ? String(input.stage) : String(current.doc.stage || "rendering").slice(0, 80);
    current.doc.error = error;
    current.doc.stage = "retry_wait";
    current.doc.lastFailure = { at: now(), stage, error };
    const attempts = Number(current.row.attempts || 0);
    // A saved voice that cannot meet the locked five-second slot is a durable
    // input problem, not a transient FFmpeg or network failure. Preserve it
    // and surface review rather than retrying it three times.
    const permanent = input?.permanent === true || /cannot be naturally timed|saved narration is .*cannot/i.test(error);
    if (!permanent && attempts <= 3) {
      const retryAt = now() + RETRY_DELAY_MS;
      current.doc.retryAt = retryAt;
      delete current.doc.lease;
      const update = await q("UPDATE ec_render_jobs SET status='pending',doc=?,updated_at=?,lease_until=?,lease_owner=NULL WHERE id=? AND status='running' AND lease_owner=?", [JSON.stringify(current.doc), now(), retryAt, jobId, current.key]);
      if (Number(update.affectedRows) !== 1) throw new RenderWorkerBridgeError(409, "Render lease is no longer active.");
      await clearWorkerJob(workerId);
      return { ok: true, retry: true, retryAt };
    }
    current.doc.stage = "failed";
    delete current.doc.lease;
    try { current.doc.notification = await notifyFailure({ runId: current.row.run_id, stepName: `Final edit — ${stage}`, reason: error }); }
    catch { current.doc.notification = false; }
    const update = await q("UPDATE ec_render_jobs SET status='failed',doc=?,updated_at=?,lease_until=0,lease_owner=NULL WHERE id=? AND status='running' AND lease_owner=?", [JSON.stringify(current.doc), now(), jobId, current.key]);
    if (Number(update.affectedRows) !== 1) throw new RenderWorkerBridgeError(409, "Render lease is no longer active.");
    await clearWorkerJob(workerId);
    return { ok: true, retry: false };
  }

  async function status() {
    await ensure();
    const rows = await q("SELECT status, COUNT(*) AS total FROM ec_render_jobs GROUP BY status");
    const counts = Object.fromEntries((rows || []).map((row: any) => [String(row.status), Number(row.total || 0)]));
    const workerRows = await q("SELECT id,display_name,hostname,mac_user,renderer_version,last_seen,current_job_id FROM ec_render_workers WHERE id=? LIMIT 1", [allowedWorkerId()]).catch(() => []);
    const worker = workerRows[0] || { id: allowedWorkerId(), display_name: DEFAULT_WORKER_NAME, hostname: "Mahmouds-MacBook-Pro", mac_user: "mahmoudsaber", renderer_version: null, last_seen: 0, current_job_id: null };
    const seen = workersSeen.get(allowedWorkerId());
    const lastSeenAt = Number(worker.last_seen || 0) || Number(seen?.at || 0);
    const rendererVersion = worker.renderer_version === null || worker.renderer_version === undefined ? (seen?.rendererVersion ?? null) : Number(worker.renderer_version);
    const online = lastSeenAt > 0 && now() - lastSeenAt <= WORKER_ONLINE_MS;
    const currentJob = worker.current_job_id ? String(worker.current_job_id) : null;
    return {
      ok: true, service: "elevay-render-worker-bridge", protocol: 1, leaseSeconds: LEASE_MS / 1000, retryDelaySeconds: RETRY_DELAY_MS / 1000,
      queue: { pending: counts.pending || 0, running: counts.running || 0, retrying: counts.retry_wait || 0, failed: counts.failed || 0, done: counts.done || 0 },
      requiredRendererVersion: requiredRenderer(),
      workers: [{ id: allowedWorkerId(), name: DEFAULT_WORKER_NAME, hostname: String(worker.hostname || "Mahmouds-MacBook-Pro"), macUser: String(worker.mac_user || "mahmoudsaber"), online, lastSeen: lastSeenAt ? new Date(lastSeenAt).toISOString() : null, rendererVersion, outdated: rendererVersion === null || rendererVersion < requiredRenderer(), currentJob }],
    };
  }

  async function checkOfflineWaiting() {
    await ensure();
    const pendingRows = await q("SELECT COUNT(*) AS total FROM ec_render_jobs WHERE status IN ('pending','running')");
    const pending = Number(pendingRows[0]?.total || 0);
    const workers = await q("SELECT id,last_seen,offline_alert_at,updated_at FROM ec_render_workers WHERE id=? LIMIT 1", [allowedWorkerId()]).catch(() => []);
    const worker = workers[0] || { id: allowedWorkerId(), last_seen: 0, offline_alert_at: 0, updated_at: now() };
    const lastSeenAt = Number(worker.last_seen || 0);
    const offlineSince = lastSeenAt || Number(worker.updated_at || now());
    const offline = pending > 0 && now() - offlineSince >= WORKER_OFFLINE_ALERT_MS;
    if (!offline) return { ok: true, pending, offline: false, alerted: false };
    const alertedAt = Number(worker.offline_alert_at || 0);
    if (alertedAt && now() - alertedAt < WORKER_OFFLINE_ALERT_MS) return { ok: true, pending, offline: true, alerted: false };
    const reason = `${DEFAULT_WORKER_NAME} has been offline for 30 minutes while ${pending} saved final render job${pending === 1 ? " is" : "s are"} waiting. Jobs remain safely queued; website rendering is disabled.`;
    try { await notifyFailure({ runId: "render-worker", stepName: "Mac render worker offline", reason }); } catch { /* alert retry is safe */ }
    await q("UPDATE ec_render_workers SET offline_alert_at=?,updated_at=? WHERE id=?", [now(), now(), allowedWorkerId()]).catch(() => {});
    return { ok: true, pending, offline: true, alerted: true };
  }

  async function uploadRequest(req: any, { jobId, kind }: { jobId: string, kind: string }) {
    await ensure();
    // Final QC evidence is deliberately extensive (75 sheets plus 2 outro
    // frames). Rate-limit uploads per job rather than globally so one valid
    // completed render cannot make the next leased render fail closed.
    limit(`artifact:${jobId}`, 120, 15 * 60_000);
    const workerId = header(req, "x-render-worker-id");
    const leaseId = header(req, "x-render-worker-lease");
    const expectedSha = header(req, "x-artifact-sha256").toLowerCase();
    const index = header(req, "x-artifact-index") || undefined;
    const rule = artifactRule(kind, index);
    if (!isWorkerId(workerId) || !isLeaseId(leaseId) || !/^[a-f0-9]{64}$/.test(expectedSha)) throw new RenderWorkerBridgeError(400, "Artifact request headers are invalid.");
    if (header(req, "content-type").split(";", 1)[0].trim().toLowerCase() !== rule.type) throw new RenderWorkerBridgeError(415, "Artifact media type is not allowed.");
    const declared = Number(header(req, "content-length"));
    if (Number.isFinite(declared) && (declared <= 0 || declared > rule.maxBytes)) throw new RenderWorkerBridgeError(413, "Artifact exceeds its size limit.");
    await leased(jobId, workerId, leaseId);
    const uploadKey = `${jobId}:${kind}:${index || ""}`;
    if (activeUploads.has(uploadKey)) throw new RenderWorkerBridgeError(409, "An artifact upload is already in progress.");
    activeUploads.add(uploadKey);
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "elevay-render-upload-"));
    const file = path.join(dir, `artifact.${rule.extension}`);
    try {
      let bytes = 0;
      await pipeline(req, new Transform({ transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        callback(bytes > rule.maxBytes ? new RenderWorkerBridgeError(413, "Artifact exceeds its size limit.") : null, chunk);
      } }), fs.createWriteStream(file, { flags: "wx" }));
      if (bytes <= 0) throw new RenderWorkerBridgeError(400, "Artifact is empty.");
      const sha256 = await sha256File(file);
      if (!timingSafeEqual(sha256, expectedSha)) throw new RenderWorkerBridgeError(400, "Artifact SHA-256 does not match the declared value.");
      await verifyArtifactSignature(file, rule.type);
      const suffix = kind === "qc" ? `qc-${rule.index}` : kind;
      const key = `marketing/command-center/render-worker/${jobId}/${sha256.slice(0, 24)}-${suffix}.${rule.extension}`;
      const stored = await putFile(key, file, rule.type);
      return await commitArtifact(jobId, workerId, leaseId, { kind, index: rule.index, url: stored.url, sha256, bytes, mime: rule.type });
    } finally {
      activeUploads.delete(uploadKey);
      await fsp.rm(dir, { recursive: true, force: true });
    }
  }

  return { authenticate, ensure, lease, renew, progress, commitArtifact, complete, fail, status, checkOfflineWaiting, uploadRequest };
}

let uploadBridgePromise: Promise<any> | null = null;
async function uploadBridge() {
  if (!uploadBridgePromise) {
    uploadBridgePromise = (async () => {
      if (!process.env.DATABASE_URL) throw new Error("Render bridge is unavailable.");
      const pool = mysql.createPool(process.env.DATABASE_URL);
      return createRenderWorkerBridge({ q: async (sql: string, args: unknown[] = []) => (await pool.query(sql, args))[0] });
    })().catch((error) => { uploadBridgePromise = null; throw error; });
  }
  return uploadBridgePromise;
}

/** Must be registered before express.json() so an MP4 is never buffered by the website process. */
export function registerRenderWorkerUploadRoute(app: any) {
  app.post("/admin/api/render-worker/jobs/:jobId/artifacts/:kind", async (req: any, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const bridge = await uploadBridge();
      if (!bridge.authenticate(header(req, "authorization"))) return res.status(401).json({ ok: false, error: "Worker token missing or invalid." });
      const result = await bridge.uploadRequest(req, { jobId: String(req.params.jobId || ""), kind: String(req.params.kind || "") });
      return res.status(200).json(result);
    } catch (error) {
      const status = error instanceof RenderWorkerBridgeError ? error.status : 500;
      const message = error instanceof RenderWorkerBridgeError ? error.message : "Artifact upload failed.";
      return res.status(status).json({ ok: false, error: message });
    }
  });
}
