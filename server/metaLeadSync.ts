/**
 * Meta Lead Ads Sync Service
 *
 * Pulls leads from Meta Graph API for all active Meta integrations.
 * Auto-discovers ALL lead forms on the page — no Form ID needed.
 * Uses `lastSyncAt` as a cursor so only new leads are fetched each run.
 * Deduplication: checks phone + email against existing leads before inserting.
 *
 * Flow:
 *   1. GET /{PAGE_ID}/leadgen_forms  → discover all forms on the page
 *   2. For each form: GET /{FORM_ID}/leads?filtering=[time_created > lastSyncAt]
 *   3. Map Meta fields → ELEVAY lead fields
 *   4. Deduplicate by phone + email
 *   5. Insert new leads, update lastSyncAt
 *
 * Required Meta permissions on the Page Access Token:
 *   leads_retrieval, pages_manage_ads, pages_show_list, pages_read_engagement
 */

import { getDb } from "./db";
import { leadIntegrations, leads } from "../drizzle/schema";
import { eq, and, or } from "drizzle-orm";

const META_GRAPH_BASE = "https://graph.facebook.com/v19.0";

interface MetaFieldData {
  name: string;
  values: string[];
}

interface MetaLead {
  id: string;
  created_time: string;
  ad_id?: string;
  form_id?: string;
  field_data: MetaFieldData[];
}

interface MetaLeadsResponse {
  data: MetaLead[];
  paging?: {
    cursors?: { before: string; after: string };
    next?: string;
  };
  error?: { message: string; type: string; code: number };
}

interface MetaForm {
  id: string;
  name: string;
  status?: string;
}

interface MetaFormsResponse {
  data: MetaForm[];
  paging?: { next?: string; cursors?: { after: string } };
  error?: { message: string; type: string; code: number };
}

/** Map Meta field names to ELEVAY lead fields */
function mapMetaFieldsToLead(fieldData: MetaFieldData[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fieldData) {
    const val = f.values?.[0] ?? "";
    const key = f.name.toLowerCase().replace(/[\s-]/g, "_");
    switch (key) {
      case "full_name":
      case "name":
        map.fullName = val;
        break;
      case "first_name":
        map.firstName = val;
        break;
      case "last_name":
        map.lastName = val;
        break;
      case "email":
      case "email_address":
        map.email = val;
        break;
      case "phone_number":
      case "phone":
      case "mobile":
      case "mobile_number":
        map.phone = val;
        break;
      case "whatsapp":
      case "whatsapp_number":
        map.whatsapp = val;
        break;
      case "nationality":
      case "country":
        map.nationality = val;
        break;
      case "city":
        map.city = val;
        break;
      case "interested_program":
      case "program":
      case "service":
      case "interested_in":
        map.interestedProgram = val;
        break;
      case "budget":
      case "investment_budget":
        map.budgetRange = val;
        break;
      case "notes":
      case "message":
      case "comment":
        map.notes = val;
        break;
      default:
        if (val) map._extra = (map._extra ? map._extra + "\n" : "") + `${f.name}: ${val}`;
    }
  }
  // Combine first + last name if full name not provided
  if (!map.fullName && (map.firstName || map.lastName)) {
    map.fullName = [map.firstName, map.lastName].filter(Boolean).join(" ");
  }
  return map;
}

/** Fetch all lead forms on a page (auto-discovery) */
async function fetchAllForms(pageId: string, accessToken: string): Promise<MetaForm[]> {
  const allForms: MetaForm[] = [];
  let afterCursor: string | undefined;

  do {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: "id,name,status",
      limit: "100",
    });
    if (afterCursor) params.set("after", afterCursor);

    const url = `${META_GRAPH_BASE}/${pageId}/leadgen_forms?${params.toString()}`;
    const res = await fetch(url);
    const json = (await res.json()) as MetaFormsResponse;

    if (json.error) {
      console.error(`[MetaLeadSync] Error fetching forms for page ${pageId}: ${json.error.message}`);
      break;
    }

    allForms.push(...(json.data ?? []));
    afterCursor = json.paging?.cursors?.after;
    if (!json.paging?.next) break;
  } while (afterCursor);

  return allForms;
}

