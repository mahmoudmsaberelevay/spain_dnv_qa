import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startReminderScheduler } from "../reminderScheduler";
import { startMonthlyReportScheduler } from "../monthlyReportScheduler";
import { startRateScheduler } from "../rateScheduler";
import { startMetaLeadSyncScheduler } from "../metaLeadSyncScheduler";
import { startWeeklyBackupScheduler } from "../weeklyBackupScheduler";
import rateLimit from "express-rate-limit";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust the first proxy (Manus reverse proxy / load balancer)
  app.set("trust proxy", 1);

  // ── Rate limiting ──────────────────────────────────────────────────────────
  // General API limiter: 200 requests per minute per IP
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again in a minute." },
    skip: (req) => req.ip === "127.0.0.1" || req.ip === "::1", // skip localhost
  });
  // Strict OAuth limiter: 20 attempts per 15 minutes per IP
  const oauthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts, please try again later." },
  });
  app.use("/api/trpc", apiLimiter);
  app.use("/api/oauth", oauthLimiter);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Storage proxy for webdev-uploaded assets
  registerStorageProxy(app);
  // Health/warm-up endpoint — used by the frontend to wake the server before OAuth login
  app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // WhatsApp webhook
  app.get("/api/webhook/whatsapp", async (req, res) => {
    const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query as Record<string, string>;
    const { verifyWebhook } = await import("../whatsapp");
    const result = await verifyWebhook(mode, token, challenge);
    if (result !== null) return res.status(200).send(result);
    return res.status(403).send("Forbidden");
  });
  app.post("/api/webhook/whatsapp", async (req, res) => {
    res.status(200).send("EVENT_RECEIVED");
    try {
      const { processWebhookPayload } = await import("../whatsapp");
      await processWebhookPayload(req.body);
    } catch (err) {
      console.error("[WA Webhook] Processing error:", err);
    }
  });
  // Baileys WhatsApp Bridge Webhook
  app.post("/api/webhook/baileys", express.json({ limit: "50mb" }), async (req, res) => {
    const secret = req.headers["x-bridge-secret"];
    if (secret !== "elevay-bridge-2024") return res.status(403).send("Forbidden");
    // Respond immediately so the bridge never times out
    res.status(200).send("OK");
    const body = req.body as {
      messageId?: string; groupId?: string; groupName?: string | null;
      senderPhone?: string; senderName?: string | null; fromMe?: boolean;
      isGroup?: boolean; textContent?: string | null; messageType?: string; timestamp?: string;
      mediaBase64?: string; mediaMimeType?: string; mediaSize?: number;
    };
      // Validate required fields — log and drop if missing
      if (!body?.messageId || !body?.groupId) {
        console.error("[Baileys Webhook] ❌ Missing required fields. Payload:", JSON.stringify(body).slice(0, 200));
        return;
      }
      // Skip internal WhatsApp system messages — never store these
      if (body.messageType === 'system') {
        console.log(`[Baileys Webhook] ⏭️ Skipping system message ${body.messageId}`);
        return;
      }
    try {
      const { upsertGroup, insertWaMessage, updateGroupStats, updateWaMessageMedia } = await import("../db");
      // Step 1: Upsert the group/contact record
      await upsertGroup({
        groupId: body.groupId,
        name: body.groupName || body.senderName || body.senderPhone || body.groupId,
        isGroup: body.isGroup ?? body.groupId.includes("@g.us"),
        lastSender: body.fromMe ? "ELEVAY" : (body.senderName || body.senderPhone || null),
        messageCount: 0,
      });
      // Step 2: Insert the message (deduplicated by messageId)
      const validMessageTypes = ["text","image","video","audio","document","sticker","location","reaction","contacts","unknown"];
      const msgType = validMessageTypes.includes(body.messageType || "") ? body.messageType! : "unknown";
      await insertWaMessage({
        messageId: body.messageId,
        groupId: body.groupId,
        senderId: body.senderPhone || (body.fromMe ? "me" : "unknown"),
        senderPhone: body.senderPhone || null,
        senderName: body.senderName || null,
        textContent: body.textContent || null,
        messageType: msgType as any,
        fromMe: body.fromMe ?? false,
        whatsappTimestamp: body.timestamp ? Math.floor(new Date(body.timestamp).getTime() / 1000) : null,
        createdAt: body.timestamp ? new Date(body.timestamp) : new Date(),
      });
      // Step 3: Update group message count and last message time
      await updateGroupStats(body.groupId);
      console.log(`[Baileys Webhook] ✅ Stored msg ${body.messageId} | group=${body.groupId} | from=${body.fromMe ? 'ELEVAY' : (body.senderName || body.senderPhone || 'unknown')} | type=${msgType}`);

      // Step 4: Handle media — upload to S3 and transcribe audio
      if (body.mediaBase64 && body.mediaMimeType) {
        (async () => {
          try {
            const { storagePut } = await import("../storage");
            const mediaBuffer = Buffer.from(body.mediaBase64!, "base64");
            const ext = body.mediaMimeType!.split("/")[1]?.split(";")[0] || "bin";
            const safeExt = ext === "ogg" ? "ogg" : ext === "opus" ? "ogg" : ext;
            const fileKey = `wa-media/${body.groupId}/${body.messageId}.${safeExt}`;
            const { url: mediaUrl } = await storagePut(fileKey, mediaBuffer, body.mediaMimeType!.split(";")[0]);
            let transcript: string | null = null;
            let transcriptLang: string | null = null;
            // Transcribe audio messages using Whisper
            if (msgType === "audio") {
              try {
                const { transcribeAudio } = await import("./voiceTranscription");
                const result = await transcribeAudio({ audioUrl: mediaUrl, language: "ar", prompt: "This is a WhatsApp voice note. Transcribe accurately in the original language." });
                transcript = result.text || null;
                transcriptLang = result.language || "ar";
                console.log(`[Baileys Webhook] 🎙️ Transcribed audio ${body.messageId}: ${transcript?.slice(0, 80)}`);
              } catch (tErr: any) {
                console.error(`[Baileys Webhook] ⚠️ Transcription failed for ${body.messageId}:`, tErr.message);
              }
            }
            // Extract text from PDF and Word documents
            let docText: string | null = null;
            const mimeClean = body.mediaMimeType!.split(";")[0].toLowerCase();
            const fileNameLower = (body.fileName || "").toLowerCase();
            const isPdf = mimeClean === "application/pdf" || fileNameLower.endsWith(".pdf");
            const isWord = mimeClean.includes("wordprocessingml") || mimeClean === "application/msword" ||
              fileNameLower.endsWith(".docx") || fileNameLower.endsWith(".doc");
            if (isPdf) {
              try {
                const pdfParse = (await import("pdf-parse")).default;
                const pdfData = await pdfParse(mediaBuffer);
                docText = pdfData.text?.trim() || null;
                console.log(`[Baileys Webhook] 📄 PDF extracted for ${body.messageId}: ${docText?.slice(0, 100)}`);
              } catch (pdfErr: any) {
                console.error(`[Baileys Webhook] ⚠️ PDF extraction failed for ${body.messageId}:`, pdfErr.message);
              }
            } else if (isWord) {
              try {
                const mammoth = await import("mammoth");
                const result = await mammoth.extractRawText({ buffer: mediaBuffer });
                docText = result.value?.trim() || null;
                console.log(`[Baileys Webhook] 📝 Word extracted for ${body.messageId}: ${docText?.slice(0, 100)}`);
              } catch (wordErr: any) {
                console.error(`[Baileys Webhook] ⚠️ Word extraction failed for ${body.messageId}:`, wordErr.message);
              }
            }
            await updateWaMessageMedia(body.messageId!, mediaUrl, body.mediaMimeType!.split(";")[0], transcript, transcriptLang, docText);
            console.log(`[Baileys Webhook] 📎 Media stored for ${body.messageId}: ${mediaUrl}`);
          } catch (mediaErr: any) {
            console.error(`[Baileys Webhook] ❌ Media upload failed for ${body.messageId}:`, mediaErr.message);
          }
        })();
      }
    } catch (err: any) {
      console.error(`[Baileys Webhook] ❌ Failed to store message ${body.messageId}: ${err?.message || err}`);
      if (err?.stack) console.error(err.stack);
    }
  });

  // Meta Ads Lead Gen Webhook
  const { verifyMetaWebhook, processMetaLeadEvent } = await import("../metaAdsWebhook");
  app.get("/api/webhook/meta-leads", verifyMetaWebhook);
  app.post("/api/webhook/meta-leads", processMetaLeadEvent);
  // Website / Landing Page Lead Webhook
  app.post("/api/webhook/leads/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { getIntegrationByToken } = await import("../leadsSettingsDb");
      const integration = await getIntegrationByToken(token);
      if (!integration || integration.type !== "website") {
        return res.status(404).json({ error: "Integration not found or inactive" });
      }
      const body = req.body as Record<string, unknown>;
      const fullName = (body.full_name ?? body.fullName ?? "") as string;
      const phone = (body.phone ?? "") as string;
      if (!fullName) {
        return res.status(400).json({ error: "full_name is required" });
      }
      const { createLead, checkDuplicate } = await import("../leadsDb");
      // Duplicate check by phone
      if (phone) {
        const dup = await checkDuplicate(phone);
        if (dup) {
          return res.status(409).json({ error: "Duplicate lead: phone already exists", leadId: dup.id });
        }
      }
      const utmParams = {
        source: body.utm_source, medium: body.utm_medium, campaign: body.utm_campaign,
      };
      const leadId = await createLead({
        fullName,
        phone: phone || undefined,
        email: (body.email as string) || undefined,
        nationality: (body.nationality as string) || undefined,
        interestedProgram: (body.interested_program as string) || undefined,
        interestedCountry: (body.interested_country as string) || undefined,
        leadSource: (body.lead_source as string) || integration.name,
        budgetRange: (body.budget_range as string) || undefined,
        utmParams: Object.values(utmParams).some(Boolean) ? JSON.stringify(utmParams) : undefined,
        stage: "fresh",
      });
      return res.status(200).json({ success: true, leadId });
    } catch (err) {
      console.error("[Website Webhook] Error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  // WhatsApp Weekly Backup (Heartbeat cron + manual trigger)
  const { waBackupHandler } = await import("../waBackupHandler");
  app.post("/api/scheduled/waBackup", waBackupHandler);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

// Start the daily document reminder scheduler
startReminderScheduler();
startMonthlyReportScheduler();
startRateScheduler();
// Start Meta Lead Ads 4-hour sync
startMetaLeadSyncScheduler();
startWeeklyBackupScheduler();
