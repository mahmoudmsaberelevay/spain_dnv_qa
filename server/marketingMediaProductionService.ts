import crypto from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { storagePut } from "./storage";
import { generateElevayVideoVoiceOver } from "./elevenLabsTts";
import { composeApprovedReelForReview } from "./reelCompositorService";
import {
  marketingGeneratedMediaAssets,
  marketingMediaProductionControls,
  marketingMediaProductionJobs,
  marketingWeeklyResultsItemEvents,
  marketingWeeklyResultsItems,
  marketingWeeklyResultsPlans,
} from "../drizzle/schema";
import { currentCairoWeekStart } from "../shared/marketingWeeklyResults";
import { isCreativeItemType } from "../shared/marketingCreativeLanguagePolicy";
import { ELEVAY_AGENTIC_DESIGN_STANDARD } from "../shared/elevayAgenticDesignStandard";
import { checkManusMediaAuthentication, mediaCredential, requireManusMediaAuthentication, MANUS_MEDIA_AUTH_MESSAGE } from "./manusMediaAuthentication";
import { estimateMediaCompletion } from "../shared/marketingMediaEta";
import { applyOfficialElevayLogoToStatic } from "./elevayBrandMedia";
import { mediaRendererReadiness, requireMediaRenderer } from "./mediaExecutables";

const CONTROL_KEY = "primary-manus-review-media";
const MONTHLY_CAP_USD = 100;
const PER_ITEM_CAP_USD = 1.5;