/** Fetch one page of leads from a specific form */
async function fetchMetaLeadsPage(
  formId: string,
  accessToken: string,
  afterCursor?: string,
  sinceTimestamp?: number
): Promise<MetaLeadsResponse> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "created_time,id,ad_id,form_id,field_data",
    limit: "100",
  });

  if (sinceTimestamp) {
    params.set(
      "filtering",
      JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceTimestamp }])
    );
  }

  if (afterCursor) {
    params.set("after", afterCursor);
  }

  const url = `${META_GRAPH_BASE}/${formId}/leads?${params.toString()}`;
  const res = await fetch(url);
  const json = (await res.json()) as MetaLeadsResponse;
  return json;
}

/** Check if a lead already exists by phone or email (deduplication) */
async function leadExists(db: Awaited<ReturnType<typeof getDb>>, phone?: string, email?: string): Promise<boolean> {
  if (!db) return false;
  if (!phone && !email) return false;

  const conditions = [];
  if (phone) conditions.push(eq(leads.phone, phone));
  if (email) conditions.push(eq(leads.email, email));

  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(or(...conditions))
    .limit(1);

  return !!existing;
}

export interface SyncResult {
  integrationId: number;
  integrationName: string;
  newLeads: number;
  skippedDuplicates: number;
  formsDiscovered: number;
  errors: string[];
}

