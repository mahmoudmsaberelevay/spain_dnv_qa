import { and, eq, gt } from "drizzle-orm";
import { gzip as gzipCallback } from "node:zlib";
import { promisify } from "node:util";
import {
  databaseBackupRuns,
  databaseBackupSettings,
  type DatabaseBackupRun,
} from "../drizzle/schema";
import { BACKUP_ENCRYPTION_METADATA, encryptBackupBuffer } from "./backupEncryption";
import { sendEmail } from "./backupEmailService";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { storageGet, storagePut } from "./storage";

const gzip = promisify(gzipCallback);
const CAIRO_TIME_ZONE = "Africa/Cairo";
const PROCESSING_STALE_AFTER_MS = 10 * 60 * 1000;
export const BACKUP_NOTIFICATION_EMAILS = [
  "mahmoud.saberelevay@gmail.com",
  "mahmoud.saber@elevay.com",
] as const;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function cairoParts(now: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
  };
}

export function isCairoBackupWindow(now: number) {
  return cairoParts(now).hour === 18;
}

export function makeBackupRunKey(taskUid: string, now: number) {
  return `db-backup:${taskUid}:${cairoParts(now).date}`;
}

function getNextBackupInfo(now = Date.now()) {
  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const candidate = new Date(now + dayOffset * 24 * 60 * 60 * 1000);
    const dayName = new Intl.DateTimeFormat("en-US", { timeZone: CAIRO_TIME_ZONE, weekday: "short" }).format(candidate);
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: CAIRO_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(candidate));
    const isBackupDay = ["Mon", "Tue", "Wed", "Thu"].includes(dayName);
    if (isBackupDay && (dayOffset > 0 || hour < 18)) {
      const date = new Intl.DateTimeFormat("en-GB", {
        timeZone: CAIRO_TIME_ZONE,
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(candidate);
      return `${date} at 18:00 Cairo`;
    }
  }
  return "Next Monday–Thursday at 18:00 Cairo";
}

export async function getDatabaseBackupStatus(now = Date.now()) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [settings] = await db.select().from(databaseBackupSettings)
    .where(eq(databaseBackupSettings.name, "primary-database-backup"))
    .limit(1);
  if (!settings) {
    return {
      lastBackupDate: "",
      lastBackupStatus: null,
      lastBackupTimestamp: null,
      lastBackupDriveLink: "",
      nextBackupInfo: getNextBackupInfo(now),
    };
  }
  const lastBackupTimestamp = settings.lastSuccessAt ?? settings.lastFailureAt ?? null;
  let lastBackupDriveLink = "";
  if (settings.lastArtifactKey) {
    lastBackupDriveLink = (await storageGet(settings.lastArtifactKey)).url;
  }
  return {
    lastBackupDate: settings.lastSuccessAt ? cairoParts(settings.lastSuccessAt).date : "",
    lastBackupStatus: settings.lastSuccessAt && (!settings.lastFailureAt || settings.lastSuccessAt >= settings.lastFailureAt)
      ? "success" as const
      : settings.lastFailureAt
        ? "failed" as const
        : null,
    lastBackupTimestamp,
    lastBackupDriveLink,
    nextBackupInfo: getNextBackupInfo(now),
  };
}

function isDuplicateKeyError(error: unknown) {
  const candidate = error as { code?: string; errno?: number; message?: string };
  return candidate?.code === "ER_DUP_ENTRY" || candidate?.errno === 1062 || /duplicate/i.test(candidate?.message ?? "");
}

function classifyBackupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("notification")) return "NOTIFICATION_FAILED";
  if (message.includes("Storage")) return "STORAGE_FAILED";
  if (message.includes("Database")) return "DATABASE_FAILED";
  if (message.includes("encryption")) return "ENCRYPTION_FAILED";
  return "BACKUP_FAILED";
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace("T", " ")}'`;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