type WeeklyItem = typeof marketingWeeklyResultsItems.$inferSelect;

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Media generation failed.").replace(/(?:sk-|key-|Bearer\s+)[A-Za-z0-9._-]+/g, "[redacted]").slice(0, 900);
}
function manusCredentialForMedia() {
  const { value, fingerprint } = mediaCredential();
  if (value.length < 20) throw new Error("Manus media credential is unavailable or malformed.");
  return { value, fingerprint };
}
async function manusTaskRequestError(response: Response) {
  if (response.status === 401) return new Error(MANUS_MEDIA_AUTH_MESSAGE);
  const body = await response.json().catch(() => null) as { error?: { code?: unknown; message?: unknown } } | null;
  const code = typeof body?.error?.code === "string" ? body.error.code.slice(0, 80) : "unknown_error";
  const message = typeof body?.error?.message === "string" ? body.error.message.replace(/[\r\n]+/g, " ").slice(0, 280) : "no error message";
  return new Error(`Manus media task request failed with status ${response.status} (${code}: ${message}).`);
}
function jobKey() { return `mmp-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 10)}`; }
function snapshotHash(item: WeeklyItem) {
  return crypto.createHash("sha256").update(JSON.stringify({
    id: item.id, itemType: item.itemType, title: item.title, programme: item.programKey,
    objective: item.objective, creativeDirection: item.creativeDirection, visualBrief: item.visualBrief,
    script: item.scriptCopy, caption: item.caption, metadata: item.metadataJson,
  })).digest("hex");
}
function mediaKind(item: WeeklyItem) { return item.itemType === "reel" ? "reel" : "static"; }
function systemGeneratedEnglishVisualText(item: WeeklyItem) {
  const programme = (item.programKey ?? "").toLowerCase();
  if (programme.includes("spain")) return "Spain Digital Nomad\nElevay";
  if (programme.includes("malta")) return "Malta Residency\nElevay";
  if (programme.includes("portugal")) return "Portugal Residency\nElevay";
  if (programme.includes("greece")) return "Greece Golden Visa\nElevay";
  if (programme.includes("caribbean") || programme.includes("dominica") || programme.includes("grenada") || programme.includes("antigua") || programme.includes("lucia") || programme.includes("kitts")) return "Caribbean Citizenship\nElevay";
  return "Global Mobility\nElevay";
}
async function prepareSystemGeneratedVisualText(db: any, item: WeeklyItem) {
  if (mediaKind(item) !== "static") return item;
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(item.metadataJson || "{}") as Record<string, unknown>; } catch { /* replace only malformed derived metadata */ }
  const onScreenEnglishText = systemGeneratedEnglishVisualText(item);
  const metadataJson = JSON.stringify({ ...metadata, onScreenEnglishText, onScreenEnglishTextSource: "system_generated" });
  if (metadataJson !== item.metadataJson) {
    await db.update(marketingWeeklyResultsItems).set({ metadataJson, updatedAt: Date.now() }).where(eq(marketingWeeklyResultsItems.id, item.id));
  }
  return { ...item, metadataJson };
}
function currentCairoMonth() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}`;
}
function dbOrThrow() { return getDb().then(db => { if (!db) throw new Error("Marketing database unavailable."); return db; }); }

async function controlOrThrow() {
  const db = await dbOrThrow();
  const [control] = await db.select().from(marketingMediaProductionControls)
    .where(eq(marketingMediaProductionControls.controlKey, CONTROL_KEY)).limit(1);
  if (!control?.isEnabled || control.state !== "active") throw new Error("Manus review-media production is disabled.");
  if (Number(control.monthlyBudgetUsd) > MONTHLY_CAP_USD || Number(control.perItemBudgetUsd) > PER_ITEM_CAP_USD) throw new Error("Media-production control exceeds its owner-approved cap.");
  if (!mediaCredential().value) throw new Error(MANUS_MEDIA_AUTH_MESSAGE);
  return { db, control };
}

export async function getMediaProductionReadiness() {
  const [auth, renderer] = await Promise.all([checkManusMediaAuthentication(), mediaRendererReadiness()]);
  const db = await dbOrThrow();
  const [control] = await db.select().from(marketingMediaProductionControls).where(eq(marketingMediaProductionControls.controlKey, CONTROL_KEY)).limit(1);
  const month = currentCairoMonth();
  const [totals] = await db.select({ total: sql<string>`COALESCE(SUM(${marketingMediaProductionJobs.reservedCostUsd}), 0)` })
    .from(marketingMediaProductionJobs).where(sql`DATE_FORMAT(FROM_UNIXTIME(${marketingMediaProductionJobs.createdAt} / 1000), '%Y-%m') = ${month}`);
  const jobs = await db.select().from(marketingMediaProductionJobs).orderBy(desc(marketingMediaProductionJobs.createdAt)).limit(80);
  const now = Date.now();
  return {
    control: control ? { isEnabled: control.isEnabled, state: control.state, monthlyBudgetUsd: Number(control.monthlyBudgetUsd), perItemBudgetUsd: Number(control.perItemBudgetUsd), providerAlias: control.providerAlias, lastError: control.lastError } : null,
    month, budgetUsedUsd: Number(totals?.total ?? 0), providerAuthentication: { ready: auth.ready, checkedAt: auth.checkedAt, message: auth.ready ? null : MANUS_MEDIA_AUTH_MESSAGE }, renderer: { ready: renderer.ready, checkedAt: renderer.checkedAt }, jobs: jobs.slice(0, 48).map(job => ({ id: job.id, weeklyItemId: job.weeklyItemId, mediaKind: job.mediaKind, state: job.state, reservedCostUsd: Number(job.reservedCostUsd), manusTaskUrl: job.manusTaskUrl, errorSummary: job.errorSummary, createdAt: job.createdAt, updatedAt: job.updatedAt, eta: estimateMediaCompletion(job, jobs, now) })),
  };
}

function mediaPrompt(item: WeeklyItem, kind: "static" | "reel") {
  const common = [
    "You are producing exactly one review-only ELEVAY marketing visual from an approved CRM plan item.",
    "Use only the supplied internal brief; do not browse or cite external/government sources, do not invent legal claims, and never include personal/client/Lead/contact information.",
    ELEVAY_AGENTIC_DESIGN_STANDARD,
    `Title: ${item.title}`, `Programme key: ${item.programKey ?? "not specified"}`, `Objective: ${item.objective}`,
    `Creative direction: ${item.creativeDirection ?? "Follow the ELEVAY Design System."}`,
    `Visual brief: ${item.visualBrief ?? "Use a premium, trustworthy educational visual."}`,
  ];
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(item.metadataJson || "{}") as Record<string, unknown>; } catch { /* derived metadata is optional */ }
  const revisionInstruction = typeof metadata.latestRevisionInstruction === "string" ? metadata.latestRevisionInstruction.trim() : "";
  if (revisionInstruction) {
    common.push(`Mandatory owner revision instruction: ${revisionInstruction}`, "Replace the prior design completely. Do not recreate, retain, or refer to the prior preview.");
  }
  if (kind === "reel") return [...common,
    "Create one vertical 9:16 MP4 narrative reel, 15–30 seconds, no embedded on-screen text, no spoken narration, no music, NO logo or brand mark. The CRM adds narration and the exact official logo outro after generation. Never recreate the logo with AI. Return exactly one playable MP4 attachment.",
  ].join("\n");
  const englishText = typeof metadata.onScreenEnglishText === "string" && metadata.onScreenEnglishText.trim()
    ? metadata.onScreenEnglishText.trim() : systemGeneratedEnglishVisualText(item);
  return [...common,
    `Create one finished ELEVAY static social image, portrait 4:5. Render this exact English-only in-design text with premium readable typography: ${englishText}. Do not render Arabic or any other visible text. Leave the upper-left 350×120 px quiet and free of typography. DO NOT generate or imitate an ELEVAY logo or brand mark: the CRM adds the exact official source logo after generation. Return exactly one PNG or JPEG attachment.`,
  ].join("\n");
}

async function hideManusTaskFromList(taskId: string) {
  try {
    const credential = manusCredentialForMedia();
    await fetch("https://api.manus.ai/v2/task.update", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-manus-api-key": credential.value },
      body: JSON.stringify({ task_id: taskId, enable_visible_in_task_list: false, share_visibility: "private" }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    // List visibility does not affect CRM-owned media safety, idempotency, or review state.
  }
}

async function dispatchManusMediaTask(item: WeeklyItem, kind: "static" | "reel") {
  const credential = manusCredentialForMedia();
  console.info("[Marketing media] Dispatching Manus task", { kind, keyFingerprint: credential.fingerprint });
  const response = await fetch("https://api.manus.ai/v2/task.create", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-manus-api-key": credential.value },
    body: JSON.stringify({
      title: `ELEVAY review preview — ${item.id} — ${kind}`,
      interactive_mode: false,
      hide_in_task_list: true,
      // Use the same authenticated task profile as the proven weekly planner.
      // Default account skills remain available without an extra skill-authorization boundary.
      agent_profile: "standard",
      message: { content: mediaPrompt(item, kind) },
    }),
  });
  if (!response.ok) {
    console.error("[Marketing media] Manus task dispatch failed", { kind, status: response.status, keyFingerprint: credential.fingerprint });
    throw await manusTaskRequestError(response);
  }
  const body = await response.json() as { task_id?: string; task_url?: string; task_detail?: { task_id?: string; task_url?: string } };
  const taskId = body.task_id ?? body.task_detail?.task_id;
  if (!taskId) throw new Error("Manus media task did not return an identifier.");
  await hideManusTaskFromList(taskId);
  return { taskId, taskUrl: body.task_url ?? body.task_detail?.task_url ?? null };
}

async function monthlyMediaBudgetRemaining(db: Awaited<ReturnType<typeof dbOrThrow>>, control: { monthlyBudgetUsd: unknown }) {
  const [totalRow] = await db.select({ total: sql<string>`COALESCE(SUM(${marketingMediaProductionJobs.reservedCostUsd}), 0)` })
    .from(marketingMediaProductionJobs)
    .where(sql`DATE_FORMAT(FROM_UNIXTIME(${marketingMediaProductionJobs.createdAt} / 1000), '%Y-%m') = ${currentCairoMonth()}`);
  return Number(control.monthlyBudgetUsd) - Number(totalRow?.total ?? 0);
}

async function dispatchSystemMediaForWeeklyItem(input: {
  db: Awaited<ReturnType<typeof dbOrThrow>>;
  control: { perItemBudgetUsd: unknown };
  item: WeeklyItem;
  actorUserId: number;
}) {
  await requireManusMediaAuthentication();
  await requireMediaRenderer();
  const preparedItem = await prepareSystemGeneratedVisualText(input.db, input.item);
  const snapshot = snapshotHash(preparedItem);
  const kind = mediaKind(preparedItem);
  const idempotencyKey = `manus-review-media:${preparedItem.id}:${snapshot}`;
  const reservedCostUsd = Number(input.control.perItemBudgetUsd);
  const [existing] = await input.db.select().from(marketingMediaProductionJobs).where(eq(marketingMediaProductionJobs.idempotencyKey, idempotencyKey)).limit(1);
  if (existing) {
    if (existing.state === "dispatching" && !existing.manusTaskId) {
      await input.db.update(marketingMediaProductionJobs).set({
        state: "failed", errorCode: "orphaned_dispatch",
        errorSummary: "The prior dispatch stopped before a task ID was saved; it was released for one clean retry.",
        completedAt: Date.now(), updatedAt: Date.now(), idempotencyKey: `${existing.idempotencyKey}:released:${existing.id}`,
      }).where(eq(marketingMediaProductionJobs.id, existing.id));
    } else {
      return { itemId: preparedItem.id, jobId: existing.id, taskUrl: existing.manusTaskUrl, reused: true };
    }
  }
  const now = Date.now();
  const [inserted] = await input.db.insert(marketingMediaProductionJobs).values({
    jobKey: jobKey(), idempotencyKey, weeklyItemId: preparedItem.id, itemSnapshotHash: snapshot,
    mediaKind: kind, state: "dispatching", reservedCostUsd: reservedCostUsd.toFixed(2),
    manusTaskId: null, manusTaskUrl: null, taskAttachmentsJson: "[]", errorCode: null,
    errorSummary: null, requestedByUserId: input.actorUserId, createdAt: now, updatedAt: now, completedAt: null,
  });
  const jobId = Number((inserted as { insertId?: number }).insertId);
  if (!Number.isInteger(jobId) || jobId < 1) throw new Error("Media-production job persistence did not return an identifier.");
  try {
    const task = await dispatchManusMediaTask(preparedItem, kind);
    await input.db.update(marketingMediaProductionJobs).set({ state: "waiting_manus", manusTaskId: task.taskId, manusTaskUrl: task.taskUrl, updatedAt: Date.now() }).where(eq(marketingMediaProductionJobs.id, jobId));
    return { itemId: preparedItem.id, jobId, taskUrl: task.taskUrl, reused: false };
  } catch (error) {
    await input.db.update(marketingMediaProductionJobs).set({ state: "failed", errorCode: "dispatch_failed", errorSummary: safeError(error), reservedCostUsd: error instanceof Error && error.message === MANUS_MEDIA_AUTH_MESSAGE ? "0.00" : reservedCostUsd.toFixed(2), completedAt: Date.now(), updatedAt: Date.now() }).where(eq(marketingMediaProductionJobs.id, jobId));
    throw error;
  }
}

export async function queueSystemMediaForWeeklyPlan(input: { planId: number; actorUserId: number }) {
  const { db, control } = await controlOrThrow();
  await requireManusMediaAuthentication();
  await requireMediaRenderer();
  const items = await db.select().from(marketingWeeklyResultsItems).where(and(eq(marketingWeeklyResultsItems.planId, input.planId), eq(marketingWeeklyResultsItems.isSelected, true)));
  const creatives = items.filter(item => isCreativeItemType(item.itemType) && !item.previewHash);
  const [totalRow] = await db.select({ total: sql<string>`COALESCE(SUM(${marketingMediaProductionJobs.reservedCostUsd}), 0)` }).from(marketingMediaProductionJobs)
    .where(sql`DATE_FORMAT(FROM_UNIXTIME(${marketingMediaProductionJobs.createdAt} / 1000), '%Y-%m') = ${currentCairoMonth()}`);
  const remaining = Number(control.monthlyBudgetUsd) - Number(totalRow?.total ?? 0);
  const cost = Number(control.perItemBudgetUsd);
  if (creatives.length === 0) return { queued: 0, reused: items.length, remainingUsd: remaining };
  if (creatives.length * cost > remaining + 1e-9) throw new Error(`The remaining review-media budget is USD ${remaining.toFixed(2)}; this plan needs USD ${(creatives.length * cost).toFixed(2)} at the USD ${cost.toFixed(2)} per-item cap.`);
  const results: Array<{ itemId: number; jobId: number; taskUrl: string | null; reused: boolean }> = [];
  for (const item of creatives) {
    const preparedItem = await prepareSystemGeneratedVisualText(db, item);
    const snapshot = snapshotHash(preparedItem); const kind = mediaKind(preparedItem); const idempotencyKey = `manus-review-media:${preparedItem.id}:${snapshot}`;
    const [existing] = await db.select().from(marketingMediaProductionJobs).where(eq(marketingMediaProductionJobs.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) {
      if (existing.state === "dispatching" && !existing.manusTaskId) {
        await db.update(marketingMediaProductionJobs).set({
          state: "failed", errorCode: "orphaned_dispatch",
          errorSummary: "The prior dispatch stopped before a task ID was saved; it was released for one clean retry.",
          completedAt: Date.now(), updatedAt: Date.now(), idempotencyKey: `${existing.idempotencyKey}:released:${existing.id}`,
        }).where(eq(marketingMediaProductionJobs.id, existing.id));
      } else { results.push({ itemId: item.id, jobId: existing.id, taskUrl: existing.manusTaskUrl, reused: true }); continue; }
    }
    const now = Date.now();
    const [inserted] = await db.insert(marketingMediaProductionJobs).values({ jobKey: jobKey(), idempotencyKey, weeklyItemId: item.id, itemSnapshotHash: snapshot, mediaKind: kind, state: "dispatching", reservedCostUsd: control.perItemBudgetUsd, manusTaskId: null, manusTaskUrl: null, taskAttachmentsJson: "[]", errorCode: null, errorSummary: null, requestedByUserId: input.actorUserId, createdAt: now, updatedAt: now, completedAt: null });
    const jobId = Number((inserted as { insertId?: number }).insertId);
    if (!Number.isInteger(jobId) || jobId < 1) throw new Error("Media-production job persistence did not return an identifier.");
    try {
      const task = await dispatchManusMediaTask(preparedItem, kind);
      await db.update(marketingMediaProductionJobs).set({ state: "waiting_manus", manusTaskId: task.taskId, manusTaskUrl: task.taskUrl, updatedAt: Date.now() }).where(eq(marketingMediaProductionJobs.id, jobId));
      results.push({ itemId: item.id, jobId, taskUrl: task.taskUrl, reused: false });
    } catch (error) {
      await db.update(marketingMediaProductionJobs).set({ state: "failed", errorCode: "dispatch_failed", errorSummary: safeError(error), reservedCostUsd: error instanceof Error && error.message === MANUS_MEDIA_AUTH_MESSAGE ? "0.00" : control.perItemBudgetUsd, completedAt: Date.now(), updatedAt: Date.now() }).where(eq(marketingMediaProductionJobs.id, jobId));
      throw error;
    }
  }
  return { queued: results.filter(result => !result.reused).length, reused: results.filter(result => result.reused).length, remainingUsd: remaining - creatives.length * cost, jobs: results };
}

/**
 * A requested change creates one replacement preview from the owner's comment.
 * The old preview is removed from the active CRM media library; only the
 * privacy-safe feedback event and preference memory remain for future learning.
 */
export async function regenerateSystemMediaFromFeedback(input: { itemId: number; actorUserId: number; revisionInstruction: string }) {
  const { db, control } = await controlOrThrow();
  await requireManusMediaAuthentication();
  const [item] = await db.select().from(marketingWeeklyResultsItems).where(eq(marketingWeeklyResultsItems.id, input.itemId)).limit(1);
  if (!item) throw new Error("Weekly marketing item was not found.");
  if (!item.isSelected || !isCreativeItemType(item.itemType)) throw new Error("Only a selected creative item can receive a replacement preview.");
  const remaining = await monthlyMediaBudgetRemaining(db, control);
  if (remaining + 1e-9 < Number(control.perItemBudgetUsd)) throw new Error("The review-media monthly limit has no remaining capacity for this replacement.");
  let metadata: Record<string, unknown> = {};
  try { metadata = JSON.parse(item.metadataJson || "{}") as Record<string, unknown>; } catch { /* replace malformed derived metadata */ }
  const now = Date.now();
  const revisionMetadata = JSON.stringify({ ...metadata, latestRevisionInstruction: input.revisionInstruction, latestRevisionRequestedAt: now, latestRevisionSource: "individual_owner_feedback" });
  await db.transaction(async tx => {
    // The former asset is never selectable or previewable after a requested change.
    await tx.delete(marketingGeneratedMediaAssets).where(eq(marketingGeneratedMediaAssets.weeklyItemId, item.id));
    await tx.update(marketingWeeklyResultsItems).set({
      previewUrl: null, previewHash: null, metadataJson: revisionMetadata, status: "changes_requested",
      blockedReason: "System is generating the replacement from the submitted comment.", lastEditedByUserId: input.actorUserId, updatedAt: now,
    }).where(eq(marketingWeeklyResultsItems.id, item.id));
  });
  const refreshed = { ...item, previewUrl: null, previewHash: null, metadataJson: revisionMetadata, status: "changes_requested" as const, updatedAt: now };
  return dispatchSystemMediaForWeeklyItem({ db, control, item: refreshed, actorUserId: input.actorUserId });
}

/** Regenerate the selected, unapproved creative items of only the current Cairo week. */
export async function regenerateCurrentWeekSystemMedia(input: { planId: number; actorUserId: number }) {
  const { db, control } = await controlOrThrow();
  await requireManusMediaAuthentication();
  await requireMediaRenderer();
  const [latest] = await db.select().from(marketingWeeklyResultsPlans)
    .where(eq(marketingWeeklyResultsPlans.periodStart, currentCairoWeekStart()))
    .orderBy(desc(marketingWeeklyResultsPlans.version)).limit(1);
  if (!latest || latest.id !== input.planId) throw new Error("Regeneration is available only for the latest plan of the current Cairo week.");
  const rows = await db.select().from(marketingWeeklyResultsItems).where(eq(marketingWeeklyResultsItems.planId, latest.id));
  const creatives = rows.filter(row => row.isSelected && ["static_post", "reel"].includes(row.itemType) && !["approved", "stopped", "superseded", "rejected"].includes(row.status));
  if (!creatives.length) throw new Error("No unapproved static posts or reels are eligible for current-week regeneration.");
  const active = await db.select({ itemId: marketingMediaProductionJobs.weeklyItemId }).from(marketingMediaProductionJobs)
    .where(and(inArray(marketingMediaProductionJobs.weeklyItemId, creatives.map(row => row.id)), inArray(marketingMediaProductionJobs.state, ["dispatching", "waiting_manus", "processing", "waiting_input"])));
  if (active.length) throw new Error("Some media tasks are still active. Wait for their verified completion before regenerating this week's previews.");
  const remaining = await monthlyMediaBudgetRemaining(db, control);
  const required = creatives.length * Number(control.perItemBudgetUsd);
  if (remaining + 1e-9 < required) throw new Error(`This week's new previews need USD ${required.toFixed(2)}; the remaining monthly media budget is USD ${remaining.toFixed(2)}. Nothing was dispatched.`);
  const jobs = [];
  for (const item of creatives) {
    const [feedback] = await db.select({ feedback: marketingWeeklyResultsItemEvents.feedback }).from(marketingWeeklyResultsItemEvents)
      .where(and(eq(marketingWeeklyResultsItemEvents.itemId, item.id), eq(marketingWeeklyResultsItemEvents.action, "individual_send_back")))
      .orderBy(desc(marketingWeeklyResultsItemEvents.createdAt)).limit(1);
    const note = feedback?.feedback ? ` Owner's most recent comment: ${feedback.feedback.slice(0, 1200)}` : "";
    jobs.push(await regenerateSystemMediaFromFeedback({ itemId: item.id, actorUserId: input.actorUserId, revisionInstruction: `Owner requested a fresh current-week version. Apply the active ELEVAY design instructions, Egyptian-Arabic copy and the exact item objective. Do not retain the old preview in the active media library.${note}` }));
  }
  return { weekStart: latest.periodStart, queued: jobs.length, skipped: rows.length - creatives.length, jobs, monthlyRemainingAfterReservationUsd: remaining - required, publicationEnabled: false as const };
}

