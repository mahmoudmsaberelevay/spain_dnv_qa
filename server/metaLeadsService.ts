import crypto from "crypto";
import { and, asc, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import {
  leadActivities,
  leadIntegrations,
  leadMetaAttributions,
  leads,
  metaCrmEventLog,
  metaIntegrationMappings,
  metaReconciliationState,
  metaWebhookInbox,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  applyMetaAssignment,
  collectMetaMonitoringSnapshot,
  processMetaNotificationOutbox,
  queueMetaAdminAlert,
  queueMetaLeadAlert,
  recordAmbiguousMetaInquiry,
  recoverUnassignedMetaLeads,
  resolveMetaDefaultConsultant,
  resolveMetaLeadMatch,
  updateMetaInboxOutcome,
  type MetaMatchMethod,
} from "./metaAssignmentMonitoring";

const DEFAULT_GRAPH_VERSION = "v26.0";
const DEFAULT_DATASET_ID = "1944021856148780";
const DEFAULT_PAGE_ID = "100123051604258";
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];

export const META_EVENT_ORDER = [
  "Initial Lead from Facebook",
  "Contacted",
  "Marketing Qualified Lead",
  "Sales Opportunity",
  "Converted",
] as const;

export type MetaCrmEventName = (typeof META_EVENT_ORDER)[number];

export type MetaFieldData = { name: string; values?: string[] };

export type MetaLeadDetail = {
  id: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  is_organic?: boolean;
  field_data?: MetaFieldData[];
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
};

export type MetaWebhookLeadChange = {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  adgroup_id?: string;
  adset_id?: string;
  campaign_id?: string;
  created_time?: number;
};

export type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{ field?: string; value?: MetaWebhookLeadChange }>;
  }>;
};

export type ActiveMetaConfig = {
  integrationId: number | null;
  accessToken: string;
  assignedTo: string | null;
  leadSource: string;
  pageId: string;
  lastSyncAt: number | null;
};

type ResolvedAttribution = {
  metaLeadId: string;
  metaPageId: string | null;
  metaFormId: string | null;
  metaFormName: string | null;
  metaCampaignId: string | null;
  metaCampaignName: string | null;
  metaAdSetId: string | null;
  metaAdSetName: string | null;
  metaAdId: string | null;
  metaAdName: string | null;
  metaIsOrganic: boolean;
  isTestLead: boolean;
  routingConsultantUserId: number | null;
  routingConsultantDisplayName: string | null;
  matchMethod: MetaMatchMethod;
  duplicateIndicator: boolean;
  ambiguousMatch: boolean;
  source: string;
  program: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  metaLeadCreatedAt: number;
  firstReceivedAt: number;
};

const now = () => Date.now();

export function safeMetaError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/access_token=[^&\s]+/gi, "access_token=[REDACTED]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .slice(0, 2_000);
}

export class MetaManualReviewError extends Error {
  constructor(public readonly safeCode: string) {
    super(safeCode);
    this.name = "MetaManualReviewError";
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function normalizeMetaEmail(value?: string | null): string | null {
  const normalized = value?.normalize("NFKC").trim().toLowerCase() ?? "";
  if (!normalized || !normalized.includes("@")) return null;
  return normalized;
}

export function normalizeMetaPhone(value?: string | null): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = `20${digits.slice(1)}`;
  if (!digits.startsWith("20") && digits.length === 10) digits = `20${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function hashMetaEmail(value?: string | null): string | null {
  const normalized = normalizeMetaEmail(value);
  return normalized ? sha256(normalized) : null;
}

export function hashMetaPhone(value?: string | null): string | null {
  const normalized = normalizeMetaPhone(value);
  return normalized ? sha256(normalized) : null;
}

export function mapMetaFields(fieldData: MetaFieldData[]): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const field of fieldData) {
    const value = field.values?.[0]?.trim() ?? "";
    const key = field.name.toLowerCase().replace(/[\s-]+/g, "_");
    if (!value) continue;
    if (["full_name", "name"].includes(key)) mapped.fullName = value;
    else if (key === "first_name") mapped.firstName = value;
    else if (key === "last_name") mapped.lastName = value;
    else if (["email", "email_address"].includes(key)) mapped.email = value;
    else if (["phone_number", "phone", "mobile", "mobile_number"].includes(key)) mapped.phone = value;
    else if (["whatsapp", "whatsapp_number"].includes(key)) mapped.whatsapp = value;
    else if (["nationality", "country"].includes(key)) mapped.nationality = value;
    else if (["interested_program", "program", "service", "interested_in"].includes(key)) mapped.interestedProgram = value;
    else if (["budget", "investment_budget"].includes(key)) mapped.budgetRange = value;
    else if (["notes", "message", "comment"].includes(key)) mapped.notes = value;
  }
  if (!mapped.fullName && (mapped.firstName || mapped.lastName)) {
    mapped.fullName = [mapped.firstName, mapped.lastName].filter(Boolean).join(" ");
  }
  return mapped;
}

async function getActiveMetaConfig(): Promise<ActiveMetaConfig> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db
    .select()
    .from(leadIntegrations)
    .where(and(eq(leadIntegrations.type, "meta"), eq(leadIntegrations.isActive, true)))
    .orderBy(desc(leadIntegrations.updatedAt))
    .limit(1);
  const integration = rows[0] ?? null;
  let storedConfig: Record<string, string> = {};
  if (integration?.config) {
    try {
      storedConfig = JSON.parse(integration.config);
    } catch {
      storedConfig = {};
    }
  }
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN || storedConfig.page_access_token || storedConfig.access_token || "";
  if (!accessToken) throw new Error("Meta Page access token is not configured");
  return {
    integrationId: integration?.id ?? null,
    accessToken,
    assignedTo: storedConfig.assigned_to || null,
    leadSource: storedConfig.lead_source || "Meta Instant Form",
    pageId: process.env.META_PAGE_ID || storedConfig.page_id || DEFAULT_PAGE_ID,
    lastSyncAt: integration?.lastSyncAt ?? null,
  };
}

function graphBase(): string {
  return `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION}`;
}

async function metaFetch(input: string | URL, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("META_REQUEST_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function metaGraphGet<T>(path: string, accessToken: string, fields: string): Promise<T> {
  const url = new URL(`${graphBase()}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  const response = await metaFetch(url, { headers: { Accept: "application/json" } });
  const payload = (await response.json()) as T & { error?: { message?: string; code?: number } };
  if (!response.ok || payload.error) {
    throw new Error(`Meta Graph API ${response.status}: ${payload.error?.message || "request failed"}`);
  }
  return payload;
}

export async function inspectMetaLeadForm(formId: string): Promise<{ id: string; name: string | null; status: string | null }> {
  if (!/^\d+$/.test(formId)) throw new Error("Invalid Meta Form ID");
  const config = await getActiveMetaConfig();
  const form = await metaGraphGet<{ id: string; name?: string; status?: string }>(
    formId,
    config.accessToken,
    "id,name,status",
  );
  return { id: form.id, name: form.name ?? null, status: form.status ?? null };
}

