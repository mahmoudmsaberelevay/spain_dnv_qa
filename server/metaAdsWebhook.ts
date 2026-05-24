/**
 * Meta Ads Lead Gen Webhook Handler
 * Handles Facebook/Instagram Lead Ads form submissions and creates leads automatically.
 *
 * When Meta fires a real-time webhook event, we immediately fetch the full lead
 * data (name, phone, country, program, Q&A) from the Meta Graph API using the
 * leadgen_id — so leads are always created with complete information.
 *
 * Setup:
 *  1. In Meta Business Suite → Leads Center → Webhooks, set:
 *     - Callback URL: https://your-domain.com/api/webhook/meta-leads
 *     - Verify Token: value of META_WEBHOOK_VERIFY_TOKEN env var
 *     - Subscribe to: leadgen
 *  2. Add META_WEBHOOK_VERIFY_TOKEN to project secrets.
 */

import type { Request, Response } from "express";
import { getDb } from "./db";
import { leadIntegrations, leads, leadActivities } from "../drizzle/schema";
import { eq, or } from "drizzle-orm";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "elevay_meta_leads_2026";
const META_GRAPH_BASE = "https://graph.facebook.com/v19.0";

// ─── Webhook Verification (GET) ───────────────────────────────────────────────
export function verifyMetaWebhook(req: Request, res: Response) {
  const mode = req.query["hub.mode"] as string;
  const token = req.query["hub.verify_token"] as string;
  const challenge = req.query["hub.challenge"] as string;

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[MetaWebhook] Verification successful");
    return res.status(200).send(challenge);
  }
  console.warn("[MetaWebhook] Verification failed — token mismatch");
  return res.status(403).send("Forbidden");
}

