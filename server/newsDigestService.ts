import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { google, type gmail_v1 } from "googleapis";
import { and, desc, eq, gt, isNull, ne, notInArray } from "drizzle-orm";
import {
  clientPortalDeliveryOutbox,
  clientPortalNotifications,
  clientPortalSessions,
  clientPortalUsers,
  newsDigestImports,
  newsDigestSettings,
  publicNewsArticles,
  publicNewsPushSubscriptions,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";

export const NEWS_SOURCE_MAILBOX = "mahmoud.saberelevay@gmail.com";
export const NEWS_SUBJECT_TRIGGER = "Daily Digest";
export const NEWS_MAX_ARTICLES = 200;
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const OAUTH_CALLBACK = "https://elevay.vip/api/admin/news/gmail/callback";
const TOKEN_AAD = Buffer.from("elevay-news-gmail-refresh-token-v1", "utf8");
const EXCLUDED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const TRACKING_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "gclid", "fbclid", "mc_cid", "mc_eid"];

export type NewsArticleCandidate = {
  title: string;
  description?: string | null;
  sourceName?: string | null;
  url: string;
  publishedAt?: Date | null;
};

export type GmailDigestMessage = {
  sourceMessageId: string;
  subject: string;
  receivedAt: Date;
  text: string;
  html?: string;
};

function secretKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for Gmail token encryption");
  return createHash("sha256").update(`news-gmail:${ENV.cookieSecret}`).digest();
}

export function encryptGmailRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  cipher.setAAD(TOKEN_AAD);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptGmailRefreshToken(value: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) throw new Error("invalid_gmail_refresh_token_ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAAD(TOKEN_AAD);
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

function oauthClient() {
  const clientId = ENV.newsGmailClientId || ENV.googleClientId;
  const clientSecret = ENV.newsGmailClientSecret || ENV.googleClientSecret;
  if (!clientId || !clientSecret) throw new Error("Google OAuth client is not configured");
  return new google.auth.OAuth2(clientId, clientSecret, OAUTH_CALLBACK);
}

function oauthStateSignature(payload: string) {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for OAuth state signing");
  return createHmac("sha256", ENV.cookieSecret).update(payload).digest("base64url");
}

export function createNewsGmailOAuthState() {
  const payload = `${Date.now()}.${randomBytes(18).toString("base64url")}`;
  return `${payload}.${oauthStateSignature(payload)}`;
}

export function verifyNewsGmailOAuthState(state: string) {
  const segments = state.split(".");
  if (segments.length !== 3) return false;
  const payload = `${segments[0]}.${segments[1]}`;
  const expected = oauthStateSignature(payload);
  const actualBuffer = Buffer.from(segments[2], "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return false;
  const createdAt = Number(segments[0]);
  return Number.isFinite(createdAt) && Date.now() - createdAt >= 0 && Date.now() - createdAt <= 15 * 60 * 1000;
}

export function getNewsGmailAuthorizationUrl(state: string) {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: true,
    scope: [GMAIL_SCOPE],
    state,
    login_hint: NEWS_SOURCE_MAILBOX,
  });
}

async function ensureSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(newsDigestSettings).values({
    id: 1,
    sourceMailbox: NEWS_SOURCE_MAILBOX,
    subjectTrigger: NEWS_SUBJECT_TRIGGER,
    maxArticles: NEWS_MAX_ARTICLES,
  }).onDuplicateKeyUpdate({ set: { sourceMailbox: NEWS_SOURCE_MAILBOX, subjectTrigger: NEWS_SUBJECT_TRIGGER, maxArticles: NEWS_MAX_ARTICLES } });
  const [settings] = await db.select().from(newsDigestSettings).where(eq(newsDigestSettings.id, 1)).limit(1);
  if (!settings) throw new Error("News settings unavailable");
  return settings;
}

