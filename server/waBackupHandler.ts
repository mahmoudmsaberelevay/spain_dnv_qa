/**
 * WhatsApp QC — Weekly Google Drive Backup
 * Runs every Thursday at 17:00 Cairo time (15:00 UTC) via Heartbeat cron.
 * Exports all WhatsApp messages (with transcripts and doc text) as a JSON file
 * and uploads it to a "ELEVAY WhatsApp Backups" folder in Google Drive.
 */

import { Request, Response } from "express";
import { google } from "googleapis";
import { Readable } from "stream";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { waMessages, whatsappGroups } from "../drizzle/schema";
import { desc } from "drizzle-orm";

// ─── Google Drive Auth ────────────────────────────────────────────────────────
function getOAuth2Client() {
  const oauth2 = new google.auth.OAuth2(
    ENV.googleClientId,
    ENV.googleClientSecret,
  );
  oauth2.setCredentials({ refresh_token: ENV.googleRefreshToken });
  return oauth2;
}

// ─── Ensure backup folder exists ──────────────────────────────────────────────
async function ensureBackupFolder(drive: ReturnType<typeof google.drive>): Promise<string> {
  const folderName = "ELEVAY WhatsApp Backups";
  // Search for existing folder
  const search = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });
  if (search.data.files && search.data.files.length > 0) {
    return search.data.files[0].id!;
  }
  // Create the folder
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  return folder.data.id!;
}

// ─── Main backup handler ──────────────────────────────────────────────────────
export async function waBackupHandler(req: Request, res: Response) {
  try {
    // Authenticate — accept both cron trigger and manual admin trigger
    const taskUid = req.headers["x-manus-cron-task-uid"] as string | undefined;
    const isManualTrigger = req.headers["x-manual-backup"] === "true";
    if (!taskUid && !isManualTrigger) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Fetch all messages with group info
    const messages = await db
      .select({
        messageId: waMessages.messageId,
        groupId: waMessages.groupId,
        senderPhone: waMessages.senderPhone,
        senderName: waMessages.senderName,
        messageType: waMessages.messageType,
        textContent: waMessages.textContent,
        caption: waMessages.caption,
        mediaUrl: waMessages.mediaUrl,
        mediaMimeType: waMessages.mediaMimeType,
        transcript: waMessages.transcript,
        transcriptLang: waMessages.transcriptLang,
        transcriptArabic: waMessages.transcriptArabic,
        transcriptEnglish: waMessages.transcriptEnglish,
        docText: waMessages.docText,
        fromMe: waMessages.fromMe,
        whatsappTimestamp: waMessages.whatsappTimestamp,
        createdAt: waMessages.createdAt,
      })
      .from(waMessages)
      .orderBy(desc(waMessages.whatsappTimestamp));

    // Fetch all groups
    const groups = await db.select().from(whatsappGroups);
    const groupMap = Object.fromEntries(groups.map(g => [g.groupId, g.name]));

    // Build export object
    const exportDate = new Date().toISOString().split("T")[0];
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportDate,
      totalMessages: messages.length,
      groups: groups.map(g => ({ groupId: g.groupId, name: g.name, description: g.description })),
      messages: messages.map(m => ({
        ...m,
        groupName: groupMap[m.groupId] || m.groupId,
        whatsappTimestamp: m.whatsappTimestamp ? new Date(m.whatsappTimestamp).toISOString() : null,
        createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
      })),
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    const fileName = `WhatsApp_Backup_${exportDate}.json`;

    // Upload to Google Drive
    if (!ENV.googleClientId || !ENV.googleClientSecret || !ENV.googleRefreshToken) {
      console.warn("[WA Backup] Google credentials not configured — skipping Drive upload");
      return res.json({ ok: true, skipped: "no-google-credentials", messageCount: messages.length });
    }

    const auth = getOAuth2Client();
    const drive = google.drive({ version: "v3", auth });

    const folderId = await ensureBackupFolder(drive);

    // Convert string to readable stream
    const stream = Readable.from([jsonContent]);

    const uploadRes = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: "application/json",
        parents: [folderId],
      },
      media: {
        mimeType: "application/json",
        body: stream,
      },
      fields: "id, name, webViewLink",
    });

    console.log(`[WA Backup] ✅ Uploaded ${fileName} to Google Drive — ${uploadRes.data.webViewLink}`);

    return res.json({
      ok: true,
      fileName,
      fileId: uploadRes.data.id,
      webViewLink: uploadRes.data.webViewLink,
      messageCount: messages.length,
      groupCount: groups.length,
    });
  } catch (err: any) {
    console.error("[WA Backup] ❌ Backup failed:", err.message);
    return res.status(500).json({
      error: err.message,
      stack: err.stack,
      context: { url: req.url, taskUid: req.headers["x-manus-cron-task-uid"] },
      timestamp: new Date().toISOString(),
    });
  }
}
