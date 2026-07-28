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
import { leadIntegrations, leads, leadActivities, leadNotes } from "../drizzle/schema";
import { eq, and, or } from "drizzle-orm";
import { sendCapiEvent } from "./metaCapi";

const META_GRAPH_BASE = "https://graph.facebook.com/v19.0";

interface MetaFieldData {
  name: string;
  values: string[];
}

interface MetaLead {
  id: string;
  created_time: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
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
    fields: "created_time,id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data",
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

/** Find existing lead by phone (primary) or email (fallback). Returns the lead row or null. */
async function findExistingLead(
  db: Awaited<ReturnType<typeof getDb>>,
  phone?: string,
  email?: string
): Promise<{ id: number; fullName: string; stage: string } | null> {
  if (!db) return null;
  // Phone-only check first (more reliable for deduplication)
  if (phone) {
    const [existing] = await db
      .select({ id: leads.id, fullName: leads.fullName, stage: leads.stage })
      .from(leads)
      .where(eq(leads.phone, phone))
      .limit(1);
    if (existing) return existing as { id: number; fullName: string; stage: string };
  }
  // Fallback to email check
  if (email) {
    const [existing] = await db
      .select({ id: leads.id, fullName: leads.fullName, stage: leads.stage })
      .from(leads)
      .where(eq(leads.email, email))
      .limit(1);
    if (existing) return existing as { id: number; fullName: string; stage: string };
  }
  return null;
}

export interface SyncResult {
  integrationId: number;
  integrationName: string;
  newLeads: number;
  skippedDuplicates: number;
  formsDiscovered: number;
  errors: string[];
  assignedTo?: string | null;
  formResults?: Array<{ formName: string; newLeads: number; errors: string[]; leadDetails: Array<{ name: string; phone?: string; program?: string }> }>;
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
    formResults: [],
  };

  let config: Record<string, string> = {};
  try {
    config = integration.config ? JSON.parse(integration.config) : {};
  } catch {
    result.errors.push("Invalid config JSON");
    return result;
  }

  const { page_access_token: accessToken, lead_source: leadSource, assigned_to: assignedTo } = config;
  result.assignedTo = assignedTo || null;
  const perFormSources: Record<string, string> = (config.form_sources && typeof config.form_sources === "object") ? config.form_sources as Record<string, string> : {};

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
    let formNewLeads = 0;
    const formErrors: string[] = [];
    const formLeadDetails: Array<{ name: string; phone?: string; program?: string }> = [];

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

          // Deduplication check — if phone matches an existing lead, add a note and change stage to 'resubmit'
          const existingLead = await findExistingLead(db, phone, email);
          if (existingLead) {
            result.skippedDuplicates++;
            // Add a resubmit note to the existing lead
            try {
              const resubmitNote = [
                `🔄 This lead resubmitted again via Meta Ads`,
                `📋 Form: ${form.name}`,
                metaLead.campaign_name ? `📢 Campaign: ${metaLead.campaign_name}` : null,
                metaLead.ad_name ? `🖼️ Ad: ${metaLead.ad_name}` : null,
                `📅 Resubmitted: ${new Date(metaLead.created_time).toLocaleString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Cairo" })} (Cairo)`,
                `🔗 Meta Lead ID: ${metaLead.id}`,
              ].filter(Boolean).join("\n");
              const noteTs = Date.now();
              await db.insert(leadNotes).values({
                leadId: existingLead.id,
                userId: 0, // system
                userName: "System (Meta Sync)",
                note: resubmitNote,
                isPinned: false,
                isImportant: true,
                createdAt: noteTs,
                updatedAt: noteTs,
              });
              // Change stage to 'resubmit'
              await db.update(leads)
                .set({ stage: "resubmit", updatedAt: Date.now() })
                .where(eq(leads.id, existingLead.id));
              // Log activity
              await db.insert(leadActivities).values({
                leadId: existingLead.id,
                userId: null,
                activityType: "stage_changed",
                description: `Stage changed to Resubmit — lead resubmitted via Meta Ads (Form: ${form.name})`,
                score: 0,
                createdAt: Date.now(),
              });
            } catch {
              // Note/stage update failure should not block sync
            }
            continue;
          }

