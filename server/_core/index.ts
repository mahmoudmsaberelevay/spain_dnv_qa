import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startReminderScheduler } from "../reminderScheduler";
import { startMonthlyReportScheduler } from "../monthlyReportScheduler";
import { startRateScheduler } from "../rateScheduler";

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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
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
  // Meta Ads Lead Gen Webhook
  const { verifyMetaWebhook, processMetaLeadEvent } = await import("../metaAdsWebhook");
  app.get("/api/webhook/meta-leads", verifyMetaWebhook);
  app.post("/api/webhook/meta-leads", processMetaLeadEvent);
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
