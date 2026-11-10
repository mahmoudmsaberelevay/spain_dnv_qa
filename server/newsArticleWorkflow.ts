import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { publicNewsArticles } from "../drizzle/schema";
import { getDb } from "./db";
import { researchNewsArticle, type ArticleResearchResult } from "./newsArticleResearch";

export const NEWS_RESEARCH_BATCH_SIZE = 40;
const LEASE_MS = 5 * 60 * 1000;
type RelevancePredicate = Parameters<typeof researchNewsArticle>[1];
type WorkflowOptions = {
  limit?: number;
  concurrency?: number;
  maxDurationMs?: number;
  publicIds?: string[];
};

export function isNewsReadyForPublication(row: {
  publicationStatus?: string; accessStatus?: string; articleSummary?: string | null;
  fetchedAt?: Date | string | null; summarizedAt?: Date | string | null;
}) {
  return row.publicationStatus === "published" && row.accessStatus === "accessible"
    && Boolean(row.articleSummary?.trim()) && Boolean(row.fetchedAt) && Boolean(row.summarizedAt);
}

export function isNewsEligibleForSummaryRetry(row: { publicationStatus?: string; accessStatus?: string; reviewReason?: string | null }) {
  return row.publicationStatus === "pending_review" && row.accessStatus === "accessible"
    && row.reviewReason === "summary_unverified";
}

export async function processPendingNewsArticles(isRelevant: RelevancePredicate, options: WorkflowOptions = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const limit = Math.max(1, Math.min(NEWS_RESEARCH_BATCH_SIZE, Math.floor(options.limit || NEWS_RESEARCH_BATCH_SIZE)));
  const concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency || 4)));
  const maxDurationMs = Math.max(1000, Math.min(120_000, options.maxDurationMs || 120_000));
  const start = Date.now();
  const eligible = () => and(
    eq(publicNewsArticles.publicationStatus, "pending_review"),
    or(eq(publicNewsArticles.accessStatus, "pending"), and(
      eq(publicNewsArticles.accessStatus, "processing"),
      lt(publicNewsArticles.processingAt, new Date(Date.now() - LEASE_MS)),
    )),
    options.publicIds?.length ? inArray(publicNewsArticles.publicId, options.publicIds) : undefined,
  );
  const candidates = await db.select().from(publicNewsArticles).where(eligible())
    .orderBy(desc(publicNewsArticles.digestReceivedAt), desc(publicNewsArticles.id)).limit(limit);
  const published: Array<{ publicId: string; title: string }> = [];
  let next = 0, checked = 0, flagged = 0, rejected = 0;
  const worker = async () => {
    while (next < candidates.length && Date.now() - start < maxDurationMs) {
      const article = candidates[next++];
      const processingAt = new Date(Math.floor(Date.now() / 1000) * 1000);
      // Atomic conditional UPDATE arbitrates overlapping CLI/cron executions.
      const [claimed] = await db.update(publicNewsArticles).set({ accessStatus: "processing", processingAt })
        .where(and(eq(publicNewsArticles.id, article.id), eligible()));
      if (!Number((claimed as { affectedRows?: number }).affectedRows)) continue;
      let result: ArticleResearchResult;
      try {
        result = await researchNewsArticle(article, isRelevant);
      } catch {
        // Do not persist provider messages that might contain credentials or source text.
        result = {
          publicationStatus: "pending_review", accessStatus: "fetch_failed", articleContent: null,
          articleSummary: null, description: article.description, sourceName: article.sourceName,
          fetchedAt: null, summarizedAt: null, summaryWordCount: null,
          accessError: "article_processing_failed", reviewReason: "article_processing_failed",
        };
      }
      const canPublish = isNewsReadyForPublication(result);
      const status = result.publicationStatus === "published" && !canPublish ? "pending_review" : result.publicationStatus;
      const [saved] = await db.update(publicNewsArticles).set({
        ...result,
        publicationStatus: status,
        articleSummary: canPublish ? result.articleSummary : null,
        reviewReason: canPublish ? null : result.reviewReason || "summary_validation_failed",
        processingAt: null,
      }).where(and(eq(publicNewsArticles.id, article.id), eq(publicNewsArticles.accessStatus, "processing"), eq(publicNewsArticles.processingAt, processingAt)));
      if (!Number((saved as { affectedRows?: number }).affectedRows)) continue;
      checked++;
      if (canPublish) published.push({ publicId: article.publicId, title: article.title });
      else if (status === "rejected") rejected++;
      else flagged++;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  // Preserve publication order for the existing broadcastNews latest-item contract.
  const order = new Map(candidates.map((article, index) => [article.publicId, index]));
  published.sort((a, b) => (order.get(b.publicId) || 0) - (order.get(a.publicId) || 0));
  return { checked, flagged, rejected, published };
}