export async function exportDatabaseAsSql(db: Db): Promise<string> {
  const [tables] = await (db as any).execute(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
  );
  const tableNames = (tables as Array<{ TABLE_NAME: string }>).map(row => row.TABLE_NAME);
  let output = `-- ELEVAY Full Database Backup\n-- Generated: ${new Date().toISOString()}\n-- Tables: ${tableNames.length}\nSET FOREIGN_KEY_CHECKS=0;\n\n`;

  for (const tableName of tableNames) {
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) throw new Error("Database returned an unsafe table name");
    const [createRows] = await (db as any).execute(`SHOW CREATE TABLE \`${tableName}\``);
    const createStatement = (createRows as Array<Record<string, unknown>>)[0]?.["Create Table"];
    if (!createStatement) throw new Error("Database schema export failed");
    output += `-- Table: ${tableName}\nDROP TABLE IF EXISTS \`${tableName}\`;\n${createStatement};\n\n`;

    const [rows] = await (db as any).execute(`SELECT * FROM \`${tableName}\``);
    const records = rows as Array<Record<string, unknown>>;
    for (let offset = 0; offset < records.length; offset += 100) {
      const batch = records.slice(offset, offset + 100);
      const columns = Object.keys(batch[0] ?? {});
      if (columns.length === 0) continue;
      const columnSql = columns.map(column => `\`${column}\``).join(", ");
      const valueSql = batch.map(record => `(${columns.map(column => sqlLiteral(record[column])).join(", ")})`).join(",\n  ");
      output += `INSERT INTO \`${tableName}\` (${columnSql}) VALUES\n  ${valueSql};\n`;
    }
    output += "\n";
  }
  return `${output}SET FOREIGN_KEY_CHECKS=1;\n`;
}

async function getRun(db: Db, runKey: string) {
  return (await db.select().from(databaseBackupRuns).where(eq(databaseBackupRuns.runKey, runKey)).limit(1))[0];
}

async function claimRun(db: Db, runKey: string, taskUid: string, now: number) {
  try {
    await db.insert(databaseBackupRuns).values({ runKey, taskUid, status: "processing", startedAt: now });
    return { state: "claimed" as const, run: await getRun(db, runKey) };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await getRun(db, runKey);
    if (!existing) throw error;
    if (existing.status === "success") return { state: "success" as const, run: existing };
    if (existing.status === "processing" && existing.startedAt > now - PROCESSING_STALE_AFTER_MS) {
      return { state: "processing" as const, run: existing };
    }
    await db.update(databaseBackupRuns).set({
      status: "processing",
      startedAt: now,
      completedAt: null,
      durationMs: null,
      errorCode: null,
      emailSuccessCount: 0,
      emailFailureCount: 0,
    }).where(eq(databaseBackupRuns.id, existing.id));
    return { state: "claimed" as const, run: await getRun(db, runKey) };
  }
}

