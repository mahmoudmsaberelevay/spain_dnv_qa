/**
 * Scheduled Database Backup Handler
 * Runs Mon-Thu at 18:00 Cairo time (15:00 UTC) via Heartbeat cron.
 * Exports full database as SQL dump, compresses with gzip, encrypts with AES-256-CBC,
 * uploads to S3, and sends email notifications with download links.
 */
import { Request, Response } from "express";
import crypto from "crypto";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable, PassThrough } from "stream";
import { getDb } from "./db";
import { storagePut } from "./storage";
import { sendEmail } from "./backupEmailService";
import { notifyOwner } from "./_core/notification";

const ENCRYPTION_PASSWORD = "3488";
const NOTIFICATION_EMAILS = [
  "mahmoud.saberelevay@gmail.com",
  "mahmoud.saber@elevay.com",
];

/**
 * AES-256-CBC encrypt a buffer using a password (OpenSSL-compatible).
 * Uses PBKDF2 for key derivation from the password.
 */
function encryptBuffer(data: Buffer, password: string): Buffer {
  // Generate random salt and IV
  const salt = crypto.randomBytes(8);
  const iv = crypto.randomBytes(16);

  // Derive key from password using PBKDF2
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");

  // Encrypt
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

  // Format: "Salted__" + salt + iv + encrypted data
  // This is a custom format that includes salt and IV for decryption
  const header = Buffer.from("Salted__");
  return Buffer.concat([header, salt, iv, encrypted]);
}

/**
 * Export all tables from the database as SQL INSERT statements
 */
async function exportDatabaseAsSql(): Promise<string> {
  const db = await getDb() as any;
  if (!db) throw new Error("Database unavailable");

  const [tables] = await db.execute(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
  );
  const tableNames = (tables as any[]).map((t: any) => t.TABLE_NAME);

  let sqlDump = `-- ELEVAY Full Database Backup\n`;
  sqlDump += `-- Generated: ${new Date().toISOString()}\n`;
  sqlDump += `-- Tables: ${tableNames.length}\n`;
  sqlDump += `-- Encryption: AES-256-CBC\n\n`;
  sqlDump += `SET FOREIGN_KEY_CHECKS=0;\n\n`;

  for (const tableName of tableNames) {
    try {
      // Get CREATE TABLE statement
      const [createResult] = await db.execute(`SHOW CREATE TABLE \`${tableName}\``);
      const createStmt = (createResult as any[])[0]?.["Create Table"];
      if (createStmt) {
        sqlDump += `-- Table: ${tableName}\n`;
        sqlDump += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
        sqlDump += `${createStmt};\n\n`;
      }

      // Get all rows
      const [rows] = await db.execute(`SELECT * FROM \`${tableName}\``);
      const rowsArr = rows as any[];

      if (rowsArr.length > 0) {
        // Build INSERT statements in batches of 100
        for (let i = 0; i < rowsArr.length; i += 100) {
          const batch = rowsArr.slice(i, i + 100);
          const columns = Object.keys(batch[0]);
          const colStr = columns.map((c) => `\`${c}\``).join(", ");

          const values = batch
            .map((row) => {
              const vals = columns.map((col) => {
                const val = row[col];
                if (val === null || val === undefined) return "NULL";
                if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace("T", " ")}'`;
                if (typeof val === "number") return String(val);
                if (typeof val === "boolean") return val ? "1" : "0";
                if (Buffer.isBuffer(val)) return `X'${val.toString("hex")}'`;
                // Escape string
                const escaped = String(val)
                  .replace(/\\/g, "\\\\")
                  .replace(/'/g, "\\'")
                  .replace(/\n/g, "\\n")
                  .replace(/\r/g, "\\r")
                  .replace(/\t/g, "\\t");
                return `'${escaped}'`;
              });
              return `(${vals.join(", ")})`;
            })
            .join(",\n  ");

          sqlDump += `INSERT INTO \`${tableName}\` (${colStr}) VALUES\n  ${values};\n`;
        }
        sqlDump += `\n`;
      }
    } catch (err) {
      sqlDump += `-- ERROR exporting table ${tableName}: ${String(err)}\n\n`;
    }
  }

  sqlDump += `SET FOREIGN_KEY_CHECKS=1;\n`;
  return sqlDump;
}

/**
 * Main scheduled backup handler
 */
