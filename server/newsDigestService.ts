import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { google, type gmail_v1 } from "googleapis";
import { load } from "cheerio";
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
import { sendNewsDigestFailureAlert } from "./emailService";

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
  const connected = Boolean(settings.gmailRefreshTokenEncrypted && settings.gmailConnectedEmail === NEWS_SOURCE_MAILBOX);
  const authorizationIssue = !connected
    ? "Gmail authorization is required for the Daily Digest importer."
    : settings.lastError && /gmail|google|oauth|authorization|credential|token|access|invalid_grant/i.test(settings.lastError)
      ? settings.lastError
      : null;
  return {
    configured: Boolean((ENV.newsGmailClientId || ENV.googleClientId) && (ENV.newsGmailClientSecret || ENV.googleClientSecret)),
    connected,
    authorizationIssue,
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
    const chunk = text.slice(previousEnd, match.index ?? 0);
    previousEnd = (match.index ?? 0) + match[0].length;
    const url = unwrapArticleUrl(match[1]);
    if (!url) continue;
    // Google Alerts wraps descriptions over multiple lines. Do not mistake
    // a description line for the title or borrow text from an adjacent story.
    const rawLines = chunk.split(/\r?\n/);
    const headingIndex = rawLines.findLastIndex(line => /^\s*\*\*.+\*\*\s*$/.test(line));
    const lines = rawLines.slice(headingIndex >= 0 ? headingIndex : 0)
      .map(line => clean(line, 12000)).filter(Boolean);
    if (lines.length < 3) continue;
    const [title, sourceName, ...body] = lines;
    const description = clean(body.join(" "), 12000);
    if (!looksLikeTitle(title) || sourceName.length > 255 || description.length < 10) continue;
    candidates.push({ title: clean(title, 500), sourceName: clean(sourceName, 255), description, url });
  }
  return candidates;
}

function parseHtmlDigest(html: string) {
  if (!html) return [];
  const $ = load(html.slice(0, 2_000_000));
  $("script, style, noscript").remove();
  const candidates: NewsArticleCandidate[] = [];
  $("a[href]").each((_index, element) => {
    const link = $(element);
    const url = unwrapArticleUrl(link.attr("href") || "");
    if (!url) return;
    const title = clean(link.text(), 500);
    if (!looksLikeTitle(title)) return;
    let description: string | null = null;
    let sourceName = new URL(url).hostname.replace(/^www\./, "");
    // Bound extraction to one article's Google Alerts item/container. The
    // selected container must contain only one distinct publisher URL.
    for (const parent of link.parents().toArray()) {
      const container = $(parent);
      const urls = new Set(container.find("a[href]").toArray()
        .map(node => unwrapArticleUrl($(node).attr("href") || "")).filter(Boolean));
      if (urls.size > 1) break;
      const snippet = container.find(".item_snippet, .snippet, [itemprop='description']").first();
      if (!snippet.length) continue;
      const text = clean(snippet.text(), 12000);
      if (text.length >= 10) description = text;
      const source = container.find(".item_source, .source, [itemprop='publisher']").first();
      if (source.length) sourceName = clean(source.text(), 255) || sourceName;
      break;
    }
    candidates.push({ title, sourceName, description, url });
  });
  return candidates;
}

export function extractNewsArticlesFromDigest(text: string, html = "") {
  // HTML carries the actual linked title and decoded entities; prefer it,
  // then merge a missing excerpt from the plain-text alternative by URL.
  const combined = [...parseHtmlDigest(html), ...parsePlainDigest(text)];
  const unique = new Map<string, NewsArticleCandidate>();
  for (const article of combined) {
    const canonicalUrlHash = createHash("sha256").update(article.url).digest("hex");
    const existing = unique.get(canonicalUrlHash);
    if (!existing) unique.set(canonicalUrlHash, article);
    else if (!existing.description && article.description) unique.set(canonicalUrlHash, {
      ...existing, description: article.description, sourceName: article.sourceName || existing.sourceName,
    });
  }
  return Array.from(unique.values());
}

