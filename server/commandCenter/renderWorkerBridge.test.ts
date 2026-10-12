// @ts-nocheck
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { createRenderWorkerBridge, RenderWorkerBridgeError } from "./renderWorkerBridge";

const manifest = {
  version: "disk-concat-v3-18s-narration-fixed-elevayoutro",
  runId: 90007,
  clipUrls: [1, 2, 3, 4].map((n) => `https://assets.example/clip-${n}.mp4`),
  voiceUrls: [1, 2, 3, 4].map((n) => `https://assets.example/voice-${n}.mp3`),
  outroUrl: "https://assets.example/ELEVAYEXTRO.mov",
  narrationTargetSeconds: 18,
  narrationSceneSeconds: 4.5,
  ignoredServerCredential: "must-never-leave-the-server",
};

function harness(start = 1_000_000) {
  let clock = start;
  const rows = new Map<string, any>();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const q = async (sql: string, args: any[] = []) => {
    if (sql.startsWith("CREATE TABLE")) return [];
    if (sql.startsWith("SELECT * FROM ec_render_jobs WHERE ((status='pending'")) {
      const [pendingAt, runningAt] = args;
      return [...rows.values()].filter((row) => (row.status === "pending" && row.lease_until <= pendingAt) || (row.status === "running" && row.lease_until < runningAt)).sort((a, b) => a.created_at - b.created_at).slice(0, 1).map(clone);
    }
    if (sql.startsWith("SELECT id FROM ec_render_jobs WHERE status='running'")) {
      const [activeAt, workerId] = args;
      return [...rows.values()].filter((row) => {
        const lease = JSON.parse(row.doc || "{}").lease;
        return row.status === "running" && row.lease_until > activeAt && lease?.workerId === workerId;
      }).slice(0, 1).map((row) => ({ id: row.id }));
    }
    if (sql.startsWith("SELECT * FROM ec_render_jobs WHERE id=")) return rows.has(args[0]) ? [clone(rows.get(args[0]))] : [];
    if (sql.startsWith("SELECT status, COUNT(*)")) {
      const counts = new Map<string, number>();
      for (const row of rows.values()) counts.set(row.status, (counts.get(row.status) || 0) + 1);
      return [...counts.entries()].map(([status, total]) => ({ status, total }));
    }
    if (sql.startsWith("UPDATE ec_render_jobs SET status='running'")) {
      const [owner, leaseUntil, doc, updatedAt, id, pendingAt, runningAt] = args;
      const row = rows.get(id);
      if (!row || !((row.status === "pending" && row.lease_until <= pendingAt) || (row.status === "running" && row.lease_until < runningAt))) return { affectedRows: 0 };
      Object.assign(row, { status: "running", lease_owner: owner, lease_until: leaseUntil, doc, updated_at: updatedAt, attempts: row.attempts + 1 });
      return { affectedRows: 1 };
    }
    if (sql.startsWith("UPDATE ec_render_jobs SET lease_until=")) {
      const [leaseUntil, updatedAt, id, owner, activeAt] = args; const row = rows.get(id);
      if (!row || row.status !== "running" || row.lease_owner !== owner || row.lease_until <= activeAt) return { affectedRows: 0 };
      Object.assign(row, { lease_until: leaseUntil, updated_at: updatedAt }); return { affectedRows: 1 };
    }
    if (sql.startsWith("UPDATE ec_render_jobs SET status='done'")) {
      const [doc, updatedAt, id, owner, activeAt] = args; const row = rows.get(id);
      if (!row || row.status !== "running" || row.lease_owner !== owner || row.lease_until <= activeAt) return { affectedRows: 0 };
      Object.assign(row, { status: "done", doc, updated_at: updatedAt, lease_until: 0, lease_owner: null }); return { affectedRows: 1 };
    }
    if (sql.startsWith("UPDATE ec_render_jobs SET status='pending'")) {
      const [doc, updatedAt, leaseUntil, id, owner] = args; const row = rows.get(id);
      if (!row || row.status !== "running" || row.lease_owner !== owner) return { affectedRows: 0 };
      Object.assign(row, { status: "pending", doc, updated_at: updatedAt, lease_until: leaseUntil, lease_owner: null }); return { affectedRows: 1 };
    }
    if (sql.startsWith("UPDATE ec_render_jobs SET status='failed'")) {
      if (sql.includes("status IN ('pending','running')")) {
        const [doc, updatedAt, id] = args; const row = rows.get(id);
        if (!row || !["pending", "running"].includes(row.status)) return { affectedRows: 0 };
        Object.assign(row, { status: "failed", doc, updated_at: updatedAt, lease_until: 0, lease_owner: null }); return { affectedRows: 1 };
      }
      const [doc, updatedAt, id, owner] = args; const row = rows.get(id);
      if (!row || row.status !== "running" || row.lease_owner !== owner) return { affectedRows: 0 };
      Object.assign(row, { status: "failed", doc, updated_at: updatedAt, lease_until: 0, lease_owner: null }); return { affectedRows: 1 };
    }
    if (sql.startsWith("UPDATE ec_render_jobs SET doc=")) {
      const [doc, updatedAt, id, owner, activeAt] = args; const row = rows.get(id);
      if (!row || row.status !== "running" || row.lease_owner !== owner || row.lease_until <= activeAt) return { affectedRows: 0 };
      Object.assign(row, { doc, updated_at: updatedAt }); return { affectedRows: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const bridge = createRenderWorkerBridge({ q, token: "test-worker-token", now: () => clock, notifyFailure: async () => true, putFile: async (_key: string, _file: string, type: string) => ({ url: `https://storage.example/${type.replace("/", "-")}` }) });
  const enqueue = (id = "reel-bridge-security-90007", manifestOverride = {}) => rows.set(id, { id, run_id: 90007, status: "pending", created_at: clock, updated_at: clock, lease_until: 0, lease_owner: null, attempts: 0, doc: JSON.stringify({ manifest: { ...manifest, ...manifestOverride }, parts: { _version: manifest.version, privateServerOnly: "not-a-render-part" }, stage: "queued" }) });
  return { bridge, rows, enqueue, advance: (ms: number) => { clock += ms; } };
}

describe("render worker bridge", () => {
  it("accepts the configured managed worker token and rejects a different token", () => {
    const configured = process.env.ELEVAY_RENDER_WORKER_TOKEN;
    expect(configured, "ELEVAY_RENDER_WORKER_TOKEN must be set through managed secrets").toBeTruthy();
    const { bridge } = harness();
    const liveBridge = createRenderWorkerBridge({ q: async () => [], token: configured });
    expect(liveBridge.authenticate(`Bearer ${configured}`)).toBe(true);
    expect(liveBridge.authenticate("Bearer definitely-not-the-managed-token")).toBe(false);
    expect(bridge.authenticate("Bearer definitely-not-the-test-token")).toBe(false);
  });

  it("fails closed for absent or invalid worker credentials and exposes only safe health data", async () => {
    const { bridge } = harness();
    expect(bridge.authenticate("")).toBe(false);
    expect(bridge.authenticate("Bearer invalid")).toBe(false);
    expect(bridge.authenticate("Bearer test-worker-token")).toBe(true);
    await expect(bridge.status()).resolves.toMatchObject({ ok: true, service: "elevay-render-worker-bridge", protocol: 1, queue: { pending: 0, running: 0 } });
  });

  it("leases exactly one saved-input job without disclosing server-only fields", async () => {
    const { bridge, enqueue } = harness(); enqueue();
    const result = await bridge.lease("macbook-worker-01", 3);
    expect(result.job).toMatchObject({ id: "reel-bridge-security-90007", runId: 90007, manifest: { narrationTargetSeconds: 18, narrationSceneSeconds: 4.5, threads: 1 } });
    expect(result.job.manifest).not.toHaveProperty("ignoredServerCredential");
    expect(result.job.parts).not.toHaveProperty("privateServerOnly");
    expect(result.lease.id).not.toContain("test-worker-token");
  });

  it("quarantines a legacy job without a fixed outro and continues to a valid waiting job", async () => {
    const { bridge, enqueue, rows } = harness();
    enqueue("reel-legacy-invalid-90007", { outroUrl: null });
    enqueue("reel-valid-next-90007");
    const result = await bridge.lease("macbook-worker-01", 3);
    expect(result.job.id).toBe("reel-valid-next-90007");
    const invalid = rows.get("reel-legacy-invalid-90007");
    expect(invalid.status).toBe("failed");
    expect(JSON.parse(invalid.doc)).toMatchObject({ stage: "invalid_manifest" });
  });

  it("rejects a second worker’s progress or completion attempts on an active lease", async () => {
    const { bridge, enqueue } = harness(); enqueue();
    const lease = await bridge.lease("macbook-worker-01", 3);
    await expect(bridge.progress(lease.job.id, "other-worker-02", lease.lease.id, { stage: "rendering" })).rejects.toMatchObject({ status: 409 });
    await expect(bridge.complete(lease.job.id, "other-worker-02", lease.lease.id, { final: {} })).rejects.toMatchObject({ status: 409 });
  });

  it("keeps high-volume progress allowance isolated to each leased render job", async () => {
    const { bridge, enqueue } = harness();
    enqueue("reel-rate-job-one-90007");
    enqueue("reel-rate-job-two-90008");
    const first = await bridge.lease("macbook-worker-01", 3);
    const second = await bridge.lease("macbook-worker-02", 3);
    for (let i = 0; i < 180; i++) await bridge.progress(first.job.id, "macbook-worker-01", first.lease.id, { stage: "rendering" });
    await expect(bridge.progress(first.job.id, "macbook-worker-01", first.lease.id, { stage: "rendering" })).rejects.toMatchObject({ status: 429 });
    await expect(bridge.progress(second.job.id, "macbook-worker-02", second.lease.id, { stage: "rendering" })).resolves.toMatchObject({ ok: true });
  });

  it("allows an expired lease to be reclaimed, but not a live lease", async () => {
    const { bridge, enqueue, advance } = harness(); enqueue();
    const first = await bridge.lease("macbook-worker-01", 3);
    await expect(bridge.lease("macbook-worker-02", 3)).resolves.toMatchObject({ job: null });
    advance(15 * 60_000 + 1);
    const second = await bridge.lease("macbook-worker-02", 3);
    expect(second.job.id).toBe(first.job.id);
    expect(second.lease.id).not.toBe(first.lease.id);
  });

  it("gives jobs only to Macs on the current renderer version; older or unversioned Macs wait", async () => {
    const { bridge, enqueue } = harness(); enqueue();
    await expect(bridge.lease("old-mac-worker-01", undefined)).resolves.toMatchObject({ ok: true, job: null, outdated: true, requiredVersion: 3 });
    await expect(bridge.lease("old-mac-worker-01", 2)).resolves.toMatchObject({ job: null, outdated: true });
    await expect(bridge.lease("new-mac-worker-02", 3)).resolves.toMatchObject({ ok: true, job: { id: expect.any(String) } });
    const st = await bridge.status();
    expect(st.workers.find((w) => w.id === "old-mac-worker-01")).toMatchObject({ outdated: true, rendererVersion: 2 });
  });

  it("gives no new jobs to a paused worker name while other workers keep rendering", async () => {
    const { bridge, enqueue } = harness(); enqueue();
    process.env.ELEVAY_RENDER_WORKERS_PAUSED = "old-mac-worker";
    try {
      await expect(bridge.lease("old-mac-worker", 3)).resolves.toMatchObject({ ok: true, job: null, paused: true });
      await expect(bridge.lease("new-mac-worker-2", 3)).resolves.toMatchObject({ ok: true, job: { id: expect.any(String) } });
    } finally { delete process.env.ELEVAY_RENDER_WORKERS_PAUSED; }
  });

  it("allows only one active lease for a worker identity even if a stale process polls", async () => {
    const { bridge, enqueue } = harness();
    enqueue("reel-one-active-90007"); enqueue("reel-two-active-90008");
    const first = await bridge.lease("macbook-worker-01", 3);
    await expect(bridge.lease("macbook-worker-01", 3)).resolves.toMatchObject({ ok: true, job: null });
    await expect(bridge.lease("other-worker-02", 3)).resolves.toMatchObject({ job: { id: "reel-two-active-90008" } });
    expect(first.job.id).toBe("reel-one-active-90007");
  });

  it("stops a permanently untimable saved voice without consuming automatic render retries", async () => {
    const { bridge, enqueue, rows } = harness(); enqueue();
    const lease = await bridge.lease("macbook-worker-01", 3);
    await expect(bridge.fail(lease.job.id, "macbook-worker-01", lease.lease.id, { stage: "rendering", error: "Scene 1 saved narration cannot be naturally timed to the locked slot." })).resolves.toMatchObject({ retry: false });
    expect(rows.get(lease.job.id).status).toBe("failed");
  });

  it("validates artifact kind, MIME, size, SHA-256 and active lease before committing", async () => {
    const { bridge, enqueue, advance } = harness(); enqueue();
    const lease = await bridge.lease("macbook-worker-01", 3);
    const base = { kind: "final", url: "https://storage.example/final.mp4", sha256: "a".repeat(64), bytes: 100, mime: "video/mp4" };
    await expect(bridge.commitArtifact(lease.job.id, "macbook-worker-01", lease.lease.id, { ...base, kind: "unexpected" })).rejects.toBeInstanceOf(RenderWorkerBridgeError);
    await expect(bridge.commitArtifact(lease.job.id, "macbook-worker-01", lease.lease.id, { ...base, mime: "image/jpeg" })).rejects.toMatchObject({ status: 400 });
    await expect(bridge.commitArtifact(lease.job.id, "macbook-worker-01", lease.lease.id, { ...base, bytes: 400 * 1024 * 1024 })).rejects.toMatchObject({ status: 400 });
    await expect(bridge.commitArtifact(lease.job.id, "macbook-worker-01", lease.lease.id, { ...base, sha256: "nope" })).rejects.toMatchObject({ status: 400 });
    advance(15 * 60_000 + 1);
    await expect(bridge.commitArtifact(lease.job.id, "macbook-worker-01", lease.lease.id, base)).rejects.toMatchObject({ status: 409 });
  });

  it("streams an allowlisted artifact to server-side storage and rejects mismatched bytes", async () => {
    const { bridge, enqueue } = harness(); enqueue();
    const lease = await bridge.lease("macbook-worker-01", 3);
    const payload = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(64)]);
    const goodRequest: any = Object.assign(Readable.from([payload]), { headers: {
      "x-render-worker-id": "macbook-worker-01", "x-render-worker-lease": lease.lease.id,
      "x-artifact-sha256": crypto.createHash("sha256").update(payload).digest("hex"),
      "content-type": "video/mp4", "content-length": String(payload.length),
    } });
    await expect(bridge.uploadRequest(goodRequest, { jobId: lease.job.id, kind: "seg0" })).resolves.toMatchObject({ ok: true, artifact: { kind: "seg0", url: "https://storage.example/video-mp4" } });

    const wrongBytes = Buffer.from("not a jpeg");
    const badRequest: any = Object.assign(Readable.from([wrongBytes]), { headers: {
      "x-render-worker-id": "macbook-worker-01", "x-render-worker-lease": lease.lease.id,
      "x-artifact-sha256": crypto.createHash("sha256").update(wrongBytes).digest("hex"),
      "x-artifact-index": "1", "content-type": "image/jpeg", "content-length": String(wrongBytes.length),
    } });
    await expect(bridge.uploadRequest(badRequest, { jobId: lease.job.id, kind: "qc" })).rejects.toMatchObject({ status: 415 });
  });
});
