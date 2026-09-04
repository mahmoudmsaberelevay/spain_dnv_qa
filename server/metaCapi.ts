/**
 * Meta Conversions API (CAPI) Service
 * Sends lead lifecycle events from ELEVAY CRM back to Meta Pixel
 * to help Meta optimize ad delivery and find higher-quality leads.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 * Parameter Builder SDK: https://github.com/facebook/capi-param-builder
 */
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
 * Retained only as a compatibility export for older modules.
 * Direct sending is permanently disabled; all CRM and Test Events must use the
 * durable outbox in metaLeadsService.ts for ordering, retries, and audit history.
 */
export async function sendCapiEvent(_payload: CapiEventPayload): Promise<{ disabled: true }> {
  console.warn("[MetaCAPI] Legacy direct sender is disabled; use the CRM event outbox.");
  return { disabled: true };
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