          // Parse created_time to a readable format: "24 May 2026 — 09:43"
          const createdAtMs = new Date(metaLead.created_time).getTime() || now;
          const createdDate = new Date(createdAtMs);
          const createdReadable = createdDate.toLocaleString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Africa/Cairo",
          });

          // Build notes: meta source info
          const noteParts: string[] = [];
          noteParts.push(`📅 Submitted: ${createdReadable} (Cairo)`);
          noteParts.push(`📋 Form: ${form.name}`);
          if (metaLead.campaign_name) noteParts.push(`📢 Campaign: ${metaLead.campaign_name}`);
          if (metaLead.adset_name) noteParts.push(`🎯 Ad Set: ${metaLead.adset_name}`);
          if (metaLead.ad_name) noteParts.push(`🖼️ Ad: ${metaLead.ad_name}`);
          noteParts.push(`🔗 Meta Lead ID: ${metaLead.id}`);

          // Insert the lead and capture the new ID
          const [insertResult] = await db.insert(leads).values({
            fullName: mapped.fullName || "Unknown",
            email: email || null,
            phone: phone || null,
            whatsapp: mapped.whatsapp || phone || null,
            // Country field → nationality
            nationality: mapped.nationality || null,
            // Program field → interestedProgram
            interestedProgram: mapped.interestedProgram || null,
            budgetRange: mapped.budgetRange || null,
            leadSource: perFormSources[form.id] || leadSource || "Meta Ads",
            metaFormId: form.id,
            metaFormName: form.name,
            metaCampaign: metaLead.campaign_name || metaLead.campaign_id || null,
            metaAdset: metaLead.adset_name || metaLead.adset_id || null,
            metaAd: metaLead.ad_name || metaLead.ad_id || null,
            stage: "fresh",
            assignedTo: assignedTo || null,
            notes: noteParts.join("\n") || null,
            leadScore: 0,
            createdAt: createdAtMs,
            updatedAt: createdAtMs,
            // Meta lead form submission implies GDPR consent and data sharing consent
            gdprConsent: true,
            dataSharingConsent: true,
            marketingOptIn: true,
            dataRegion: "EG",
          });

          const newLeadId = (insertResult as any).insertId as number;

          // Log a "Form Submission" activity with numbered Q&A pairs
          if (newLeadId) {
            try {
              const fieldData = metaLead.field_data ?? [];
              const activityLines: string[] = [
                `📋 Form Submission — ${form.name}`,
                `📅 Submitted: ${createdReadable} (Cairo)`,
              ];
              if (metaLead.campaign_name) activityLines.push(`📢 Campaign: ${metaLead.campaign_name}`);
              if (metaLead.adset_name) activityLines.push(`🎯 Ad Set: ${metaLead.adset_name}`);
              if (metaLead.ad_name) activityLines.push(`🖼️ Ad: ${metaLead.ad_name}`);
              activityLines.push("");
              activityLines.push("── Form Answers ──");

              fieldData.forEach((f, idx) => {
                // Clean up the question label: replace underscores with spaces, trim
                const question = f.name.replace(/_/g, " ").trim();
                // Clean up the answer: replace underscores with spaces
                const answer = (f.values?.[0] ?? "").replace(/_/g, " ").trim();
                activityLines.push(`Question ${idx + 1}: ${question}`);
                activityLines.push(`Answer ${idx + 1}: ${answer}`);
                activityLines.push("");
              });

              await db.insert(leadActivities).values({
                leadId: newLeadId,
                userId: null,
                activityType: "created",
                description: activityLines.join("\n"),
                score: 0,
                createdAt: createdAtMs,
              });
            } catch {
              // Activity logging failure should not block the lead import
            }
          }

          // Fire CAPI Lead event for the newly synced lead (non-blocking)
          // Meta Lead Ads don't have browser-side fbc/fbp available, but we send
          // all available PII fields to maximize event match quality.
          if (newLeadId) {
            const _syncNameParts = (mapped.fullName || "").trim().split(/\s+/);
            sendCapiEvent({
              eventName: "Lead",
              leadId: newLeadId,
              email: email,
              phone: phone,
              firstName: mapped.firstName || _syncNameParts[0] || undefined,
              lastName: mapped.lastName || (_syncNameParts.length > 1 ? _syncNameParts.slice(1).join(" ") : undefined),
              country: mapped.nationality || undefined,
              city: mapped.city || undefined,
              // Meta Lead Ads forms don't expose fbc/fbp — these come from browser cookies
              // which are not available server-side for form submissions
            }).catch(() => {});
          }

          result.newLeads++;
          formNewLeads++;
          // Capture lead details for the alert email
          formLeadDetails.push({ name: mapped.fullName || "Unknown", phone: phone, program: mapped.interestedProgram });
        }

        // Pagination
        afterCursor = response.paging?.cursors?.after;
        const hasNextPage = !!response.paging?.next;
        if (!hasNextPage) break;
      } while (afterCursor);
    } catch (err) {
      const errMsg = `Form "${form.name}": ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(errMsg);
      formErrors.push(errMsg);
    }

    // Record per-form breakdown for daily summary
    result.formResults!.push({ formName: form.name, newLeads: formNewLeads, errors: formErrors, leadDetails: formLeadDetails });
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