/** Sync one Meta integration — auto-discovers all forms on the page */
async function syncOneIntegration(integration: {
  id: number;
  name: string;
  config: string | null;
  lastSyncAt: number | null;
}): Promise<SyncResult> {
  const result: SyncResult = {
    integrationId: integration.id,
    integrationName: integration.name,
    newLeads: 0,
    skippedDuplicates: 0,
    formsDiscovered: 0,
    errors: [],
  };

  let config: Record<string, string> = {};
  try {
    config = integration.config ? JSON.parse(integration.config) : {};
  } catch {
    result.errors.push("Invalid config JSON");
    return result;
  }

  const { page_access_token: accessToken, lead_source: leadSource, assigned_to: assignedTo } = config;

  // page_id can be in config or auto-detected — we always auto-detect from /me/accounts
  let pageId = config.page_id;

  if (!accessToken) {
    result.errors.push("No page_access_token configured");
    return result;
  }

  const db = await getDb();
  if (!db) {
    result.errors.push("DB not available");
    return result;
  }

  // Auto-detect page ID if not stored
  if (!pageId) {
    try {
      const accountsRes = await fetch(
        `${META_GRAPH_BASE}/me/accounts?fields=id,name&access_token=${accessToken}`
      );
      const accountsJson = (await accountsRes.json()) as { data?: Array<{ id: string; name: string }>; error?: { message: string } };
      if (accountsJson.error) {
        result.errors.push(`Token error: ${accountsJson.error.message}`);
        return result;
      }
      if (!accountsJson.data?.length) {
        result.errors.push("No pages found for this token");
        return result;
      }
      // Use the first page (or the one matching stored name)
      pageId = accountsJson.data[0].id;

      // Persist the page_id back to config so future syncs skip this step
      const updatedConfig = { ...config, page_id: pageId };
      await db
        .update(leadIntegrations)
        .set({ config: JSON.stringify(updatedConfig) })
        .where(eq(leadIntegrations.id, integration.id));
    } catch (err) {
      result.errors.push(`Failed to auto-detect page ID: ${err instanceof Error ? err.message : String(err)}`);
      return result;
    }
  }

  // Auto-discover ALL lead forms on the page
  let forms: MetaForm[] = [];
  try {
    forms = await fetchAllForms(pageId, accessToken);
    result.formsDiscovered = forms.length;
    console.log(`[MetaLeadSync] Integration "${integration.name}": discovered ${forms.length} form(s) on page ${pageId}`);
  } catch (err) {
    result.errors.push(`Failed to discover forms: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  if (forms.length === 0) {
    console.log(`[MetaLeadSync] No lead forms found on page ${pageId}`);
    return result;
  }

  // Use lastSyncAt as the since filter (subtract 60s buffer to avoid missing edge cases)
  const sinceTs = integration.lastSyncAt ? Math.floor(integration.lastSyncAt / 1000) - 60 : undefined;
  const now = Date.now();

  // Sync leads from each form
  for (const form of forms) {
    let afterCursor: string | undefined;

    try {
      do {
        const response = await fetchMetaLeadsPage(form.id, accessToken, afterCursor, sinceTs);

        if (response.error) {
          result.errors.push(`Form "${form.name}" (${form.id}): ${response.error.message}`);
          break;
        }

        for (const metaLead of response.data ?? []) {
          const mapped = mapMetaFieldsToLead(metaLead.field_data ?? []);
          const phone = mapped.phone || mapped.whatsapp || undefined;
          const email = mapped.email || undefined;

          // Deduplication check
          const isDuplicate = await leadExists(db, phone, email);
          if (isDuplicate) {
            result.skippedDuplicates++;
            continue;
          }

          // Build notes: combine user notes + extra unmapped fields + meta metadata
          const noteParts: string[] = [];
          if (mapped.notes) noteParts.push(mapped.notes);
          if (mapped._extra) noteParts.push(`--- Additional Fields ---\n${mapped._extra}`);
          noteParts.push(`Meta Form: ${form.name}`);
          if (metaLead.ad_id) noteParts.push(`Meta Ad ID: ${metaLead.ad_id}`);
          noteParts.push(`Meta Lead ID: ${metaLead.id}`);

          const createdAtMs = new Date(metaLead.created_time).getTime() || now;

          await db.insert(leads).values({
            fullName: mapped.fullName || "Unknown",
            email: email || null,
            phone: phone || null,
            whatsapp: mapped.whatsapp || phone || null,
            nationality: mapped.nationality || null,
            interestedProgram: mapped.interestedProgram || null,
            budgetRange: mapped.budgetRange || null,
            leadSource: leadSource || "Meta Ads",
            metaFormId: form.id,
            metaFormName: form.name,
            stage: "fresh",
            assignedTo: assignedTo || null,
            notes: noteParts.join("\n\n") || null,
            leadScore: 0,
            createdAt: createdAtMs,
            updatedAt: createdAtMs,
          });

          result.newLeads++;
        }

        // Pagination
        afterCursor = response.paging?.cursors?.after;
        const hasNextPage = !!response.paging?.next;
        if (!hasNextPage) break;
      } while (afterCursor);
    } catch (err) {
      result.errors.push(`Form "${form.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Update lastSyncAt and lastSyncCount
  try {
    await db
      .update(leadIntegrations)
      .set({ lastSyncAt: now, lastSyncCount: result.newLeads, updatedAt: now })
      .where(eq(leadIntegrations.id, integration.id));
  } catch (err) {
    result.errors.push(`Failed to update sync timestamp: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/** Sync a single integration by ID with optional historical since timestamp override */
export async function syncOneIntegrationById(id: number, sinceOverrideMs?: number): Promise<SyncResult> {
  const db = await getDb();
  if (!db) return { integrationId: id, integrationName: "Unknown", newLeads: 0, skippedDuplicates: 0, formsDiscovered: 0, errors: ["DB not available"] };
  const [integration] = await db.select().from(leadIntegrations).where(eq(leadIntegrations.id, id)).limit(1);
  if (!integration) return { integrationId: id, integrationName: "Unknown", newLeads: 0, skippedDuplicates: 0, formsDiscovered: 0, errors: ["Integration not found"] };
  // If a historical override is provided, temporarily override lastSyncAt
  const integrationWithOverride = sinceOverrideMs !== undefined
    ? { ...integration, lastSyncAt: sinceOverrideMs }
    : integration;
  return syncOneIntegration(integrationWithOverride);
}

/** Sync ALL active Meta integrations — called by the 4-hour heartbeat */
export async function syncAllMetaIntegrations(): Promise<SyncResult[]> {
  const db = await getDb();
  if (!db) return [];

  const activeIntegrations = await db
    .select()
    .from(leadIntegrations)
    .where(and(eq(leadIntegrations.type, "meta"), eq(leadIntegrations.isActive, true)));

  if (activeIntegrations.length === 0) {
    console.log("[MetaLeadSync] No active Meta integrations configured.");
    return [];
  }

  console.log(`[MetaLeadSync] Syncing ${activeIntegrations.length} Meta integration(s)...`);
  const results: SyncResult[] = [];
  for (const integration of activeIntegrations) {
    const result = await syncOneIntegration(integration);
    console.log(`[MetaLeadSync] "${result.integrationName}": ${result.newLeads} new, ${result.skippedDuplicates} duplicates, ${result.formsDiscovered} forms${result.errors.length ? `, errors: ${result.errors.join("; ")}` : ""}`);
    results.push(result);
  }

  return results;
}
