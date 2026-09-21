import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerAuthRoutes } from "./auth-routes";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite, registerBackupRoutes } from "./vite";
import { getBackupDownloadHTML } from "../backupDownloadPage";
import fs from "fs";
import path from "path";
import { startReminderScheduler } from "../reminderScheduler";
import { startMonthlyReportScheduler } from "../monthlyReportScheduler";
import { startRateScheduler } from "../rateScheduler";
import rateLimit from "express-rate-limit";
import { requireBackupAdmin } from "../backupAccess";

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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust the first proxy (Manus reverse proxy / load balancer)
  app.set("trust proxy", 1);

  // Apple App Site Association — must be served with application/json content-type
  app.get("/.well-known/apple-app-site-association", (_req, res) => {
    const aasaContent = {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: ["8M53HJ223G.com.app.elevaymobile"],
            components: [
              { "/": "/client-app/*", exclude: true },
              { "/": "/client-questionnaire", exclude: true },
              { "/": "/*" },
            ]
          },
          {
            appIDs: ["8M53HJ223G.com.elevay.client"],
            components: [{ "/": "/client-app/*" }]
          }
        ]
      },
      webcredentials: {
        apps: ["8M53HJ223G.com.app.elevaymobile", "8M53HJ223G.com.elevay.client"]
      }
    };
    res.setHeader("Content-Type", "application/json");
    res.json(aasaContent);
  });

  // Android App Links — Digital Asset Links
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const assetlinks = [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.app.elevaymobile",
          sha256_cert_fingerprints: [
            "D7:1E:11:BB:98:F3:2A:6F:FB:AC:12:F2:A7:86:E8:C7:16:FE:E5:D6:F1:AC:99:E8:B1:9D:BD:B5:31:37:DE:E7"
          ]
        }
      },
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.elevay.client",
          sha256_cert_fingerprints: [
            "D7:1E:11:BB:98:F3:2A:6F:FB:AC:12:F2:A7:86:E8:C7:16:FE:E5:D6:F1:AC:99:E8:B1:9D:BD:B5:31:37:DE:E7",
            "4D:48:21:19:C8:EE:FA:87:88:77:F0:E1:2B:EB:8E:0D:83:8D:4B:0C:40:2E:2C:3A:30:F1:4F:3B:C7:C0:CC:D8"
          ]
        }
      }
    ];
    res.setHeader("Content-Type", "application/json");
    res.json(assetlinks);
  });

  // Backup download page (register FIRST to bypass all middleware)
  app.get("/backup", requireBackupAdmin, (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(getBackupDownloadHTML());
  });

  // Backup download API
  app.get("/api/backup/download/:filename", requireBackupAdmin, (req, res) => {
    try {
      const filename = decodeURIComponent(req.params.filename);
      const BACKUP_DIR = "/home/ubuntu/backups";

      if (!filename.endsWith(".sql.gz.enc")) {
        return res.status(400).json({ error: "Invalid file type" });
      }

      if (filename.includes("..") || filename.includes("/")) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      const filePath = path.join(BACKUP_DIR, filename);

      if (!filePath.startsWith(BACKUP_DIR)) {
        return res.status(400).json({ error: "Invalid path" });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Backup file not found" });
      }

      const stats = fs.statSync(filePath);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", stats.size);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on("error", (err) => {
        console.error("File stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Download failed" });
        }
      });
    } catch (error) {
      console.error("Download error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

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

  // Manus signs council-task callbacks over the raw request body, so this route
  // must be registered before the global JSON parser consumes that body.
  app.post("/api/webhook/manus-ai-council", express.raw({ type: "application/json", limit: "2mb" }), async (req, res) => {
    const { handleManusCouncilWebhook } = await import("../aiCouncilWebhook");
    await handleManusCouncilWebhook(req, res);
  });

  // Meta Lead Ads signatures must be validated against the untouched body.
  // The registrar includes the exact production callback
  // /api/webhooks/meta-leads-v2 and keeps it before express.json(), tRPC,
  // static assets, and the SPA fallback.
  const { registerMetaAdsWebhookRoutes } = await import("../metaAdsWebhook");
  registerMetaAdsWebhookRoutes(app);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Parse cookies
  app.use(cookieParser());
  // Storage proxy for webdev-uploaded assets
  registerStorageProxy(app);
  // Health/warm-up endpoint — used by the frontend to wake the server before OAuth login
  app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Email/password authentication routes
  registerAuthRoutes(app);
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
    const { verifyWaBridgeSecret, ingestWaBridgePayload, enrichWaBridgeMedia } = await import("../waBridgeSyncService");
    const receivedSecret = Array.isArray(req.headers["x-bridge-secret"])
      ? req.headers["x-bridge-secret"][0]
      : req.headers["x-bridge-secret"];
    if (!verifyWaBridgeSecret(receivedSecret)) return res.status(403).json({ ok: false, code: "FORBIDDEN" });
    try {
      const result = await ingestWaBridgePayload(req.body);
      if (!result.accepted) return res.status(400).json({ ok: false, code: result.code });
      res.status(200).json({ ok: true, inserted: result.inserted, duplicate: "duplicate" in result && result.duplicate === true });
      if (result.inserted && req.body?.mediaBase64 && req.body?.mediaMimeType) {
        void enrichWaBridgeMedia(req.body).catch(() => undefined);
      }
    } catch {
      return res.status(500).json({ ok: false, code: "INGEST_FAILED" });
    }
  });

  // Website / Landing Page Lead Webhook
  const { registerSpainLandingLeadRoutes } = await import("../spainLandingLeadsService");
  registerSpainLandingLeadRoutes(app);

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
      const email = (body.email as string) || undefined;
      const whatsapp = (body.whatsapp as string) || undefined;
      const { createLead } = await import("../leadsDb");
      const { findLeadContactMatch } = await import("../leadContactMatcher");
      const { isLeadContactUniqueViolation, normalizeLeadEmail, normalizeLeadPhone } = await import("../leadContactIdentity");
      const contactMatch = await findLeadContactMatch({ phone, whatsapp, email, isMetaTestLead: false });
      if (contactMatch.status === "matched") {
        return res.status(200).json({ success: true, leadId: contactMatch.lead.id, created: false, duplicate: true, matchMethod: contactMatch.method });
      }
      if (contactMatch.status === "ambiguous") {
        return res.status(409).json({ error: "Multiple existing Leads match these contact details", code: "AMBIGUOUS_CONTACT_MATCH" });
      }
      const utmParams = {
        source: body.utm_source, medium: body.utm_medium, campaign: body.utm_campaign,
      };
      let leadId: number;
      try {
        leadId = await createLead({
          fullName,
          phone: phone || undefined,
          whatsapp,
          email,
          normalizedPhone: normalizeLeadPhone(phone || whatsapp),
          normalizedEmail: normalizeLeadEmail(email),
          nationality: (body.nationality as string) || undefined,
          interestedProgram: (body.interested_program as string) || undefined,
          interestedCountry: (body.interested_country as string) || undefined,
          leadSource: (body.lead_source as string) || integration.name,
          budgetRange: (body.budget_range as string) || undefined,
          utmParams: Object.values(utmParams).some(Boolean) ? JSON.stringify(utmParams) : undefined,
          stage: "fresh",
        });
      } catch (error) {
        if (!isLeadContactUniqueViolation(error)) throw error;
        const raceMatch = await findLeadContactMatch({ phone, whatsapp, email, isMetaTestLead: false });
        if (raceMatch.status === "matched") {
          return res.status(200).json({ success: true, leadId: raceMatch.lead.id, created: false, duplicate: true, matchMethod: raceMatch.method });
        }
        return res.status(409).json({ error: "Multiple existing Leads match these contact details", code: "AMBIGUOUS_CONTACT_MATCH" });
      }
      return res.status(200).json({ success: true, leadId, created: true, duplicate: false, matchMethod: null });
    } catch (err) {
      console.error("[Website Webhook] Error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  // WhatsApp Weekly Backup (Heartbeat cron + manual trigger)
  const { waBackupHandler } = await import("../waBackupHandler");
  app.post("/api/scheduled/waBackup", waBackupHandler);

  // Scheduled Database Backup (Heartbeat cron Mon-Thu 18:00 Cairo + manual trigger)
  const { scheduledDbBackupHandler } = await import("../scheduledDbBackupHandler");
  app.post("/api/scheduled/dbBackup", scheduledDbBackupHandler);
  const { scheduledMetaReconciliationHandler } = await import("../scheduledMetaReconciliationHandler");
  app.post("/api/scheduled/metaReconciliation", scheduledMetaReconciliationHandler);
  const { scheduledMetaMonitoringHandler } = await import("../scheduledMetaMonitoringHandler");
  app.post("/api/scheduled/metaMonitoring", scheduledMetaMonitoringHandler);
  const { scheduledPublicContentSyncHandler } = await import("../scheduledPublicContentSyncHandler");
  app.post("/api/scheduled/publicContentSync", scheduledPublicContentSyncHandler);
  const { scheduledClientLifecycleRemindersHandler } = await import("../scheduledClientLifecycleRemindersHandler");
  app.post("/api/scheduled/clientLifecycleReminders", scheduledClientLifecycleRemindersHandler);
  const { scheduledClientChatMessageHandler } = await import("../scheduledClientChatMessageHandler");
  app.post("/api/scheduled/clientChatMessage", scheduledClientChatMessageHandler);

  // Backup list endpoint
  app.get("/api/backup/list", requireBackupAdmin, (req, res) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const BACKUP_DIR = "/home/ubuntu/backups";

      if (!fs.existsSync(BACKUP_DIR)) {
        return res.json({ success: true, backups: [] });
      }

      const files = fs.readdirSync(BACKUP_DIR)
        .filter((f) => f.endsWith(".sql.gz.enc"))
        .sort()
        .reverse();

      const backups = files.map((filename) => {
        const filePath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(filePath);
        const createdAt = stats.mtime.getTime();
        
        return {
          filename,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          createdAt,
          createdAtFormatted: new Date(createdAt).toLocaleString(),
          hasManifest: fs.existsSync(path.join(BACKUP_DIR, filename + ".manifest")),
          downloadUrl: `/api/backup/download/${encodeURIComponent(filename)}`,
        };
      });

      res.json({ success: true, backups });
    } catch (error) {
      console.error("Backup list error:", error);
      res.status(500).json({ success: false, error: "Failed to list backups" });
    }
  });

  // Backup stats endpoint
  app.get("/api/backup/stats", requireBackupAdmin, (req, res) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const BACKUP_DIR = "/home/ubuntu/backups";

      if (!fs.existsSync(BACKUP_DIR)) {
        return res.json({
          success: true,
          stats: {
            totalBackups: 0,
            totalSize: 0,
            totalSizeFormatted: "0 B",
            averageSize: 0,
            averageSizeFormatted: "0 B",
            oldestBackup: null,
            newestBackup: null,
            encryption: "AES-256-GCM",
            credentialStorage: "server-side secret",
            retention: "10 days",
            schedule: "Mon-Thu 18:00 Cairo",
          },
        });
      }

      const files = fs.readdirSync(BACKUP_DIR)
        .filter((f) => f.endsWith(".sql.gz.enc"))
        .sort()
        .reverse();

      let totalSize = 0;
      const backupDates = [];

      files.forEach((filename) => {
        const filePath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        backupDates.push(stats.mtime.getTime());
      });

      const oldestDate = backupDates.length > 0 ? Math.min(...backupDates) : null;
      const newestDate = backupDates.length > 0 ? Math.max(...backupDates) : null;

      res.json({
        success: true,
        stats: {
          totalBackups: files.length,
          totalSize,
          totalSizeFormatted: formatBytes(totalSize),
          averageSize: files.length > 0 ? totalSize / files.length : 0,
          averageSizeFormatted: files.length > 0 ? formatBytes(totalSize / files.length) : "0 B",
          oldestBackup: oldestDate ? { filename: files[files.length - 1], date: oldestDate, dateFormatted: new Date(oldestDate).toLocaleString() } : null,
          newestBackup: newestDate ? { filename: files[0], date: newestDate, dateFormatted: new Date(newestDate).toLocaleString() } : null,
          encryption: "AES-256-GCM",
          credentialStorage: "server-side secret",
          retention: "10 days",
          schedule: "Mon-Thu 18:00 Cairo",
        },
      });
    } catch (error) {
      console.error("Backup stats error:", error);
      res.status(500).json({ success: false, error: "Failed to get stats" });
    }
  });

  // Backup download endpoints
  app.get("/api/backup/download/:filename", requireBackupAdmin, (req, res) => {
    try {
      const fs = require("fs");
      const path = require("path");
      const filename = decodeURIComponent(req.params.filename);
      const BACKUP_DIR = "/home/ubuntu/backups";

      if (!filename.endsWith(".sql.gz.enc")) {
        return res.status(400).json({ error: "Invalid file type" });
      }

      if (filename.includes("..") || filename.includes("/")) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      const filePath = path.join(BACKUP_DIR, filename);

      if (!filePath.startsWith(BACKUP_DIR)) {
        return res.status(400).json({ error: "Invalid path" });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Backup file not found" });
      }

      const stats = fs.statSync(filePath);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", stats.size);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on("error", (err) => {
        console.error("File stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Download failed" });
        }
      });
    } catch (error) {
      console.error("Download error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Backup preview upload endpoint
  const multerMod = await import("multer");
  const multerUpload = multerMod.default({ dest: "/tmp/backup-uploads/", limits: { fileSize: 50 * 1024 * 1024 } });
  const { decryptBackupBuffer } = await import("../backupEncryption");
  const zlib = await import("zlib");

  app.post("/api/backup/preview/upload", requireBackupAdmin, multerUpload.single("file"), async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const uploadedPath = req.file.path;
      const originalName = req.file.originalname || "backup.sql.gz.enc";

      // Step 1: Decrypt with the server-only restoration secret.
      let compressed: Buffer;
      try {
        compressed = decryptBackupBuffer(fs.readFileSync(uploadedPath));
      } catch {
        fs.unlinkSync(uploadedPath);
        return res.status(400).json({ error: "Failed to decrypt file. The backup is unsupported, corrupted, or does not match the server restoration key." });
      }

      // Step 2: Decompress gzip
      const sqlPath = uploadedPath + ".sql";
      try {
        const decompressed = zlib.gunzipSync(compressed);
        fs.writeFileSync(sqlPath, decompressed);
      } catch (gzipErr) {
        fs.unlinkSync(uploadedPath);
        return res.status(400).json({ error: "Failed to decompress file. File may be corrupted." });
      }

      // Step 3: Parse SQL to extract table info
      const sqlContent = fs.readFileSync(sqlPath, "utf-8");
      const tables: any[] = [];
      
      // Find CREATE TABLE statements
      const createTableRegex = /CREATE TABLE[^`]*`([^`]+)`\s*\(([^;]+?)\)\s*(?:ENGINE|;)/gs;
      let match;
      while ((match = createTableRegex.exec(sqlContent)) !== null) {
        const tableName = match[1];
        const columnsBlock = match[2];
        
        // Extract column names
        const columns: string[] = [];
        const colRegex = /^\s*`([^`]+)`/gm;
        let colMatch;
        while ((colMatch = colRegex.exec(columnsBlock)) !== null) {
          columns.push(colMatch[1]);
        }

        // Count INSERT rows for this table
        const insertRegex = new RegExp(`INSERT INTO \`${tableName}\`.*?VALUES\s*(.+?)(?:;|$)`, "gs");
        let rowCount = 0;
        let sampleData: any[] = [];
        let insertMatch;
        while ((insertMatch = insertRegex.exec(sqlContent)) !== null) {
          const valuesStr = insertMatch[1];
          // Count rows by counting opening parens at value start
          const rows = valuesStr.split(/\),\s*\(/);
          rowCount += rows.length;
          
          // Extract first 3 rows as sample data
          if (sampleData.length < 3) {
            for (let i = 0; i < Math.min(3 - sampleData.length, rows.length); i++) {
              const row = rows[i].replace(/^\(|\)$/g, "");
              const values = row.split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map(v => v.trim().replace(/^'|'$/g, ""));
              const rowObj: any = {};
              columns.forEach((col, idx) => {
                rowObj[col] = values[idx] || null;
              });
              sampleData.push(rowObj);
            }
          }
        }

        tables.push({
          name: tableName,
          rowCount,
          columns: columns.slice(0, 20), // Limit to 20 columns
          sampleData: sampleData.slice(0, 3),
        });
      }

      // Get file stats
      const stats = fs.statSync(uploadedPath);
      const totalSize = formatBytes(stats.size);

      // Extract date from filename
      const dateMatch = originalName.match(/(\d{4}-\d{2}-\d{2}[_T]\d{2}[-:]\d{2}[-:]\d{2})/);
      const backupDate = dateMatch ? dateMatch[1].replace(/_/g, " ").replace(/-/g, ":") : new Date().toLocaleString();

      // Cleanup temp files
      fs.existsSync(uploadedPath) && fs.unlinkSync(uploadedPath);
      fs.existsSync(sqlPath) && fs.unlinkSync(sqlPath);

      res.json({
        fileName: originalName,
        backupDate,
        totalSize,
        tables: tables.sort((a, b) => b.rowCount - a.rowCount),
      });
    } catch (error: any) {
      console.error("Backup preview error:", error);
      // Cleanup on error
      if (req.file?.path) {
        fs.existsSync(req.file.path) && fs.unlinkSync(req.file.path);
        fs.existsSync(req.file.path + ".sql") && fs.unlinkSync(req.file.path + ".sql");
      }
      res.status(500).json({ error: error.message || "Failed to preview backup" });
    }
  });

  // Register backup routes BEFORE Vite (to avoid catch-all)
  registerBackupRoutes(app);

  // ELEVAY Client App APIs are isolated from the employee tRPC identity layer.
  const { registerPublicContentRoutes } = await import("../publicContentService.js");
  registerPublicContentRoutes(app);
  const { registerNewsRoutes } = await import("../newsRoutes.js");
  registerNewsRoutes(app);
  const { scheduledNewsDigestHandler } = await import("../scheduledNewsDigestHandler.js");
  app.post("/api/scheduled/news-digest", scheduledNewsDigestHandler);
  const { registerClientPortalRoutes } = await import("../clientPortalRoutes.js");
  registerClientPortalRoutes(app);

  // Server-rendered public legal pages (no JS bundle needed, always accessible)
  const { registerPublicPages } = await import("../publicPagesHandler.js");
  registerPublicPages(app);
  const { registerClientAppPublicPages } = await import("../clientAppPublicPages.js");
  registerClientAppPublicPages(app);
  const { registerClientAppAiPages } = await import("../clientAppAiPages.js");
  registerClientAppAiPages(app);

  // MCP Server for AI agent integration (Claude, Manus, ChatGPT, Cursor)
  const { registerMcpServer } = await import("../mcpServer.js");
  registerMcpServer(app);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // The login shell must not be cached by browsers or shared proxies.
  // This does not control password-manager behavior, but prevents stale auth UI from being reused.
  app.use("/login", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

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
