import { ELEVAY_CLIP_SECONDS, HIGGSFIELD_API_BASE, HIGGSFIELD_CANDIDATE_MODEL } from "./higgsfieldClipPreflight";

// This module deliberately has no fetch or generation function. Durable budget
// reservation, keyframe provenance, job ownership and release gates must exist
// before any caller is allowed to POST to the returned endpoint.
export type HiggsfieldClipIntent = {
  keyframeUrl: string;
  motionPrompt: string;
  idempotencyKey: string;
};

const modelEndpoint = `${HIGGSFIELD_API_BASE}/${HIGGSFIELD_CANDIDATE_MODEL}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publicHttpsUrl(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a public HTTPS URL.`);
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error(`${label} must be a public HTTPS URL.`); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.searchParams.has("key")) {
    throw new Error(`${label} must be a credential-free HTTPS URL.`);
  }
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[")) {
    throw new Error(`${label} must not point to a local or IP-address host.`);
  }
  return url.href;
}

/** Exact documented Kling v2.5 request body, not a media-generation call. */
export function buildHiggsfieldClipRequest(intent: HiggsfieldClipIntent) {
  const keyframeUrl = publicHttpsUrl(intent.keyframeUrl, "OpenAI keyframe");
  const prompt = intent.motionPrompt.trim();
  if (prompt.length < 8 || prompt.length > 2_500) throw new Error("The Higgsfield motion prompt must be 8–2,500 characters.");
  if (!/^[\x21-\x7e]{1,255}$/.test(intent.idempotencyKey)) throw new Error("Persist one unique visible-ASCII idempotency key per clip before submission.");
  return {
    url: modelEndpoint,
    method: "POST" as const,
    idempotencyKey: intent.idempotencyKey,
    body: {
      prompt,
      image_url: keyframeUrl,
      duration: ELEVAY_CLIP_SECONDS,
      negative_prompt: "speech, dialogue, text, captions, logos, contact details, malformed anatomy or wardrobe",
    },
  };
}

export type HiggsfieldAcceptedClip = {
  requestId: string;
  statusUrl: string;
  cancelUrl: string;
};

function matchingRequestUrl(raw: unknown, requestId: string, suffix: "status" | "cancel") {
  const url = new URL(publicHttpsUrl(raw, `Higgsfield ${suffix} URL`));
  if (url.origin !== HIGGSFIELD_API_BASE || url.pathname !== `/requests/${requestId}/${suffix}` || url.search) {
    throw new Error(`Higgsfield returned an unexpected ${suffix} URL.`);
  }
  return url.href;
}

/** Only persist provider task identifiers returned from this validated receipt. */
export function parseHiggsfieldAcceptedClip(payload: unknown): HiggsfieldAcceptedClip {
  if (!payload || typeof payload !== "object") throw new Error("Higgsfield returned an invalid acceptance receipt.");
  const row = payload as Record<string, unknown>;
  if (row.status !== "queued" || typeof row.request_id !== "string" || !uuid.test(row.request_id)) {
    throw new Error("Higgsfield did not return a queued request UUID.");
  }
  return {
    requestId: row.request_id,
    statusUrl: matchingRequestUrl(row.status_url, row.request_id, "status"),
    cancelUrl: matchingRequestUrl(row.cancel_url, row.request_id, "cancel"),
  };
}

export function parseHiggsfieldClipStatus(payload: unknown, expectedRequestId: string) {
  if (!uuid.test(expectedRequestId) || !payload || typeof payload !== "object") throw new Error("Invalid Higgsfield status response.");
  const row = payload as Record<string, unknown>;
  if (row.request_id !== expectedRequestId || !["queued", "in_progress", "completed", "failed", "nsfw", "canceled"].includes(String(row.status))) {
    throw new Error("Higgsfield status does not match the owned request.");
  }
  if (row.status === "completed") {
    const video = row.video;
    const url = video && typeof video === "object" ? (video as Record<string, unknown>).url : undefined;
    return { requestId: expectedRequestId, state: "completed" as const, videoUrl: publicHttpsUrl(url, "Completed clip") };
  }
  return { requestId: expectedRequestId, state: row.status as "queued" | "in_progress" | "failed" | "nsfw" | "canceled", videoUrl: null };
}