const MAX_AUTOMATIC_MEDIA_RETRIES = 1;

export async function retryFailedMarketingMediaJob(input: { jobId: number; actorUserId: number; automatic: boolean }) {
  const { db, control } = await controlOrThrow();
  await requireManusMediaAuthentication();
  const [job] = await db.select().from(marketingMediaProductionJobs).where(eq(marketingMediaProductionJobs.id, input.jobId)).limit(1);
  if (!job) throw new Error("Media production job was not found.");
  if (job.state !== "failed") throw new Error("Only a failed media job can be retried.");
  if (job.errorSummary?.includes("retry_dispatched=")) return { retried: false, reason: "retry_already_dispatched" as const };
  const retryCount = (job.errorSummary?.match(/retry_count=(\d+)/)?.[1] ? Number(job.errorSummary.match(/retry_count=(\d+)/)?.[1]) : 0);
  if (input.automatic && retryCount >= MAX_AUTOMATIC_MEDIA_RETRIES) return { retried: false, reason: "automatic_retry_limit_reached" as const };
  const [item] = await db.select().from(marketingWeeklyResultsItems).where(eq(marketingWeeklyResultsItems.id, job.weeklyItemId)).limit(1);
  if (!item || snapshotHash(item) !== job.itemSnapshotHash) throw new Error("The item changed after the failed generation. Review the changed item before starting a new preview.");
  const [totalRow] = await db.select({ total: sql<string>`COALESCE(SUM(${marketingMediaProductionJobs.reservedCostUsd}), 0)` }).from(marketingMediaProductionJobs)
    .where(sql`DATE_FORMAT(FROM_UNIXTIME(${marketingMediaProductionJobs.createdAt} / 1000), '%Y-%m') = ${currentCairoMonth()}`);
  const remaining = Number(control.monthlyBudgetUsd) - Number(totalRow?.total ?? 0);
  if (remaining + 1e-9 < Number(control.perItemBudgetUsd)) throw new Error("The review-media monthly limit has no remaining retry capacity.");
  const now = Date.now();
  const nextRetry = retryCount + 1;
  const idempotencyKey = `${job.idempotencyKey}:retry:${nextRetry}`;
  const [inserted] = await db.insert(marketingMediaProductionJobs).values({
    jobKey: jobKey(), idempotencyKey, weeklyItemId: job.weeklyItemId, itemSnapshotHash: job.itemSnapshotHash,
    mediaKind: job.mediaKind, state: "dispatching", reservedCostUsd: control.perItemBudgetUsd,
    manusTaskId: null, manusTaskUrl: null, taskAttachmentsJson: "[]", errorCode: null,
    errorSummary: `retry_count=${nextRetry}; ${input.automatic ? "automatic" : "owner_requested"} retry`,
    requestedByUserId: input.actorUserId, createdAt: now, updatedAt: now, completedAt: null,
  });
  const retryJobId = Number((inserted as { insertId?: number }).insertId);
  if (!Number.isInteger(retryJobId) || retryJobId < 1) throw new Error("Media retry persistence did not return an identifier.");
  try {
    const task = await dispatchManusMediaTask(item, job.mediaKind as "static" | "reel");
    await db.update(marketingMediaProductionJobs).set({ state: "waiting_manus", manusTaskId: task.taskId, manusTaskUrl: task.taskUrl, updatedAt: Date.now() }).where(eq(marketingMediaProductionJobs.id, retryJobId));
    await db.update(marketingMediaProductionJobs).set({ errorSummary: `${job.errorSummary ?? "failed"}; retry_dispatched=${retryJobId}`, updatedAt: Date.now() }).where(eq(marketingMediaProductionJobs.id, job.id));
    return { retried: true, jobId: retryJobId, taskUrl: task.taskUrl };
  } catch (error) {
    await db.update(marketingMediaProductionJobs).set({ state: "failed", errorCode: "retry_dispatch_failed", errorSummary: `retry_count=${nextRetry}; ${safeError(error)}`, reservedCostUsd: error instanceof Error && error.message === MANUS_MEDIA_AUTH_MESSAGE ? "0.00" : control.perItemBudgetUsd, completedAt: Date.now(), updatedAt: Date.now() }).where(eq(marketingMediaProductionJobs.id, retryJobId));
    throw error;
  }
}

