import { cairoParts, planningWeek } from "./ai";

/**
 * Cairo-time operating controller for the Command Center.
 *
 * This is deliberately separate from the historical weekly-results automation:
 * Command Center is the single authority for AI Studio production, final QC,
 * Saturday owner review, and the direct-publishing release guard.
 *
 * It does not create Meta posts, campaigns, spend, replies, leads, or CRM
 * records. It may only start the already-approved content-production pipeline
 * after a redacted, non-generative readiness check passes.
 */
const HIGGSFIELD_AUTH_PROBE_ID = "00000000-0000-4000-8000-000000000000";
const PRECHECK_RETRY_MS = 30 * 60_000;
const DAYS = 24 * 60 * 60_000;

const iso = () => new Date().toISOString();
const clip = (value: unknown, max = 180) => String(value instanceof Error ? value.message : value || "").replace(/\s+/g, " ").slice(0, max);
const phaseKey = (week: string, phase: string) => `cc_weekly_operations:${week}:${phase}`;
// On Wednesday this resolves to the publishing week starting on the following
// Sunday; on Sunday it resolves to that same active publishing week. This keeps
// Wednesday planning, Saturday review and Sunday hold on one durable key.
const operationsWeek = (nowMs: number) => planningWeek(nowMs + 4 * DAYS);

export type WeeklyOperationsDependencies = {
  q: (sql: string, args?: unknown[]) => Promise<any>;
  loadState: () => Promise<{ state: any }>;
  mutate: (ctx: any, fn: (state: any) => any) => Promise<any>;
  studio: () => Promise<any>;
  metaHub: () => Promise<any>;
  renderBridge: () => Promise<any>;
  creditsReport: (args: any) => Promise<any>;
  notifyOwner: (message: { title: string; content: string }) => Promise<boolean>;
  fetcher?: typeof fetch;
  now?: () => number;
};

function cleanProvider(result: { ok: boolean; detail?: string }) {
  return { ok: !!result.ok, detail: clip(result.detail || (result.ok ? "Available" : "Unavailable")) };
}

function countReviewItems(state: any, week: string) {
  const items = (state.items || []).filter((item: any) => String(item.item_id || "").startsWith(`${week}-`));
  return {
    total: items.length,
    ready: items.filter((item: any) => item.status === "pending_approval").length,
    approved: items.filter((item: any) => item.status === "approved" || item.status === "scheduled" || item.status === "published").length,
    working: items.filter((item: any) => ["draft", "changes_requested", "revision_pending"].includes(item.status)).length,
    blocked: items.filter((item: any) => ["qc_failed", "rejected", "revision_approved"].includes(item.status)).length,
  };
}

function workerReadiness(status: any) {
  const workers = Array.isArray(status?.workers) ? status.workers : [];
  const eligible = workers.filter((worker: any) => !worker?.outdated && Number(worker?.rendererVersion) >= Number(status?.requiredRendererVersion || 3));
  // Two workers are the intended normal capacity. A temporary one-worker failure
  // must never cause silent production, but is surfaced with an exact blocker.
  const required = Math.max(1, Math.min(2, Number(process.env.ELEVAY_WEEKLY_REQUIRED_RENDER_WORKERS || 2)));
  return {
    required,
    seen: workers.length,
    eligible: eligible.length,
    ready: eligible.length >= required,
    workers: workers.map((worker: any) => ({
      id: String(worker?.id || "unknown").slice(0, 80),
      rendererVersion: Number.isFinite(Number(worker?.rendererVersion)) ? Number(worker.rendererVersion) : null,
      outdated: !!worker?.outdated,
      lastSeen: typeof worker?.lastSeen === "string" ? worker.lastSeen : null,
    })),
    queue: {
      pending: Number(status?.queue?.pending || 0),
      running: Number(status?.queue?.running || 0),
      retrying: Number(status?.queue?.retrying || 0),
      failed: Number(status?.queue?.failed || 0),
    },
  };
}

