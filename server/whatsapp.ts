import axios from "axios";
import { storagePut } from "./storage";
import {
  getActiveConfig,
  getGroupById,
  getWaMediaByMessageId,
  insertWaMediaFile,
  insertWaMessage,
  updateGroupStats,
  updateWaMediaFile,
  upsertGroup,
} from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────
interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}
interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  video?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string; sha256: string };
  document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type: string; sha256: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reaction?: { message_id: string; emoji: string };
  context?: { from: string; id: string };
  group_id?: string;
}
interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: { display_phone_number: string; phone_number_id: string };
      contacts?: WhatsAppContact[];
      messages?: WhatsAppMessage[];
      statuses?: unknown[];
    };
    field: string;
  }>;
}
export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

// ─── Webhook Verification ─────────────────────────────────────────────────────
export async function verifyWebhook(mode: string, token: string, challenge: string): Promise<string | null> {
  const config = await getActiveConfig();
  const verifyToken = config?.webhookVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token === verifyToken) {
    console.log("[WA Webhook] Verification successful");
    return challenge;
  }
  return null;
}

// ─── Webhook Processing ───────────────────────────────────────────────────────
export async function processWebhookPayload(payload: WhatsAppWebhookPayload): Promise<void> {
  if (payload.object !== "whatsapp_business_account") return;
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const { messages, contacts } = change.value;
      if (!messages || messages.length === 0) continue;
      const contactMap = new Map<string, string>();
      if (contacts) {
        for (const c of contacts) contactMap.set(c.wa_id, c.profile.name);
      }
      for (const msg of messages) {
        await processMessage(msg, contactMap);
      }
    }
  }
}

async function processMessage(msg: WhatsAppMessage, contactMap: Map<string, string>): Promise<void> {
  const senderName = contactMap.get(msg.from) || null;
  // Determine groupId: if message has group_id, use it; otherwise use sender phone
  const groupId = msg.group_id || msg.from;
  // Ensure group exists
  const existingGroup = await getGroupById(groupId);
  if (!existingGroup) {
    await upsertGroup({
      groupId,
      name: senderName || groupId,
      isActive: true,
      messageCount: 0,
    });
  }
  // Extract message fields
  let messageType = mapMessageType(msg.type);
  let textContent: string | null = null;
  let caption: string | null = null;
  let mediaId: string | null = null;
  let mimeType: string | null = null;
  let fileName: string | null = null;
  let latitude: string | null = null;
  let longitude: string | null = null;
  let locationName: string | null = null;
  let reactionEmoji: string | null = null;
  let reactedToMessageId: string | null = null;

  switch (msg.type) {
    case "text":
      textContent = msg.text?.body || null;
      break;
    case "image":
      mediaId = msg.image?.id || null;
      mimeType = msg.image?.mime_type || null;
      caption = msg.image?.caption || null;
      break;
    case "video":
      mediaId = msg.video?.id || null;
      mimeType = msg.video?.mime_type || null;
      caption = msg.video?.caption || null;
      break;
    case "audio":
      mediaId = msg.audio?.id || null;
      mimeType = msg.audio?.mime_type || null;
      break;
    case "document":
      mediaId = msg.document?.id || null;
      mimeType = msg.document?.mime_type || null;
      fileName = msg.document?.filename || null;
      caption = msg.document?.caption || null;
      break;
    case "sticker":
      mediaId = msg.sticker?.id || null;
      mimeType = msg.sticker?.mime_type || null;
      break;
    case "location":
      latitude = String(msg.location?.latitude);
      longitude = String(msg.location?.longitude);
      locationName = msg.location?.name || null;
      textContent = msg.location?.address || null;
      break;
    case "reaction":
      reactionEmoji = msg.reaction?.emoji || null;
      reactedToMessageId = msg.reaction?.message_id || null;
      break;
  }

  await insertWaMessage({
    messageId: msg.id,
    groupId,
    senderId: msg.from,
    senderName,
    senderPhone: msg.from,
    messageType,
    textContent,
    caption,
    mediaId,
    mimeType,
    fileName,
    latitude,
    longitude,
    locationName,
    reactionEmoji,
    reactedToMessageId,
    rawPayload: msg as any,
    whatsappTimestamp: parseInt(msg.timestamp, 10) * 1000,
  });

  await updateGroupStats(groupId);

  if (mediaId) {
    await insertWaMediaFile({
      messageId: msg.id,
      mediaId,
      mimeType: mimeType || null,
      fileName: fileName || generateFileName(mimeType || ""),
      downloadStatus: "pending",
    });
    downloadMedia(msg.id, mediaId, mimeType || "application/octet-stream", fileName || undefined).catch(
      (err) => console.error("[WA Media] Download failed:", err)
    );
  }
  console.log(`[WA Webhook] Processed ${messageType} message ${msg.id} in group ${groupId}`);
}

// ─── Media Download ───────────────────────────────────────────────────────────
export async function downloadMedia(messageId: string, mediaId: string, mimeType: string, originalFileName?: string): Promise<void> {
  const config = await getActiveConfig();
  const accessToken = config?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn("[WA Media] No access token configured, skipping download");
    return;
  }
  const mediaRecords = await getWaMediaByMessageId(messageId);
  const mediaRecord = mediaRecords.find((r) => r.mediaId === mediaId);
  if (!mediaRecord) return;
  try {
    const metaResponse = await axios.get(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    });
    const mediaUrl: string = metaResponse.data.url;
    if (!mediaUrl) throw new Error("No media URL returned from Meta API");
    const downloadResponse = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: "arraybuffer",
      timeout: 60000,
    });
    const buffer = Buffer.from(downloadResponse.data);
    const ext = getExtensionFromMimeType(mimeType);
    const storageFileName = originalFileName || `${mediaId}.${ext}`;
    const storageKey = `whatsapp-media/${messageId}/${storageFileName}`;
    const { url: storageUrl } = await storagePut(storageKey, buffer, mimeType);
    await updateWaMediaFile(mediaRecord.id, {
      storageKey,
      storageUrl,
      fileName: storageFileName,
      fileSize: buffer.length,
      downloadStatus: "downloaded",
      downloadedAt: new Date(),
    });
    console.log(`[WA Media] Downloaded and stored: ${storageKey} (${buffer.length} bytes)`);
  } catch (err: any) {
    console.error(`[WA Media] Failed to download ${mediaId}:`, err.message);
    if (mediaRecord) {
      await updateWaMediaFile(mediaRecord.id, {
        downloadStatus: "failed",
        downloadError: err.message,
      });
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mapMessageType(type: string): any {
  const map: Record<string, string> = {
    text: "text", image: "image", video: "video", audio: "audio",
    document: "document", sticker: "sticker", location: "location",
    reaction: "reaction", contacts: "contacts",
  };
  return map[type] || "unknown";
}
function getExtensionFromMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
    "video/mp4": "mp4", "video/3gpp": "3gp", "audio/mpeg": "mp3", "audio/ogg": "ogg",
    "audio/wav": "wav", "audio/aac": "aac", "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return map[mimeType] || "bin";
}
function generateFileName(mimeType: string): string {
  return `media_${Date.now()}.${getExtensionFromMimeType(mimeType)}`;
}
