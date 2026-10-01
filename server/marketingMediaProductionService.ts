import crypto from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { storagePut } from "./storage";
import { generateElevayArabicVoiceOver } from "./elevenLabsTts";
import { composeApprovedReelForReview } from "./reelCompositorService";
import {
  marketingGeneratedMediaAssets,
  marketingMediaProductionControls,
  marketingMediaProductionJobs,
  marketingWeeklyResultsItems,
} from "../drizzle/schema";
import { isCreativeItemType } from "../shared/marketingCreativeLanguagePolicy";

const CONTROL_KEY = "primary-manus-review-media";
const MONTHLY_CAP_USD = 100;
const PER_ITEM_CAP_USD = 1.5;

type WeeklyItem = typeof marketingWeeklyResultsItems.$inferSelect;

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Media generation failed.").replace(/(?:sk-|key-|Bearer\s+)[A-Za-z0-9._-]+/g, "[redacted]").slice(0, 900);
}
async function manusTaskRequestError(response: Response) {
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
  if (!ENV.manusApiKey) throw new Error("Manus server credential is unavailable.");
  return { db, control };
}

export async function getMediaProductionReadiness() {
  const db = await dbOrThrow();
  const [control] = await db.select().from(marketingMediaProductionControls).where(eq(marketingMediaProductionControls.controlKey, CONTROL_KEY)).limit(1);
  const month = currentCairoMonth();
  const [totals] = await db.select({ total: sql<string>`COALESCE(SUM(${marketingMediaProductionJobs.reservedCostUsd}), 0)` })
    .from(marketingMediaProductionJobs).where(sql`DATE_FORMAT(FROM_UNIXTIME(${marketingMediaProductionJobs.createdAt} / 1000), '%Y-%m') = ${month}`);
  const jobs = await db.select().from(marketingMediaProductionJobs).orderBy(desc(marketingMediaProductionJobs.createdAt)).limit(48);
  return {
    control: control ? { isEnabled: control.isEnabled, state: control.state, monthlyBudgetUsd: Number(control.monthlyBudgetUsd), perItemBudgetUsd: Number(control.perItemBudgetUsd), providerAlias: control.providerAlias, lastError: control.lastError } : null,
    month, budgetUsedUsd: Number(totals?.total ?? 0), jobs: jobs.map(job => ({ id: job.id, weeklyItemId: job.weeklyItemId, mediaKind: job.mediaKind, state: job.state, reservedCostUsd: Number(job.reservedCostUsd), manusTaskUrl: job.manusTaskUrl, errorSummary: job.errorSummary, createdAt: job.createdAt })),
  };
}

function mediaPrompt(item: WeeklyItem, kind: "static" | "reel") {
  const common = [
    "You are producing exactly one review-only ELEVAY marketing visual from an approved CRM plan item.",
    "Use only the supplied internal brief; do not browse or cite external/government sources, do not invent legal claims, and never include personal/client/Lead/contact information.",
    "Premium ELEVAY luxury-editorial style. Follow the supplied Design System and logo. Never add phone, email, WhatsApp, QR, URL, guarantee or promise.",
    "Every depicted person must have coherent, realistic head-to-toe clothing, polished formal footwear where appropriate, natural anatomy/hands, no random traditional headwear or cultural accessories, and continuity across shots.",
    `Title: ${item.title}`, `Programme key: ${item.programKey ?? "not specified"}`, `Objective: ${item.objective}`,
    `Creative direction: ${item.creativeDirection ?? "Follow the ELEVAY Design System."}`,
    `Visual brief: ${item.visualBrief ?? "Use a premium, trustworthy educational visual."}`,
  ];
  if (kind === "reel") return [...common,
    "Create one finished vertical 9:16 MP4 reel, 15–30 seconds, no embedded on-screen text, no spoken narration and no music. Use visual storytelling only; end with the approved ELEVAY logo outro on a white background. Return exactly one playable MP4 attachment.",
  ].join("\n");
  return [...common,
    "Create one finished ELEVAY static social image, portrait 4:5. Any visible design text must be English only; use NONE when no visual text is needed. Return exactly one PNG or JPEG attachment.",
  ].join("\n");
}

async function dispatchManusMediaTask(item: WeeklyItem, kind: "static" | "reel") {
  const response = await fetch("https://api.manus.ai/v2/task.create", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-manus-api-key": ENV.manusApiKey },
    body: JSON.stringify({
      title: `ELEVAY review preview — ${item.id} — ${kind}`,
      interactive_mode: false,
      hide_in_task_list: false,
      // Use the same authenticated task profile as the proven weekly planner.
      // Default account skills remain available without an extra skill-authorization boundary.
      agent_profile: "standard",
      message: { content: mediaPrompt(item, kind) },
    }),
  });
  if (!response.ok) throw await manusTaskRequestError(response);
  const body = await response.json() as { task_id?: string; task_url?: string; task_detail?: { task_id?: string; task_url?: string } };
  const taskId = body.task_id ?? body.task_detail?.task_id;
  if (!taskId) throw new Error("Manus media task did not return an identifier.");
  return { taskId, taskUrl: body.task_url ?? body.task_detail?.task_url ?? null };
}

