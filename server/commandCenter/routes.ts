// @ts-nocheck
/*
 * ELEVAY Marketing Command Center at /admin.
 *
 * A separate section of elevay.vip where the team approves Manus's weekly
 * content, Friday Meta actions and monthly plans, with the 200,000 EGP monthly
 * cap, the 100 EGP max cost per lead, the first-pass approval tracker and the
 * autopublish gate. Manus works from the job queue through the agent API.
 *
 *   /admin/                    dashboard (static files in client/public/admin-cc)
 *   /admin/api/*               team API (elevay.vip session cookie)
 *   /admin/api/agent/*         Manus agent API (Bearer token, owner sees it in the dashboard)
 *   /admin/api/webhooks/manus  Manus API task webhook (?secret=...)
 *
 * Sign-in reuses elevay.vip accounts. Access is derived from the existing
 * Agentic Marketing System roles: CRM owner / marketing_system_admin → owner;
 * marketing_manager, creative_producer, researcher → marketer; analyst → viewer.
 * Everyone else gets 403. Data lives in its own ec_* tables in the same
 * database; nothing here reads or writes CRM, Lead, client or finance tables.
 */
import crypto from "crypto";
import mysql from "mysql2/promise";
import type { Express, Request, Response } from "express";
import R from "./rules";
import E from "./engine";
import Manus from "./manus";
import { PAGE_HTML } from "./page";
import { sdk } from "../_core/sdk";
import { COOKIE_NAME } from "@shared/const";
import { isOwner } from "../permissionsRouter";

const BASE = "/admin";
const ROLE_MAP: Record<string, "owner" | "marketer" | "viewer"> = {
  owner: "owner",
  marketing_system_admin: "owner",
  marketing_manager: "marketer",
  creative_producer: "marketer",
  researcher: "marketer",
  analyst: "viewer",
};

// ------------------------------------------------------------------ database
let poolPromise: Promise<mysql.Pool> | null = null; // connection pool only; no request data
async function pool(): Promise<mysql.Pool> {
  if (!poolPromise) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    poolPromise = (async () => {
      const p = mysql.createPool(process.env.DATABASE_URL); // same connection string the app's drizzle client uses
      const ddl = [
        "CREATE TABLE IF NOT EXISTS ec_meta (id INT PRIMARY KEY, ver INT NOT NULL, doc LONGTEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS ec_items (item_id VARCHAR(32) PRIMARY KEY, doc LONGTEXT NOT NULL, updated_at VARCHAR(40))",
        "CREATE TABLE IF NOT EXISTS ec_jobs (id VARCHAR(32) PRIMARY KEY, created_at VARCHAR(40), doc LONGTEXT NOT NULL, INDEX ec_jobs_created (created_at))",
        "CREATE TABLE IF NOT EXISTS ec_audit (seq BIGINT AUTO_INCREMENT PRIMARY KEY, at VARCHAR(40), doc TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS ec_kv (name VARCHAR(64) PRIMARY KEY, value TEXT)",
      ];
      for (const s of ddl) await p.query(s);
      return p;
    })().catch((e) => { poolPromise = null; throw e; });
  }
  return poolPromise;
}
async function q(sql: string, args: unknown[] = []) { const p = await pool(); const [rows] = await p.query(sql, args); return rows as any; }
async function kvGet(name: string) { const rows = await q("SELECT value FROM ec_kv WHERE name=?", [name]); return rows[0] ? rows[0].value : null; }
async function kvSet(name: string, value: string) { await q("INSERT INTO ec_kv (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value)", [name, value]); }
async function secret(name: string, bytes: number) {
  let v = await kvGet(name);
  if (!v) { await q("INSERT IGNORE INTO ec_kv (name, value) VALUES (?, ?)", [name, crypto.randomBytes(bytes).toString("hex")]); v = await kvGet(name); }
  return v;
}

