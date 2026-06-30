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
  app.post("/api/webhook/baileys", async (req, res) => {
    const secret = req.headers["x-bridge-secret"];
    if (secret !== "elevay-bridge-2024") return res.status(403).send("Forbidden");
    res.status(200).send("OK");
    try {
      const body = req.body as {
        messageId: string; groupId: string; groupName: string | null;
        senderPhone: string; senderName: string | null; fromMe: boolean;
        isGroup: boolean; textContent: string | null; messageType: string; timestamp: string;
      };
      const { upsertGroup, insertWaMessage, updateGroupStats } = await import("../db");
      await upsertGroup({
        groupId: body.groupId,
        name: body.groupName || body.senderName || body.senderPhone || body.groupId,
        isGroup: body.isGroup,
        lastSender: body.fromMe ? "ELEVAY" : (body.senderName || body.senderPhone || null),
        messageCount: 0,
      });
      await insertWaMessage({
        messageId: body.messageId,
        groupId: body.groupId,
        senderId: body.senderPhone || (body.fromMe ? "me" : "unknown"),
        senderPhone: body.senderPhone || null,
        senderName: body.senderName || null,
        textContent: body.textContent || null,
        messageType: body.messageType || "text",
        fromMe: body.fromMe,
        createdAt: body.timestamp ? new Date(body.timestamp) : new Date(),
      });
      await updateGroupStats(body.groupId);
    } catch (err) {
      console.error("[Baileys Webhook] Error:", err);
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
