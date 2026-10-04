import crypto from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { marketingDesignSystemAssets, marketingReviewMediaRuns, marketingWeeklyResultsItems, marketingWeeklyResultsPlans } from "../drizzle/schema";
import { getDb } from "./db";
import { itemizedElevayReelCostReview, itemizedElevayStaticCostReview } from "./elevayMediaCostReview";
import { quoteElevayHiggsfieldProClips } from "./higgsfieldProClipQuote";
import { prepareEgyptianReelNarration } from "../shared/elevayVideoNarration";

const MAX_QUOTE_AGE_MS = 10 * 60 * 1000;
function fingerprint(value: unknown) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function safePublicQuotePrompt(clip: number) { return `Cinematic natural camera movement in a premium architectural environment, realistic textures, no people, no text, no logos; scene ${clip}.`; }

async function itemSnapshot(itemId: number) {
  const db = await getDb(); if (!db) throw new Error("Marketing database unavailable.");
  const [item] = await db.select().from(marketingWeeklyResultsItems).where(eq(marketingWeeklyResultsItems.id, itemId)).limit(1);
  if (!item || !item.isSelected || !["reel", "static_post"].includes(item.itemType) || !["draft", "changes_requested", "on_hold"].includes(item.status)) throw new Error("Select an editable reel or static item from a current plan before requesting a cost quote.");
  const [plan] = await db.select().from(marketingWeeklyResultsPlans).where(eq(marketingWeeklyResultsPlans.id, item.planId)).limit(1);
  if (!plan || plan.status === "superseded" || plan.status === "stopped" || plan.source !== "manual_internal") throw new Error("Historical or retired Manus-produced plans are not eligible for new provider estimates.");
  const activeDesign = await db.select({ assetType: marketingDesignSystemAssets.assetType, sha256Digest: marketingDesignSystemAssets.sha256Digest }).from(marketingDesignSystemAssets).where(and(eq(marketingDesignSystemAssets.isActive, true), isNull(marketingDesignSystemAssets.archivedAt)));
  if (!activeDesign.some(asset => asset.assetType === "logo") || !activeDesign.some(asset => asset.assetType === "design_instruction")) throw new Error("The active official logo and Design System are required for a new media quote.");
  const fields = {
    itemId: item.id, planId: plan.id, planHash: plan.planHash, periodStart: plan.periodStart, itemType: item.itemType,
    title: item.title, programKey: item.programKey, objective: item.objective, creativeDirection: item.creativeDirection,
    scriptCopy: item.scriptCopy, caption: item.caption, cta: item.cta, visualBrief: item.visualBrief,
    sourceClaimIdsJson: item.sourceClaimIdsJson, metadataJson: item.metadataJson, updatedAt: item.updatedAt,
    designAssets: activeDesign.map(asset => [asset.assetType, asset.sha256Digest]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  };
  return { db, item, itemSnapshotHash: fingerprint(fields) };
}

/** Estimate-only mutation: stores a quote but never creates images, voice or video. */
export async function quoteElevayMarketingMediaItem(itemId: number) {
  const { db, item, itemSnapshotHash } = await itemSnapshot(itemId);
  const isStatic = item.itemType === "static_post";
  const quote = isStatic
    ? itemizedElevayStaticCostReview({ itemId, snapshotHash: itemSnapshotHash })
    : itemizedElevayReelCostReview({
      itemId, snapshotHash: itemSnapshotHash,
      clips: (await quoteElevayHiggsfieldProClips([1, 2, 3, 4].map(clip => ({
        keyframeUrl: `https://example.com/elevay-illustrative-quote-only-frame-${clip}.png`,
        motionPrompt: safePublicQuotePrompt(clip),
        idempotencyKey: `elevay-estimate-only-${itemId}-${itemSnapshotHash.slice(0, 12)}-scene-${clip}`,
      })))).clips,
      narrationScript: prepareEgyptianReelNarration(item.scriptCopy ?? ""),
    });
  const now = Date.now(); const expiresAt = now + MAX_QUOTE_AGE_MS;
  const explanation = isStatic
    ? "Illustrative OpenAI image usage only; the actual square image, exact official-logo overlay and QC are not connected to this quote."
    : "Illustrative 4-scene model quote only; actual four distinct OpenAI keyframes must be generated after owner review, then re-quoted using their real URLs before any paid video dispatch. Native vertical output, voice timing and deployed renderer are unverified.";
  const runKey = `media-quote:${itemId}:${now}:${crypto.randomBytes(7).toString("hex")}`;
  await db.insert(marketingReviewMediaRuns).values({
    runKey, weeklyItemId: itemId, itemSnapshotHash, itemType: item.itemType,
    status: "quote_ready", inputManifestJson: JSON.stringify({ quoteKind: "illustrative_before_keyframes", mediaGenerated: false, publicationEnabled: false }),
    costQuoteJson: JSON.stringify({ quote, quotedAt: now, expiresAt, explanation, itemTitle: item.title }), estimatedCostUsd: quote.estimatedSubtotalUsd.toFixed(4),
    ownerReviewedByUserId: null, ownerReviewedAt: null, createdAt: now, updatedAt: now,
  });
  const [run] = await db.select({ id: marketingReviewMediaRuns.id }).from(marketingReviewMediaRuns).where(eq(marketingReviewMediaRuns.runKey, runKey)).limit(1);
  if (!run) throw new Error("The itemized cost quote could not be saved; no paid work was started.");
  return { runId: run.id, itemId, itemType: item.itemType, itemTitle: item.title, quotedAt: now, expiresAt, quote, productionEnabled: false as const, explanation };
}

/** Durable owner acknowledgment of the *exact persisted* estimate; deliberately no dispatch method. */
export async function recordOwnerElevayMediaCostReview(input: { runId: number; quoteFingerprint: string; actorUserId: number }) {
  if (!Number.isSafeInteger(input.runId) || input.runId <= 0 || !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0 || !/^[a-f0-9]{64}$/.test(input.quoteFingerprint)) throw new Error("A signed-in owner and saved exact quote are required.");
  const db = await getDb(); if (!db) throw new Error("Marketing database unavailable.");
  const [run] = await db.select().from(marketingReviewMediaRuns).where(eq(marketingReviewMediaRuns.id, input.runId)).limit(1);
  if (!run) throw new Error("The itemized quote was not found. Request a fresh estimate.");
  const stored = JSON.parse(run.costQuoteJson) as { quote?: { quoteFingerprint?: string; estimatedSubtotalUsd?: number }; expiresAt?: number };
  if (stored.quote?.quoteFingerprint !== input.quoteFingerprint || !Number.isFinite(stored.expiresAt) || Date.now() > Number(stored.expiresAt)) throw new Error("This exact cost estimate expired or changed. Request a fresh estimate.");
  if (run.status === "cost_reviewed_generation_locked" && run.ownerReviewedByUserId === input.actorUserId) return { runId: run.id, status: run.status, itemId: run.weeklyItemId, quotedSubtotalUsd: Number(run.estimatedCostUsd ?? 0), paidGenerationStarted: false as const, publicationEnabled: false as const };
  if (run.status !== "quote_ready") throw new Error("This cost estimate is not available for owner review.");
  const { itemSnapshotHash } = await itemSnapshot(run.weeklyItemId);
  if (itemSnapshotHash !== run.itemSnapshotHash) throw new Error("The creative or active design changed since this quote. Request a fresh estimate.");
  const now = Date.now();
  await db.update(marketingReviewMediaRuns).set({ status: "cost_reviewed_generation_locked", ownerReviewedByUserId: input.actorUserId, ownerReviewedAt: now, updatedAt: now }).where(and(eq(marketingReviewMediaRuns.id, run.id), eq(marketingReviewMediaRuns.status, "quote_ready")));
  const [saved] = await db.select().from(marketingReviewMediaRuns).where(eq(marketingReviewMediaRuns.id, run.id)).orderBy(desc(marketingReviewMediaRuns.id)).limit(1);
  if (!saved || saved.status !== "cost_reviewed_generation_locked" || saved.ownerReviewedByUserId !== input.actorUserId) throw new Error("A concurrent cost review changed; refresh before proceeding.");
  return { runId: run.id, status: saved.status, itemId: run.weeklyItemId, quotedSubtotalUsd: Number(run.estimatedCostUsd ?? 0), paidGenerationStarted: false as const, publicationEnabled: false as const };
}

/** Read-only pre-dispatch gate; this neither claims a step nor contacts a provider. */
export async function requireCurrentOwnerReviewedMediaRun(runId: number, itemId: number) {
  if (!Number.isSafeInteger(runId) || runId <= 0 || !Number.isSafeInteger(itemId) || itemId <= 0) throw new Error("A saved reviewed run and exact weekly item are required.");
  const db = await getDb(); if (!db) throw new Error("Marketing database unavailable.");
  const [run] = await db.select().from(marketingReviewMediaRuns).where(and(eq(marketingReviewMediaRuns.id, runId), eq(marketingReviewMediaRuns.weeklyItemId, itemId))).limit(1);
  if (!run || run.status !== "cost_reviewed_generation_locked" || !run.ownerReviewedByUserId || !run.ownerReviewedAt) throw new Error("The media run has not received an exact owner cost review.");
  let stored: { quote?: { quoteFingerprint?: string; itemSnapshotHash?: string }; expiresAt?: number };
  try { stored = JSON.parse(run.costQuoteJson); } catch { throw new Error("The saved owner cost quote cannot be verified."); }
  if (!stored.quote?.quoteFingerprint || stored.quote.itemSnapshotHash !== run.itemSnapshotHash || !Number.isFinite(stored.expiresAt) || Date.now() > Number(stored.expiresAt)) {
    throw new Error("The owner-reviewed cost quote expired or changed; request a new itemized estimate.");
  }
  const current = await itemSnapshot(itemId);
  if (current.itemSnapshotHash !== run.itemSnapshotHash || current.item.itemType !== run.itemType) throw new Error("The weekly creative or Design System changed since owner cost review.");
  return { run, item: current.item, itemSnapshotHash: current.itemSnapshotHash, quoteFingerprint: stored.quote.quoteFingerprint };
}