const META_KEYS = ["settings", "counters", "actions", "reports", "news", "plans"];
async function loadState() {
  let meta = (await q("SELECT ver, doc FROM ec_meta WHERE id=1"))[0];
  if (!meta) {
    const empty = E.emptyState();
    await q("INSERT IGNORE INTO ec_meta (id, ver, doc) VALUES (1, 0, ?)", [JSON.stringify(Object.fromEntries(META_KEYS.map((k) => [k, empty[k]])))]);
    meta = (await q("SELECT ver, doc FROM ec_meta WHERE id=1"))[0];
  }
  const [items, jobs, audit] = await Promise.all([
    q("SELECT doc FROM ec_items"),
    q("SELECT doc FROM ec_jobs ORDER BY created_at DESC LIMIT 400"),
    q("SELECT doc FROM ec_audit ORDER BY seq DESC LIMIT 300"),
  ]);
  const m = JSON.parse(meta.doc);
  const state = {
    ...E.emptyState(), ...m,
    settings: Object.assign({}, R.DEFAULT_SETTINGS, m.settings || {}),
    items: items.map((r) => JSON.parse(r.doc)),
    jobs: jobs.map((r) => JSON.parse(r.doc)),
    audit: audit.map((r) => JSON.parse(r.doc)),
  };
  const snap = {
    ver: meta.ver,
    items: new Map(items.map((r) => [JSON.parse(r.doc).item_id, r.doc])),
    jobs: new Map(jobs.map((r) => [JSON.parse(r.doc).id, r.doc])),
    auditLen: state.audit.length,
  };
  return { state, snap };
}

async function saveState(state, snap) {
  if (state.reports.length > 60) state.reports.length = 60;
  if (state.news.length > 300) state.news.length = 300;
  if (state.actions.length > 400) state.actions.length = 400;
  if (state.plans.length > 24) state.plans.length = 24;
  for (const i of state.items) if (i.history && i.history.length > 8) i.history.length = 8;
  const metaDoc = JSON.stringify(Object.fromEntries(META_KEYS.map((k) => [k, state[k]])));
  const res = await q("UPDATE ec_meta SET doc=?, ver=ver+1 WHERE id=1 AND ver=?", [metaDoc, snap.ver]);
  if (res.affectedRows !== 1) return false; // another write landed first; caller retries
  const now = new Date().toISOString();
  for (const it of state.items) {
    const doc = JSON.stringify(it);
    if (snap.items.get(it.item_id) !== doc) await q("INSERT INTO ec_items (item_id, doc, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE doc=VALUES(doc), updated_at=VALUES(updated_at)", [it.item_id, doc, now]);
  }
  for (const j of state.jobs) {
    const doc = JSON.stringify(j);
    if (snap.jobs.get(j.id) !== doc) await q("INSERT INTO ec_jobs (id, created_at, doc) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE doc=VALUES(doc)", [j.id, j.created_at, doc]);
  }
  const fresh = state.audit.slice(0, Math.max(0, state.audit.length - snap.auditLen)).reverse();
  for (const a of fresh) await q("INSERT INTO ec_audit (at, doc) VALUES (?, ?)", [a.at, JSON.stringify(a)]);
  return true;
}

async function mutate(ctx, fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { state, snap } = await loadState();
    const r = await fn(state);
    if (r && r.ok === false) return r;
    E.killSwitchCheck(state);
    if (await saveState(state, snap)) { ctx.changed = true; return r; }
    await new Promise((res) => setTimeout(res, 40 + crypto.randomInt(120)));
  }
  return { ok: false, error: "The data changed while saving. Try again." };
}

// ------------------------------------------------------------------ Manus push (optional)
function manusCfg(ctx) {
  return {
    manusApiKey: process.env.ELEVAY_COMMAND_CENTER_MANUS_API_KEY || "",
    manusAgentProfile: process.env.ELEVAY_COMMAND_CENTER_MANUS_PROFILE || "manus-1.6",
    manusProjectId: process.env.ELEVAY_COMMAND_CENTER_MANUS_PROJECT_ID || "",
    manusConnectors: [],
    publicUrl: ctx.origin + BASE,
  };
}
async function pushJobs(ctx) {
  const cfg = manusCfg(ctx);
  if (!cfg.manusApiKey || !ctx.changed) return;
  const { state } = await loadState();
  const toSend = state.jobs.filter((j) => j.status === "pending" && !j.manus.task_id && !j.manus.push_attempted).slice(0, 5);
  for (const job of toSend) {
    let patch;
    try { const d = await Manus.pushJob(cfg, { ...job, manus: { ...job.manus } }); patch = { task_id: d.task_id, task_url: d.task_url || null, push_attempted: true, error: null }; }
    catch (e) { patch = { push_attempted: true, error: String(e?.message || e) }; }
    await mutate(ctx, (st) => {
      const j = st.jobs.find((x) => x.id === job.id);
      if (!j) return { ok: true };
      Object.assign(j.manus, patch);
      if (patch.task_id) E.setJobStatus(st, j.id, "sent", {}, "system");
      else E.audit(st, "system", "job.push_failed", j.id, patch.error);
      return { ok: true };
    });
  }
}