export async function createMetaTestLead(formId: string): Promise<{ id: string }> {
  if (!/^\d+$/.test(formId)) throw new Error("Invalid Meta Form ID");
  const config = await getActiveMetaConfig();
  const response = await metaFetch(`${graphBase()}/${formId}/test_leads`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ access_token: config.accessToken }),
  });
  const payload = (await response.json()) as { id?: string; error?: { message?: string; code?: number; error_subcode?: number } };
  if (!response.ok || payload.error || !payload.id) {
    throw new Error(`Meta Test Lead ${response.status}: ${payload.error?.message || "creation failed"}`);
  }
  return { id: payload.id };
}

export async function classifyMetaTestLead(metaLeadId: string, formId: string | null, accessToken: string): Promise<boolean> {
  if (!formId || !/^\d+$/.test(formId) || !/^\d+$/.test(metaLeadId)) {
    throw new Error("Meta Test Lead classification requires valid Lead and Form IDs");
  }
  let nextUrl: string | null = (() => {
    const url = new URL(`${graphBase()}/${formId}/test_leads`);
    url.searchParams.set("fields", "id");
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", accessToken);
    return url.toString();
  })();
  while (nextUrl) {
    const response = await metaFetch(nextUrl, { headers: { Accept: "application/json" } });
    const payload = await response.json() as {
      data?: Array<{ id?: string }>;
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!response.ok || payload.error) {
      throw new Error(`Meta Test Lead lookup failed: ${payload.error?.message || response.status}`);
    }
    if ((payload.data ?? []).some(item => item.id === metaLeadId)) return true;
    nextUrl = payload.paging?.next || null;
  }
  return false;
}

export async function inspectMetaLeadgenSubscriptions(): Promise<{
  pageId: string;
  subscriptions: Array<{ id: string; name: string | null; subscribedFields: string[] }>;
}> {
  const config = await getActiveMetaConfig();
  const payload = await metaGraphGet<{
    data?: Array<{ id: string; name?: string; subscribed_fields?: string[] }>;
  }>(`${config.pageId}/subscribed_apps`, config.accessToken, "id,name,subscribed_fields");
  return {
    pageId: config.pageId,
    subscriptions: (payload.data ?? []).map(item => ({
      id: item.id,
      name: item.name ?? null,
      subscribedFields: item.subscribed_fields ?? [],
    })),
  };
}

export async function fetchMetaLeadDetail(metaLeadId: string, accessToken: string): Promise<MetaLeadDetail> {
  return metaGraphGet<MetaLeadDetail>(
    metaLeadId,
    accessToken,
    "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic,field_data",
  );
}

async function fetchMetaFormName(formId: string | null, accessToken: string): Promise<string | null> {
  if (!formId) return null;
  try {
    const result = await metaGraphGet<{ name?: string }>(formId, accessToken, "name");
    return result.name || null;
  } catch {
    return null;
  }
}

export function verifyMetaWebhookSignature(rawBody: Buffer, signatureHeader?: string): boolean {
  const appSecret = process.env.META_APP_SECRET || "";
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const received = Buffer.from(signatureHeader, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
}

function deriveMetaWebhookVerifyToken(): string {
  const appSecret = process.env.META_APP_SECRET || "";
  return appSecret ? sha256(`elevay-meta-webhook:${appSecret}`) : "";
}

export async function getMetaWebhookVerifyToken(): Promise<string> {
  if (process.env.META_WEBHOOK_VERIFY_TOKEN) return process.env.META_WEBHOOK_VERIFY_TOKEN;
  const db = await getDb();
  if (!db) return "";
  const [integration] = await db.select({
    config: leadIntegrations.config,
    webhookToken: leadIntegrations.webhookToken,
  }).from(leadIntegrations)
    .where(and(eq(leadIntegrations.type, "meta"), eq(leadIntegrations.isActive, true)))
    .orderBy(desc(leadIntegrations.updatedAt))
    .limit(1);
  let storedConfig: Record<string, string> = {};
  try { storedConfig = integration?.config ? JSON.parse(integration.config) : {}; } catch { storedConfig = {}; }
  return storedConfig.verify_token || integration?.webhookToken || deriveMetaWebhookVerifyToken();
}

export async function verifyMetaWebhookVerifyToken(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  const configuredToken = await getMetaWebhookVerifyToken();
  if (configuredToken) {
    const configured = Buffer.from(configuredToken, "utf8");
    const received = Buffer.from(candidate, "utf8");
    if (configured.length === received.length && crypto.timingSafeEqual(configured, received)) return true;
  }

  const db = await getDb();
  if (!db) return false;
  const [integration] = await db.select({ config: leadIntegrations.config })
    .from(leadIntegrations)
    .where(and(eq(leadIntegrations.type, "meta"), eq(leadIntegrations.isActive, true)))
    .orderBy(desc(leadIntegrations.updatedAt))
    .limit(1);
  let storedConfig: Record<string, string> = {};
  try { storedConfig = integration?.config ? JSON.parse(integration.config) : {}; } catch { storedConfig = {}; }
  const expectedHash = storedConfig.verify_token_hash || "";
  const candidateHash = sha256(candidate);
  const expected = Buffer.from(expectedHash, "utf8");
  const received = Buffer.from(candidateHash, "utf8");
  return expected.length > 0 && expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export async function storeMetaWebhookNotifications(payload: MetaWebhookPayload, signatureValidated = false) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (payload.object !== "page" || !Array.isArray(payload.entry)) {
    throw new Error("Unsupported Meta webhook payload");
  }

  let accepted = 0;
  let ignored = 0;
  const receivedAt = now();
  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      if (change.field !== "leadgen" || !value.leadgen_id) {
        ignored += 1;
        continue;
      }
      const pageId = value.page_id || entry.id || null;
      const webhookKey = sha256([
        pageId || "",
        value.leadgen_id,
        value.form_id || "",
        String(value.created_time || entry.time || ""),
      ].join(":"));
      await db.insert(metaWebhookInbox).values({
        webhookKey,
        metaLeadId: value.leadgen_id,
        metaPageId: pageId,
        metaFormId: value.form_id || null,
        metaAdId: value.ad_id || null,
        metaAdGroupId: value.adgroup_id || value.adset_id || null,
        metaCreatedTime: value.created_time || entry.time || null,
        ingestionSource: "webhook",
        signatureValidated,
        status: "pending",
        attempts: 0,
        receivedAt,
        updatedAt: receivedAt,
      }).onDuplicateKeyUpdate({ set: { updatedAt: receivedAt } });
      accepted += 1;
    }
  }
  return { accepted, ignored };
}

async function resolveProgram(meta: MetaLeadDetail, inbox: typeof metaWebhookInbox.$inferSelect): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const candidates = [
    { type: "form", value: meta.form_id || inbox.metaFormId },
    { type: "campaign", value: meta.campaign_id },
    { type: "adset", value: meta.adset_id || inbox.metaAdGroupId },
    { type: "ad", value: meta.ad_id || inbox.metaAdId },
    { type: "page", value: inbox.metaPageId },
  ].filter((item): item is { type: "form" | "campaign" | "adset" | "ad" | "page"; value: string } => Boolean(item.value));

  for (const candidate of candidates) {
    const [mapping] = await db
      .select()
      .from(metaIntegrationMappings)
      .where(and(
        eq(metaIntegrationMappings.mappingType, candidate.type),
        eq(metaIntegrationMappings.matchValue, candidate.value),
        eq(metaIntegrationMappings.isActive, true),
      ))
      .orderBy(asc(metaIntegrationMappings.priority))
      .limit(1);
    if (mapping?.program) return mapping.program;
  }
  return null;
}

