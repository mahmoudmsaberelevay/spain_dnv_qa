import { and, eq, inArray, sql } from "drizzle-orm";
import { publicNewsArticles } from "../drizzle/schema";
import { getDb } from "../server/db";
import { isNewsEligibleForSummaryRetry, processPendingNewsArticles } from "../server/newsArticleWorkflow";
import { isImmigrationNewsArticleRelevant } from "../server/newsDigestService";

// Finite operator/backfill tool. The existing canonical Daily Digest runner
// continues to be the only scheduled importer; this script creates no schedule.
const batches = Math.max(1, Math.min(15, Number(process.argv.find(arg => arg.startsWith("--batches="))?.split("=")[1] || 1)));
const limit = Math.max(1, Math.min(40, Number(process.argv.find(arg => arg.startsWith("--limit="))?.split("=")[1] || 20)));
const retryUnverified = process.argv.includes("--retry-unverified");
if (!Number.isInteger(batches) || !Number.isInteger(limit)) throw new Error("Batch count and size must be integers");

async function main() {
  console.log(JSON.stringify({ operation: "original_source_news_research", maxBatches: batches, batchLimit: limit, retryAccessibleUnverifiedOnly: retryUnverified, sendsHistoricalNotifications: false }));
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  let retryIds: string[] | undefined;
  if (retryUnverified) {
    const candidates = await db.select({ publicId: publicNewsArticles.publicId, publicationStatus: publicNewsArticles.publicationStatus,
      accessStatus: publicNewsArticles.accessStatus, reviewReason: publicNewsArticles.reviewReason }).from(publicNewsArticles)
      .where(and(eq(publicNewsArticles.publicationStatus, "pending_review"), eq(publicNewsArticles.accessStatus, "accessible"), eq(publicNewsArticles.reviewReason, "summary_unverified")))
      .limit(limit);
    retryIds = candidates.filter(isNewsEligibleForSummaryRetry).map(row => row.publicId);
    if (retryIds.length) {
      await db.update(publicNewsArticles).set({ accessStatus: "pending", processingAt: null, reviewReason: "source_research_pending", accessError: null })
        .where(and(eq(publicNewsArticles.publicationStatus, "pending_review"), eq(publicNewsArticles.accessStatus, "accessible"),
          eq(publicNewsArticles.reviewReason, "summary_unverified"), inArray(publicNewsArticles.publicId, retryIds)));
    }
    console.log(JSON.stringify({ safeRetryCandidates: retryIds.length, scope: "accessible+summary_unverified only" }));
  }
  for (let batch = 1; batch <= batches && (!retryUnverified || Boolean(retryIds?.length)); batch++) {
    console.log(`News research batch ${batch}/${batches} started`);
    const result = await processPendingNewsArticles(isImmigrationNewsArticleRelevant, { limit, concurrency: 4, maxDurationMs: 120_000,
      publicIds: retryIds });
    console.log(JSON.stringify({ batch, checked: result.checked, published: result.published.length, flagged: result.flagged, rejected: result.rejected }));
    if (!result.checked) break;
  }
  const counts = await db.select({ publicationStatus: publicNewsArticles.publicationStatus, accessStatus: publicNewsArticles.accessStatus, count: sql<number>`count(*)` })
    .from(publicNewsArticles).groupBy(publicNewsArticles.publicationStatus, publicNewsArticles.accessStatus);
  console.log(JSON.stringify({ retainedNewsStatus: counts }));
}
main().then(() => process.exit(0)).catch(() => { console.error("News research queue failed; inspect server logs and the private review queue."); process.exit(1); });