function pickAttachment(attachments: Array<{ file_name?: unknown; filename?: unknown; url?: unknown }>, kind: string) {
  return attachments.find(file => {
    const filename = typeof file.file_name === "string" ? file.file_name : typeof file.filename === "string" ? file.filename : null;
    if (typeof file.url !== "string" || !filename) return false;
    return kind === "reel" ? /\.mp4$/i.test(filename) : /\.(png|jpe?g|webp)$/i.test(filename);
  }) ?? null;
}

async function applyMarketingMediaManusWebhookUnsafe(payload: any) {
  if (payload?.event_type !== "task_stopped" || payload?.task_detail?.stop_reason !== "finish") return false;
  const taskId = typeof payload.task_detail?.task_id === "string" ? payload.task_detail.task_id : null;
  if (!taskId) return false;
  const db = await dbOrThrow();
  const [job] = await db.select().from(marketingMediaProductionJobs).where(eq(marketingMediaProductionJobs.manusTaskId, taskId)).limit(1);
  if (!job || !["waiting_manus", "waiting_input"].includes(job.state)) return false;
  // The signed webhook and the background scheduler may observe the same stop.
  const [claimed] = await db.update(marketingMediaProductionJobs).set({ state: "processing", updatedAt: Date.now() })
    .where(and(eq(marketingMediaProductionJobs.id, job.id), sql`${marketingMediaProductionJobs.state} IN ('waiting_manus', 'waiting_input')`));
  if (Number((claimed as { affectedRows?: number })?.affectedRows ?? 0) !== 1) return false;
  const attachments = Array.isArray(payload.task_detail?.attachments) ? payload.task_detail.attachments : [];
  const attachment = pickAttachment(attachments, job.mediaKind);
  if (!attachment || typeof attachment.url !== "string") throw new Error("Manus media task completed without the required visual attachment.");
  const source = await fetch(attachment.url, { signal: AbortSignal.timeout(90_000) });
  if (!source.ok) throw new Error("Generated media attachment could not be downloaded.");
  let bytes: Buffer = Buffer.from(await source.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 80 * 1024 * 1024) throw new Error("Generated media attachment is empty or exceeds the review limit.");
  let exactLogoSha256: string | null = null;
  if (job.mediaKind !== "reel") {
    const branded = await applyOfficialElevayLogoToStatic(bytes);
    bytes = branded.bytes;
    exactLogoSha256 = branded.logoSha256;
  }
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const mimeType = job.mediaKind === "reel" ? "video/mp4" : "image/png";
  const extension = job.mediaKind === "reel" ? "mp4" : "png";
  const storageKey = `marketing/system-media/${job.weeklyItemId}/${sha256}.${extension}`;
  const stored = await storagePut(storageKey, bytes, mimeType);
  const now = Date.now();
  if (job.mediaKind === "reel") {
    const [item] = await db.select().from(marketingWeeklyResultsItems).where(eq(marketingWeeklyResultsItems.id, job.weeklyItemId)).limit(1);
    if (!item?.scriptCopy) throw new Error("A reel requires its final Arabic script before narration composition.");
    const narration = await generateElevayVideoVoiceOver(item.scriptCopy);
    const composed = await composeApprovedReelForReview({ weeklyItemId: item.id, sourceVideo: { url: stored.url, sha256, mimeType }, narration: { url: narration.url, sha256: narration.sha256, mimeType: "audio/mpeg" } });
    await db.update(marketingGeneratedMediaAssets).set({ status: "superseded", supersededAt: now, updatedAt: now }).where(and(eq(marketingGeneratedMediaAssets.weeklyItemId, item.id), eq(marketingGeneratedMediaAssets.status, "review_ready"), isNull(marketingGeneratedMediaAssets.supersededAt)));
    await db.insert(marketingGeneratedMediaAssets).values({ assetKey: `system-media:reel:${item.id}:${composed.outputSha256}`, weeklyItemId: item.id, contentPacketId: null, assetType: "reel", providerAlias: "manus-orchestrator", origin: "system_generated", generationTaskId: taskId, status: "review_ready", storageKey: composed.outputStorageKey, assetUrl: composed.outputUrl, assetSha256: composed.outputSha256, mimeType: "video/mp4", metadataJson: JSON.stringify({ mediaJobId: job.id, inputSourceSha256: sha256, narrationSha256: narration.sha256, narrationScript: narration.script, reviewOnly: true }), supersededAt: null, generatedAt: now, createdAt: now, updatedAt: now });
    let currentMetadata: Record<string, unknown> = {};
    try { currentMetadata = JSON.parse(item.metadataJson || "{}"); } catch { /* replace malformed optional metadata */ }
    await db.update(marketingWeeklyResultsItems).set({ previewUrl: composed.outputUrl, previewHash: composed.outputSha256, status: "draft", blockedReason: null, metadataJson: JSON.stringify({ ...currentMetadata, finalNarrationScript: narration.script, narrationLanguage: "Egyptian Arabic" }), updatedAt: now }).where(eq(marketingWeeklyResultsItems.id, item.id));
  } else {
    await db.update(marketingGeneratedMediaAssets).set({ status: "superseded", supersededAt: now, updatedAt: now }).where(and(eq(marketingGeneratedMediaAssets.weeklyItemId, job.weeklyItemId), eq(marketingGeneratedMediaAssets.status, "review_ready"), isNull(marketingGeneratedMediaAssets.supersededAt)));
    await db.insert(marketingGeneratedMediaAssets).values({ assetKey: `system-media:static:${job.weeklyItemId}:${sha256}`, weeklyItemId: job.weeklyItemId, contentPacketId: null, assetType: "static", providerAlias: "manus-orchestrator", origin: "system_generated", generationTaskId: taskId, status: "review_ready", storageKey, assetUrl: stored.url, assetSha256: sha256, mimeType, metadataJson: JSON.stringify({ mediaJobId: job.id, exactOfficialLogoSha256: exactLogoSha256, reviewOnly: true }), supersededAt: null, generatedAt: now, createdAt: now, updatedAt: now });
    await db.update(marketingWeeklyResultsItems).set({ previewUrl: stored.url, previewHash: sha256, status: "draft", blockedReason: null, updatedAt: now }).where(eq(marketingWeeklyResultsItems.id, job.weeklyItemId));
  }
  await db.update(marketingMediaProductionJobs).set({ state: "completed", taskAttachmentsJson: JSON.stringify(attachments.map((attachment: any) => ({ file_name: attachment.file_name, size_bytes: attachment.size_bytes }))), completedAt: now, updatedAt: now }).where(eq(marketingMediaProductionJobs.id, job.id));
  return true;
}