export async function findMatchingLead(metaLeadId: string, normalizedPhone: string | null, normalizedEmail: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [direct] = await db.select().from(leads).where(eq(leads.metaLeadId, metaLeadId)).limit(1);
  if (direct) return direct;
  const [attribution] = await db
    .select({ leadId: leadMetaAttributions.leadId })
    .from(leadMetaAttributions)
    .where(eq(leadMetaAttributions.metaLeadId, metaLeadId))
    .limit(1);
  if (attribution) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, attribution.leadId)).limit(1);
    if (lead) return lead;
  }
  const conditions = [];
  if (normalizedPhone) conditions.push(eq(leads.normalizedPhone, normalizedPhone));
  if (normalizedEmail) conditions.push(eq(leads.normalizedEmail, normalizedEmail));
  if (!conditions.length) return null;
  const [matched] = await db.select().from(leads).where(or(...conditions)).orderBy(asc(leads.createdAt)).limit(1);
  return matched ?? null;
}

export async function addAttribution(leadId: number, attribution: ResolvedAttribution, isPrimary: boolean, executor?: any) {
  const db = executor || await getDb();
  if (!db) throw new Error("Database unavailable");
  const ts = now();
  await db.insert(leadMetaAttributions).values({
    leadId,
    ...attribution,
    isPrimary,
    createdAt: ts,
    updatedAt: ts,
  }).onDuplicateKeyUpdate({
    set: {
      leadId,
      metaFormName: attribution.metaFormName,
      metaCampaignName: attribution.metaCampaignName,
      metaAdSetName: attribution.metaAdSetName,
      metaAdName: attribution.metaAdName,
      isTestLead: attribution.isTestLead,
      routingConsultantUserId: attribution.routingConsultantUserId,
      routingConsultantDisplayName: attribution.routingConsultantDisplayName,
      matchMethod: attribution.matchMethod,
      duplicateIndicator: attribution.duplicateIndicator,
      ambiguousMatch: attribution.ambiguousMatch,
      program: attribution.program,
      updatedAt: ts,
    },
  });
}

function readableCairoTime(timestampMs: number) {
  return new Date(timestampMs).toLocaleString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Cairo",
  });
}

async function writeMetaInquiryActivity(
  leadId: number,
  meta: MetaLeadDetail,
  attribution: ResolvedAttribution,
  repeatInquiry: boolean,
  executor?: any,
) {
  const db = executor || await getDb();
  if (!db) throw new Error("Database unavailable");
  const lines = [
    attribution.isTestLead ? "[META TEST LEAD — EXCLUDED FROM OPERATIONAL REPORTS]" : null,
    repeatInquiry ? "Meta repeat inquiry received" : "Meta Instant Form submission received",
    `Submitted: ${readableCairoTime(attribution.metaLeadCreatedAt)} (Cairo)`,
    `Form: ${attribution.metaFormName || attribution.metaFormId || "Unknown"}`,
    `Campaign: ${attribution.metaCampaignName || attribution.metaCampaignId || "Unknown"}`,
    `Ad Set: ${attribution.metaAdSetName || attribution.metaAdSetId || "Unknown"}`,
    `Ad: ${attribution.metaAdName || attribution.metaAdId || "Unknown"}`,
    `Meta Lead ID: ${attribution.metaLeadId}`,
    "",
    "Form answers:",
    ...(meta.field_data ?? []).map((field, index) => {
      const question = field.name.replace(/_/g, " ");
      const answer = (field.values?.[0] ?? "").replace(/_/g, " ");
      return `${index + 1}. ${question}: ${answer}`;
    }),
  ].filter((line): line is string => line !== null);
  await db.insert(leadActivities).values({
    leadId,
    userId: null,
    activityType: "created",
    description: lines.join("\n"),
    score: 0,
    createdAt: attribution.firstReceivedAt,
  });
}

function eventRank(eventName: string): number {
  const rank = META_EVENT_ORDER.indexOf(eventName as MetaCrmEventName);
  return rank === -1 ? 999 : rank;
}

export function requiredEarlierMetaEvents(eventName: string): string[] {
  if (eventName === "Converted" || eventName === "Sales Opportunity") {
    return ["Initial Lead from Facebook", "Marketing Qualified Lead"];
  }
  if (eventName === "Marketing Qualified Lead" || eventName === "Contacted") {
    return ["Initial Lead from Facebook"];
  }
  return [];
}

export function shouldEnqueueMetaConverted(previousStatus: string | null | undefined, nextStatus: string): boolean {
  return nextStatus === "signed" && previousStatus !== "signed";
}

export function isMetaEventWithinRetryWindow(eventTimeSeconds: number, nowMs = Date.now()): boolean {
  const ageSeconds = Math.floor(nowMs / 1000) - eventTimeSeconds;
  return ageSeconds >= 0 && ageSeconds <= 7 * 24 * 60 * 60;
}

