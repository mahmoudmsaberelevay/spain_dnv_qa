/**
 * Meta Lead Ads Sync Service
 *
 * Pulls leads from Meta Graph API for all active Meta integrations.
 * Uses `lastSyncAt` as a cursor so only new leads are fetched each run.
 * Deduplication: checks phone + email against existing leads before inserting.
 *
 * API reference:
 *   GET /{FORM_ID}/leads?fields=created_time,id,ad_id,form_id,field_data
 *                        &filtering=[{"field":"time_created","operator":"GREATER_THAN","value":<unix_ts>}]
 *                        &access_token={PAGE_ACCESS_TOKEN}
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
        // Store unknown fields in notes as "key: value"
        if (val) map._extra = (map._extra ? map._extra + "\n" : "") + `${f.name}: ${val}`;
    }
  }
  // Combine first + last name if full name not provided
  if (!map.fullName && (map.firstName || map.lastName)) {
    map.fullName = [map.firstName, map.lastName].filter(Boolean).join(" ");
  }
  return map;
}

/** Fetch one page of leads from Meta Graph API */
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
  errors: string[];
}

/** Sync one Meta integration */
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
    errors: [],
  };

  let config: Record<string, string> = {};
  try {
    config = integration.config ? JSON.parse(integration.config) : {};
  } catch {
    result.errors.push("Invalid config JSON");
    return result;
  }

  const { form_id: formId, page_access_token: accessToken, lead_source: leadSource, assigned_to: assignedTo } = config;

  if (!formId) {
    result.errors.push("No form_id configured");
    return result;
  }
  if (!accessToken) {
    result.errors.push("No page_access_token configured");
    return result;
  }

  const db = await getDb();
  if (!db) {
    result.errors.push("DB not available");
    return result;
  }

  // Use lastSyncAt as the since filter (subtract 60s buffer to avoid missing edge cases)
  const sinceTs = integration.lastSyncAt ? Math.floor(integration.lastSyncAt / 1000) - 60 : undefined;

  let afterCursor: string | undefined;
  const now = Date.now();

  try {
    do {
      const response = await fetchMetaLeadsPage(formId, accessToken, afterCursor, sinceTs);

      if (response.error) {
        result.errors.push(`Meta API error: ${response.error.message} (code ${response.error.code})`);
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

        // Build notes: combine user notes + extra unmapped fields
        const noteParts: string[] = [];
        if (mapped.notes) noteParts.push(mapped.notes);
        if (mapped._extra) noteParts.push(`--- Additional Fields ---\n${mapped._extra}`);
        if (metaLead.ad_id) noteParts.push(`Meta Ad ID: ${metaLead.ad_id}`);
        noteParts.push(`Meta Lead ID: ${metaLead.id}`);

        const createdAtMs = new Date(metaLead.created_time).getTime() || now;

        await db.insert(leads).values({
          fullName: mapped.fullName || "Unknown",
          email: email || null,
          phone: phone || null,
          whatsapp: mapped.whatsapp || phone || null,
          nationality: mapped.nationality || null,
          city: mapped.city || null,
          interestedProgram: mapped.interestedProgram || null,
          budgetRange: mapped.budgetRange || null,
          leadSource: leadSource || "Meta Ads",
          stage: "new",
          assignedTo: assignedTo ? parseInt(assignedTo) || null : null,
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

    // Update lastSyncAt and lastSyncCount
    await db
      .update(leadIntegrations)
      .set({ lastSyncAt: now, lastSyncCount: result.newLeads, updatedAt: now })
      .where(eq(leadIntegrations.id, integration.id));
  } catch (err: unknown) {
    result.errors.push(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/** Sync a single integration by ID — called by "Sync Now" button */
export async function syncOneIntegrationById(id: number): Promise<SyncResult> {
  const db = await getDb();
  if (!db) return { integrationId: id, integrationName: "Unknown", newLeads: 0, skippedDuplicates: 0, errors: ["DB not available"] };
  const [integration] = await db.select().from(leadIntegrations).where(eq(leadIntegrations.id, id)).limit(1);
  if (!integration) return { integrationId: id, integrationName: "Unknown", newLeads: 0, skippedDuplicates: 0, errors: ["Integration not found"] };
  return syncOneIntegration(integration);
}

/** Sync ALL active Meta integrations — called by the 4-hour heartbeat and "Sync Now" button */
export async function syncAllMetaIntegrations(): Promise<SyncResult[]> {
  const db = await getDb();
  if (!db) return [];

  const activeIntegrations = await db
    .select()
    .from(leadIntegrations)
    .where(and(eq(leadIntegrations.type, "meta"), eq(leadIntegrations.isActive, true)));

  const results: SyncResult[] = [];
  for (const integration of activeIntegrations) {
    const result = await syncOneIntegration(integration);
    results.push(result);
  }

  return results;
}
