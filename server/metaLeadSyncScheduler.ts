/**
 * Meta Lead Sync Scheduler
 *
 * Runs syncAllMetaIntegrations() every 4 hours automatically.
 * Logs results to the console for visibility.
 */

import { syncAllMetaIntegrations } from "./metaLeadSync";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

async function runSync() {
  console.log("[MetaLeadSync] Starting scheduled sync...");
  try {
    const results = await syncAllMetaIntegrations();
    const totalNew = results.reduce((s, r) => s + r.newLeads, 0);
    const totalSkipped = results.reduce((s, r) => s + r.skippedDuplicates, 0);
    const errors = results.flatMap((r) => r.errors.map((e) => `[${r.integrationName}] ${e}`));

    if (results.length === 0) {
      console.log("[MetaLeadSync] No active Meta integrations configured.");
    } else {
      console.log(
        `[MetaLeadSync] Sync complete: ${results.length} integration(s), ` +
          `${totalNew} new lead(s), ${totalSkipped} duplicate(s) skipped.`
      );
      if (errors.length > 0) {
        console.warn("[MetaLeadSync] Errors:", errors.join("; "));
      }
    }
  } catch (err) {
    console.error("[MetaLeadSync] Scheduler error:", err);
  }
}

export function startMetaLeadSyncScheduler() {
  console.log("[MetaLeadSync] Scheduler initialized. Will sync every 4 hours.");

  // Run once at startup (after a short delay to let DB connect)
  setTimeout(() => {
    runSync();
  }, 30_000); // 30 seconds after server start

  // Then every 4 hours
  setInterval(() => {
    runSync();
  }, FOUR_HOURS_MS);
}
