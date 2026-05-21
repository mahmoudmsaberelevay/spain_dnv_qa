/**
 * Meta Ads Lead Gen Webhook Handler
 * Handles Facebook/Instagram Lead Ads form submissions and creates leads automatically.
 * 
 * Setup:
 *  1. In Meta Business Suite → Leads Center → Webhooks, set:
 *     - Callback URL: https://your-domain.com/api/webhook/meta-leads
 *     - Verify Token: value of META_WEBHOOK_VERIFY_TOKEN env var
 *     - Subscribe to: leadgen
 *  2. Add META_WEBHOOK_VERIFY_TOKEN to project secrets.
 */

import type { Request, Response } from "express";
import { createLead } from "./leadsDb";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "elevay_meta_leads_2026";

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
  // Respond immediately so Meta doesn't retry
  res.status(200).send("EVENT_RECEIVED");

  try {
    const body = req.body as MetaWebhookPayload;
    if (!body?.entry) return;

    for (const entry of body.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "leadgen") continue;
        const leadgenId = change.value?.leadgen_id;
        const formId = change.value?.form_id;
        const pageId = change.value?.page_id;
        const adId = change.value?.ad_id;
        const adsetId = change.value?.adset_id;
        const campaignId = change.value?.campaign_id;

        console.log(`[MetaWebhook] New lead: leadgen_id=${leadgenId} form_id=${formId} ad_id=${adId}`);

        // Build a lead record from the webhook data
        // Note: The full field data requires a separate Graph API call with the leadgen_id.
        // Here we create a placeholder lead that can be enriched later.
        const leadData = {
          fullName: `Meta Lead ${leadgenId ?? "Unknown"}`,
          phone: "",
          whatsapp: "",
          email: "",
          nationality: "",
          interestedProgram: "",
          leadSource: "Meta Ads",
          assignedTo: "",
          stage: "fresh" as const,
          priority: "medium" as const,
          notes: [
            `Auto-created from Meta Lead Ad`,
            `Leadgen ID: ${leadgenId ?? "N/A"}`,
            formId ? `Form ID: ${formId}` : null,
            adId ? `Ad ID: ${adId}` : null,
            adsetId ? `Ad Set ID: ${adsetId}` : null,
            campaignId ? `Campaign ID: ${campaignId}` : null,
            pageId ? `Page ID: ${pageId}` : null,
          ].filter(Boolean).join("\n"),
          budgetRange: "",
          metaCampaign: campaignId ?? null,
          metaAdset: adsetId ?? null,
          metaAd: adId ?? null,
        };

        await createLead(leadData);
        console.log(`[MetaWebhook] Lead created for leadgen_id=${leadgenId}`);
      }
    }
  } catch (err) {
    console.error("[MetaWebhook] Processing error:", err);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
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