export async function connectNewsGmail(code: string) {
  const auth = oauthClient();
  const { tokens } = await auth.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google did not return an offline refresh token");
  auth.setCredentials(tokens);
  const profile = await google.gmail({ version: "v1", auth }).users.getProfile({ userId: "me" });
  const email = String(profile.data.emailAddress || "").trim().toLowerCase();
  if (email !== NEWS_SOURCE_MAILBOX) throw new Error(`Please authorize ${NEWS_SOURCE_MAILBOX}`);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureSettings();
  await db.update(newsDigestSettings).set({
    gmailRefreshTokenEncrypted: encryptGmailRefreshToken(tokens.refresh_token),
    gmailConnectedEmail: email,
    gmailConnectedAt: new Date(),
    lastError: null,
  }).where(eq(newsDigestSettings.id, 1));
  return { email };
}

export async function getNewsGmailConnectionStatus() {
  const settings = await ensureSettings();
  return {
    configured: Boolean((ENV.newsGmailClientId || ENV.googleClientId) && (ENV.newsGmailClientSecret || ENV.googleClientSecret)),
    connected: Boolean(settings.gmailRefreshTokenEncrypted && settings.gmailConnectedEmail === NEWS_SOURCE_MAILBOX),
    email: settings.gmailConnectedEmail,
    sourceMailbox: settings.sourceMailbox,
    subjectTrigger: settings.subjectTrigger,
    lastAttemptAt: settings.lastAttemptAt,
    lastSuccessfulAt: settings.lastSuccessfulAt,
    lastError: settings.lastError,
  };
}

