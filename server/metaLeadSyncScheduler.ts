/**
 * Meta Lead Sync Scheduler
 *
 * - Runs syncAllMetaIntegrations() every 4 hours automatically.
 * - Accumulates daily sync results and sends a summary email to Mahmoud
 *   every day at 08:00 Cairo time (UTC+3 / UTC+2 depending on DST).
 */

import { syncAllMetaIntegrations, SyncResult } from "./metaLeadSync";
import { sendLeadSyncSummaryEmail } from "./emailService";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

// Accumulate results across all syncs in the current day
let dailyAccumulator: {
  totalNew: number;
  totalSkipped: number;
  byForm: Map<string, { newLeads: number; errors: string[] }>;
  errors: string[];
  lastResetDate: string; // YYYY-MM-DD in Cairo time
} = {
  totalNew: 0,
  totalSkipped: 0,
  byForm: new Map(),
  errors: [],
  lastResetDate: "",
};

/** Get current date string in Cairo timezone (UTC+3) */
function getCairoDateString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }); // YYYY-MM-DD
}

/** Get current hour in Cairo timezone */
function getCairoHour(): number {
  return parseInt(
    new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Africa/Cairo" }),
    10
  );
}

function accumulateResults(results: SyncResult[]): void {
  const today = getCairoDateString();

  // Reset accumulator if it's a new day
  if (dailyAccumulator.lastResetDate !== today) {
    dailyAccumulator = {
      totalNew: 0,
      totalSkipped: 0,
      byForm: new Map(),
      errors: [],
      lastResetDate: today,
    };
  }

  for (const r of results) {
    dailyAccumulator.totalNew += r.newLeads;
    dailyAccumulator.totalSkipped += r.skippedDuplicates;

    // Aggregate per-form results
    for (const formResult of r.formResults ?? []) {
      const existing = dailyAccumulator.byForm.get(formResult.formName) ?? { newLeads: 0, errors: [] };
      existing.newLeads += formResult.newLeads;
      existing.errors.push(...formResult.errors);
      dailyAccumulator.byForm.set(formResult.formName, existing);
    }

    dailyAccumulator.errors.push(...r.errors.map(e => `[${r.integrationName}] ${e}`));
  }
}

async function runSync(): Promise<void> {
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

    // Accumulate for daily summary
    accumulateResults(results);
  } catch (err) {
    console.error("[MetaLeadSync] Scheduler error:", err);
    dailyAccumulator.errors.push(`Scheduler error: ${String(err)}`);
  }
}

let lastSummaryDate = "";

async function checkAndSendDailySummary(): Promise<void> {
  const today = getCairoDateString();
  const hour = getCairoHour();

  // Send once per day at 08:00 Cairo time
  if (hour === 8 && lastSummaryDate !== today) {
    lastSummaryDate = today;
    console.log("[MetaLeadSync] Sending daily sync summary email...");

    const byForm = Array.from(dailyAccumulator.byForm.entries()).map(([formName, data]) => ({
      formName,
      newLeads: data.newLeads,
      errors: data.errors,
    }));

    try {
      await sendLeadSyncSummaryEmail({
        date: new Date().toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          timeZone: "Africa/Cairo",
        }),
        totalNew: dailyAccumulator.totalNew,
        totalSkipped: dailyAccumulator.totalSkipped,
        byForm,
        errors: dailyAccumulator.errors,
      });
      console.log("[MetaLeadSync] Daily summary email sent.");
    } catch (err) {
      console.error("[MetaLeadSync] Failed to send daily summary email:", err);
    }
  }
}

export function startMetaLeadSyncScheduler(): void {
  console.log("[MetaLeadSync] Scheduler initialized. Will sync every 4 hours. Daily summary at 08:00 Cairo.");

  // Run once at startup (after a short delay to let DB connect)
  setTimeout(() => {
    runSync();
  }, 30_000); // 30 seconds after server start

  // Sync every 4 hours
  setInterval(() => {
    runSync();
  }, FOUR_HOURS_MS);

  // Check every minute if it's time to send the daily summary
  setInterval(() => {
    checkAndSendDailySummary();
  }, ONE_MINUTE_MS);
}
