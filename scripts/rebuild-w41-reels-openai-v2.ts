// @ts-nocheck
/**
 * Explicit owner-authorized finite W41 rebuild.
 * Generates fresh OpenAI-directed reel versions for the three current W41 reel items,
 * keeps every old item snapshot, performs sandbox-only single-thread final edits, and
 * never schedules, publishes, spends, or dispatches Meta work.
 */
import mysql from "mysql2/promise";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createOrchestrator, makeProviders } from "../server/commandCenter/ai";
import { createRenderQueue } from "../server/commandCenter/renderQueue";
import { notifyAiFailure } from "../server/commandCenter/alerts";
import E from "../server/commandCenter/engine";
import R from "../server/commandCenter/rules";

const root = "/home/ubuntu/elevay-w41-rebuild-openai-v2";
const manifestFile = path.join(root, "manifest.json");
const allowed = new Set(["2026-W41-02", "2026-W41-04", "2026-W41-07"]);
const owner = { email: "mahmoud.saber@elevay.com", role: "owner" };
const pool = mysql.createPool(process.env.DATABASE_URL);
const q = async (sql, args = []) => (await pool.query(sql, args))[0];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (error) => String(error?.message || error).replace(/https?:\/\/\S+/g, "[asset]").slice(0, 600);

async function loadState() {
  const meta = (await q("SELECT doc FROM ec_meta WHERE id=1"))[0];
  return {
    state: {
      ...E.emptyState(),
      ...JSON.parse(meta.doc),
      items: (await q("SELECT doc FROM ec_items")).map((row) => JSON.parse(row.doc)),
      jobs: (await q("SELECT doc FROM ec_jobs WHERE id LIKE 'REV-W41-OPENAI-V2-%'")).map((row) => JSON.parse(row.doc)),
      audit: [],
    },
  };
}

async function mutate(_ctx, fn) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const rows = (await connection.query("SELECT item_id,doc FROM ec_items WHERE item_id LIKE '2026-W41-%' FOR UPDATE"))[0];
    const meta = (await connection.query("SELECT doc FROM ec_meta WHERE id=1"))[0][0];
    const jobs = (await connection.query("SELECT doc FROM ec_jobs WHERE id LIKE 'REV-W41-OPENAI-V2-%' FOR UPDATE"))[0].map((row) => JSON.parse(row.doc));
    const state = { ...E.emptyState(), ...JSON.parse(meta.doc), items: rows.map((row) => JSON.parse(row.doc)), jobs, audit: [] };
    const before = new Map(state.items.map((item) => [item.item_id, JSON.stringify(item)]));
    const result = await fn(state);
    if (result?.ok === false) { await connection.rollback(); return result; }
    if (state.jobs.some((job) => job.type !== "revise_item" || !allowed.has(job.payload?.item_id) || job.payload?.owner_authorized !== true)) throw new Error("Finite W41 rebuild forbids publishing, scheduling, or unrelated job dispatch.");
    for (const item of state.items) {
      if (before.get(item.item_id) === JSON.stringify(item)) continue;
      if (!allowed.has(item.item_id)) throw new Error("Attempted unrelated item mutation.");
      if (item.revision_status === "owner_approved" && !["published", "scheduled"].includes(item.status)) {
        item.status = "revision_approved";
        item.publish = { ...item.publish, revision_hold: { active: true, version: item.version, set_at: new Date().toISOString(), set_by: owner.email, reason: "Owner-authorized OpenAI/Higgsfield/ELEVAY rebuild; no Meta publication authorized." } };
      }
      await connection.query("UPDATE ec_items SET doc=?,updated_at=? WHERE item_id=?", [JSON.stringify(item), new Date().toISOString(), item.item_id]);
    }
    for (const audit of state.audit) await connection.query("INSERT INTO ec_audit (at,doc) VALUES (?,?)", [audit.at, JSON.stringify(audit)]);
    for (const job of state.jobs) await connection.query("UPDATE ec_jobs SET doc=? WHERE id=?", [JSON.stringify(job), job.id]);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const queue = createRenderQueue(q);
const providers = makeProviders(fetch, queue);
const rawCompose = providers.composeReelStep;
providers.composeReelStep = (input) => rawCompose({ ...input, musicUrl: null });
const orchestrator = createOrchestrator({ q, loadState, mutate, providers, E, R, allowSandboxRuns: true, notifyFailure: notifyAiFailure, liveReport: async () => { throw new Error("No Meta or CRM reporting in W41 rebuild."); } });

async function renderOnce(runId) {
  const env = { ...process.env, ELEVAY_REEL_THREADS: "1", ELEVAY_RENDER_WORK_DIR: path.join(root, "renders"), OMP_NUM_THREADS: "1" };
  await new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "tsx", "scripts/elevay-render-worker.ts", "--once", `--runs=${runId}`], { cwd: "/home/ubuntu/spain_dnv_qa", env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (data) => process.stdout.write(data));
    child.stderr.on("data", (data) => process.stdout.write(data));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(undefined) : reject(new Error(`Finite render worker failed with exit ${code}.`)));
  });
}