const NEWS_COUNTRY_RULES: RegExp[] = [
  /\b(spain|spanish|espana|espanol)\b/,
  /\b(portugal|portuguese|portugues)\b/,
  /\b(malta|maltese)\b/,
  /\b(greece|greek|hellenic)\b/,
  /\b(latvia|latvian)\b/,
  /\b(united kingdom|great britain|britain|british|uk|u k)\b/,
  /\b(united states( of america)?|usa|u s a|u s|american|uscis)\b/,
  /\b(canada|canadian|ircc)\b/,
  /\b(australia|australian)\b/,
  /\b(argentina|argentine|argentinian)\b/,
  /\b(sao tome( and principe)?|sao tome e principe)\b/,
  /\b(antigua( and barbuda)?|barbuda|antiguan|barbudan)\b/,
  /\b(saint kitts( and nevis)?|st kitts( and nevis)?|nevis|kittitian|nevisian)\b/,
  /\b(saint lucia|st lucia|saint lucian|st lucian)\b/,
  /\b(dominica)\b/,
  /\b(grenada|grenadian)\b/,
];

const NEWS_COUNTRY_ARABIC_RULE = /اسبانيا|البرتغال|مالطا|اليونان|لاتفيا|المملكه المتحده|بريطانيا|الولايات المتحده|امريكا|كندا|استراليا|الارجنتين|ساو توم[ييه]|انتيغوا|باربودا|سانت كيتس|نيفيس|سانت لوسيا|دومينيكا|غرينادا|جرينادا/;
// A residence, resident, permit, citizen or settlement alone is not immigration
// evidence (homes, construction licences, citizen bonds and legal settlements).
const IMMIGRATION_TOPIC_RULE = /\b(immigration|citizenship|natural(?:iz|is)(?:e|ation|ed|ing)|visas?|golden visa|investor visa|investment migration|cbi|cip|rcbi|residen(?:ce|cy) (?:permit|visa|program(?:me)?s?|polic(?:y|ies)|rules?|regulations?|reforms?|eligibility|requirements?|by investment)|(?:permanent|temporary|tax|legal|lawful|investor) residen(?:ce|cy)|(?:work|study|student|employment|residency|residence) permits?|nationality (?:law|laws|rules?|regulations?|policy|reform)|(?:settlement|settled) (?:status|visa)|(?:uk|british) settlement|asylum|deportation|migrant workers?|skilled migration|family reunification|green cards?|border polic(?:y|ies)|entry requirements?)\b/;
const MIGRATION_POLICY_RULE = /\b(?:migration|migrants?|immigrants?)\b/;
const MIGRATION_CONTEXT_RULE = /\b(?:polic(?:y|ies)|regulations?|laws?|reforms?|program(?:me)?s?|eligibility|applications?|workers?|skills?|skilled|employment|reunification|naturalisation|naturalization|residence|residency|visa|border|government)\b/;
const IMMIGRATION_TOPIC_ARABIC_RULE = /الهجره|هجره|الجنسية|الجنسيه|تجنيس|تجنس|تاشير|فيزا|اقامه (?:دائمه|موقته|ضريبيه)|(?:قواعد|قوانين|شروط|برنامج|برامج|تصاريح|تصريح) الاقامه|تصاريح العمل|تصريح عمل|لم الشمل|لجوء|ترحيل/;

function normalizeNewsMatchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeArabicNewsText(value: string) {
  return value.replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
}