function unwrapArticleUrl(raw: string) {
  try {
    let parsed = new URL(raw.replace(/&amp;/g, "&"));
    if (/^(www\.)?google\.[^/]+$/i.test(parsed.hostname) && parsed.pathname === "/url") {
      const target = parsed.searchParams.get("url") || parsed.searchParams.get("q");
      if (!target) return null;
      parsed = new URL(target);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const host = parsed.hostname.toLowerCase();
    if (EXCLUDED_HOSTS.has(host) || host.endsWith(".local") || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    if (/google\.[^/]+$/i.test(host) && (/^\/alerts\//.test(parsed.pathname) || /^\/alerts$/.test(parsed.pathname))) return null;
    parsed.hash = "";
    TRACKING_PARAMS.forEach(param => parsed.searchParams.delete(param));
    parsed.searchParams.sort();
    const normalized = parsed.toString();
    return normalized.length <= 2048 ? normalized : null;
  } catch {
    return null;
  }
}

function clean(value: string, max: number) {
  return value.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function looksLikeTitle(value: string) {
  const lowered = value.toLowerCase();
  return value.length >= 12 && !["facebook", "twitter", "send feedback", "view all your alerts", "see more results", "edit this alert", "flag as irrelevant"].some(label => lowered.includes(label));
}

function parsePlainDigest(text: string) {
  const candidates: NewsArticleCandidate[] = [];
  const linkPattern = /<((?:https?):\/\/[^>\s]+)>/g;
  let previousEnd = 0;
  for (const match of Array.from(text.matchAll(linkPattern))) {
    const rawUrl = match[1];
    const matchIndex = match.index ?? 0;
    const chunk = text.slice(previousEnd, matchIndex);
    previousEnd = matchIndex + match[0].length;
    const url = unwrapArticleUrl(rawUrl);
    if (!url) continue;
    const lines = chunk.split(/\r?\n/).map(part => clean(part, 1200)).filter(Boolean);
    if (lines.length < 3) continue;
    const description = lines.at(-1) || "";
    const sourceName = lines.at(-2) || "";
    const title = lines.at(-3) || "";
    if (!looksLikeTitle(title) || sourceName.length > 255 || description.length < 10) continue;
    candidates.push({ title: clean(title, 500), sourceName: clean(sourceName, 255), description: clean(description, 1000), url });
  }
  return candidates;
}

function parseHtmlDigest(html: string) {
  const candidates: NewsArticleCandidate[] = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of Array.from(html.matchAll(anchorPattern))) {
    const url = unwrapArticleUrl(match[1]);
    if (!url) continue;
    const title = clean(match[2].replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, " "), 500);
    if (!looksLikeTitle(title)) continue;
    candidates.push({ title, sourceName: new URL(url).hostname.replace(/^www\./, ""), description: null, url });
  }
  return candidates;
}

export function extractNewsArticlesFromDigest(text: string, html = "") {
  const combined = [...parsePlainDigest(text), ...parseHtmlDigest(html)];
  const unique = new Map<string, NewsArticleCandidate>();
  for (const article of combined) {
    const canonicalUrlHash = createHash("sha256").update(article.url).digest("hex");
    const existing = unique.get(canonicalUrlHash);
    if (!existing || (!existing.description && article.description)) unique.set(canonicalUrlHash, article);
  }
  return Array.from(unique.values());
}

function decodeBody(data?: string | null) {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function collectBodies(part: gmail_v1.Schema$MessagePart | undefined, output: { text: string[]; html: string[] }) {
  if (!part) return;
  if (part.mimeType === "text/plain" && part.body?.data) output.text.push(decodeBody(part.body.data));
  if (part.mimeType === "text/html" && part.body?.data) output.html.push(decodeBody(part.body.data));
  for (const child of part.parts || []) collectBodies(child, output);
}

function header(message: gmail_v1.Schema$Message, name: string) {
  return message.payload?.headers?.find(item => item.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

async function gmailClientFromSettings() {
  const settings = await ensureSettings();
  if (!settings.gmailRefreshTokenEncrypted) throw new Error("Gmail News source is not connected");
  if (settings.gmailConnectedEmail !== NEWS_SOURCE_MAILBOX) throw new Error("Connected Gmail account does not match the configured News source");
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: decryptGmailRefreshToken(settings.gmailRefreshTokenEncrypted) });
  return { gmail: google.gmail({ version: "v1", auth }), settings };
}

async function loadDigestMessages() {
  const { gmail, settings } = await gmailClientFromSettings();
  const profile = await gmail.users.getProfile({ userId: "me" });
  if (String(profile.data.emailAddress || "").toLowerCase() !== NEWS_SOURCE_MAILBOX) throw new Error("Gmail News source account mismatch");
  const escapedTrigger = settings.subjectTrigger.replace(/["\\]/g, " ").trim();
  const listed = await gmail.users.messages.list({ userId: "me", q: `subject:"${escapedTrigger}" newer_than:30d`, maxResults: 100 });
  const messages: GmailDigestMessage[] = [];
  for (const item of listed.data.messages || []) {
    if (!item.id) continue;
    const response = await gmail.users.messages.get({ userId: "me", id: item.id, format: "full" });
    const subject = header(response.data, "subject");
    if (!subject.toLowerCase().includes(settings.subjectTrigger.toLowerCase())) continue;
    const bodies = { text: [] as string[], html: [] as string[] };
    collectBodies(response.data.payload, bodies);
    messages.push({
      sourceMessageId: item.id,
      subject: clean(subject, 500),
      receivedAt: new Date(Number(response.data.internalDate || Date.now())),
      text: bodies.text.join("\n\n"),
      html: bodies.html.join("\n"),
    });
  }
  return messages.sort((a, b) => +a.receivedAt - +b.receivedAt);
}

async function importDigestMessage(message: GmailDigestMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [previous] = await db.select().from(newsDigestImports).where(and(eq(newsDigestImports.sourceMailbox, NEWS_SOURCE_MAILBOX), eq(newsDigestImports.sourceMessageId, message.sourceMessageId))).limit(1);
  if (previous?.status === "success") return { found: previous.articlesFound, inserted: [] as Array<{ publicId: string; title: string }> };
  if (!previous) {
    await db.insert(newsDigestImports).values({ sourceMessageId: message.sourceMessageId, sourceMailbox: NEWS_SOURCE_MAILBOX, subject: message.subject, receivedAt: message.receivedAt, status: "processing" });
  } else {
    await db.update(newsDigestImports).set({ status: "processing", errorMessage: null, completedAt: null }).where(eq(newsDigestImports.id, previous.id));
  }
  const [importRow] = await db.select().from(newsDigestImports).where(and(eq(newsDigestImports.sourceMailbox, NEWS_SOURCE_MAILBOX), eq(newsDigestImports.sourceMessageId, message.sourceMessageId))).limit(1);
  try {
    const candidates = extractNewsArticlesFromDigest(message.text, message.html);
    const inserted: Array<{ publicId: string; title: string }> = [];
    for (const article of candidates) {
      const hash = createHash("sha256").update(article.url).digest("hex");
      const [existing] = await db.select({ id: publicNewsArticles.id }).from(publicNewsArticles).where(eq(publicNewsArticles.canonicalUrlHash, hash)).limit(1);
      if (existing) continue;
      const publicId = randomUUID();
      try {
        await db.insert(publicNewsArticles).values({
          publicId,
          canonicalUrlHash: hash,
          url: article.url,
          title: article.title,
          description: article.description || null,
          sourceName: article.sourceName || new URL(article.url).hostname.replace(/^www\./, ""),
          sourceMailbox: NEWS_SOURCE_MAILBOX,
          sourceMessageId: message.sourceMessageId,
          digestReceivedAt: message.receivedAt,
          publishedAt: article.publishedAt || null,
        });
        inserted.push({ publicId, title: article.title });
      } catch (error) {
        const duplicate = String(error).toLowerCase().includes("duplicate");
        if (!duplicate) throw error;
      }
    }
    if (importRow) await db.update(newsDigestImports).set({ status: "success", articlesFound: candidates.length, articlesInserted: inserted.length, completedAt: new Date(), errorMessage: null }).where(eq(newsDigestImports.id, importRow.id));
    return { found: candidates.length, inserted };
  } catch (error) {
    if (importRow) await db.update(newsDigestImports).set({ status: "failed", errorMessage: String(error).slice(0, 4000), completedAt: new Date() }).where(eq(newsDigestImports.id, importRow.id));
    throw error;
  }
}

export async function enforceNewsRetention(maxArticles = NEWS_MAX_ARTICLES) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const max = Math.max(1, Math.min(NEWS_MAX_ARTICLES, Math.floor(maxArticles)));
  const kept = await db.select({ id: publicNewsArticles.id }).from(publicNewsArticles).orderBy(desc(publicNewsArticles.digestReceivedAt), desc(publicNewsArticles.id)).limit(max);
  if (!kept.length) return 0;
  const deleted = await db.select({ id: publicNewsArticles.id }).from(publicNewsArticles).where(notInArray(publicNewsArticles.id, kept.map(row => row.id)));
  if (deleted.length) await db.delete(publicNewsArticles).where(notInArray(publicNewsArticles.id, kept.map(row => row.id)));
  return deleted.length;
}

async function deliverPush(token: string, locale: "en" | "ar", articleCount: number, latestArticle: { publicId: string; title: string }) {
  const db = await getDb();
  if (!db) return false;
  const title = locale === "ar" ? "أخبار جديدة من إليفاي" : "New ELEVAY news";
  const body = articleCount === 1
    ? latestArticle.title.slice(0, 180)
    : locale === "ar" ? `تمت إضافة ${articleCount} مقالات جديدة إلى قسم الأخبار.` : `${articleCount} new articles were added to News.`;
  const data = { type: "news_digest", entityType: "news", articlePublicId: latestArticle.publicId, entityPublicId: latestArticle.publicId };
  const [result] = await db.insert(clientPortalDeliveryOutbox).values({ eventType: "news_digest", channel: "push", recipient: token, payload: { title, body, data } });
  const outboxId = Number((result as { insertId?: number }).insertId || 0);
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ to: token, title, body, data, sound: "default", channelId: "news" }) });
    if (!response.ok) throw new Error(`push_${response.status}`);
    const payload = await response.json() as { data?: { status?: string; message?: string } };
    if (payload.data?.status === "error") throw new Error(payload.data.message || "push_rejected");
    if (outboxId) await db.update(clientPortalDeliveryOutbox).set({ status: "sent", attempts: 1, processedAt: new Date() }).where(eq(clientPortalDeliveryOutbox.id, outboxId));
    return true;
  } catch (error) {
    if (outboxId) await db.update(clientPortalDeliveryOutbox).set({ status: "failed", attempts: 1, lastError: String(error).slice(0, 4000) }).where(eq(clientPortalDeliveryOutbox.id, outboxId));
    return false;
  }
}