function freshRequest(item) {
  return `Rebuild this W41 reel completely FROM SCRATCH as a new version. Topic: ${item.topic}. Program: ${item.program}. Preserve its topic, objective and scheduled Cairo posting time, but create a fresh, distinct production using this exact order: (1) OpenAI writes the four-scene storyboard, a 100–150 word Modern Standard Arabic caption, natural Egyptian Arabic scene narration, and a constrained final-edit direction; (2) OpenAI creates 4 vertical 9:16 keyframes; (3) Higgsfield animates 4 x 5-second clips; (4) the ELEVAY voice clone reads one scene take each; (5) the external disk-based renderer joins the clips, narration and 3-second official white-logo outro; (6) Claude performs the only final review. All people Arab/Middle Eastern in modern elegant Western attire, hair uncovered, no headscarves or traditional accessories, polished appropriate leather footwear. Each motion prompt must be two to four sentences with one restrained action and coherent identity/wardrobe inside its five-second scene. Every narration line must be 7–10 words, use a natural Egyptian marker, fit below 4.85 seconds without rushing, use English only for country names and ELEVAY, and Arabic for everything else. No text in footage, no passports, contacts, flags, visa wording or guarantees. Do not reuse any previous storyboard, keyframe, clip, or voice take. Existing schedule: ${JSON.stringify(item.publish)}.`;
}

async function main() {
  await fsp.mkdir(root, { recursive: true });
  await queue.ensure();
  let manifest;
  try { manifest = JSON.parse(await fsp.readFile(manifestFile, "utf8")); }
  catch { manifest = { week: "2026-W41", createdAt: new Date().toISOString(), pipeline: "openai-higgsfield-elevay-voice-external-render-claude-final", items: [] }; }

  for (const itemId of allowed) {
    let entry = manifest.items.find((item) => item.itemId === itemId);
    if (!entry) {
      const item = JSON.parse((await q("SELECT doc FROM ec_items WHERE item_id=?", [itemId]))[0].doc);
      const run = await orchestrator.create({
        kind: "reel",
        request: freshRequest(item),
        options: {
          sandboxOnly: true,
          week: "2026-W41",
          program: item.program,
          datetime_cairo: item.publish?.datetime_cairo || "",
          revision: { itemId, baseVersion: item.version, scope: "whole_concept", request: "Owner requested a complete W41 reel rebuild through the OpenAI, Higgsfield, ELEVAY voice, external renderer and Claude workflow." },
        },
        user: owner,
      });
      entry = { itemId, runId: run.id, baseVersion: item.version, newVersion: item.version + 1 };
      manifest.items.push(entry);
      await fsp.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
      console.log(`Created W41 replacement run #${run.id} for ${itemId} version ${entry.newVersion}.`);
    }

    const jobId = `REV-W41-OPENAI-V2-${itemId.slice(-2)}-${entry.runId}`;
    const job = { id: jobId, type: "revise_item", status: "in_progress", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: owner.email, payload: { item_id: itemId, base_version: entry.baseVersion, from_version: entry.baseVersion, scope: "whole_concept", owner_authorized: true, run_id: String(entry.runId), comment: "Owner requested a complete fresh W41 reel version; retain prior versions and block Meta publication." }, manus: { task_id: null, push_attempted: true }, history: [], result: null };
    await q("INSERT IGNORE INTO ec_jobs (id,created_at,doc) VALUES (?,?,?)", [jobId, job.created_at, JSON.stringify(job)]);
    const existing = await orchestrator.get(entry.runId);
    if (existing.status === "failed") await orchestrator.retry(existing.id, owner);

    const started = Date.now();
    let lastRender = 0;
    while (Date.now() - started < 5_400_000) {
      const run = await orchestrator.get(entry.runId);
      entry.status = run.status;
      entry.step = run.steps.find((step) => !["done", "skipped"].includes(step.status))?.action || "finished";
      console.log(`${itemId} · run #${run.id} · ${run.status} · ${entry.step} · elapsed ${Math.round((Date.now() - started) / 1000)}s`);
      if (["done", "failed", "needs_review", "cancelled"].includes(run.status)) {
        entry.final = run.artifacts.final ? { url: run.artifacts.final.url, seconds: run.artifacts.final.seconds, peakRssBytes: run.artifacts.final.peakRssBytes, peakFfmpegRssBytes: run.artifacts.final.peakFfmpegRssBytes, renderJobId: run.artifacts.final.renderJobId } : null;
        entry.review = run.artifacts.final_qc || null;
        entry.error = run.steps.find((step) => ["failed", "needs_review"].includes(step.status))?.error || null;
        entry.generated = { keyframes: run.artifacts.keyframes?.length || 0, clips: run.artifacts.clips?.length || 0, voices: run.artifacts.voices?.length || 0, repairRounds: run.artifacts.repair_rounds || 0 };
        break;
      }
      const step = run.steps.find((candidate) => !["done", "skipped"].includes(candidate.status));
      if (step?.action === "compose_reel" && step.status === "waiting" && Date.now() - lastRender > 10_000) { await renderOnce(run.id); lastRender = Date.now(); }
      if (!["running", "sandbox_running"].includes(run.status)) await orchestrator.resume(run.id);
      await fsp.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
      await sleep(15_000);
    }
    await fsp.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  }
  console.log("W41 OpenAI rebuild finished.");
  console.log(JSON.stringify(manifest.items.map((item) => ({ itemId: item.itemId, runId: item.runId, status: item.status, step: item.step, error: item.error, peakRssBytes: item.final?.peakRssBytes })), null, 2));
}

main().catch((error) => { console.error(`W41 OpenAI rebuild stopped: ${clean(error)}`); process.exitCode = 1; }).finally(() => pool.end());