/** Redacted, read-only provider and worker preflight. No model or media generation. */
export async function weeklyReadiness(deps: WeeklyOperationsDependencies) {
  const fetcher = deps.fetcher || fetch;
  const safeFetch = async (url: string, init: RequestInit, accepted: number[] = [200]) => {
    try {
      const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(25_000) });
      return cleanProvider({ ok: accepted.includes(response.status), detail: accepted.includes(response.status) ? "Authenticated" : `HTTP ${response.status}` });
    } catch (error) {
      return cleanProvider({ ok: false, detail: clip(error) });
    }
  };

  const [openai, claude, higgsfield, stateData, bridgeStatus] = await Promise.all([
    process.env.OPENAI_API_KEY
      ? safeFetch("https://api.openai.com/v1/models?limit=1", { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } })
      : Promise.resolve(cleanProvider({ ok: false, detail: "OPENAI_API_KEY is not set" })),
    process.env.ANTHROPIC_API_KEY
      ? safeFetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } })
      : Promise.resolve(cleanProvider({ ok: false, detail: "ANTHROPIC_API_KEY is not set" })),
    process.env.HF_API_KEY
      ? safeFetch(`https://api.higgsfield.ai/requests/${HIGGSFIELD_AUTH_PROBE_ID}/status`, { headers: { Authorization: `Key ${process.env.HF_API_KEY}`, Accept: "application/json" } }, [404])
      : Promise.resolve(cleanProvider({ ok: false, detail: "HF_API_KEY is not set" })),
    deps.loadState(),
    deps.renderBridge().then((bridge) => bridge.status()),
  ]);

  const credits = await deps.creditsReport({ q: deps.q, manual: stateData.state.settings?.credits || {}, refresh: true }).catch((error: unknown) => ({ ok: false, error: clip(error) }));
  const eleven = (credits?.platforms || []).find((platform: any) => platform.id === "elevenlabs") || {};
  const elevenlabs = cleanProvider({
    ok: eleven.source === "live" && Number(eleven.remaining) > 0,
    detail: eleven.source === "live" ? (Number(eleven.remaining) > 0 ? "Quota available; locked voice is enforced at production time" : "No ElevenLabs character quota remains") : (eleven.error || eleven.need || "Live ElevenLabs quota is unavailable"),
  });

  let meta: Record<string, { ok: boolean }> = {};
  try {
    const checks = await (await deps.metaHub()).checkConnection();
    meta = Object.fromEntries(Object.entries(checks || {}).map(([name, value]: any) => [name, { ok: !!value?.ok }]));
  } catch {
    meta = { connection: { ok: false } };
  }
  // Inbox/reply permissions need separate Meta review and must not block
  // content production or its later owner review. Publishing checks remain
  // fail-closed for the Saturday release path.
  const publishingMetaChecks = ["key", "page", "insights", "comments", "instagram", "ads", "forms"];
  const metaReady = publishingMetaChecks.every((name) => meta[name]?.ok === true);
  const workers = workerReadiness(bridgeStatus);
  const balances = Object.fromEntries((credits?.platforms || []).map((platform: any) => [platform.id, {
    source: platform.source || null,
    remaining: typeof platform.remaining === "number" ? platform.remaining : null,
    status: platform.status || null,
  }]));
  const hardBlockers: string[] = [];
  const blockers: string[] = [];
  for (const [name, status] of Object.entries({ openai, claude })) if (!status.ok) hardBlockers.push(`${name}: ${status.detail}`);
  for (const [name, status] of Object.entries({ higgsfield, elevenlabs })) if (!status.ok) blockers.push(`${name}: ${status.detail}`);
  if (!metaReady) blockers.push("Meta publishing/insights: one or more required Page, Instagram, ads, or forms checks failed.");
  if (!workers.ready) blockers.push(`Render workers: ${workers.eligible}/${workers.required} eligible v${bridgeStatus?.requiredRendererVersion || 3}+ Mac workers are currently available; reel final edits will stay queued outside the website container.`);
  blockers.unshift(...hardBlockers);

  return {
    // A missing reel-only dependency must not stop the plan, statics,
    // keyframes, or another independent content item from proceeding.
    ok: hardBlockers.length === 0,
    checkedAt: iso(),
    providers: { openai, claude, higgsfield, elevenlabs },
    credits: balances,
    meta,
    workers,
    hardBlockers,
    blockers,
  };
}