// ------------------------------------------------------------------ identity
function safeEqual(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Verified elevay.vip session → { email, name, id, role } or null. Signature is always checked. */
async function currentUser(req: Request) {
  const cookie = req.cookies?.[COOKIE_NAME];
  const session = await sdk.verifySession(cookie);
  if (!session) return null;
  const rows = /^\d+$/.test(session.openId)
    ? await q("SELECT id, openId, email, name, role FROM users WHERE id=? LIMIT 1", [Number(session.openId)])
    : await q("SELECT id, openId, email, name, role FROM users WHERE openId=? LIMIT 1", [session.openId]);
  const u = rows[0];
  if (!u) return null;
  let mrole = null;
  if (isOwner(u)) mrole = "owner";
  else {
    const a = (await q("SELECT role, isActive FROM marketing_system_role_assignments WHERE userId=? LIMIT 1", [u.id]))[0];
    if (a && (a.isActive === 1 || a.isActive === true)) mrole = a.role;
  }
  const role = ROLE_MAP[mrole] || null;
  return { id: `u_${u.id}`, email: u.email || u.name || `user-${u.id}`, name: u.name || u.email || `User ${u.id}`, role, marketingRole: mrole };
}

// ------------------------------------------------------------------ routes
const routes = [];
const route = (method, pattern, auth, handler) => {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  routes.push({ method, re, keys, auth, handler });
};
const out = (status, body) => ({ status, body });
const ok = (b) => out(200, b);
const fail = (status, error, extra?) => out(status, Object.assign({ ok: false, error }, extra || {}));
const fromResult = (r) => (r && r.ok === false ? fail(400, r.error, r) : ok(r || { ok: true }));
const loginUrl = `/login?returnTo=${encodeURIComponent(BASE + "/")}`;

route("GET", "/health", "public", async () => ok({ ok: true, service: "elevay-command-center", externalAuth: true, loginUrl, needsSetup: false, time: new Date().toISOString() }));

route("GET", "/bootstrap", "team", async (ctx) => {
  const { state } = await loadState();
  return ok({
    ok: true, me: { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name, role: ctx.user.role }, externalAuth: true, loginUrl,
    settings: state.settings, summary: E.summary(state), items: state.items, actions: state.actions.slice(0, 200), reports: state.reports.slice(0, 12),
    news: state.news.slice(0, 150), plans: state.plans.slice(0, 12), jobs: state.jobs.slice(0, 200), audit: ctx.user.role === "owner" ? state.audit : [], users: [],
    manus: { push: !!manusCfg(ctx).manusApiKey, agentApi: true, webhook: true, lastAgentSeen: await kvGet("last_agent_seen"), lastWebhookAt: await kvGet("last_webhook_at"), publicUrl: ctx.origin + BASE },
    server_time: new Date().toISOString(),
  });
});

route("POST", "/items/:id/decision", "marketer", (ctx) => mutate(ctx, (st) => E.decideItem(st, ctx.params.id, ctx.body.decision, ctx.body, ctx.user.email, ctx.user.role)).then(fromResult));
route("POST", "/weeks/:week/approve-all", "owner", (ctx) => mutate(ctx, (st) => E.approveAllWeek(st, ctx.params.week, ctx.user.email, ctx.user.role)).then(fromResult));
route("POST", "/compliance/check", "team", async (ctx) => ok({ ok: true, result: R.checkBrief(ctx.body || {}) }));
route("POST", "/actions/:id/decision", "owner", (ctx) => mutate(ctx, (st) => E.decideAction(st, ctx.params.id, ctx.body.decision, ctx.body, ctx.user.email, ctx.user.role)).then(fromResult));
route("POST", "/guardrails/pause", "owner", (ctx) => (ctx.body.adset ? mutate(ctx, (st) => E.proposePause(st, String(ctx.body.adset), ctx.user.email)).then(fromResult) : fail(400, "adset is required")));
route("POST", "/plans/:id/decision", "owner", (ctx) => mutate(ctx, (st) => E.decidePlan(st, ctx.params.id, ctx.body.decision, ctx.body.comment, ctx.user.email, ctx.user.role)).then(fromResult));
route("POST", "/news/:id/select", "marketer", (ctx) => mutate(ctx, (st) => {
  const n = st.news.find((x) => x.id === ctx.params.id);
  if (!n) return { ok: false, error: "News item not found" };
  if (n.confidence === "unconfirmed" && ctx.body.selected) return { ok: false, error: "Unconfirmed items cannot be used." };
  n.selected = !!ctx.body.selected;
  E.audit(st, ctx.user.email, n.selected ? "news.selected" : "news.unselected", n.id, n.headline);
  return { ok: true, news: n };
}).then(fromResult));
route("POST", "/jobs", "marketer", (ctx) => {
  const text = String(ctx.body.text || "").trim();
  if (!text) return fail(400, "Describe what Manus should do.");
  return mutate(ctx, (st) => ({ ok: true, job: E.enqueueJob(st, "custom", { request: text, requested_by: ctx.user.email }, ctx.user.email) })).then(fromResult);
});
route("POST", "/jobs/:id/reply", "marketer", async (ctx) => {
  const msg = String(ctx.body.message || "").trim();
  if (!msg) return fail(400, "Write a reply.");
  const cfg = manusCfg(ctx);
  let taskId = null;
  const r = await mutate(ctx, (st) => {
    const job = st.jobs.find((j) => j.id === ctx.params.id);
    if (!job) return { ok: false, error: "Job not found" };
    job.replies = job.replies || [];
    job.replies.push({ at: new Date().toISOString(), by: ctx.user.email, text: msg });
    job.manus.question = null;
    taskId = job.manus.task_id;
    return E.setJobStatus(st, job.id, cfg.manusApiKey && taskId ? "in_progress" : "pending", {}, ctx.user.email);
  });
  if (r.ok !== false && cfg.manusApiKey && taskId) {
    try { await Manus.replyToTask(cfg, taskId, msg); } catch (e) { return fail(502, "Saved, but Manus did not accept the reply: " + e.message); }
  }
  return fromResult(r);
});
route("POST", "/jobs/:id/retry", "marketer", (ctx) => mutate(ctx, (st) => {
  const job = st.jobs.find((j) => j.id === ctx.params.id);
  if (!job) return { ok: false, error: "Job not found" };
  Object.assign(job.manus, { task_id: null, task_url: null, error: null, push_attempted: false });
  return E.setJobStatus(st, job.id, "pending", {}, ctx.user.email);
}).then(fromResult));
route("PUT", "/settings", "owner", (ctx) => mutate(ctx, (st) => {
  const allowed = ["monthlyAdCapEgp", "maxCplEgp", "targetCplEgp", "cplBreachDays", "cplBreachMinSpendEgp", "approvalThreshold", "killSwitchRollingThreshold", "manualWeeks", "approvalChannel", "targets"];
  if (Number(ctx.body.monthlyAdCapEgp) > R.DEFAULT_SETTINGS.monthlyAdCapEgp && !ctx.body.confirmRaiseCap) return { ok: false, error: "Raising the monthly cap above 200,000 EGP needs confirmRaiseCap: true." };
  for (const k of allowed) if (k in ctx.body) st.settings[k] = ctx.body[k];
  E.audit(st, ctx.user.email, "settings.updated", null, Object.keys(ctx.body).join(", "));
  return { ok: true, settings: st.settings };
}).then(fromResult));
route("POST", "/autopublish/enable", "owner", (ctx) => mutate(ctx, (st) => E.enableAutopublish(st, ctx.user.email, ctx.user.role)).then(fromResult));
route("POST", "/autopublish/disable", "owner", (ctx) => mutate(ctx, (st) => E.disableAutopublish(st, ctx.body.reason || "Turned off by owner", ctx.user.email)).then(fromResult));

route("GET", "/admin/integration", "owner", async (ctx) => ok({
  ok: true, agentToken: await secret("agent_token", 24), agentBase: `${ctx.origin}${BASE}/api/agent`,
  webhookUrl: `${ctx.origin}${BASE}/api/webhooks/manus?secret=${await secret("webhook_secret", 16)}`, pushEnabled: !!manusCfg(ctx).manusApiKey,
}));
route("POST", "/admin/rotate", "owner", async (ctx) => {
  const which = ctx.body.which === "webhook" ? "webhook_secret" : "agent_token";
  await kvSet(which, crypto.randomBytes(which === "agent_token" ? 24 : 16).toString("hex"));
  await mutate(ctx, (st) => { E.audit(st, ctx.user.email, "credentials.rotated", which); return { ok: true }; });
  return ok({ ok: true });
});
route("POST", "/admin/seed-example", "owner", async (ctx) => {
  const { state } = await loadState();
  if (state.items.length) return fail(400, "Example data can only be loaded into an empty workspace.");
  const Demo = (await import("./demo-data")).default;
  const demo = Demo.build();
  return mutate(ctx, (st) => { const keep = st.audit; Object.assign(st, demo, { audit: keep }); E.audit(st, ctx.user.email, "example_data.loaded"); return { ok: true }; }).then(fromResult);
});

// Manus agent API
route("GET", "/agent/ping", "agent", async () => ok({ ok: true, time: new Date().toISOString() }));
route("GET", "/agent/summary", "agent", async () => { const { state } = await loadState(); return ok({ ok: true, settings: state.settings, summary: E.summary(state) }); });
route("GET", "/agent/jobs", "agent", async (ctx) => {
  const { state } = await loadState();
  const status = ctx.query.status, type = ctx.query.type;
  let jobs = state.jobs;
  if (status) jobs = jobs.filter((j) => String(status).split(",").includes(j.status));
  if (type) jobs = jobs.filter((j) => String(type).split(",").includes(j.type));
  return ok({ ok: true, jobs: jobs.slice(0, Number(ctx.query.limit || 50)).reverse() });
});
const jobStatus = (status, patchFn?) => (ctx) => mutate(ctx, (st) => {
  const j = st.jobs.find((x) => x.id === ctx.params.id);
  if (!j) return { ok: false, error: "Job not found" };
  return E.setJobStatus(st, j.id, status, patchFn ? patchFn(ctx, j) : {}, "manus");
}).then(fromResult);
route("POST", "/agent/jobs/:id/ack", "agent", jobStatus("in_progress", (ctx, j) => (ctx.body.task_id ? { manus: Object.assign(j.manus, { task_id: ctx.body.task_id, task_url: ctx.body.task_url || null }) } : {})));
route("POST", "/agent/jobs/:id/complete", "agent", jobStatus("done", (ctx) => ({ result: ctx.body.result || null })));
route("POST", "/agent/jobs/:id/fail", "agent", jobStatus("failed", (ctx) => ({ result: { error: String(ctx.body.error || "unknown") } })));
route("POST", "/agent/jobs/:id/ask", "agent", jobStatus("needs_input", (ctx, j) => { j.manus.question = { text: String(ctx.body.question || ""), options: ctx.body.options || [] }; return {}; }));
route("POST", "/agent/briefs", "agent", async (ctx) => {
  const list = Array.isArray(ctx.body.briefs) ? ctx.body.briefs : [ctx.body];
  let results = [];
  const r = await mutate(ctx, (st) => {
    results = list.map((b) => { const x = E.upsertBrief(st, b, "manus"); return x.ok ? { ok: true, item_id: x.item.item_id, version: x.item.version, status: x.item.status, compliance: { pass: x.item.compliance.pass, blocks: x.item.compliance.blocks.map((y) => y.label) } } : { ok: false, item_id: b && b.item_id, error: x.error }; });
    return { ok: true };
  });
  if (r.ok === false) return fromResult(r);
  return ok({ ok: results.every((x) => x.ok), results });
});
route("GET", "/agent/items", "agent", async (ctx) => {
  const { state } = await loadState();
  const week = ctx.query.week, status = ctx.query.status;
  let items = state.items;
  if (week) items = items.filter((i) => R.weekOf(i.item_id) === week);
  if (status) items = items.filter((i) => String(status).split(",").includes(i.status));
  return ok({ ok: true, items: items.map(({ history, ...rest }) => rest) });
});
route("POST", "/agent/items/:id/publish-status", "agent", (ctx) => mutate(ctx, (st) => E.markPublished(st, ctx.params.id, ctx.body.status, ctx.body, "manus")).then(fromResult));
route("POST", "/agent/actions", "agent", (ctx) => mutate(ctx, (st) => E.upsertActions(st, ctx.body.actions || [ctx.body], "manus")).then(fromResult));
route("POST", "/agent/actions/:id/result", "agent", (ctx) => mutate(ctx, (st) => E.actionResult(st, ctx.params.id, ctx.body, "manus")).then(fromResult));
route("POST", "/agent/reports", "agent", (ctx) => mutate(ctx, (st) => E.addReport(st, ctx.body, "manus")).then(fromResult));
route("POST", "/agent/news", "agent", (ctx) => mutate(ctx, (st) => E.addNews(st, ctx.body.news || [ctx.body], "manus")).then(fromResult));
route("POST", "/agent/plans", "agent", (ctx) => mutate(ctx, (st) => E.addPlan(st, ctx.body, "manus")).then(fromResult));
route("POST", "/webhooks/manus", "webhook", async (ctx) => {
  await kvSet("last_webhook_at", new Date().toISOString());
  let matched = false;
  await mutate(ctx, (st) => { const r = E.applyManusWebhook(st, ctx.body); matched = !!r.ok; return { ok: true }; });
  return ok({ ok: true, matched });
});

async function handle(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const sub = req.path.slice((BASE + "/api").length) || "/";
  const r = routes.find((x) => x.method === req.method && x.re.test(sub));
  if (!r) return res.status(404).json({ ok: false, error: "Not found" });
  const m = sub.match(r.re);
  const origin = `${req.headers["x-forwarded-proto"] ? String(req.headers["x-forwarded-proto"]).split(",")[0] : req.protocol}://${req.get("host")}`;
  const ctx = {
    origin, query: req.query || {}, body: req.body && typeof req.body === "object" ? req.body : {}, changed: false, user: null,
    params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])),
  };
  try {
    if (r.auth === "agent") {
      const h = String(req.headers.authorization || "");
      if (!h.startsWith("Bearer ") || !safeEqual(h.slice(7), await secret("agent_token", 24))) return res.status(401).json({ ok: false, error: "Agent token missing or invalid." });
      await kvSet("last_agent_seen", new Date().toISOString());
    } else if (r.auth === "webhook") {
      if (!safeEqual(req.query.secret, await secret("webhook_secret", 16))) return res.status(401).json({ ok: false, error: "Bad webhook secret." });
    } else if (r.auth !== "public") {
      ctx.user = await currentUser(req);
      if (!ctx.user) return res.status(401).json({ ok: false, error: "Sign in to elevay.vip first.", loginUrl });
      if (!ctx.user.role) return res.status(403).json({ ok: false, error: "Your account has no Agentic Marketing role. Ask the owner to assign one in Marketing settings." });
      if (req.method !== "GET") {
        const o = req.headers.origin;
        if (o && o !== origin) return res.status(403).json({ ok: false, error: "Cross-site request refused." });
      }
      if (r.auth === "owner" && ctx.user.role !== "owner") return res.status(403).json({ ok: false, error: "Owner only." });
      if (r.auth === "marketer" && ctx.user.role === "viewer") return res.status(403).json({ ok: false, error: "Viewers cannot change data." });
    }
    const result = await r.handler(ctx);
    if (ctx.changed) { try { await pushJobs(ctx); } catch (e) { console.error("[CommandCenter] push", e); } }
    return res.status(result.status).json(result.body);
  } catch (e) {
    console.error("[CommandCenter]", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

export function registerCommandCenterRoutes(app: Express) {
  app.get(BASE, (_req, res) => res.redirect(301, BASE + "/"));
  app.get(BASE + "/", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.type("html").send(PAGE_HTML);
  });
  app.all(BASE + "/api/*", handle);
}

// Exported for tests.
export const __test = { routes, ROLE_MAP };