export function isImmigrationNewsArticleRelevant(article: Pick<NewsArticleCandidate, "title" | "description">) {
  const rawText = `${article.title} ${article.description || ""}`;
  const text = normalizeNewsMatchText(rawText);
  const arabic = normalizeArabicNewsText(rawText);
  const nonImmigrationResidency = /\b(?:artist|artistic|art|medical|surgical|music|writer|writers) residency\b/.test(text);
  if (nonImmigrationResidency && !/\b(?:immigration|visas?|citizenship|work permit|residence permit)\b/.test(text)) return false;
  const countryText = text.replace(/\b(?:latin|south|central|north) american\b/g, " ");
  const countryArabic = arabic.replace(/امريكا (?:اللاتينيه|الجنوبيه|الوسطي|الشماليه)/g, " ");
  const countryMatched = NEWS_COUNTRY_RULES.some(rule => rule.test(countryText)) || NEWS_COUNTRY_ARABIC_RULE.test(countryArabic);
  const topicMatched = IMMIGRATION_TOPIC_RULE.test(text)
    || (MIGRATION_POLICY_RULE.test(text) && MIGRATION_CONTEXT_RULE.test(text))
    || IMMIGRATION_TOPIC_ARABIC_RULE.test(arabic);
  return countryMatched && topicMatched;
}

export function filterImmigrationNewsArticles<T extends Pick<NewsArticleCandidate, "title" | "description">>(articles: T[]) {
  return articles.filter(isImmigrationNewsArticleRelevant);
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
  if (previous?.status === "success") return { found: previous.articlesFound, filteredOut: 0, inserted: [] as Array<{ publicId: string; title: string }> };
  if (!previous) {
    try {
      await db.insert(newsDigestImports).values({ sourceMessageId: message.sourceMessageId, sourceMailbox: NEWS_SOURCE_MAILBOX, subject: message.subject, receivedAt: message.receivedAt, status: "processing" });
    } catch (error) {
      // The unique mailbox/message key arbitrates two simultaneous first runs.
      // Only the winning insert owns this message; a duplicate is not a failure.
      if (String(error).toLowerCase().includes("duplicate")) return { found: 0, filteredOut: 0, inserted: [] as Array<{ publicId: string; title: string }> };
      throw error;
    }
  } else {
    await db.update(newsDigestImports).set({ status: "processing", errorMessage: null, completedAt: null }).where(eq(newsDigestImports.id, previous.id));
  }
  const [importRow] = await db.select().from(newsDigestImports).where(and(eq(newsDigestImports.sourceMailbox, NEWS_SOURCE_MAILBOX), eq(newsDigestImports.sourceMessageId, message.sourceMessageId))).limit(1);
  try {
    const extractedCandidates = extractNewsArticlesFromDigest(message.text, message.html);
    const candidates = filterImmigrationNewsArticles(extractedCandidates);
    const filteredOut = extractedCandidates.length - candidates.length;
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
    return { found: extractedCandidates.length, filteredOut, inserted };
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

export function retainedNewsForDelivery<T extends { publicId: string }>(inserted: T[], retained: Array<{ publicId: string }>) {
  const retainedIds = new Set(retained.map(article => article.publicId));
  return inserted.filter(article => retainedIds.has(article.publicId));
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
    let articlesFilteredOut = 0;
    for (const message of messages) {
      const result = await importDigestMessage(message);
      articlesFound += result.found;
      articlesFilteredOut += result.filteredOut;
      inserted.push(...result.inserted);
    }
    const removed = await enforceNewsRetention(NEWS_MAX_ARTICLES);
    const retained = inserted.length ? await db.select({ publicId: publicNewsArticles.publicId }).from(publicNewsArticles)
      .orderBy(desc(publicNewsArticles.digestReceivedAt), desc(publicNewsArticles.id)).limit(NEWS_MAX_ARTICLES) : [];
    const delivery = await broadcastNews(retainedNewsForDelivery(inserted, retained));
    await db.update(newsDigestSettings).set({ lastSuccessfulAt: new Date(), lastError: null }).where(eq(newsDigestSettings.id, 1));
    return { messagesChecked: messages.length, articlesFound, articlesFilteredOut, articlesInserted: inserted.length, articlesRemoved: removed, ...delivery };
  } catch (error) {
    const errorMessage = String(error).slice(0, 4000);
    await db.update(newsDigestSettings).set({ lastError: errorMessage }).where(eq(newsDigestSettings.id, 1));
    const alertSent = await sendNewsDigestFailureAlert({
      attemptedAt,
      errorMessage,
    });
    if (!alertSent) console.error("[NewsDigest] Failure alert email could not be sent");
    throw error;
  }
}
