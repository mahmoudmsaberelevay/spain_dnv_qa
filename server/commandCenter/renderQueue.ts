import crypto from "node:crypto";

/** The web process only persists jobs. Rendering is deliberately external. */
export function createRenderQueue(q: (sql: string, args?: unknown[]) => Promise<any>, opts: { pendingReason?: () => string, fixedOutroUrl?: string } = {}) {
  let ready: Promise<any> | undefined;
  const ensure = () => ready ??= q(`CREATE TABLE IF NOT EXISTS ec_render_jobs (
    id VARCHAR(64) PRIMARY KEY, run_id INT NOT NULL, status VARCHAR(24) NOT NULL,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, lease_until BIGINT NOT NULL DEFAULT 0,
    lease_owner VARCHAR(64), attempts INT NOT NULL DEFAULT 0, doc LONGTEXT NOT NULL,
    INDEX ec_render_status (status, created_at))`);
  async function compose(input: any) {
    await ensure();
    if (!Number.isInteger(input.runId) || input.runId < 1) throw new Error("A persisted run ID is required for rendering.");
    for (const [label, urls] of [["clips", input.clipUrls], ["voices", input.voiceUrls]] as const) {
      if (!Array.isArray(urls) || urls.length !== 4 || urls.some((u: unknown) => typeof u !== "string" || !/^https:\/\//.test(u))) throw new Error(`Four saved HTTPS ${label} are required; nothing will be regenerated.`);
    }
    const outroUrl = String(opts.fixedOutroUrl || process.env.ELEVAY_FIXED_OUTRO_URL || "").trim();
    if (!outroUrl) return { pending: true, jobId: null, parts: input.parts || {}, stage: "waiting_for_fixed_outro", waitReason: "Waiting for the required fixed ELEVAYEXTRO.mov; no fallback outro will be created.", metrics: {} };
    if (!/^https:\/\//.test(outroUrl)) throw new Error("ELEVAY_FIXED_OUTRO_URL must be a public HTTPS stored ELEVAYEXTRO.mov URL.");
    const narrationTargetSeconds = Number(input.narrationTargetSeconds);
    const narrationSceneSeconds = Number(input.narrationSceneSeconds);
    const legacyNarration = narrationTargetSeconds === 18 && narrationSceneSeconds === 4.5;
    const currentNarration = narrationTargetSeconds === 20 && narrationSceneSeconds === 5;
    if (!legacyNarration && !currentNarration) {
      throw new Error("ELEVAY reels require four saved voice takes using either the legacy 18-second/4.5-second contract or the current 20-second/5-second contract.");
    }
    const manifest = { version: currentNarration ? "disk-concat-v4-20s-narration-fixed-elevayoutro" : "disk-concat-v3-18s-narration-fixed-elevayoutro", runId: input.runId, clipUrls: input.clipUrls, voiceUrls: input.voiceUrls, musicUrl: input.musicUrl || null, outroUrl, editDirection: typeof input.editDirection === "string" ? input.editDirection.slice(0, 600) : null, threads: 1, width: 1080, height: 1920, fps: 30, sceneSeconds: 5, outroSeconds: 3, narrationTargetSeconds, narrationSceneSeconds };
    const id = "reel-" + crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex").slice(0, 40);
    const now = Date.now();
    const reusable = input.parts?._version === manifest.version ? Object.fromEntries(Object.entries(input.parts).filter(([k]) => ["seg0", "seg1", "seg2", "seg3", "outro", "audio", "music", "musicDropped", "narrationTargetSeconds", "narrationSceneSeconds", "rawVoiceSeconds", "appliedVoiceTempos", "voicePaddingSeconds"].includes(k))) : {};
    const doc = JSON.stringify({ manifest, parts: { ...reusable, _version: manifest.version }, stage: "queued", waitReason: "Waiting for render worker", metrics: {} });
    await q("INSERT IGNORE INTO ec_render_jobs (id,run_id,status,created_at,updated_at,doc) VALUES (?,?,'pending',?,?,?)", [id, input.runId, now, now, doc]);
    const row = (await q("SELECT id,status,doc FROM ec_render_jobs WHERE id=?", [id]))[0];
    if (!row) throw new Error("Render job could not be persisted.");
    const job = JSON.parse(row.doc);
    // A Retry (step restarted) sends a failed job back to the Mac with the same saved inputs: the renderer may have
    // been updated since (e.g. new timing rules). Plain status polling never re-queues, so a failure can't loop.
    if (row.status === "failed" && input.requeueFailed) {
      const fresh = JSON.stringify({ ...JSON.parse(doc), retriedAfter: String(job.error || "").slice(0, 300), retriedAt: new Date(now).toISOString() });
      await q("UPDATE ec_render_jobs SET status='pending', lease_owner=NULL, lease_until=0, attempts=0, updated_at=?, doc=? WHERE id=? AND status='failed'", [now, fresh, id]);
      return { pending: true, jobId: id, parts: JSON.parse(fresh).parts || {}, stage: "queued", waitReason: "Waiting for render worker (retry of a failed render)", metrics: {} };
    }
    if (row.status === "failed") throw new Error("External render failed: " + (job.error || "unknown worker error"));
    if (row.status === "done" && job.final) return { parts: job.parts, final: { ...job.final, renderJobId: id }, stage: "final" };
    // A finished job without a usable result, or a status this website does not know, must not wait forever.
    if (row.status === "done") throw new Error("External render finished without a usable final video; press Retry to render it again.");
    if (!["pending", "running"].includes(row.status)) throw new Error(`External render is in an unexpected state (${row.status}); press Retry.`);
    return { pending: true, jobId: id, parts: job.parts || {}, stage: job.stage, waitReason: row.status === "running" ? "Rendering the final edit" : (opts.pendingReason?.() || "Waiting for render worker"), metrics: job.metrics || {} };
  }
  return { ensure, compose };
}