export async function applyMarketingMediaManusWebhook(payload: any) {
  const taskId = typeof payload?.task_detail?.task_id === "string" ? payload.task_detail.task_id : null;
  try {
    return await applyMarketingMediaManusWebhookUnsafe(payload);
  } catch (error) {
    if (!taskId) throw error;
    const db = await dbOrThrow();
    const [job] = await db.select().from(marketingMediaProductionJobs).where(eq(marketingMediaProductionJobs.manusTaskId, taskId)).limit(1);
    if (!job || job.state === "completed") throw error;
    await db.update(marketingMediaProductionJobs).set({ state: "failed", errorCode: "completion_failed", errorSummary: safeError(error), completedAt: Date.now(), updatedAt: Date.now() }).where(eq(marketingMediaProductionJobs.id, job.id));
    try { await retryFailedMarketingMediaJob({ jobId: job.id, actorUserId: job.requestedByUserId, automatic: true }); } catch { /* one bounded retry is best-effort; failure remains visible in Production */ }
    return true;
  }
}

function collectTaskAttachments(value: unknown): Array<{ filename?: string; file_name?: string; url?: string }> {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectTaskAttachments);
  const record = value as Record<string, unknown>;
  const own = typeof record.url === "string" && (typeof record.filename === "string" || typeof record.file_name === "string")
    ? [{ url: record.url, filename: typeof record.filename === "string" ? record.filename : undefined, file_name: typeof record.file_name === "string" ? record.file_name : undefined }]
    : [];
  return [...own, ...Object.values(record).flatMap(collectTaskAttachments)];
}