// ─── Webhook Event Processing (POST) ─────────────────────────────────────────
export async function processMetaLeadEvent(req: Request, res: Response) {
  // Respond immediately so Meta doesn't retry (must be within 5 seconds)
  res.status(200).send("EVENT_RECEIVED");

  try {
    const body = req.body as MetaWebhookPayload;
    if (!body?.entry) return;

    // Load the Meta integration to get the page access token
    const db = await getDb();
    if (!db) return;

    const integrations = await db
      .select()
      .from(leadIntegrations)
      .where(eq(leadIntegrations.type, "meta"));

    if (!integrations.length) {
      console.warn("[MetaWebhook] No Meta integration configured — cannot enrich lead");
      return;
    }

    // Use the first active Meta integration's access token
    const integration = integrations.find((i) => i.isActive) ?? integrations[0];
    let config: Record<string, string> = {};
    try {
      config = integration.config ? JSON.parse(integration.config) : {};
    } catch {
      console.error("[MetaWebhook] Invalid integration config JSON");
      return;
    }
    const accessToken = config.page_access_token;
    const leadSource = config.lead_source || "Meta Ads";
    const assignedTo = config.assigned_to || null;

    if (!accessToken) {
      console.error("[MetaWebhook] No page_access_token in integration config");
      return;
    }

    for (const entry of body.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "leadgen") continue;

        const leadgenId = change.value?.leadgen_id;
        const formId = change.value?.form_id;
        const adId = change.value?.ad_id;
        const adsetId = change.value?.adset_id;
        const campaignId = change.value?.campaign_id;

        if (!leadgenId) continue;

        console.log(`[MetaWebhook] New lead event: leadgen_id=${leadgenId} form_id=${formId}`);

        try {
          // Fetch full lead data from Meta Graph API using the leadgen_id
          const fields = "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data";
          const url = `${META_GRAPH_BASE}/${leadgenId}?access_token=${accessToken}&fields=${fields}`;
          const metaRes = await fetch(url);
          const metaLead = (await metaRes.json()) as MetaLeadDetail;

          if (metaLead.error) {
            console.error(`[MetaWebhook] Meta API error for leadgen_id=${leadgenId}: ${metaLead.error.message}`);
            continue;
          }

          // Map field_data to ELEVAY lead fields
          const mapped = mapMetaFieldsToLead(metaLead.field_data ?? []);
          const phone = mapped.phone || mapped.whatsapp || undefined;
          const email = mapped.email || undefined;

          // Deduplication: skip if lead already exists by phone or email
          if (phone || email) {
            const conditions: any[] = [];
            if (phone) conditions.push(eq(leads.phone, phone));
            if (email) conditions.push(eq(leads.email, email));
            const [existing] = await db
              .select({ id: leads.id })
              .from(leads)
              .where(or(...conditions))
              .limit(1);
            if (existing) {
              console.log(`[MetaWebhook] Duplicate lead skipped: phone=${phone} email=${email}`);
              continue;
            }
          }

          // Resolve ad/campaign names — prefer names from the full lead fetch, fall back to IDs from webhook
          const campaignName = metaLead.campaign_name || campaignId || null;
          const adsetName = metaLead.adset_name || adsetId || null;
          const adName = metaLead.ad_name || adId || null;

          // Parse created_time to a readable format in Cairo timezone
          const createdAtMs = metaLead.created_time
            ? new Date(metaLead.created_time).getTime()
            : Date.now();
          const createdReadable = new Date(createdAtMs).toLocaleString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Africa/Cairo",
          });

          // Resolve form name from the form_id if available
          const resolvedFormId = metaLead.form_id || formId || null;
          const resolvedFormName = resolvedFormId ? await getFormName(accessToken, resolvedFormId) : "Meta Lead Form";

          // Build notes
          const noteParts: string[] = [
            `📅 Submitted: ${createdReadable} (Cairo)`,
            `📋 Form: ${resolvedFormName}`,
          ];
          if (campaignName) noteParts.push(`📢 Campaign: ${campaignName}`);
          if (adsetName) noteParts.push(`🎯 Ad Set: ${adsetName}`);
          if (adName) noteParts.push(`🖼️ Ad: ${adName}`);
          noteParts.push(`🔗 Meta Lead ID: ${leadgenId}`);

          // Insert the lead
          const [insertResult] = await db.insert(leads).values({
            fullName: mapped.fullName || "Unknown",
            email: email || null,
            phone: phone || null,
            whatsapp: mapped.whatsapp || phone || null,
            nationality: mapped.nationality || null,
            interestedProgram: mapped.interestedProgram || null,
            budgetRange: mapped.budgetRange || null,
            leadSource: leadSource,
            metaFormId: resolvedFormId,
            metaFormName: resolvedFormName,
            metaCampaign: campaignName,
            metaAdset: adsetName,
            metaAd: adName,
            stage: "fresh",
            assignedTo: assignedTo,
            notes: noteParts.join("\n"),
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
            const fieldData = metaLead.field_data ?? [];
            const activityLines: string[] = [
              `📋 Form Submission — ${resolvedFormName}`,
              `📅 Submitted: ${createdReadable} (Cairo)`,
            ];
            if (campaignName) activityLines.push(`📢 Campaign: ${campaignName}`);
            if (adsetName) activityLines.push(`🎯 Ad Set: ${adsetName}`);
            if (adName) activityLines.push(`🖼️ Ad: ${adName}`);
            activityLines.push("");
            activityLines.push("── Form Answers ──");

            fieldData.forEach((f, idx) => {
              const question = f.name.replace(/_/g, " ").trim();
              const answer = (f.values?.[0] ?? "").replace(/_/g, " ").trim();
              activityLines.push(`Question ${idx + 1}: ${question}`);
              activityLines.push(`Answer ${idx + 1}: ${answer}`);
              activityLines.push("");
            });

            try {
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

          console.log(`[MetaWebhook] Lead created: "${mapped.fullName || "Unknown"}" (ID: ${newLeadId}) from form "${resolvedFormName}"`);
        } catch (err) {
          console.error(`[MetaWebhook] Failed to process leadgen_id=${leadgenId}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[MetaWebhook] Processing error:", err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch the form name from Meta API by form ID */
async function getFormName(accessToken: string, formId: string): Promise<string> {
  try {
    const url = `${META_GRAPH_BASE}/${formId}?access_token=${accessToken}&fields=name`;
    const res = await fetch(url);
    const json = (await res.json()) as { name?: string; error?: { message: string } };
    return json.name || "Meta Lead Form";
  } catch {
    return "Meta Lead Form";
  }
}

/** Map Meta field_data array to ELEVAY lead fields */
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
        break;
    }
  }
  if (!map.fullName && (map.firstName || map.lastName)) {
    map.fullName = [map.firstName, map.lastName].filter(Boolean).join(" ");
  }
  return map;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface MetaFieldData {
  name: string;
  values: string[];
}

interface MetaLeadDetail {
  id: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  field_data: MetaFieldData[];
  error?: { message: string; type: string; code: number };
}

interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    changes: Array<{
      field: string;
      value: {
        leadgen_id?: string;
        form_id?: string;
        page_id?: string;
        ad_id?: string;
        adset_id?: string;
        campaign_id?: string;
        created_time?: number;
      };
    }>;
  }>;
}
