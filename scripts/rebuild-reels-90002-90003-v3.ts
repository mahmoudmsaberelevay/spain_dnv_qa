// @ts-nocheck
/**
 * Owner-authorized finite rebuild for the current weekly-plan reels formerly produced by
 * AI Studio runs #90002 and #90003. It creates fresh v2 revisions, retains every prior
 * item version, never publishes to Meta, and stops safely at final edit if the fixed
 * ELEVAYEXTRO.mov has not yet been supplied through ELEVAY_FIXED_OUTRO_URL.
 */
import mysql from "mysql2/promise";
import fsp from "node:fs/promises";
import path from "node:path";
import { createOrchestrator, makeProviders } from "../server/commandCenter/ai";
import { createRenderQueue } from "../server/commandCenter/renderQueue";
import { notifyAiFailure } from "../server/commandCenter/alerts";
import E from "../server/commandCenter/engine";
import R from "../server/commandCenter/rules";

const root = "/home/ubuntu/elevay-two-reels-v3";
const manifestFile = path.join(root, "manifest.json");
const allowed = new Set(["2026-W41-04", "2026-W41-07"]);
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
      jobs: (await q("SELECT doc FROM ec_jobs WHERE id LIKE 'REV-TWO-REELS-V3-%'")).map((row) => JSON.parse(row.doc)),
      audit: [],
    },
  };
}

async function mutate(_ctx, fn) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const rows = (await connection.query("SELECT item_id,doc FROM ec_items WHERE item_id IN ('2026-W41-04','2026-W41-07') FOR UPDATE"))[0];
    const meta = (await connection.query("SELECT doc FROM ec_meta WHERE id=1"))[0][0];
    const jobs = (await connection.query("SELECT doc FROM ec_jobs WHERE id LIKE 'REV-TWO-REELS-V3-%' FOR UPDATE"))[0].map((row) => JSON.parse(row.doc));
    const state = { ...E.emptyState(), ...JSON.parse(meta.doc), items: rows.map((row) => JSON.parse(row.doc)), jobs, audit: [] };
    const before = new Map(state.items.map((item) => [item.item_id, JSON.stringify(item)]));
    const result = await fn(state);
    if (result?.ok === false) { await connection.rollback(); return result; }
    if (state.jobs.some((job) => job.type !== "revise_item" || !allowed.has(job.payload?.item_id) || job.payload?.owner_authorized !== true)) throw new Error("Finite reel rebuild forbids publishing, scheduling, or unrelated job dispatch.");
    for (const item of state.items) {
      if (before.get(item.item_id) === JSON.stringify(item)) continue;
      if (!allowed.has(item.item_id)) throw new Error("Attempted unrelated item mutation.");
      if (item.revision_status === "owner_approved" && !["published", "scheduled"].includes(item.status)) {
        item.status = "revision_approved";
        item.publish = { ...item.publish, revision_hold: { active: true, version: item.version, set_at: new Date().toISOString(), set_by: owner.email, reason: "Owner-authorized fresh rebuild; final content remains on a Meta publication hold." } };
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
  } finally { connection.release(); }
}

const queue = createRenderQueue(q);
const providers = makeProviders(fetch, queue);
const orchestrator = createOrchestrator({ q, loadState, mutate, providers, E, R, allowSandboxRuns: true, notifyFailure: notifyAiFailure, liveReport: async () => { throw new Error("No Meta or CRM reporting in this finite rebuild."); } });

function freshRequest(item) {
  return `Create a completely new reel version from the existing weekly plan item. Program: ${item.program}. Topic: ${item.topic}. Keep the existing objective and Cairo schedule, but do not reuse prior storyboard, keyframe, Higgsfield clip, or voice take. Workflow: (1) OpenAI writes the four-scene storyboard, one Modern Standard Arabic caption plus a professional English caption, four Egyptian Arabic scene scripts, and final edit direction; (2) OpenAI creates four 9:16 keyframes; (3) Higgsfield makes four 5-second clips; (4) the ELEVAY CRM Arabic voice-over service creates one approved ELEVAY voice-clone take per scene; (5) the disk-based sandbox worker combines them only with ELEVAYEXTRO.mov; (6) Claude checks the final output before the weekly plan can be replaced.

Every visual person is an Arab/Middle Eastern prospective client, never ELEVAY staff, in realistic modern elegant Western clothing, uncovered hair, no traditional accessories, appropriate polished footwear and natural hands/anatomy. No on-screen text, passports, flags, contact details, guarantees, 'تأشيرة', or generated logos. Each motion prompt is 2–4 detailed sentences with a single restrained action, coherent setting, wardrobe, camera and lighting continuity. Each spoken line is exactly 7–10 natural Egyptian Arabic words, includes a natural Egyptian marker, fits under 4.85 seconds, and uses English only for the country name and ELEVAY. The caption remains Modern Standard Arabic plus professional English. Do not publish, schedule, spend, or change any Meta asset. Existing Cairo schedule: ${JSON.stringify(item.publish)}.`;
}

