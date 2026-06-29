/**
 * Meta Conversions API (CAPI) Service
 * Sends lead lifecycle events from ELEVAY CRM back to Meta Pixel
 * to help Meta optimize ad delivery and find higher-quality leads.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 * Parameter Builder SDK: https://github.com/facebook/capi-param-builder
 */
import { ENV } from "./_core/env";
import crypto from "crypto";

const CAPI_URL = "https://graph.facebook.com/v19.0";

/** Hash a value with SHA-256 (required by Meta for PII fields) */
function hash(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/** Normalize a phone number to E.164-ish digits only */
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export interface CapiEventPayload {
  eventName:
    | "Lead"           // new lead created
    | "CompleteRegistration"  // lead qualified / moved to hot stage
    | "Contact"        // lead contacted (stage: contacted)
    | "CustomEvent";   // any other stage change
  customEventName?: string;  // used when eventName = "CustomEvent"
  eventTime?: number;        // unix timestamp in seconds (defaults to now)
  leadId?: number;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  country?: string;          // nationality / country of origin
  city?: string;             // city of residence
  state?: string;            // state / region
  zip?: string;              // postal code
  externalId?: string;       // your internal lead ID as string
  sourceUrl?: string;
  testEventCode?: string;    // set during testing to see events in Test Events tab
  // Browser-side parameters from Meta capi-param-builder SDK
  fbc?: string;              // _fbc cookie — Meta click ID (format: fb.1.timestamp.fbclid)
  fbp?: string;              // _fbp cookie — Meta browser ID
  clientIpAddress?: string;  // client IP address (IPv4 or IPv6, NOT hashed)
  clientUserAgent?: string;  // browser user agent string (NOT hashed)
  referrerUrl?: string;      // HTTP Referer of the page that triggered the event
}

/**
 * Build CAPI params from an Express request using the Meta param builder SDK.
 * Returns fbc, fbp, clientIpAddress, clientUserAgent, sourceUrl, referrerUrl.
 * Call this inside a tRPC procedure where ctx.req is available.
 */
export function extractCapiParamsFromRequest(req: any): Pick<
  CapiEventPayload,
  "fbc" | "fbp" | "clientIpAddress" | "clientUserAgent" | "sourceUrl" | "referrerUrl"
> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ParamBuilder } = require("capi-param-builder-nodejs");
    const builder = new ParamBuilder(["elevay.vip", "localhost"]);
    builder.processRequestFromContext(req);

    return {
      fbc: builder.getFbc() || undefined,
      fbp: builder.getFbp() || undefined,
      clientIpAddress: builder.getClientIpAddress() || undefined,
      clientUserAgent: (req.headers?.["user-agent"] as string) || undefined,
      sourceUrl: builder.getEventSourceUrl() || undefined,
      referrerUrl: builder.getReferrerUrl() || undefined,
    };
  } catch (err) {
    // Param builder failure must never break the CRM
    console.warn("[MetaCAPI] extractCapiParamsFromRequest failed:", err);
    // Fallback: extract what we can manually
    const ip =
      (req.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      undefined;
    return {
      clientIpAddress: ip,
      clientUserAgent: (req.headers?.["user-agent"] as string) || undefined,
      sourceUrl: req.headers?.["referer"] as string | undefined,
      referrerUrl: req.headers?.["referer"] as string | undefined,
    };
  }
}

/**
 * Send a single event to Meta Conversions API.
 * Silently logs errors — never throws — so a CAPI failure never breaks the CRM.
 */
export async function sendCapiEvent(payload: CapiEventPayload): Promise<void> {
  const pixelId = ENV.metaPixelId;
  const token = ENV.metaCapiToken;

  if (!pixelId || !token) {
    console.warn("[MetaCAPI] Skipping — META_PIXEL_ID or META_CAPI_TOKEN not set.");
    return;
  }

  const eventTime = payload.eventTime ?? Math.floor(Date.now() / 1000);

  // Build user_data object — hash all PII fields
  const userData: Record<string, string | string[]> = {};
  if (payload.email) userData.em = hash(payload.email);
  if (payload.phone) userData.ph = hash(normalizePhone(payload.phone));
  if (payload.firstName) userData.fn = hash(payload.firstName);
  if (payload.lastName) userData.ln = hash(payload.lastName);
  if (payload.country) userData.country = hash(payload.country.toLowerCase());
  if (payload.city) userData.ct = hash(payload.city.trim().toLowerCase());
  if (payload.state) userData.st = hash(payload.state.trim().toLowerCase());
  if (payload.zip) userData.zp = hash(payload.zip.trim().toLowerCase());
  if (payload.externalId || payload.leadId) {
    userData.external_id = hash(String(payload.externalId ?? payload.leadId));
  }

  // Browser-side parameters from Meta param builder SDK (NOT hashed per Meta spec)
  if (payload.fbc) userData.fbc = payload.fbc;
  if (payload.fbp) userData.fbp = payload.fbp;
  if (payload.clientIpAddress) userData.client_ip_address = payload.clientIpAddress;
  if (payload.clientUserAgent) userData.client_user_agent = payload.clientUserAgent;

  const event: Record<string, unknown> = {
    event_name: payload.eventName,
    event_time: eventTime,
    action_source: "website",  // upgraded from "crm" since we now have browser context
    user_data: userData,
  };

  if (payload.eventName === "CustomEvent" && payload.customEventName) {
    event.custom_data = { custom_event_type: payload.customEventName };
  }

  if (payload.sourceUrl) {
    event.event_source_url = payload.sourceUrl;
  }
  if (payload.referrerUrl) {
    event.referrer_url = payload.referrerUrl;
  }

  const body: Record<string, unknown> = {
    data: [event],
  };

  // Auto-inject test event code from ENV when not in production (or when explicitly passed)
  const testCode = payload.testEventCode || (!ENV.isProduction ? ENV.metaCapiTestCode : "");
  if (testCode) {
    body.test_event_code = testCode;
  }

  try {
    const response = await fetch(`${CAPI_URL}/${pixelId}/events?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = await response.json() as any;

    if (!response.ok) {
      console.error("[MetaCAPI] Error response:", JSON.stringify(result));
    } else {
      console.log(`[MetaCAPI] Sent ${payload.eventName} for lead ${payload.leadId ?? "unknown"} — events_received: ${result.events_received}`);
    }
  } catch (err) {
    console.error("[MetaCAPI] Network error:", err);
  }
}

/**
 * Map a CRM stage name to the appropriate CAPI event name.
 */
export function stageToCapiEvent(stage: string): CapiEventPayload["eventName"] | null {
  const s = stage.toLowerCase();
  if (s === "fresh" || s === "new") return "Lead";
  if (s === "contacted") return "Contact";
  if (s === "qualified" || s === "hot" || s === "interested") return "CompleteRegistration";
  // For other stages (follow_up, not_interested, etc.) send a CustomEvent
  return "CustomEvent";
}