export function createWeeklyOperations(deps: WeeklyOperationsDependencies) {
  const clock = deps.now || (() => Date.now());

  async function getRecord(week: string, phase: string) {
    const rows = await deps.q("SELECT value FROM ec_kv WHERE name=?", [phaseKey(week, phase)]);
    try { return rows?.[0]?.value ? JSON.parse(rows[0].value) : null; } catch { return null; }
  }

  async function putRecord(week: string, phase: string, record: any) {
    await deps.q("INSERT INTO ec_kv (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value)", [phaseKey(week, phase), JSON.stringify(record)]);
    return record;
  }

  async function notify(title: string, content: string) {
    try { return await deps.notifyOwner({ title, content }); } catch { return false; }
  }

  async function preflight(week: string, force = false) {
    const prior = await getRecord(week, "preflight");
    if (!force && prior?.checkedAt && Date.now() - Date.parse(prior.checkedAt) < PRECHECK_RETRY_MS) return prior;
    const report = await weeklyReadiness(deps);
    await putRecord(week, "preflight", report);
    await deps.mutate({}, (state: any) => {
      state.settings = state.settings || {};
      state.settings.weeklyOperations = { ...(state.settings.weeklyOperations || {}), latestPreflight: { week, checkedAt: report.checkedAt, ok: report.ok, blockers: report.blockers } };
      deps && state.audit && state.audit.unshift({ at: iso(), actor: "weekly-controller", action: report.ok ? "weekly.preflight.ready" : "weekly.preflight.blocked", target: week, detail: report.ok ? "Provider, Meta and renderer preflight passed." : report.blockers.join(" ").slice(0, 1000) });
      return { ok: true };
    });
    if (!report.ok && (!prior?.notifiedAt || prior.ok)) {
      await notify("ELEVAY weekly production is paused", `Preflight for ${week} did not start any paid generation. ${report.blockers.join(" ")}`);
      const notified = { ...report, notifiedAt: iso() };
      await putRecord(week, "preflight", notified);
      return notified;
    }
    if (report.ok && report.blockers.length && (!prior?.notifiedAt || !prior.ok)) {
      await notify("ELEVAY weekly production is running with limited dependencies", `Preflight for ${week} passed its plan-start requirements. ${report.blockers.join(" ")} Independent items will continue; affected steps remain queued or retry through their durable provider workflow.`);
      const notified = { ...report, notifiedAt: iso() };
      await putRecord(week, "preflight", notified);
      return notified;
    }
    return report;
  }

  async function startPlan(week: string) {
    const started = await getRecord(week, "plan_started");
    if (started?.runId) return started;
    const readiness = await preflight(week);
    if (!readiness.ok) return { ok: false, blocked: true, blockers: readiness.blockers };
    try {
      const run = await (await deps.studio()).startWeekly(week, { email: "weekly-controller", role: "owner" });
      const record = { ok: true, runId: run.id, startedAt: iso() };
      await putRecord(week, "plan_started", record);
      await deps.mutate({}, (state: any) => { state.settings.weeklyOperations = { ...(state.settings.weeklyOperations || {}), activeWeek: week, status: "production" }; return { ok: true }; });
      return record;
    } catch (error) {
      const message = clip(error, 320);
      if (/already started/i.test(message)) return { ok: true, existing: true };
      const record = { ok: false, failedAt: iso(), error: message };
      await putRecord(week, "plan_started", record);
      await notify("ELEVAY weekly plan did not start", `The ${week} plan was not started. ${message}`);
      return record;
    }
  }

  /** Owner-authorized initial rollout or catch-up. It never bypasses preflight. */
  async function startNow(week: string) {
    const readiness = await preflight(week, true);
    if (!readiness.ok) return { ok: false, blocked: true, blockers: readiness.blockers };
    return startPlan(week);
  }

  async function fridayRecovery(week: string) {
    const record = await getRecord(week, "friday_recovery");
    if (record?.at) return record;
    const result = await (await deps.studio()).watchdog();
    const next = { at: iso(), result: { checked: Number(result?.checked || 0), recovered: Number(result?.recovered || 0), failed: Number(result?.failed || 0) } };
    await putRecord(week, "friday_recovery", next);
    if (next.result.failed) await notify("ELEVAY Friday recovery needs attention", `${next.result.failed} external production step(s) failed after their controlled retry. See AI Studio for exact causes.`);
    return next;
  }

  async function saturdayReview(week: string) {
    const prior = await getRecord(week, "saturday_review");
    if (prior?.sentAt) return prior;
    const { state } = await deps.loadState();
    const summary = countReviewItems(state, week);
    const record = { sentAt: iso(), ...summary };
    await putRecord(week, "saturday_review", record);
    await deps.mutate({}, (s: any) => {
      s.settings.weeklyOperations = { ...(s.settings.weeklyOperations || {}), activeWeek: week, status: "owner_review", saturdayReview: record };
      return { ok: true };
    });
    await notify("ELEVAY Saturday Review is ready", `${week}: ${summary.ready} item(s) are ready for approval, ${summary.working} still processing, and ${summary.blocked} need attention. Open Marketing Command Center → Saturday Review. Nothing will publish without your Saturday approval.`);
    return record;
  }

  async function saturdayReminder(week: string) {
    const prior = await getRecord(week, "saturday_reminder");
    if (prior?.sentAt) return prior;
    const { state } = await deps.loadState();
    const summary = countReviewItems(state, week);
    const outstanding = summary.ready + summary.working + summary.blocked;
    const record = { sentAt: iso(), outstanding, ...summary };
    await putRecord(week, "saturday_reminder", record);
    if (outstanding) await notify("ELEVAY Saturday review reminder", `${week} still has ${outstanding} item(s) awaiting review, final QC, or correction. Sunday publishing remains blocked until Saturday release is recorded.`);
    return record;
  }

  async function sundayGuard(week: string) {
    const prior = await getRecord(week, "sunday_guard");
    if (prior?.at) return prior;
    let held = 0;
    await deps.mutate({}, (state: any) => {
      for (const item of state.items || []) {
        if (!String(item.item_id || "").startsWith(`${week}-`)) continue;
        const release = item.review?.release;
        if (release?.version === item.version) continue;
        item.publish = { ...(item.publish || {}), weekly_review_hold: { active: true, week, at: iso(), reason: "No valid Saturday owner approval was recorded before the Sunday hold." } };
        held++;
      }
      state.settings.weeklyOperations = { ...(state.settings.weeklyOperations || {}), activeWeek: week, status: "sunday_hold" };
      return { ok: true };
    });
    const record = { at: iso(), held };
    await putRecord(week, "sunday_guard", record);
    if (held) await notify("ELEVAY Sunday publishing hold", `${held} item(s) in ${week} have no valid Saturday owner approval and were held. No social post was published.`);
    return record;
  }

  /** Frequent UTC heartbeat; all phase decisions are made in Africa/Cairo. */
  async function run(nowMs = clock()) {
    const cairo = cairoParts(nowMs);
    const week = operationsWeek(nowMs);
    const events: string[] = [];
    // Wednesday: plan the week that begins on the next Sunday.
    if (cairo.weekday === "Wed" && cairo.hour >= 8) {
      const report = await preflight(week);
      events.push(report.ok ? "preflight_ready" : "preflight_blocked");
      if (cairo.hour >= 9 && report.ok) { await startPlan(week); events.push("plan_start_checked"); }
    }
    // The durable AI watchdog owns normal Wed–Fri production and final QC;
    // Friday adds an explicit recovery checkpoint and alert.
    if (cairo.weekday === "Fri" && cairo.hour >= 9) { await fridayRecovery(week); events.push("friday_recovery"); }
    if (cairo.weekday === "Sat" && cairo.hour >= 9) { await saturdayReview(week); events.push("saturday_review"); }
    if (cairo.weekday === "Sat" && cairo.hour >= 18) { await saturdayReminder(week); events.push("saturday_reminder"); }
    if (cairo.weekday === "Sun" && cairo.hour >= 9) { await sundayGuard(week); events.push("sunday_guard"); }
    return { ok: true, cairo, week, events };
  }

  return { run, preflight, startPlan, startNow, fridayRecovery, saturdayReview, saturdayReminder, sundayGuard };
}
