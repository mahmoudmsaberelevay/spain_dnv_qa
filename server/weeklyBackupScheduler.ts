/**
 * Automatic Database Backup Scheduler
 *
 * Runs Monday–Thursday at 18:00 Cairo time (UTC+3).
 * Exports all database tables as a JSON file, encrypts with AES-256-CBC,
 * uploads to Google Drive, and sends email notifications to
 * mahmoud.saberelevay@gmail.com and mahmoud.saber@elevay.com.
 */

import crypto from "crypto";
import { getDb } from "./db";
import { uploadBackupToDrive, isDriveConfigured } from "./googleDrive";
import { sendBackupNotification } from "./emailService";
import * as schema from "../drizzle/schema";

const ONE_MINUTE_MS = 60 * 1000;
const ENCRYPTION_KEY = crypto.scryptSync(process.env.JWT_SECRET || "elevay-backup-key-2026", "salt", 32);
const IV_LENGTH = 16;

/** Encrypt data with AES-256-CBC */
function encryptAES256(data: Buffer): { encrypted: Buffer; iv: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return { encrypted, iv: iv.toString("hex") };
}

/** Get current day of week in Cairo timezone (0=Sun, 1=Mon, ..., 4=Thu, 5=Fri, 6=Sat) */
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
      console.warn(`[DailyBackup] Could not export table "${name}":`, err);
      backup[name] = [];
    }
  }

  const json = JSON.stringify(backup, null, 2);
  const tables = Object.keys(backup).map(t => ({ name: t, rows: (backup[t] as unknown[]).length }));
  return { json, tables };
}


async function runBackup(): Promise<void> {
  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "Africa/Cairo",
  });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `ELEVAY-Backup-${timestamp}.enc.json`;

  console.log(`[DailyBackup] Starting backup: ${filename}`);

  try {
    // 1. Export all tables
    const { json, tables } = await exportAllTables();
    const rawBuffer = Buffer.from(json, "utf-8");
    const rawSizeKb = Math.round(rawBuffer.length / 1024);

    // 2. Encrypt with AES-256-CBC
    const { encrypted, iv } = encryptAES256(rawBuffer);
    // Prepend IV to encrypted data for decryption later
    const encryptedWithIv = Buffer.concat([Buffer.from(iv, "utf-8"), Buffer.from("|"), encrypted]);
    const encSizeKb = Math.round(encryptedWithIv.length / 1024);

    console.log(`[DailyBackup] Encrypted: ${rawSizeKb} KB → ${encSizeKb} KB (AES-256-CBC)`);

    // 3. Upload to Google Drive
    if (!isDriveConfigured()) {
      throw new Error("Google Drive is not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.");
    }

    const { webViewLink } = await uploadBackupToDrive(encryptedWithIv, filename);

    console.log(`[DailyBackup] Uploaded to Google Drive: ${webViewLink} (${encSizeKb} KB)`);

    // 4. Send confirmation email
    const totalRecords = tables.reduce((s, t) => s + t.rows, 0);
    const tablesSummary = tables.map(t => `${t.name}: ${t.rows}`).join(", ");
    try {
      await sendBackupNotification(
        filename,
        webViewLink,
        `${encSizeKb} KB (encrypted) | ${totalRecords.toLocaleString()} records | AES-256-CBC | Tables: ${tablesSummary}`
      );
    } catch (emailErr) {
      console.warn("[DailyBackup] Email notification failed (non-critical):", emailErr);
    }

    lastBackupStatus = "success";
    lastBackupTimestamp = Date.now();
    lastBackupDriveLink = webViewLink;
    console.log(`[DailyBackup] ✅ Backup complete. ${totalRecords.toLocaleString()} total records backed up and encrypted.`);
  } catch (err) {
    lastBackupStatus = "failed";
    lastBackupTimestamp = Date.now();
    lastBackupDriveLink = "";
    console.error("[DailyBackup] ❌ Backup failed:", err);
    try {
      await sendBackupNotification(
        filename,
        "",
        `FAILED: ${String(err)}`
      );
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
  // Calculate next backup day (Mon-Thu at 18:00 Cairo)
  const now = new Date();
  const cairoNow = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
  const dayOfWeek = cairoNow.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const hour = cairoNow.getHours();

  let daysUntilNext = 0;
  if (dayOfWeek >= 1 && dayOfWeek <= 4) {
    // Mon-Thu: if before 18:00, next is today; otherwise next weekday
    if (hour < 18) {
      daysUntilNext = 0;
    } else if (dayOfWeek < 4) {
      daysUntilNext = 1; // next day (still Mon-Thu)
    } else {
      daysUntilNext = 4; // Thu after 18:00 → next Monday
    }
  } else if (dayOfWeek === 5) {
    daysUntilNext = 3; // Fri → Mon
  } else if (dayOfWeek === 6) {
    daysUntilNext = 2; // Sat → Mon
  } else {
    daysUntilNext = 1; // Sun → Mon
  }

  const nextBackup = new Date(cairoNow);
  nextBackup.setDate(cairoNow.getDate() + daysUntilNext);
  nextBackup.setHours(18, 0, 0, 0);
  const nextBackupInfo = nextBackup.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) + " at 18:00 Cairo";

  return {
    lastBackupDate,
    lastBackupStatus,
    lastBackupTimestamp,
    lastBackupDriveLink,
    nextBackupInfo,
  };
}

async function checkAndRunBackup(): Promise<void> {
  const today = getCairoDateString();
  const day = getCairoDay();
  const hour = getCairoHour();

  // Run Mon-Thu (day 1-4) at 18:00 Cairo time, once per day
  if (day >= 1 && day <= 4 && hour === 18 && lastBackupDate !== today) {
    lastBackupDate = today;
    await runBackup();
  }
}

export function startWeeklyBackupScheduler(): void {
  console.log("[DailyBackup] Scheduler initialized. Will run Mon-Thu at 18:00 Cairo time with AES-256 encryption.");
  // Check every minute
  setInterval(() => {
    checkAndRunBackup().catch(err => console.error("[DailyBackup] Scheduler error:", err));
  }, ONE_MINUTE_MS);
}