function buildBackupEmail(fileName: string, fileUrl: string, sizeBytes: number, now: number) {
  const localDate = new Date(now).toLocaleString("en-US", { timeZone: CAIRO_TIME_ZONE, dateStyle: "full", timeStyle: "short" });
  const sizeMb = (sizeBytes / 1024 / 1024).toFixed(2);
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><h2 style="color:#1A3A5C">ELEVAY encrypted database backup</h2><p>The scheduled full-system database backup completed successfully.</p><table><tr><td><strong>Date</strong></td><td>${localDate}</td></tr><tr><td><strong>File</strong></td><td>${fileName}</td></tr><tr><td><strong>Size</strong></td><td>${sizeMb} MB</td></tr><tr><td><strong>Encryption</strong></td><td>${BACKUP_ENCRYPTION_METADATA.algorithm}</td></tr></table><p><a href="${fileUrl}">Download encrypted backup</a></p><p>The restoration password is stored separately by the administrator and is not included in this email.</p><p>Schedule: Monday–Thursday at 18:00 Cairo time.</p></div>`;
  const text = `ELEVAY encrypted database backup completed. Date: ${localDate}. File: ${fileName}. Size: ${sizeMb} MB. Encryption: ${BACKUP_ENCRYPTION_METADATA.algorithm}. Download: ${fileUrl}. The restoration password is stored separately and is not included in this email.`;
  return { html, text, sizeMb };
}

export async function sendBackupNotifications(
  fileName: string,
  fileUrl: string,
  sizeBytes: number,
  now: number,
  send: typeof sendEmail = sendEmail,
) {
  const content = buildBackupEmail(fileName, fileUrl, sizeBytes, now);
  const results = await Promise.all(BACKUP_NOTIFICATION_EMAILS.map(email => send({
    to: email,
    subject: `ELEVAY encrypted database backup — ${cairoParts(now).date}`,
    html: content.html,
    text: content.text,
  })));
  return {
    successCount: results.filter(Boolean).length,
    failureCount: results.filter(result => !result).length,
    sizeMb: content.sizeMb,
  };
}

export async function executeScheduledDatabaseBackup(taskUid: string, now = Date.now()) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [settings] = await db.select().from(databaseBackupSettings)
    .where(and(eq(databaseBackupSettings.scheduleCronTaskUid, taskUid), eq(databaseBackupSettings.isEnabled, true)))
    .limit(1);
  if (!settings) return { ok: true, skipped: "orphan-schedule" as const };

  const testRunAuthorized = (settings.authorizedTestRunUntil ?? 0) >= now;
  const scheduledWindow = isCairoBackupWindow(now);
  if (!scheduledWindow && !testRunAuthorized) {
    return { ok: true, skipped: "outside-cairo-backup-window" as const };
  }

  const runKey = testRunAuthorized && !scheduledWindow
    ? `db-backup:${taskUid}:test:${settings.authorizedTestRunUntil}`
    : makeBackupRunKey(taskUid, now);
  const claim = await claimRun(db, runKey, taskUid, now);
  if (claim.state === "success") return { ok: true, duplicate: true, status: "success" as const };
  if (claim.state === "processing") return { ok: true, duplicate: true, status: "processing" as const };

  const run = claim.run as DatabaseBackupRun;
  await db.update(databaseBackupSettings).set({ lastAttemptAt: now, lastErrorCode: null, updatedAt: now })
    .where(eq(databaseBackupSettings.id, settings.id));

  try {
    let artifactKey = run.artifactKey;
    let artifactSizeBytes = run.artifactSizeBytes ?? 0;
    let fileUrl: string;
    if (artifactKey) {
      fileUrl = (await storageGet(artifactKey)).url;
    } else {
      const sql = await exportDatabaseAsSql(db);
      const compressed = await gzip(Buffer.from(sql, "utf8"), { level: 9 });
      const encrypted = encryptBackupBuffer(compressed);
      const fileName = `elevay-backup-${cairoParts(now).date}.sql.gz.enc`;
      const stored = await storagePut(`backups/scheduled/${fileName}`, encrypted, "application/octet-stream");
      artifactKey = stored.key;
      artifactSizeBytes = encrypted.length;
      fileUrl = stored.url;
      await db.update(databaseBackupRuns).set({ artifactKey, artifactSizeBytes })
        .where(eq(databaseBackupRuns.id, run.id));
    }

    const fileName = artifactKey.split("/").pop() ?? "elevay-backup.sql.gz.enc";
    const delivery = await sendBackupNotifications(fileName, fileUrl, artifactSizeBytes, now);
    if (delivery.failureCount > 0) throw new Error("Backup notification delivery failed");

    const completedAt = Date.now();
    await db.update(databaseBackupRuns).set({
      status: "success",
      completedAt,
      durationMs: completedAt - now,
      emailSuccessCount: delivery.successCount,
      emailFailureCount: delivery.failureCount,
      errorCode: null,
    }).where(eq(databaseBackupRuns.id, run.id));
    await db.update(databaseBackupSettings).set({
      authorizedTestRunUntil: null,
      lastSuccessAt: completedAt,
      lastErrorCode: null,
      lastArtifactKey: artifactKey,
      lastArtifactSizeBytes: artifactSizeBytes,
      lastEmailSuccessCount: delivery.successCount,
      updatedAt: completedAt,
    }).where(eq(databaseBackupSettings.id, settings.id));
    await notifyOwner({
      title: "Scheduled database backup complete",
      content: `Encrypted backup completed. Size: ${delivery.sizeMb} MB. Notifications sent: ${delivery.successCount}/${BACKUP_NOTIFICATION_EMAILS.length}.`,
    }).catch(() => {});
    return {
      ok: true,
      status: "success" as const,
      sizeBytes: artifactSizeBytes,
      emailsSent: delivery.successCount,
      encryption: BACKUP_ENCRYPTION_METADATA.algorithm,
      durationMs: completedAt - now,
    };
  } catch (error) {
    const failedAt = Date.now();
    const errorCode = classifyBackupError(error);
    await db.update(databaseBackupRuns).set({
      status: "failed",
      completedAt: failedAt,
      durationMs: failedAt - now,
      errorCode,
    }).where(eq(databaseBackupRuns.id, run.id));
    await db.update(databaseBackupSettings).set({
      lastFailureAt: failedAt,
      lastErrorCode: errorCode,
      updatedAt: failedAt,
    }).where(eq(databaseBackupSettings.id, settings.id));
    await notifyOwner({
      title: "Scheduled database backup failed",
      content: `Backup failed with code ${errorCode}. Review the scheduled-job log and retry after resolving the issue.`,
    }).catch(() => {});
    throw new Error(errorCode);
  }
}