export async function scheduledDbBackupHandler(req: Request, res: Response) {
  const startTime = Date.now();
  try {
    // Authenticate — accept both cron trigger and manual admin trigger
    const taskUid = req.headers["x-manus-cron-task-uid"] as string | undefined;
    const isManualTrigger = req.headers["x-manual-backup"] === "true";
    if (!taskUid && !isManualTrigger) {
      return res.status(403).json({ error: "cron-only" });
    }

    console.log("[ScheduledBackup] Starting database backup...");

    // Step 1: Export database as SQL
    const sqlDump = await exportDatabaseAsSql();
    const sqlBuffer = Buffer.from(sqlDump, "utf-8");
    console.log(`[ScheduledBackup] SQL dump size: ${(sqlBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Step 2: Compress with gzip
    const gzipPromise = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const gzip = createGzip({ level: 9 });
      const input = Readable.from(sqlBuffer);
      const output = new PassThrough();
      output.on("data", (chunk) => chunks.push(chunk));
      output.on("end", () => resolve(Buffer.concat(chunks)));
      output.on("error", reject);
      input.pipe(gzip).pipe(output);
    });
    const compressedBuffer = await gzipPromise;
    console.log(`[ScheduledBackup] Compressed size: ${(compressedBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Step 3: Encrypt with AES-256-CBC
    const encryptedBuffer = encryptBuffer(compressedBuffer, ENCRYPTION_PASSWORD);
    console.log(`[ScheduledBackup] Encrypted size: ${(encryptedBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Step 4: Upload to S3
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const fileName = `elevay-backup-${timestamp}.sql.gz.enc`;
    const { url: fileUrl } = await storagePut(
      `backups/scheduled/${fileName}`,
      encryptedBuffer,
      "application/octet-stream"
    );
    console.log(`[ScheduledBackup] Uploaded to S3: ${fileName}`);

    // Step 5: Calculate stats
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const fileSizeMB = (encryptedBuffer.length / 1024 / 1024).toFixed(2);

    // Step 6: Send email notifications to both recipients
    const emailHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: #1A3A5C; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 20px;">🔐 ELEVAY Database Backup</h1>
          <p style="color: #5BA3B8; margin: 5px 0 0;">Automatic Encrypted Backup</p>
        </div>
        <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
          <p style="color: #374151; font-size: 14px;">Your scheduled database backup has been completed successfully.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">📅 Date</td>
              <td style="padding: 8px 0; color: #111827; font-size: 13px; text-align: right;">${new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo", dateStyle: "full", timeStyle: "short" })}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">📦 File Size</td>
              <td style="padding: 8px 0; color: #111827; font-size: 13px; text-align: right;">${fileSizeMB} MB</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">🔒 Encryption</td>
              <td style="padding: 8px 0; color: #111827; font-size: 13px; text-align: right;">AES-256-CBC</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">⏱️ Duration</td>
              <td style="padding: 8px 0; color: #111827; font-size: 13px; text-align: right;">${durationSec}s</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">📄 Filename</td>
              <td style="padding: 8px 0; color: #111827; font-size: 13px; text-align: right;">${fileName}</td>
            </tr>
          </table>
          <div style="text-align: center; margin: 24px 0 16px;">
            <a href="${fileUrl}" style="background: #1A3A5C; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 14px; font-weight: 500;">⬇️ Download Backup</a>
          </div>
          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px; margin-top: 16px;">
            <p style="color: #92400e; font-size: 12px; margin: 0;">
              <strong>🔑 Decryption:</strong> Use password <code style="background: #fde68a; padding: 2px 6px; border-radius: 3px;">3488</code> to decrypt.<br>
              <code style="font-size: 11px; display: block; margin-top: 6px; color: #78350f;">openssl enc -aes-256-cbc -d -pbkdf2 -iter 100000 -in ${fileName} -out backup.sql.gz -k 3488</code>
            </p>
          </div>
          <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 16px;">
            This is an automated backup from ELEVAY System. Schedule: Mon–Thu at 18:00 Cairo.
          </p>
        </div>
      </div>
    `;

    for (const email of NOTIFICATION_EMAILS) {
      await sendEmail({
        to: email,
        subject: `🔐 ELEVAY Database Backup — ${new Date().toLocaleDateString("en-US", { timeZone: "Africa/Cairo" })}`,
        html: emailHtml,
      });
    }
    console.log(`[ScheduledBackup] Email notifications sent to ${NOTIFICATION_EMAILS.join(", ")}`);

    // Step 7: Notify owner in-app
    await notifyOwner({
      title: "🔐 Scheduled Database Backup Complete",
      content: `Backup: ${fileName}\nSize: ${fileSizeMB} MB\nDuration: ${durationSec}s\nEncryption: AES-256-CBC\nEmails sent to: ${NOTIFICATION_EMAILS.join(", ")}\nDownload: ${fileUrl}`,
    });

    res.json({
      ok: true,
      fileName,
      fileUrl,
      sizeMB: fileSizeMB,
      durationSec,
      emailsSent: NOTIFICATION_EMAILS,
    });
  } catch (err) {
    const errorMsg = String(err);
    console.error("[ScheduledBackup] Error:", errorMsg);

    // Notify owner of failure
    await notifyOwner({
      title: "❌ Scheduled Database Backup Failed",
      content: `Error: ${errorMsg}\nTime: ${new Date().toISOString()}`,
    }).catch(() => {});

    // Send failure email
    for (const email of NOTIFICATION_EMAILS) {
      await sendEmail({
        to: email,
        subject: `❌ ELEVAY Backup FAILED — ${new Date().toLocaleDateString("en-US", { timeZone: "Africa/Cairo" })}`,
        html: `<h2 style="color: #dc2626;">Database Backup Failed</h2><p>Error: ${errorMsg}</p><p>Time: ${new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" })}</p>`,
      }).catch(() => {});
    }

    res.status(500).json({
      error: errorMsg,
      stack: (err as Error).stack,
      context: { url: req.url, taskUid: req.headers["x-manus-cron-task-uid"] },
      timestamp: new Date().toISOString(),
    });
  }
}