async function broadcastNews(inserted: Array<{ publicId: string; title: string }>) {
  if (!inserted.length) return { notificationsCreated: 0, pushesSent: 0 };
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const latest = inserted[inserted.length - 1];
  const users = await db.select({ id: clientPortalUsers.id, locale: clientPortalUsers.locale }).from(clientPortalUsers).where(eq(clientPortalUsers.status, "active"));
  for (const user of users) {
    await db.insert(clientPortalNotifications).values({
      publicId: randomUUID(),
      portalUserId: user.id,
      type: "news_digest",
      titleEn: "New ELEVAY news",
      titleAr: "أخبار جديدة من إليفاي",
      bodyEn: inserted.length === 1 ? latest.title : `${inserted.length} new articles were added to News.`,
      bodyAr: inserted.length === 1 ? latest.title : `تمت إضافة ${inserted.length} مقالات جديدة إلى قسم الأخبار.`,
      entityType: "news",
      entityPublicId: latest.publicId,
      createdAt: Date.now(),
    });
  }
  const signedRows = await db.select({
    token: clientPortalSessions.pushToken,
    locale: clientPortalUsers.locale,
    preferences: clientPortalUsers.notificationPreferences,
  }).from(clientPortalSessions).innerJoin(clientPortalUsers, eq(clientPortalSessions.portalUserId, clientPortalUsers.id)).where(and(isNull(clientPortalSessions.revokedAt), gt(clientPortalSessions.expiresAt, new Date()), ne(clientPortalSessions.pushToken, ""), eq(clientPortalUsers.status, "active")));
  const recipients = new Map<string, "en" | "ar">();
  const signedTokens = new Set<string>();
  for (const row of signedRows) {
    if (!row.token) continue;
    signedTokens.add(row.token);
    const preferences = row.preferences && typeof row.preferences === "object" ? row.preferences as Record<string, boolean> : {};
    if (preferences.push === false || preferences.news === false) continue;
    recipients.set(row.token, row.locale === "ar" ? "ar" : "en");
  }
  const publicRows = await db.select().from(publicNewsPushSubscriptions).where(eq(publicNewsPushSubscriptions.isActive, true));
  for (const row of publicRows) if (!signedTokens.has(row.pushToken)) recipients.set(row.pushToken, row.locale === "ar" ? "ar" : "en");
  let pushesSent = 0;
  for (const [token, locale] of Array.from(recipients.entries())) if (await deliverPush(token, locale, inserted.length, latest)) pushesSent += 1;
  return { notificationsCreated: users.length, pushesSent };
}

export async function runNewsDigestImport() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const attemptedAt = new Date();
  await ensureSettings();
  await db.update(newsDigestSettings).set({ lastAttemptAt: attemptedAt }).where(eq(newsDigestSettings.id, 1));
  try {
    const messages = await loadDigestMessages();
    const inserted: Array<{ publicId: string; title: string }> = [];
    let articlesFound = 0;
    for (const message of messages) {
      const result = await importDigestMessage(message);
      articlesFound += result.found;
      inserted.push(...result.inserted);
    }
    const removed = await enforceNewsRetention(NEWS_MAX_ARTICLES);
    const delivery = await broadcastNews(inserted);
    await db.update(newsDigestSettings).set({ lastSuccessfulAt: new Date(), lastError: null }).where(eq(newsDigestSettings.id, 1));
    return { messagesChecked: messages.length, articlesFound, articlesInserted: inserted.length, articlesRemoved: removed, ...delivery };
  } catch (error) {
    await db.update(newsDigestSettings).set({ lastError: String(error).slice(0, 4000) }).where(eq(newsDigestSettings.id, 1));
    throw error;
  }
}