export async function enqueueMetaCrmEvent(input: {
  leadId: number;
  eventName: MetaCrmEventName;
  eventTime: number;
  sourceType: string;
  sourceId?: string | number | null;
  sourceStage?: string | null;
  metaLeadId?: string | null;
  isTestLead?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [lead] = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
  if (!lead) throw new Error(`Lead ${input.leadId} not found`);
  const latestAttribution = input.metaLeadId
    ? (await db.select().from(leadMetaAttributions)
        .where(eq(leadMetaAttributions.metaLeadId, input.metaLeadId))
        .limit(1))[0]
    : (await db.select().from(leadMetaAttributions)
        .where(eq(leadMetaAttributions.leadId, input.leadId))
        .orderBy(desc(leadMetaAttributions.metaLeadCreatedAt))
        .limit(1))[0];
  const metaLeadId = input.metaLeadId || latestAttribution?.metaLeadId || lead.metaLeadId || null;
  const metaLeadCreatedAt = latestAttribution?.metaLeadCreatedAt || lead.metaLeadCreatedAt || null;
  const isTestLead = input.isTestLead ?? latestAttribution?.isTestLead ?? lead.isMetaTestLead ?? false;
  const normalizedEmail = lead.normalizedEmail || normalizeMetaEmail(lead.email);
  const normalizedPhone = lead.normalizedPhone || normalizeMetaPhone(lead.phone || lead.whatsapp);
  const eventTimeSeconds = Math.floor(input.eventTime / 1000);
  const sourceId = input.sourceId == null ? "" : String(input.sourceId);
  const eventId = buildMetaCrmEventId({
    leadId: input.leadId,
    metaLeadId,
    eventName: input.eventName,
    sourceType: input.sourceType,
    sourceId,
  });
  const invalidHistoricalTime = input.eventName !== "Initial Lead from Facebook"
    && Boolean(metaLeadCreatedAt && input.eventTime < metaLeadCreatedAt);
  const validationError = invalidHistoricalTime
    ? "CRM stage timestamp is earlier than the original Meta Lead timestamp; manual review required"
    : null;
  const ts = now();
  await db.insert(metaCrmEventLog).values({
    leadId: input.leadId,
    metaLeadId,
    eventName: input.eventName,
    eventTime: eventTimeSeconds,
    eventId,
    sourceType: input.sourceType,
    sourceId: sourceId || null,
    sourceStage: input.sourceStage || null,
    isTestLead,
    status: invalidHistoricalTime ? "manual_review" : "pending",
    attempts: 0,
    hasLeadId: Boolean(metaLeadId),
    hasEmailHash: Boolean(normalizedEmail),
    hasPhoneHash: Boolean(normalizedPhone),
    lastError: validationError,
    createdAt: ts,
    updatedAt: ts,
  }).onDuplicateKeyUpdate({ set: { eventId } });
  await db.update(leads).set({
    metaSyncStatus: invalidHistoricalTime ? "manual_review" : "pending",
    metaSyncError: validationError,
    updatedAt: ts,
  }).where(eq(leads.id, input.leadId));
  return eventId;
}

export async function enqueueMappedMetaCrmEvent(input: {
  leadId: number;
  mappingValue: string;
  eventTime: number;
  sourceType: string;
  sourceId?: string | number | null;
  sourceStage?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [lead] = await db.select({ metaLeadId: leads.metaLeadId, leadSource: leads.leadSource })
    .from(leads).where(eq(leads.id, input.leadId)).limit(1);
  if (!lead) return null;
  const [attribution] = await db.select({
    id: leadMetaAttributions.id,
    metaLeadId: leadMetaAttributions.metaLeadId,
    isTestLead: leadMetaAttributions.isTestLead,
  })
    .from(leadMetaAttributions)
    .where(eq(leadMetaAttributions.leadId, input.leadId))
    .orderBy(desc(leadMetaAttributions.metaLeadCreatedAt))
    .limit(1);
  const source = lead.leadSource?.toLowerCase() || "";
  const isMetaLead = Boolean(lead.metaLeadId || attribution || source.includes("meta") || source.includes("facebook"));
  if (!isMetaLead) return null;
  const [mapping] = await db
    .select({ eventName: metaIntegrationMappings.outputValue })
    .from(metaIntegrationMappings)
    .where(and(
      eq(metaIntegrationMappings.mappingType, "crm_stage"),
      eq(metaIntegrationMappings.matchValue, input.mappingValue),
      eq(metaIntegrationMappings.isActive, true),
    ))
    .orderBy(asc(metaIntegrationMappings.priority))
    .limit(1);
  if (!mapping?.eventName || !META_EVENT_ORDER.includes(mapping.eventName as MetaCrmEventName)) return null;
  return enqueueMetaCrmEvent({
    leadId: input.leadId,
    eventName: mapping.eventName as MetaCrmEventName,
    eventTime: input.eventTime,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceStage: input.sourceStage,
    metaLeadId: attribution?.metaLeadId || lead.metaLeadId,
    isTestLead: attribution?.isTestLead ?? false,
  });
}

export async function enqueueMetaConvertedForSignedContract(input: {
  contractId: number;
  clientName: string;
  clientPhone?: string | null;
  contractValue?: number | null;
  currency?: string | null;
  signedAt: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const normalizedPhone = normalizeMetaPhone(input.clientPhone);
  if (!normalizedPhone) return { matched: false as const, reason: "missing_phone" };

  const [match] = await db
    .select({ lead: leads })
    .from(leads)
    .innerJoin(leadMetaAttributions, eq(leadMetaAttributions.leadId, leads.id))
    .where(and(
      eq(leadMetaAttributions.isTestLead, false),
      or(
        eq(leads.normalizedPhone, normalizedPhone),
        eq(leads.phone, input.clientPhone || ""),
        eq(leads.whatsapp, input.clientPhone || ""),
      ),
    ))
    .orderBy(asc(leads.createdAt))
    .limit(1);
  const lead = match?.lead;
  if (!lead) return { matched: false as const, reason: "no_matching_lead" };

  await db.update(leads).set({
    contractSignedDate: lead.contractSignedDate || input.signedAt,
    contractValueEur: (input.currency || "EUR").toUpperCase() === "EUR"
      ? String(input.contractValue ?? lead.contractValueEur ?? "") || null
      : lead.contractValueEur,
    updatedAt: now(),
  }).where(eq(leads.id, lead.id));

  const eventId = await enqueueMappedMetaCrmEvent({
    leadId: lead.id,
    mappingValue: "contract:signed",
    eventTime: lead.contractSignedDate || input.signedAt,
    sourceType: "contract_status",
    sourceId: input.contractId,
    sourceStage: "contract:signed",
  });
  return { matched: true as const, leadId: lead.id, eventId };
}

export async function ingestMetaLeadDetail(
  meta: MetaLeadDetail,
  inbox: typeof metaWebhookInbox.$inferSelect,
  config: ActiveMetaConfig,
  isTestLead = false,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!meta.id) throw new Error("Meta Lead ID missing from lead detail");
  const mapped = mapMetaFields(meta.field_data ?? []);
  const phone = mapped.phone || mapped.whatsapp || null;
  const email = mapped.email || null;
  const normalizedPhone = normalizeMetaPhone(phone);
  const normalizedEmail = normalizeMetaEmail(email);
  const firstReceivedAt = inbox.receivedAt || now();
  const metaLeadCreatedAt = meta.created_time ? new Date(meta.created_time).getTime() : (inbox.metaCreatedTime ? inbox.metaCreatedTime * 1000 : firstReceivedAt);
  const formId = meta.form_id || inbox.metaFormId || null;
  const formName = await fetchMetaFormName(formId, config.accessToken);
  const mappedProgram = await resolveProgram(meta, inbox);
  const program = mappedProgram || mapped.interestedProgram || null;
  const match = await resolveMetaLeadMatch({ metaLeadId: meta.id, normalizedPhone, normalizedEmail, isTestLead });
  if (match.status === "ambiguous") {
    await recordAmbiguousMetaInquiry({ inboxId: inbox.id, metaLeadId: meta.id, candidateLeadIds: match.candidateLeadIds });
    throw new MetaManualReviewError("META_CONTACT_MATCH_AMBIGUOUS");
  }
  const routingConsultant = await resolveMetaDefaultConsultant();
  const resolvedRoutingConsultant = !isTestLead && routingConsultant.status === "resolved" ? routingConsultant : null;
  const matchMethod = match.method || "new_lead";
  const duplicateIndicator = match.status === "matched";
  const attribution: ResolvedAttribution = {
    metaLeadId: meta.id,
    metaPageId: inbox.metaPageId || config.pageId || null,
    metaFormId: formId,
    metaFormName: formName,
    metaCampaignId: meta.campaign_id || null,
    metaCampaignName: meta.campaign_name || null,
    metaAdSetId: meta.adset_id || inbox.metaAdGroupId || null,
    metaAdSetName: meta.adset_name || null,
    metaAdId: meta.ad_id || inbox.metaAdId || null,
    metaAdName: meta.ad_name || null,
    metaIsOrganic: Boolean(meta.is_organic),
    isTestLead,
    routingConsultantUserId: resolvedRoutingConsultant?.id ?? null,
    routingConsultantDisplayName: resolvedRoutingConsultant?.name ?? null,
    matchMethod,
    duplicateIndicator,
    ambiguousMatch: false,
    source: config.leadSource,
    program,
    utmSource: "facebook",
    utmMedium: "paid_social",
    utmCampaign: meta.campaign_name || null,
    utmContent: meta.ad_name || null,
    utmTerm: meta.adset_name || null,
    metaLeadCreatedAt,
    firstReceivedAt,
  };

  const transactionResult = await db.transaction(async tx => {
    const existing = match.lead;
    let leadId: number;
    let repeatInquiry = false;
    if (existing) {
      leadId = existing.id;
      const [{ count: attributionCount }] = await tx.select({ count: sql<number>`COUNT(*)` })
        .from(leadMetaAttributions).where(eq(leadMetaAttributions.leadId, leadId));
      const isPrimary = Number(attributionCount) === 0;
      repeatInquiry = !isPrimary;
      await addAttribution(leadId, attribution, isPrimary, tx);
      await tx.update(leads).set({
        normalizedPhone: existing.normalizedPhone || normalizedPhone,
        normalizedEmail: existing.normalizedEmail || normalizedEmail,
        metaLeadId: existing.metaLeadId || meta.id,
        metaFormId: existing.metaFormId || formId,
        metaFormName: existing.metaFormName || formName,
        metaCampaign: existing.metaCampaign || meta.campaign_name || meta.campaign_id || null,
        metaAdset: existing.metaAdset || meta.adset_name || meta.adset_id || null,
        metaAd: existing.metaAd || meta.ad_name || meta.ad_id || null,
        isMetaTestLead: existing.isMetaTestLead || isTestLead,
        metaLeadCreatedAt: existing.metaLeadCreatedAt || metaLeadCreatedAt,
        firstReceivedAt: existing.firstReceivedAt || firstReceivedAt,
        metaSyncStatus: "pending",
        metaSyncError: null,
        updatedAt: now(),
      }).where(eq(leads.id, leadId));
    } else {
      const [insertResult] = await tx.insert(leads).values({
        fullName: mapped.fullName || `Meta Lead ${meta.id.slice(-6)}`,
        email,
        phone,
        whatsapp: mapped.whatsapp || phone,
        normalizedPhone,
        normalizedEmail,
        nationality: mapped.nationality || null,
        interestedProgram: program,
        budgetRange: mapped.budgetRange || null,
        leadSource: config.leadSource,
        metaLeadId: meta.id,
        metaFormId: formId,
        metaFormName: formName,
        metaCampaign: meta.campaign_name || meta.campaign_id || null,
        metaAdset: meta.adset_name || meta.adset_id || null,
        metaAd: meta.ad_name || meta.ad_id || null,
        isMetaTestLead: isTestLead,
        metaLeadCreatedAt,
        firstReceivedAt,
        stage: "fresh",
        assignedTo: null,
        assignedConsultantUserId: null,
        metaAssignmentStatus: isTestLead ? "not_applicable" : "pending",
        notes: mapped.notes || null,
        leadScore: 0,
        metaSyncStatus: "pending",
        dataRegion: "EG",
        createdAt: metaLeadCreatedAt,
        updatedAt: firstReceivedAt,
      });
      leadId = Number((insertResult as { insertId?: number }).insertId);
      await addAttribution(leadId, attribution, true, tx);
    }
    const assignment = await applyMetaAssignment({
      leadId,
      metaLeadId: meta.id,
      isTestLead,
      matchMethod,
      routingConsultant,
    }, tx);
    return { leadId, repeatInquiry, assignment, created: !existing };
  });
  const { leadId, repeatInquiry, assignment } = transactionResult;
  await updateMetaInboxOutcome({
    inboxId: inbox.id,
    matchMethod,
    duplicateIndicator,
    assignmentStatus: assignment.outcome,
  });
  await writeMetaInquiryActivity(leadId, meta, attribution, repeatInquiry);
  await enqueueMetaCrmEvent({
    leadId,
    metaLeadId: meta.id,
    eventName: "Initial Lead from Facebook",
    eventTime: metaLeadCreatedAt,
    sourceType: "meta_lead",
    sourceId: meta.id,
    sourceStage: "fresh",
    isTestLead,
  });

  if (!isTestLead && assignment.outcome === "assigned") {
    await queueMetaLeadAlert({ leadId, metaLeadId: meta.id });
    void processMetaNotificationOutbox(5);
  } else if (!isTestLead && assignment.outcome === "pending" && routingConsultant.status !== "resolved") {
    await queueMetaAdminAlert({
      notificationKey: `admin:assignment-policy:${routingConsultant.safeCode}:${meta.id}`,
      safeAlertCode: routingConsultant.safeCode,
      leadId,
    });
    void processMetaNotificationOutbox(5);
  }
  return { leadId, created: transactionResult.created, repeatInquiry, assignment: assignment.outcome };
}

export async function processMetaWebhookInboxBatch(limit = 25) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const ts = now();
  const config = await getActiveMetaConfig();
  const items = await db.select().from(metaWebhookInbox)
    .where(and(
      inArray(metaWebhookInbox.status, ["pending", "retrying"]),
      or(sql`${metaWebhookInbox.nextAttemptAt} IS NULL`, lte(metaWebhookInbox.nextAttemptAt, ts)),
    ))
    .orderBy(asc(metaWebhookInbox.receivedAt))
    .limit(Math.min(100, Math.max(1, limit)));

  let processed = 0;
  let failed = 0;
  for (const item of items) {
    const attempt = item.attempts + 1;
    try {
      await db.update(metaWebhookInbox).set({ status: "processing", attempts: attempt, updatedAt: now() }).where(eq(metaWebhookInbox.id, item.id));
      const meta = await fetchMetaLeadDetail(item.metaLeadId, config.accessToken);
      const formId = meta.form_id || item.metaFormId || null;
      const isTestLead = await classifyMetaTestLead(meta.id, formId, config.accessToken);
      if (item.isTestLead !== isTestLead) {
        await db.update(metaWebhookInbox).set({ isTestLead, updatedAt: now() }).where(eq(metaWebhookInbox.id, item.id));
      }
      const result = await ingestMetaLeadDetail(meta, { ...item, isTestLead }, config, isTestLead);
      await db.update(metaWebhookInbox).set({
        status: "processed",
        leadId: result.leadId,
        processedAt: now(),
        nextAttemptAt: null,
        lastError: null,
        lastErrorCode: null,
        updatedAt: now(),
      }).where(eq(metaWebhookInbox.id, item.id));
      processed += 1;
    } catch (error) {
      if (error instanceof MetaManualReviewError) {
        failed += 1;
        continue;
      }
      const deadLetter = attempt >= MAX_ATTEMPTS;
      await db.update(metaWebhookInbox).set({
        status: deadLetter ? "dead_letter" : "retrying",
        nextAttemptAt: deadLetter ? null : now() + RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)],
        lastError: safeMetaError(error),
        lastErrorCode: "META_INGESTION_FAILED",
        updatedAt: now(),
      }).where(eq(metaWebhookInbox.id, item.id));
      failed += 1;
    }
  }
  return { selected: items.length, processed, failed };
}