export async function reconcileWaitingMarketingMediaJobs() {
  const auth = await checkManusMediaAuthentication();
  if (!auth.ready) return { checked: 0, blocked: "provider_authentication", refreshedAt: Date.now() };
  if (!(await mediaRendererReadiness()).ready) return { checked: 0, blocked: "renderer_unavailable", refreshedAt: Date.now() };
  const key = mediaCredential().value;
  const db = await dbOrThrow();
  const now = Date.now();
  // A runtime restart may interrupt local composition after the Manus task
  // stops. Recover from that same task, not a duplicate provider generation.
  await db.update(marketingMediaProductionJobs).set({ state: "waiting_manus", updatedAt: now, errorSummary: "Interrupted composition is being recovered from the existing task." })
    .where(and(eq(marketingMediaProductionJobs.state, "processing"), sql`${marketingMediaProductionJobs.updatedAt} < ${now - 10 * 60_000}`));
  const jobs = await db.select().from(marketingMediaProductionJobs)
    .where(sql`${marketingMediaProductionJobs.state} IN ('waiting_manus', 'waiting_input')`).orderBy(marketingMediaProductionJobs.createdAt).limit(6);
  let checked = 0;
  for (const job of jobs) {
    if (!job.manusTaskId || now - job.updatedAt < 30_000) continue;
    try {
      const detailResponse = await fetch(`https://api.manus.ai/v2/task.detail?task_id=${encodeURIComponent(job.manusTaskId)}`, {
        headers: { "x-manus-api-key": key }, signal: AbortSignal.timeout(20_000),
      });
      if (!detailResponse.ok) continue;
      checked++;
      const detail = await detailResponse.json().catch(() => null) as { task?: { status?: unknown } } | null;
      const status = typeof detail?.task?.status === "string" ? detail.task.status : "unknown";
      if (status === "waiting") {
        await db.update(marketingMediaProductionJobs).set({ state: "waiting_input", updatedAt: now, errorSummary: "Manus is awaiting input or confirmation. External actions will not be authorized automatically." }).where(eq(marketingMediaProductionJobs.id, job.id));
        continue;
      }
      if (status === "running") {
        await db.update(marketingMediaProductionJobs).set({ state: "waiting_manus", updatedAt: now, errorSummary: null }).where(eq(marketingMediaProductionJobs.id, job.id));
        continue;
      }
      if (status === "error") {
        await db.update(marketingMediaProductionJobs).set({ state: "failed", errorCode: "provider_error", errorSummary: "Manus reported an error without a preview attachment.", completedAt: now, updatedAt: now }).where(eq(marketingMediaProductionJobs.id, job.id));
        await retryFailedMarketingMediaJob({ jobId: job.id, actorUserId: job.requestedByUserId, automatic: true }).catch(() => undefined);
        continue;
      }
      if (status !== "stopped") continue;
      const messagesResponse = await fetch(`https://api.manus.ai/v2/task.listMessages?task_id=${encodeURIComponent(job.manusTaskId)}&order=desc&limit=50`, {
        headers: { "x-manus-api-key": key }, signal: AbortSignal.timeout(30_000),
      });
      const messages = await messagesResponse.json().catch(() => null);
      const attachments = collectTaskAttachments(messages);
      if (pickAttachment(attachments, job.mediaKind)) {
        await applyMarketingMediaManusWebhook({ event_type: "task_stopped", task_detail: { task_id: job.manusTaskId, stop_reason: "finish", attachments } });
      } else {
        await db.update(marketingMediaProductionJobs).set({ state: "failed", errorCode: "task_stopped_without_output", errorSummary: "The hidden media task stopped without the required preview attachment.", completedAt: now, updatedAt: now }).where(eq(marketingMediaProductionJobs.id, job.id));
        await retryFailedMarketingMediaJob({ jobId: job.id, actorUserId: job.requestedByUserId, automatic: true }).catch(() => undefined);
      }
    } catch {
      // Leave the job active; a future heartbeat safely rechecks the task.
    }
  }
  await repairMissingSystemMediaPreviewLinks();
  return { checked, pending: jobs.length, refreshedAt: Date.now() };
}

async function repairMissingSystemMediaPreviewLinks() {
  const db = await dbOrThrow();
  const assets = await db.select().from(marketingGeneratedMediaAssets)
    .where(and(eq(marketingGeneratedMediaAssets.status, "review_ready"), eq(marketingGeneratedMediaAssets.origin, "system_generated"), isNull(marketingGeneratedMediaAssets.supersededAt)));
  for (const asset of assets) {
    if (!asset.weeklyItemId) continue;
    const [item] = await db.select().from(marketingWeeklyResultsItems).where(eq(marketingWeeklyResultsItems.id, asset.weeklyItemId)).limit(1);
    if (!item || item.previewUrl || item.previewHash) continue;
    await db.update(marketingWeeklyResultsItems).set({ previewUrl: asset.assetUrl, previewHash: asset.assetSha256, blockedReason: null, updatedAt: Date.now() }).where(eq(marketingWeeklyResultsItems.id, item.id));
  }
}
