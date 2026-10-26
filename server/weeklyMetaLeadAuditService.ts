import { and, eq } from "drizzle-orm";
import {
  metaWeeklyLeadAuditRuns,
  metaWeeklyLeadAuditSettings,
  type MetaWeeklyLeadAuditRun,
} from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { runMetaReconciliation } from "./metaLeadsService";

const CAIRO_TIME_ZONE = "Africa/Cairo";
const PROCESSING_STALE_AFTER_MS = 10 * 60 * 1000;
const AUDIT_KEY = "meta-lead-integrity-saturday";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function cairoParts(at: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
    hour: Number(value("hour")),
  };
}

export function isCairoWeeklyMetaLeadAuditWindow(at = Date.now()) {
  const cairo = cairoParts(at);
  return cairo.weekday === "Sat" && cairo.hour === 21;
}

export function makeWeeklyMetaLeadAuditRunKey(_taskUid: string, at = Date.now()) {
  return `meta-lead-weekly-audit:${cairoParts(at).date}`;
}

function isDuplicateKeyError(error: unknown) {
  const candidate = error as { code?: string; errno?: number; message?: string } | undefined;
  return candidate?.code === "ER_DUP_ENTRY" || candidate?.errno === 1062 || /duplicate entry|duplicate key|unique constraint/i.test(candidate?.message ?? "");
}

function classifyAuditError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/Database unavailable/i.test(message)) return "DATABASE_UNAVAILABLE";
  if (/Meta .*failed|Graph|OAuth|token/i.test(message)) return "META_RECONCILIATION_FAILED";
  return "META_WEEKLY_AUDIT_FAILED";
}

async function getRun(db: Db, runKey: string) {
  return (await db.select().from(metaWeeklyLeadAuditRuns).where(eq(metaWeeklyLeadAuditRuns.runKey, runKey)).limit(1))[0];
}

async function claimRun(db: Db, runKey: string, taskUid: string, at: number) {
  try {
    await db.insert(metaWeeklyLeadAuditRuns).values({ runKey, taskUid, status: "processing", startedAt: at });
    return { state: "claimed" as const, run: await getRun(db, runKey) };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await getRun(db, runKey);
    if (!existing) throw error;
    if (existing.status === "success") return { state: "success" as const, run: existing };
    if (existing.status === "processing" && existing.startedAt > at - PROCESSING_STALE_AFTER_MS) {
      return { state: "processing" as const, run: existing };
    }
    await db.update(metaWeeklyLeadAuditRuns).set({
      status: "processing",
      startedAt: at,
      completedAt: null,
      durationMs: null,
      errorCode: null,
    }).where(eq(metaWeeklyLeadAuditRuns.id, existing.id));
    return { state: "claimed" as const, run: await getRun(db, runKey) };
  }
}

export async function executeScheduledWeeklyMetaLeadAudit(taskUid: string, at = Date.now()) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [settings] = await db.select().from(metaWeeklyLeadAuditSettings).where(and(
    eq(metaWeeklyLeadAuditSettings.scheduleCronTaskUid, taskUid),
    eq(metaWeeklyLeadAuditSettings.auditKey, AUDIT_KEY),
    eq(metaWeeklyLeadAuditSettings.isEnabled, true),
  )).limit(1);
  if (!settings) return { ok: true, skipped: "orphan-schedule" as const };
  if (!isCairoWeeklyMetaLeadAuditWindow(at)) return { ok: true, skipped: "outside-cairo-saturday-2100-window" as const };

  const runKey = makeWeeklyMetaLeadAuditRunKey(taskUid, at);
  const claim = await claimRun(db, runKey, taskUid, at);
  if (claim.state === "success") return { ok: true, duplicate: true, status: "success" as const };
  if (claim.state === "processing") return { ok: true, duplicate: true, status: "processing" as const };
  const run = claim.run as MetaWeeklyLeadAuditRun;
  await db.update(metaWeeklyLeadAuditSettings).set({ lastAttemptAt: at, lastErrorCode: null, updatedAt: at })
    .where(eq(metaWeeklyLeadAuditSettings.id, settings.id));

  try {
    const reconciliation = await runMetaReconciliation({ limit: 200 });
    const monitoring = reconciliation.monitoring;
    const completedAt = Date.now();
    const metrics = {
      integrationsChecked: 1,
      leadsScanned: Number(reconciliation.pull.scanned ?? 0),
      leadsImported: Number(reconciliation.inbox.processed ?? 0),
      inboxProcessed: Number(reconciliation.inbox.processed ?? 0),
      inboxFailed: Number(reconciliation.inbox.failed ?? 0),
      manualReviewCount: Number(monitoring.manualReviewCount ?? 0),
      ambiguousMatchCount: Number(monitoring.ambiguousMatchCount ?? 0),
      duplicateAttributionCount: Number(monitoring.duplicateAttributionCount ?? 0),
    };
    await db.update(metaWeeklyLeadAuditRuns).set({
      status: "success",
      ...metrics,
      completedAt,
      durationMs: completedAt - at,
      errorCode: null,
    }).where(eq(metaWeeklyLeadAuditRuns.id, run.id));
    await db.update(metaWeeklyLeadAuditSettings).set({
      lastSuccessAt: completedAt,
      lastErrorCode: null,
      updatedAt: completedAt,
    }).where(eq(metaWeeklyLeadAuditSettings.id, settings.id));

    if (metrics.inboxFailed > 0 || metrics.manualReviewCount > 0 || metrics.ambiguousMatchCount > 0) {
      await notifyOwner({
        title: "Weekly Meta lead audit needs review",
        content: `Saturday Meta lead audit completed. Inbox failures: ${metrics.inboxFailed}; manual reviews: ${metrics.manualReviewCount}; ambiguous matches: ${metrics.ambiguousMatchCount}. No duplicate Lead was created automatically.`,
      }).catch(() => {});
    }
    return { ok: true, status: "success" as const, runKey, ...metrics, durationMs: completedAt - at };
  } catch (error) {
    const completedAt = Date.now();
    const errorCode = classifyAuditError(error);
    await db.update(metaWeeklyLeadAuditRuns).set({
      status: "failed",
      completedAt,
      durationMs: completedAt - at,
      errorCode,
    }).where(eq(metaWeeklyLeadAuditRuns.id, run.id));
    await db.update(metaWeeklyLeadAuditSettings).set({
      lastFailureAt: completedAt,
      lastErrorCode: errorCode,
      updatedAt: completedAt,
    }).where(eq(metaWeeklyLeadAuditSettings.id, settings.id));
    await notifyOwner({
      title: "Weekly Meta lead audit failed",
      content: `Saturday Meta lead audit failed with ${errorCode}. Check the scheduled job diagnostics; no Leads, contracts, or Meta ads were changed by the audit failure.`,
    }).catch(() => {});
    throw new Error(errorCode);
  }
}