export function buildMetaCrmEventId(input: {
  leadId: number;
  metaLeadId?: string | null;
  eventName: string;
  sourceType: string;
  sourceId?: string | number | null;
}) {
  return sha256([
    input.leadId,
    input.metaLeadId || "",
    input.eventName,
    input.sourceType,
    input.sourceId == null ? "" : String(input.sourceId),
  ].join(":"));
}

export function buildMetaCrmPayload(event: typeof metaCrmEventLog.$inferSelect, lead: typeof leads.$inferSelect, testEventCode?: string | null) {
  const emailHash = hashMetaEmail(lead.normalizedEmail || lead.email);
  const phoneHash = hashMetaPhone(lead.normalizedPhone || lead.phone || lead.whatsapp);
  const userData: Record<string, unknown> = {};
  if (event.metaLeadId) userData.lead_id = event.metaLeadId;
  if (emailHash) userData.em = [emailHash];
  if (phoneHash) userData.ph = [phoneHash];
  const payload: Record<string, unknown> = {
    data: [{
      event_name: event.eventName,
      event_time: event.eventTime,
      event_id: event.eventId,
      action_source: "system_generated",
      user_data: userData,
      custom_data: {
        event_source: "crm",
        lead_event_source: "ELEVAY Lead Module",
        crm_stage: event.sourceStage || undefined,
        program: lead.interestedProgram || undefined,
        internal_lead_id: String(lead.id),
      },
    }],
  };
  if (testEventCode) payload.test_event_code = testEventCode;
  return payload;
}