async function main() {
  await fsp.mkdir(root, { recursive: true });
  await queue.ensure();
  let manifest;
  try { manifest = JSON.parse(await fsp.readFile(manifestFile, "utf8")); }
  catch { manifest = { createdAt: new Date().toISOString(), sourceRuns: [90002, 90003], pipeline: "openai-plan-captions-egyptian-script-higgsfield-elevay-crm-voice-fixed-outro-claude", items: [] }; }

  for (const itemId of allowed) {
    let entry = manifest.items.find((item) => item.itemId === itemId);
    if (!entry) {
      const item = JSON.parse((await q("SELECT doc FROM ec_items WHERE item_id=?", [itemId]))[0].doc);
      // ec_jobs.id is intentionally compact; keep the owner revision identifier below its column limit.
      const jobId = `R3-${itemId.slice(-2)}-${Date.now().toString(36)}`;
      const job = { id: jobId, type: "revise_item", status: "in_progress", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: owner.email, payload: { item_id: itemId, base_version: item.version, from_version: item.version, scope: "whole_concept", owner_authorized: true, comment: "Owner requested a complete fresh version from plan, bilingual caption and Egyptian Arabic ELEVAY CRM voice-over through final Claude review. Prior versions retained; Meta hold stays active." }, manus: { task_id: null, push_attempted: true }, history: [], result: null };
      await q("INSERT INTO ec_jobs (id,created_at,doc) VALUES (?,?,?)", [jobId, job.created_at, JSON.stringify(job)]);
      const run = await orchestrator.create({ kind: "reel", request: freshRequest(item), options: { sandboxOnly: true, week: itemId.slice(0, 8), program: item.program, datetime_cairo: item.publish?.datetime_cairo || "", revision: { itemId, baseVersion: item.version, scope: "whole_concept", request: job.payload.comment, jobId, authorizedBy: owner.email } }, user: owner });
      entry = { itemId, runId: run.id, baseVersion: item.version, newVersion: item.version + 1, jobId };
      manifest.items.push(entry);
      await fsp.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
      console.log(`Created fresh replacement run #${run.id} for ${itemId} version ${entry.newVersion}.`);
    }

    const started = Date.now();
    while (Date.now() - started < 5_400_000) {
      const run = await orchestrator.get(entry.runId);
      const step = run.steps.find((candidate) => !["done", "skipped"].includes(candidate.status));
      entry.status = run.status; entry.step = step?.action || "finished";
      entry.generated = { keyframes: run.artifacts.keyframes?.filter(Boolean).length || 0, clips: run.artifacts.clips?.filter(Boolean).length || 0, voices: run.artifacts.voices?.filter(Boolean).length || 0 };
      console.log(`${itemId} · run #${run.id} · ${run.status} · ${entry.step} · ${JSON.stringify(entry.generated)} · elapsed ${Math.round((Date.now() - started) / 1000)}s`);
      if (step?.action === "compose_reel" && run.artifacts?.render?.stage === "waiting_for_fixed_outro") {
        entry.waitingFor = "ELEVAYEXTRO.mov"; entry.error = run.artifacts?.render?.waitReason || "Waiting for fixed outro.";
        await fsp.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
        break;
      }
      if (["done", "failed", "needs_review", "cancelled"].includes(run.status)) {
        entry.final = run.artifacts.final ? { url: run.artifacts.final.url, seconds: run.artifacts.final.seconds, peakRssBytes: run.artifacts.final.peakRssBytes, peakFfmpegRssBytes: run.artifacts.final.peakFfmpegRssBytes } : null;
        entry.review = run.artifacts.final_qc || null;
        entry.error = step?.error || null;
        await fsp.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
        break;
      }
      if (!["running", "sandbox_running"].includes(run.status)) await orchestrator.resume(run.id);
      await fsp.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
      await sleep(15_000);
    }
  }
  console.log(JSON.stringify(manifest.items.map((item) => ({ itemId: item.itemId, runId: item.runId, status: item.status, step: item.step, generated: item.generated, waitingFor: item.waitingFor, error: item.error })), null, 2));
}

main().catch((error) => { console.error(`Finite two-reel rebuild stopped: ${clean(error)}`); process.exitCode = 1; }).finally(() => pool.end());
