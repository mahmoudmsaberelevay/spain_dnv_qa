import { forceRefreshRate } from "./exchangeRate";

/**
 * EUR/EGP Exchange Rate Scheduler
 *
 * Refreshes the cached exchange rate at 09:00, 13:00, and 15:00 Cairo time
 * (Africa/Cairo, UTC+2 year-round — Egypt does not observe DST).
 *
 * Implementation: runs a check every minute; fires when the current Cairo
 * hour:minute matches one of the three target times.
 */

const CAIRO_OFFSET_HOURS = 2; // Africa/Cairo is UTC+2, no DST
const REFRESH_TIMES: Array<{ hour: number; minute: number }> = [
  { hour: 9, minute: 0 },
  { hour: 13, minute: 0 },
  { hour: 15, minute: 0 },
];

/** Return the current hour and minute in Cairo local time */
function getCairoTime(): { hour: number; minute: number } {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const cairoMs = utcMs + CAIRO_OFFSET_HOURS * 3_600_000;
  const cairo = new Date(cairoMs);
  return { hour: cairo.getHours(), minute: cairo.getMinutes() };
}

/** Track the last minute we fired a refresh to avoid double-firing */
let lastFiredKey: string | null = null;

async function checkAndRefresh(): Promise<void> {
  const { hour, minute } = getCairoTime();
  const currentKey = `${hour}:${String(minute).padStart(2, "0")}`;

  const shouldFire = REFRESH_TIMES.some(
    (t) => t.hour === hour && t.minute === minute
  );

  if (shouldFire && lastFiredKey !== currentKey) {
    lastFiredKey = currentKey;
    console.log(`[RateScheduler] Triggering scheduled EUR/EGP refresh at Cairo ${currentKey}`);
    try {
      const result = await forceRefreshRate();
      console.log(
        `[RateScheduler] Rate refreshed: 1 EUR = ${result.rate} EGP (source: ${result.source})`
      );
    } catch (err) {
      console.error("[RateScheduler] Failed to refresh rate:", err);
    }
  }
}

/**
 * Start the exchange rate scheduler.
 * Polls every 60 seconds and fires forceRefreshRate() at the three target times.
 */
export function startRateScheduler(): void {
  console.log(
    "[RateScheduler] Starting EUR/EGP rate scheduler (fires at 09:00, 13:00, 15:00 Cairo time)"
  );
  // Check immediately on startup (won't fire unless it happens to be exactly the right minute)
  checkAndRefresh();
  // Then check every 60 seconds
  setInterval(checkAndRefresh, 60_000);
}
