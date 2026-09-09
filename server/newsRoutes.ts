import type { Express, NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { newsDigestSettings, publicNewsArticles, publicNewsPushSubscriptions } from "../drizzle/schema";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import {
  connectNewsGmail,
  createNewsGmailOAuthState,
  getNewsGmailAuthorizationUrl,
  getNewsGmailConnectionStatus,
  NEWS_MAX_ARTICLES,
  NEWS_SOURCE_MAILBOX,
  verifyNewsGmailOAuthState,
} from "./newsDigestService";

const PUSH_TOKEN = /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/;

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.role !== "admin") return res.status(403).json({ error: "admin_only" });
    next();
  } catch {
    return res.status(401).json({ error: "authentication_required" });
  }
}

function setupResult(res: Response, ok: boolean, message: string) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const color = ok ? "#299E68" : "#D9534F";
  return res.status(ok ? 200 : 400).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ELEVAY News Gmail</title><style>body{margin:0;background:#F7FAFC;color:#1A3A5C;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px}.card{max-width:620px;background:rgba(255,255,255,.82);border:1px solid rgba(91,126,151,.28);border-radius:24px;padding:28px;box-shadow:0 18px 50px rgba(18,52,74,.12)}h1{margin-top:0}.status{color:${color};font-weight:900}.button{display:inline-block;margin-top:12px;background:#1A3A5C;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:800}</style></head><body><main class="card"><p class="status">${ok ? "Connected" : "Connection failed"}</p><h1>ELEVAY News Gmail</h1><p>${message.replace(/[<>&]/g, "")}</p><a class="button" href="/">Return to ELEVAY CRM</a></main></body></html>`);
}

export function registerNewsRoutes(app: Express) {
  const subscriptionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests" },
  });
  const oauthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_oauth_requests" },
  });

  app.get("/public-api/news", async (_req: Request, res: Response) => {
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "service_unavailable" });
      const rows = await db.select({
        publicId: publicNewsArticles.publicId,
        title: publicNewsArticles.title,
        description: publicNewsArticles.description,
        sourceName: publicNewsArticles.sourceName,
        url: publicNewsArticles.url,
        publishedAt: publicNewsArticles.publishedAt,
        digestReceivedAt: publicNewsArticles.digestReceivedAt,
      }).from(publicNewsArticles).orderBy(desc(publicNewsArticles.digestReceivedAt), desc(publicNewsArticles.id)).limit(NEWS_MAX_ARTICLES);
      res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=900");
      return res.json(rows);
    } catch (error) {
      console.error("[News] Public feed failed:", error instanceof Error ? error.message : String(error));
      return res.status(500).json({ error: "news_unavailable" });
    }
  });

  app.post("/public-api/news/push-subscriptions", subscriptionLimiter, async (req: Request, res: Response) => {
    const pushToken = typeof req.body?.pushToken === "string" ? req.body.pushToken.trim() : "";
    if (!PUSH_TOKEN.test(pushToken)) return res.status(400).json({ error: "invalid_push_token" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "service_unavailable" });
    await db.insert(publicNewsPushSubscriptions).values({
      publicId: randomUUID(),
      pushToken,
      locale: req.body?.locale === "ar" ? "ar" : "en",
      platform: typeof req.body?.platform === "string" ? req.body.platform.slice(0, 32) : null,
      appVersion: typeof req.body?.appVersion === "string" ? req.body.appVersion.slice(0, 64) : null,
      isActive: true,
      lastSeenAt: new Date(),
    }).onDuplicateKeyUpdate({ set: {
      locale: req.body?.locale === "ar" ? "ar" : "en",
      platform: typeof req.body?.platform === "string" ? req.body.platform.slice(0, 32) : null,
      appVersion: typeof req.body?.appVersion === "string" ? req.body.appVersion.slice(0, 64) : null,
      isActive: true,
      lastSeenAt: new Date(),
    } });
    return res.json({ ok: true });
  });

  app.get("/api/admin/news/gmail/status", requireAdmin, async (_req: Request, res: Response) => {
    try {
      return res.json(await getNewsGmailConnectionStatus());
    } catch (error) {
      return res.status(503).json({ error: error instanceof Error ? error.message : "status_unavailable" });
    }
  });

  app.get("/api/admin/news/gmail/connect", oauthLimiter, (_req: Request, res: Response) => {
    try {
      const state = createNewsGmailOAuthState();
      return res.redirect(302, getNewsGmailAuthorizationUrl(state));
    } catch (error) {
      return setupResult(res, false, error instanceof Error ? error.message : "Unable to start Google authorization.");
    }
  });

  app.get("/api/admin/news/gmail/callback", oauthLimiter, async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !verifyNewsGmailOAuthState(state)) return setupResult(res, false, "The Google authorization response was invalid or expired.");
    try {
      const result = await connectNewsGmail(code);
      return setupResult(res, true, `${result.email} is now connected with read-only Gmail access. The daily News importer will read only messages whose subject contains Daily Digest.`);
    } catch (error) {
      return setupResult(res, false, error instanceof Error ? error.message : "Unable to connect Gmail.");
    }
  });

  app.get("/api/admin/news/status-page", requireAdmin, async (_req: Request, res: Response) => {
    const status = await getNewsGmailConnectionStatus();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ELEVAY News Setup</title><style>body{background:#F7FAFC;color:#1A3A5C;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:760px;margin:0 auto;padding:40px 22px}.card{background:#fff;border:1px solid #DCE6EC;border-radius:22px;padding:24px}.button{display:inline-block;background:#1A3A5C;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:800}.ok{color:#299E68}.pending{color:#E79B2A}code{background:#EAF5F7;padding:3px 7px;border-radius:7px}</style></head><body><div class="card"><h1>ELEVAY News Gmail</h1><p class="${status.connected ? "ok" : "pending"}"><strong>${status.connected ? "Connected" : "Connection required"}</strong></p><p>Mailbox: <code>${NEWS_SOURCE_MAILBOX}</code></p><p>Subject trigger: <code>Daily Digest</code></p><p>The importer uses read-only Gmail permission, imports newest articles first, and retains the latest 200.</p><a class="button" href="/api/admin/news/gmail/connect">${status.connected ? "Reconnect Gmail" : "Connect Gmail"}</a></div></body></html>`);
  });
}
