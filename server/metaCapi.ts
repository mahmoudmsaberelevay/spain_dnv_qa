import crypto from "crypto";
import { ENV } from "./_core/env";

const PIXEL_ID = ENV.metaPixelId;
const ACCESS_TOKEN = ENV.metaCapiToken;
const API_VERSION = "v19.0";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export interface CapiEventData {
  eventName: string;
  eventTime?: number;
  leadId?: string | number;
  phone?: string;
  email?: string;
  name?: string;
  currency?: string;
  value?: number;
  customData?: Record<string, string | number>;
}

export async function sendCapiEvent(data: CapiEventData): Promise<void> {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn("[CAPI] META_PIXEL_ID or META_CAPI_TOKEN not set — skipping event");
    return;
  }

  const userData: Record<string, string> = {};
  if (data.phone) userData.ph = sha256(data.phone.replace(/\D/g, ""));
  if (data.email) userData.em = sha256(data.email);
  if (data.name) {
    const parts = data.name.trim().split(" ");
    userData.fn = sha256(parts[0] ?? "");
    if (parts.length > 1) userData.ln = sha256(parts.slice(1).join(" "));
  }
  if (data.leadId) {
    userData.external_id = sha256(String(data.leadId));
  }

  const event: Record<string, unknown> = {
    event_name: data.eventName,
    event_time: data.eventTime ?? Math.floor(Date.now() / 1000),
    action_source: "crm",
    user_data: userData,
  };

  if (data.customData || data.value !== undefined || data.currency) {
    const cd: Record<string, string | number> = { ...(data.customData ?? {}) };
    if (data.value !== undefined) cd.value = data.value;
    if (data.currency) cd.currency = data.currency;
    event.custom_data = cd;
  }

  const body = JSON.stringify({ data: [event] });
  const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const json = await res.json() as { events_received?: number; error?: { message: string } };
    if (json.error) {
      console.error("[CAPI] Error from Meta:", json.error.message);
    } else {
      console.log(`[CAPI] Sent ${data.eventName} — events_received: ${json.events_received}`);
    }
  } catch (err) {
    console.error("[CAPI] Failed to send event:", err);
  }
}

/** Map a lead stage to the best matching Meta standard event name */
export function stageToCapiEvent(stage: string): string {
  switch (stage) {
    case "contacted": return "Contact";
    case "qualified": return "CompleteRegistration";
    case "prospect": return "InitiateCheckout";
    case "client": return "Purchase";
    default: return `Lead_${stage}`;
  }
}
