/**
 * Weekly Google Drive Backup Scheduler
 *
 * Runs every Friday at 08:00 Cairo time (UTC+3).
 * Exports all database tables as a JSON file and uploads it to
 * the "ELEVAY Backups" folder in Google Drive.
 * Sends a confirmation email to Mahmoud with a direct link.
 */

import { getDb } from "./db";
import { uploadBackupToDrive, isDriveConfigured } from "./googleDrive";
import { sendBackupNotification } from "./emailService";
import * as schema from "../drizzle/schema";

const ONE_MINUTE_MS = 60 * 1000;

/** Get current day of week in Cairo timezone (0=Sun, 5=Fri) */
function getCairoDay(): number {
  const day = new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: "Africa/Cairo" });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[day] ?? -1;
}

/** Get current hour in Cairo timezone */
function getCairoHour(): number {
  return parseInt(
    new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Africa/Cairo" }),
    10
  );
}

/** Get current date string in Cairo timezone */
function getCairoDateString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }); // YYYY-MM-DD
}

/** Export all DB tables to a JSON buffer */
async function exportAllTables(): Promise<{ json: string; tables: { name: string; rows: number }[] }> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database not available");

  const tableMap: Record<string, unknown> = {
    users: schema.users,
    cases: schema.cases,
    documents: schema.documents,
    analysisResults: schema.analysisResults,
    contracts: schema.contracts,
    invoices: schema.invoices,
    payments: schema.payments,
    commissions: schema.finCommissions,
    accounts: schema.finAccounts,
    categories: schema.finCategories,
    employees: schema.finEmployees,
    transactions: schema.finTransactions,
    clientCases: schema.clientCases,
    clientDocuments: schema.clientDocuments,
    leads: schema.leads,
    leadActivities: schema.leadActivities,
    leadNotes: schema.leadNotes,
    leadTasks: schema.leadTasks,
    leadIntegrations: schema.leadIntegrations,
    auditLogs: schema.auditLogs,
  };

  const backup: Record<string, unknown[]> = {};

  for (const [name, tableSchema] of Object.entries(tableMap)) {
    try {
      if (tableSchema) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = await (dbConn as any).select().from(tableSchema);
        backup[name] = rows ?? [];
      }
    } catch (err) {
      console.warn(`[WeeklyBackup] Could not export table "${name}":`, err);
      backup[name] = [];
    }
  }

  const json = JSON.stringify(backup, null, 2);
  const tables = Object.keys(backup).map(t => ({ name: t, rows: (backup[t] as unknown[]).length }));
  return { json, tables };
}



async function runWeeklyBackup(): Promise<void> {
  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "Africa/Cairo",
  });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `ELEVAY-Backup-${timestamp}.json`;

  console.log(`[WeeklyBackup] Starting weekly backup: ${filename}`);

  try {
    // 1. Export all tables
    const { json, tables } = await exportAllTables();
    const buffer = Buffer.from(json, "utf-8");
    const sizeKb = Math.round(buffer.length / 1024);

    // 2. Upload to Google Drive
    if (!isDriveConfigured()) {
      throw new Error("Google Drive is not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.");
    }

    const { webViewLink } = await uploadBackupToDrive(buffer, filename);

    console.log(`[WeeklyBackup] Uploaded to Google Drive: ${webViewLink} (${sizeKb} KB)`);

    // 3. Send confirmation email
    try {
      await sendBackupNotification({ date: dateStr, filename, driveLink: webViewLink, sizeKb, tables, success: true });
    } catch (emailErr) {
      console.warn("[WeeklyBackup] Email notification failed (non-critical):", emailErr);
    }

    lastBackupStatus = "success";
    lastBackupTimestamp = Date.now();
    lastBackupDriveLink = webViewLink;
    console.log(`[WeeklyBackup] ✅ Backup complete. ${tables.reduce((s, t) => s + t.rows, 0).toLocaleString()} total records backed up.`);
  } catch (err) {
    lastBackupStatus = "failed";
    lastBackupTimestamp = Date.now();
    lastBackupDriveLink = "";
    console.error("[WeeklyBackup] ❌ Backup failed:", err);
    try {
      await sendBackupNotification({ date: dateStr, filename, driveLink: "", sizeKb: 0, tables: [], success: false, error: String(err) });
    } catch { /* ignore email error */ }
  }
}

let lastBackupDate = "";
let lastBackupStatus: "success" | "failed" | null = null;
let lastBackupTimestamp: number | null = null;
let lastBackupDriveLink = "";

/** Returns the last backup status for display on the admin page */
export function getLastBackupStatus(): {
  lastBackupDate: string;
  lastBackupStatus: "success" | "failed" | null;
  lastBackupTimestamp: number | null;
  lastBackupDriveLink: string;
  nextBackupInfo: string;
} {
  // Calculate next Friday 08:00 Cairo
  const now = new Date();
  const cairoNow = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
  const dayOfWeek = cairoNow.getDay(); // 0=Sun, 5=Fri
  const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 6;
  const nextFriday = new Date(cairoNow);
  nextFriday.setDate(cairoNow.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday));
  nextFriday.setHours(8, 0, 0, 0);
  const nextBackupInfo = nextFriday.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) + " at 08:00 Cairo";
  return {
    lastBackupDate,
    lastBackupStatus,
    lastBackupTimestamp,
    lastBackupDriveLink,
    nextBackupInfo,
  };
}

async function checkAndRunWeeklyBackup(): Promise<void> {
  const today = getCairoDateString();
  const day = getCairoDay();
  const hour = getCairoHour();

  // Run on Friday at 08:00 Cairo time, once per day
  if (day === 5 && hour === 8 && lastBackupDate !== today) {
    lastBackupDate = today;
    await runWeeklyBackup();
  }
}

export function startWeeklyBackupScheduler(): void {
  console.log("[WeeklyBackup] Scheduler initialized. Will run every Friday at 08:00 Cairo time.");
  // Check every minute
  setInterval(() => {
    checkAndRunWeeklyBackup().catch(err => console.error("[WeeklyBackup] Scheduler error:", err));
  }, ONE_MINUTE_MS);
}