async function sendMetaCrmEvent(event: typeof metaCrmEventLog.$inferSelect, testEventCode?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [lead] = await db.select().from(leads).where(eq(leads.id, event.leadId)).limit(1);
  if (!lead) throw new Error(`Lead ${event.leadId} not found`);
  const datasetId = process.env.META_DATASET_ID || process.env.META_PIXEL_ID || DEFAULT_DATASET_ID;
  const accessToken = process.env.META_CAPI_TOKEN || "";
  if (!datasetId || !accessToken) throw new Error("Meta dataset ID or Conversions API token is not configured");
  const code = testEventCode?.trim() || null;
  const productionEnabled = process.env.META_CRM_PRODUCTION_ENABLED === "true";
  if (event.isTestLead && !code) {
    const reviewError = "Meta Test Lead event requires an explicit Meta Test Events code and cannot be sent as a production conversion";
    await db.update(metaCrmEventLog).set({ status: "manual_review", lastError: reviewError, updatedAt: now() }).where(eq(metaCrmEventLog.id, event.id));
    await db.update(leads).set({ metaSyncStatus: "manual_review", metaSyncError: reviewError, updatedAt: now() }).where(eq(leads.id, event.leadId));
    return { sent: false, manualReview: true };
  }
  if (!code && !productionEnabled) {
    const reviewError = "Production Meta CRM event sending is disabled pending explicit approval";
    await db.update(metaCrmEventLog).set({ status: "manual_review", lastError: reviewError, updatedAt: now() }).where(eq(metaCrmEventLog.id, event.id));
    await db.update(leads).set({ metaSyncStatus: "manual_review", metaSyncError: reviewError, updatedAt: now() }).where(eq(leads.id, event.leadId));
    return { sent: false, manualReview: true };
  }
  const response = await metaFetch(`${graphBase()}/${datasetId}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildMetaCrmPayload(event, lead, code)),
  });
  const json = await response.json() as Record<string, unknown>;
  if (!response.ok || json.error) {
    const error = json.error as { message?: string; code?: number; error_subcode?: number } | undefined;
    const wrapped = new Error(error?.message || `Meta CRM API request failed with ${response.status}`) as Error & { code?: number; response?: unknown };
    wrapped.code = error?.code || response.status;
    wrapped.response = json;
    throw wrapped;
  }
  return { sent: true, response: json };
}

export async function processMetaCrmEventOutbox(limit = 25, testEventCode?: string | null, eventLogId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const ts = now();
  const events = await db.select().from(metaCrmEventLog)
    .where(and(
      inArray(metaCrmEventLog.status, ["pending", "failed", "retrying"]),
      or(sql`${metaCrmEventLog.nextAttemptAt} IS NULL`, lte(metaCrmEventLog.nextAttemptAt, ts)),
      eventLogId ? eq(metaCrmEventLog.id, eventLogId) : undefined,
    ))
    .orderBy(asc(metaCrmEventLog.eventTime), asc(metaCrmEventLog.id))
    .limit(Math.min(100, Math.max(1, limit)));

  let sent = 0;
  let failed = 0;
  let blocked = 0;
  for (const event of events) {
    if (!isMetaEventWithinRetryWindow(event.eventTime, ts)) {
      const message = "CRM event is outside Meta's seven-day upload window; manual review required";
      await db.update(metaCrmEventLog).set({ status: "manual_review", nextAttemptAt: null, lastError: message, updatedAt: ts }).where(eq(metaCrmEventLog.id, event.id));
      await db.update(leads).set({ metaSyncStatus: "manual_review", metaSyncError: message, updatedAt: ts }).where(eq(leads.id, event.leadId));
      blocked += 1;
      continue;
    }
    const earlier = await db.select({ eventName: metaCrmEventLog.eventName, status: metaCrmEventLog.status })
      .from(metaCrmEventLog)
      .where(and(eq(metaCrmEventLog.leadId, event.leadId), sql`${metaCrmEventLog.id} != ${event.id}`))
      .orderBy(asc(metaCrmEventLog.eventTime), asc(metaCrmEventLog.id));
    const currentRank = eventRank(event.eventName);
    const requiredNames = requiredEarlierMetaEvents(event.eventName);
    const missingRequired = requiredNames.filter(name => !earlier.some(item => item.eventName === name));
    if (missingRequired.length) {
      const message = `Missing required earlier CRM event history: ${missingRequired.join(", ")}`;
      await db.update(metaCrmEventLog).set({ status: "manual_review", nextAttemptAt: null, lastError: message, updatedAt: ts }).where(eq(metaCrmEventLog.id, event.id));
      await db.update(leads).set({ metaSyncStatus: "manual_review", metaSyncError: message, updatedAt: ts }).where(eq(leads.id, event.leadId));
      blocked += 1;
      continue;
    }
    const unmetEarlier = earlier.some(item => eventRank(item.eventName) < currentRank && item.status !== "sent");
    if (unmetEarlier) {
      await db.update(metaCrmEventLog).set({ status: "retrying", nextAttemptAt: ts + 5 * 60_000, lastError: "Waiting for an earlier CRM stage event", updatedAt: ts }).where(eq(metaCrmEventLog.id, event.id));
      blocked += 1;
      continue;
    }
    const attempt = event.attempts + 1;
    try {
      const result = await sendMetaCrmEvent(event, testEventCode);
      if (result.manualReview) {
        blocked += 1;
        continue;
      }
      await db.update(metaCrmEventLog).set({
        status: "sent",
        attempts: attempt,
        sentAt: now(),
        nextAttemptAt: null,
        lastError: null,
        errorCode: null,
        metaResponse: JSON.stringify(result.response).slice(0, 8_000),
        updatedAt: now(),
      }).where(eq(metaCrmEventLog.id, event.id));
      await db.update(leads).set({
        metaLastEventSent: event.eventName,
        metaLastEventSentAt: now(),
        metaSyncStatus: "sent",
        metaSyncError: null,
        updatedAt: now(),
      }).where(eq(leads.id, event.leadId));
      sent += 1;
    } catch (error) {
      const deadLetter = attempt >= MAX_ATTEMPTS;
      const message = safeMetaError(error);
      const errorCode = String((error as { code?: number }).code || "META_API_ERROR");
      await db.update(metaCrmEventLog).set({
        status: deadLetter ? "dead_letter" : "retrying",
        attempts: attempt,
        nextAttemptAt: deadLetter ? null : now() + RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)],
        lastError: message,
        errorCode,
        metaResponse: JSON.stringify((error as { response?: unknown }).response || {}).slice(0, 8_000),
        updatedAt: now(),
      }).where(eq(metaCrmEventLog.id, event.id));
      await db.update(leads).set({ metaSyncStatus: deadLetter ? "failed" : "retrying", metaSyncError: message, updatedAt: now() }).where(eq(leads.id, event.leadId));
      failed += 1;
    }
  }
  return { selected: events.length, sent, failed, blocked };
}

export async function retryMetaCrmEvent(eventLogId: number, testEventCode?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!testEventCode?.trim()) throw new Error("A Meta Test Event code is required for manual retry");
  await db.update(metaCrmEventLog).set({ status: "pending", attempts: 0, nextAttemptAt: null, lastError: null, errorCode: null, updatedAt: now() }).where(eq(metaCrmEventLog.id, eventLogId));
  return processMetaCrmEventOutbox(1, testEventCode.trim(), eventLogId);
}

async function queueMissedMetaLeads(config: ActiveMetaConfig, sinceMs: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const formUrl = new URL(`${graphBase()}/${config.pageId}/leadgen_forms`);
  formUrl.searchParams.set("fields", "id,name,status");
  formUrl.searchParams.set("limit", "100");
  formUrl.searchParams.set("access_token", config.accessToken);
  const formResponse = await metaFetch(formUrl, { headers: { Accept: "application/json" } });
  const formPayload = await formResponse.json() as {
    data?: Array<{ id: string; name?: string; status?: string }>;
    error?: { message?: string };
  };
  if (!formResponse.ok || formPayload.error) {
    throw new Error(`Meta form discovery failed: ${formPayload.error?.message || formResponse.status}`);
  }

  let scanned = 0;
  let queued = 0;
  let newestLeadTimeMs = sinceMs;
  const sinceSeconds = Math.max(0, Math.floor((sinceMs - 5 * 60_000) / 1000));
  for (const form of formPayload.data ?? []) {
    if (form.status && form.status.toUpperCase() === "ARCHIVED") continue;
    let nextUrl: string | null = (() => {
      const url = new URL(`${graphBase()}/${form.id}/leads`);
      url.searchParams.set("fields", "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic,field_data");
      url.searchParams.set("limit", "100");
      url.searchParams.set("filtering", JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceSeconds }]));
      url.searchParams.set("access_token", config.accessToken);
      return url.toString();
    })();

    while (nextUrl && scanned < 1_000) {
      const response = await metaFetch(nextUrl, { headers: { Accept: "application/json" } });
      const payload = await response.json() as {
        data?: MetaLeadDetail[];
        paging?: { next?: string };
        error?: { message?: string };
      };
      if (!response.ok || payload.error) {
        throw new Error(`Meta lead reconciliation failed for form ${form.id}: ${payload.error?.message || response.status}`);
      }
      const pageLeads = payload.data ?? [];
      const knownMetaLeadIds = pageLeads.length
        ? new Set((await db.select({ metaLeadId: leadMetaAttributions.metaLeadId })
          .from(leadMetaAttributions)
          .where(inArray(leadMetaAttributions.metaLeadId, pageLeads.map(lead => lead.id))))
          .map(row => row.metaLeadId))
        : new Set<string>();
      for (const lead of pageLeads) {
        scanned += 1;
        const leadTimeMs = lead.created_time ? new Date(lead.created_time).getTime() : now();
        if (Number.isFinite(leadTimeMs)) newestLeadTimeMs = Math.max(newestLeadTimeMs, leadTimeMs);
        if (knownMetaLeadIds.has(lead.id)) continue;
        const webhookKey = sha256([config.pageId, lead.id, form.id, "reconciliation"].join(":"));
        const [result] = await db.insert(metaWebhookInbox).values({
          webhookKey,
          metaLeadId: lead.id,
          metaPageId: config.pageId,
          metaFormId: lead.form_id || form.id,
          metaAdId: lead.ad_id || null,
          metaAdGroupId: lead.adset_id || null,
          metaCreatedTime: Math.floor(leadTimeMs / 1000),
          ingestionSource: "reconciliation",
          signatureValidated: false,
          status: "pending",
          attempts: 0,
          receivedAt: now(),
          updatedAt: now(),
        }).onDuplicateKeyUpdate({ set: { webhookKey } });
        if (Number((result as { affectedRows?: number }).affectedRows || 0) === 1) queued += 1;
      }
      nextUrl = payload.paging?.next || null;
    }
  }
  return { scanned, queued, newestLeadTimeMs };
}

export async function runMetaReconciliation(options: { limit?: number; sinceOverrideMs?: number } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const config = await getActiveMetaConfig();
  const ts = now();
  const [existingState] = config.integrationId
    ? await db.select().from(metaReconciliationState).where(eq(metaReconciliationState.integrationId, config.integrationId)).limit(1)
    : [];
  const priorCursor = Number(existingState?.cursor || 0);
  const sinceMs = options.sinceOverrideMs ?? (priorCursor || existingState?.lastSuccessAt || config.lastSyncAt || (ts - 48 * 60 * 60_000));
  if (existingState?.status === "running" && existingState.lastAttemptAt && existingState.lastAttemptAt > ts - 5 * 60_000) {
    throw new Error("META_RECONCILIATION_ALREADY_RUNNING");
  }
  if (config.integrationId) {
    await db.insert(metaReconciliationState).values({
      integrationId: config.integrationId,
      status: "running",
      lastAttemptAt: ts,
      updatedAt: ts,
    }).onDuplicateKeyUpdate({ set: { status: "running", lastAttemptAt: ts, lastError: null, updatedAt: ts } });
  }
  try {
    const pull = await queueMissedMetaLeads(config, sinceMs);
    const inbox = await processMetaWebhookInboxBatch(options.limit ?? 100);
    const assignments = await recoverUnassignedMetaLeads();
    const events = await processMetaCrmEventOutbox(options.limit ?? 100);
    const notifications = await processMetaNotificationOutbox(options.limit ?? 100);
    const monitoring = await collectMetaMonitoringSnapshot();
    if (config.integrationId) {
      await db.update(metaReconciliationState).set({
        cursor: String(Math.max(sinceMs, pull.newestLeadTimeMs)),
        status: "success",
        lastSuccessAt: now(),
        lastError: null,
        leadsScanned: pull.scanned,
        leadsImported: inbox.processed,
        eventsRetried: events.sent,
        updatedAt: now(),
      }).where(eq(metaReconciliationState.integrationId, config.integrationId));
      await db.update(leadIntegrations).set({ lastSyncAt: now(), lastSyncCount: inbox.processed, updatedAt: now() }).where(eq(leadIntegrations.id, config.integrationId));
    }
    return { pull, inbox, assignments, events, notifications, monitoring };
  } catch (error) {
    if (config.integrationId) {
      await db.update(metaReconciliationState).set({ status: "failed", lastError: safeMetaError(error), updatedAt: now() }).where(eq(metaReconciliationState.integrationId, config.integrationId));
    }
    throw error;
  }
}

export async function getMetaIntegrationHealth() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [activeIntegration] = await db.select({ config: leadIntegrations.config, webhookToken: leadIntegrations.webhookToken })
    .from(leadIntegrations)
    .where(and(eq(leadIntegrations.type, "meta"), eq(leadIntegrations.isActive, true)))
    .orderBy(desc(leadIntegrations.updatedAt))
    .limit(1);
  let storedConfig: Record<string, unknown> = {};
  try { storedConfig = activeIntegration?.config ? JSON.parse(activeIntegration.config) : {}; } catch { storedConfig = {}; }
  const pageAccessTokenConfigured = Boolean(process.env.META_PAGE_ACCESS_TOKEN || storedConfig.page_access_token || storedConfig.access_token);
  const pageIdConfigured = Boolean(process.env.META_PAGE_ID || storedConfig.page_id || DEFAULT_PAGE_ID);
  const capiTokenConfigured = Boolean(process.env.META_CAPI_TOKEN);
  const datasetConfigured = Boolean(process.env.META_DATASET_ID || process.env.META_PIXEL_ID || DEFAULT_DATASET_ID);
  const appSecretConfigured = Boolean(process.env.META_APP_SECRET);
  const verifyTokenConfigured = Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN || storedConfig.verify_token || storedConfig.verify_token_hash || activeIntegration?.webhookToken || deriveMetaWebhookVerifyToken());
  const [lastWebhook] = await db.select().from(metaWebhookInbox).where(eq(metaWebhookInbox.isTestLead, false)).orderBy(desc(metaWebhookInbox.receivedAt)).limit(1);
  const [lastProcessed] = await db.select().from(metaWebhookInbox).where(and(eq(metaWebhookInbox.status, "processed"), eq(metaWebhookInbox.isTestLead, false))).orderBy(desc(metaWebhookInbox.processedAt)).limit(1);
  const [lastEvent] = await db.select().from(metaCrmEventLog).where(and(eq(metaCrmEventLog.status, "sent"), eq(metaCrmEventLog.isTestLead, false))).orderBy(desc(metaCrmEventLog.sentAt)).limit(1);
  const [reconciliation] = await db.select().from(metaReconciliationState).orderBy(desc(metaReconciliationState.updatedAt)).limit(1);
  const [counts] = await db.select({
    totalEvents: sql<number>`COUNT(*)`,
    sentEvents: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.status} = 'sent' THEN 1 ELSE 0 END)`,
    failedEvents: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.status} IN ('failed','dead_letter') THEN 1 ELSE 0 END)`,
    pendingEvents: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.status} = 'pending' THEN 1 ELSE 0 END)`,
    retryingEvents: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.status} = 'retrying' THEN 1 ELSE 0 END)`,
    manualReviewEvents: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.status} = 'manual_review' THEN 1 ELSE 0 END)`,
    coveredEvents: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.hasLeadId} OR ${metaCrmEventLog.hasEmailHash} OR ${metaCrmEventLog.hasPhoneHash} THEN 1 ELSE 0 END)`,
  }).from(metaCrmEventLog).where(eq(metaCrmEventLog.isTestLead, false));
  const totalEvents = Number(counts?.totalEvents || 0);
  const failedEvents = Number(counts?.failedEvents || 0);
  const warnings: string[] = [];
  if (!pageAccessTokenConfigured) warnings.push("Meta Page access token is not configured");
  if (!pageIdConfigured) warnings.push("Meta Page ID is not configured");
  if (!appSecretConfigured || !verifyTokenConfigured) warnings.push("Webhook signature or verification secret is incomplete");
  if (!capiTokenConfigured || !datasetConfigured) warnings.push("Conversions API token or dataset is incomplete");
  if (pageAccessTokenConfigured && pageIdConfigured && !lastWebhook) warnings.push("No Meta webhook delivery has been recorded");
  if (lastWebhook && now() - lastWebhook.receivedAt > 26 * 60 * 60_000) warnings.push("No Meta webhook delivery has been recorded in the last 26 hours");
  if (reconciliation?.status === "failed") warnings.push("The most recent reconciliation run failed");
  if (totalEvents >= 5 && failedEvents / totalEvents > 0.1) warnings.push("CRM event failure rate is above 10%");
  return {
    configured: pageAccessTokenConfigured && pageIdConfigured && capiTokenConfigured && datasetConfigured && appSecretConfigured && verifyTokenConfigured,
    leadRetrievalConfigured: pageAccessTokenConfigured && pageIdConfigured,
    capiConfigured: capiTokenConfigured && datasetConfigured,
    pageAccessTokenConfigured,
    pageIdConfigured,
    capiTokenConfigured,
    datasetConfigured,
    appSecretConfigured,
    verifyTokenConfigured,
    signatureConfigured: appSecretConfigured && verifyTokenConfigured,
    productionSendingEnabled: process.env.META_CRM_PRODUCTION_ENABLED === "true",
    graphVersion: process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION,
    datasetId: process.env.META_DATASET_ID || process.env.META_PIXEL_ID || DEFAULT_DATASET_ID,
    pageId: process.env.META_PAGE_ID || DEFAULT_PAGE_ID,
    lastWebhookAt: lastWebhook?.receivedAt ?? null,
    lastLeadSyncAt: lastProcessed?.processedAt ?? null,
    lastCrmEventAt: lastEvent?.sentAt ?? null,
    reconciliation: reconciliation ?? null,
    warnings,
    eventTotals: {
      total: totalEvents,
      sent: Number(counts?.sentEvents || 0),
      failed: failedEvents,
      pending: Number(counts?.pendingEvents || 0),
      retrying: Number(counts?.retryingEvents || 0),
      manualReview: Number(counts?.manualReviewEvents || 0),
      covered: Number(counts?.coveredEvents || 0),
    },
  };
}