export async function queueSystemMediaForWeeklyPlan(input: { planId: number; actorUserId: number }) {
  const { db, control } = await controlOrThrow();
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
    const snapshot = snapshotHash(item); const kind = mediaKind(item); const idempotencyKey = `manus-review-media:${item.id}:${snapshot}`;
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
      const task = await dispatchManusMediaTask(item, kind);
      await db.update(marketingMediaProductionJobs).set({ state: "waiting_manus", manusTaskId: task.taskId, manusTaskUrl: task.taskUrl, updatedAt: Date.now() }).where(eq(marketingMediaProductionJobs.id, jobId));
      results.push({ itemId: item.id, jobId, taskUrl: task.taskUrl, reused: false });
    } catch (error) {
      await db.update(marketingMediaProductionJobs).set({ state: "failed", errorCode: "dispatch_failed", errorSummary: safeError(error), completedAt: Date.now(), updatedAt: Date.now() }).where(eq(marketingMediaProductionJobs.id, jobId));
      throw error;
    }
  }
  return { queued: results.filter(result => !result.reused).length, reused: results.filter(result => result.reused).length, remainingUsd: remaining - creatives.length * cost, jobs: results };
}

const MAX_AUTOMATIC_MEDIA_RETRIES = 1;

export async function retryFailedMarketingMediaJob(input: { jobId: number; actorUserId: number; automatic: boolean }) {
  const { db, control } = await controlOrThrow();
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
    await db.update(marketingMediaProductionJobs).set({ state: "failed", errorCode: "retry_dispatch_failed", errorSummary: `retry_count=${nextRetry}; ${safeError(error)}`, completedAt: Date.now(), updatedAt: Date.now() }).where(eq(marketingMediaProductionJobs.id, retryJobId));
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
  if (!job || job.state === "completed") return false;
  const attachments = Array.isArray(payload.task_detail?.attachments) ? payload.task_detail.attachments : [];
  const attachment = pickAttachment(attachments, job.mediaKind);
  if (!attachment || typeof attachment.url !== "string") throw new Error("Manus media task completed without the required visual attachment.");
  const source = await fetch(attachment.url, { signal: AbortSignal.timeout(90_000) });
  if (!source.ok) throw new Error("Generated media attachment could not be downloaded.");
  const bytes = Buffer.from(await source.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 80 * 1024 * 1024) throw new Error("Generated media attachment is empty or exceeds the review limit.");
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const mimeType = job.mediaKind === "reel" ? "video/mp4" : (source.headers.get("content-type")?.split(";")[0] || "image/png");
  const extension = job.mediaKind === "reel" ? "mp4" : (mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png");
  const storageKey = `marketing/system-media/${job.weeklyItemId}/${sha256}.${extension}`;
  const stored = await storagePut(storageKey, bytes, mimeType);
  const now = Date.now();
  if (job.mediaKind === "reel") {
    const [item] = await db.select().from(marketingWeeklyResultsItems).where(eq(marketingWeeklyResultsItems.id, job.weeklyItemId)).limit(1);
    if (!item?.scriptCopy) throw new Error("A reel requires its final Arabic script before narration composition.");
    const narration = await generateElevayArabicVoiceOver(item.scriptCopy);
    const composed = await composeApprovedReelForReview({ weeklyItemId: item.id, sourceVideo: { url: stored.url, sha256, mimeType }, narration: { url: narration.url, sha256: narration.sha256, mimeType: "audio/mpeg" } });
    await db.update(marketingGeneratedMediaAssets).set({ status: "superseded", supersededAt: now, updatedAt: now }).where(and(eq(marketingGeneratedMediaAssets.weeklyItemId, item.id), eq(marketingGeneratedMediaAssets.status, "review_ready"), isNull(marketingGeneratedMediaAssets.supersededAt)));
    await db.insert(marketingGeneratedMediaAssets).values({ assetKey: `system-media:reel:${item.id}:${composed.outputSha256}`, weeklyItemId: item.id, contentPacketId: null, assetType: "reel", providerAlias: "manus-orchestrator", origin: "system_generated", generationTaskId: taskId, status: "review_ready", storageKey: composed.outputStorageKey, assetUrl: composed.outputUrl, assetSha256: composed.outputSha256, mimeType: "video/mp4", metadataJson: JSON.stringify({ mediaJobId: job.id, inputSourceSha256: sha256, narrationSha256: narration.sha256, reviewOnly: true }), supersededAt: null, generatedAt: now, createdAt: now, updatedAt: now });
    await db.update(marketingWeeklyResultsItems).set({ previewUrl: composed.outputUrl, previewHash: composed.outputSha256, status: "draft", blockedReason: null, updatedAt: now }).where(eq(marketingWeeklyResultsItems.id, item.id));
  } else {
    await db.update(marketingGeneratedMediaAssets).set({ status: "superseded", supersededAt: now, updatedAt: now }).where(and(eq(marketingGeneratedMediaAssets.weeklyItemId, job.weeklyItemId), eq(marketingGeneratedMediaAssets.status, "review_ready"), isNull(marketingGeneratedMediaAssets.supersededAt)));
    await db.insert(marketingGeneratedMediaAssets).values({ assetKey: `system-media:static:${job.weeklyItemId}:${sha256}`, weeklyItemId: job.weeklyItemId, contentPacketId: null, assetType: "static", providerAlias: "manus-orchestrator", origin: "system_generated", generationTaskId: taskId, status: "review_ready", storageKey, assetUrl: stored.url, assetSha256: sha256, mimeType, metadataJson: JSON.stringify({ mediaJobId: job.id, reviewOnly: true }), supersededAt: null, generatedAt: now, createdAt: now, updatedAt: now });
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
