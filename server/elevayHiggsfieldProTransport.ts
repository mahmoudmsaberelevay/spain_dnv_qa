import { parseHiggsfieldAcceptedClip, parseHiggsfieldClipStatus, type HiggsfieldAcceptedClip } from "./higgsfieldClipRequestContract";

/** The sole paid-generation endpoint permitted by this server-only transport. */
export const ELEVAY_HIGGSFIELD_PRO_IMAGE_TO_VIDEO_ENDPOINT =
  "https://api.higgsfield.ai/kling-video/v3.0/pro/image-to-video"; // owner rule 26 Oct 2026: top-quality cinematic clips

const HIGGSFIELD_API_ORIGIN = "https://api.higgsfield.ai";
const NEGATIVE_PROMPT =
  "speech, dialogue, text, captions, logos, contact details, malformed anatomy or wardrobe";
const sha256Pattern = /^[a-f0-9]{64}$/;
const visibleAscii = /^[\x21-\x7e]{1,255}$/;

export type ElevayPersistedProKeyframe = {
  /** A permanently approved, credential-free URL on an allowlisted ELEVAY CDN origin. */
  trustedCdnUrl: string;
  /** Lowercase SHA-256 of the persisted source image bytes. */
  sha256: string;
  width: 864;
  height: 1536;
};

export type ElevayHiggsfieldProClipSubmission = {
  /** Existing owner-approved production run; the transport never creates this record. */
  ownerReviewedRunId: number;
  /** Existing persisted run step; the transport never creates this record. */
  persistedStepId: number;
  /** An explicit durable-write barrier supplied by the caller. */
  alreadyPersistedBeforeNetwork: true;
  /** Caller-owned, already-persisted, immutable key. Never generated or changed here. */
  idempotencyKey: string;
  prompt: string;
  keyframe: ElevayPersistedProKeyframe;
};

export type ElevayOwnedHiggsfieldClipRequest = {
  requestId: string;
  statusUrl: string;
};

export type ElevayHiggsfieldProTransportDependencies = {
  /** Inject only in server tests. Production uses the platform fetch implementation. */
  request?: typeof fetch;
  /**
   * Deployment-owned allowlist of exact HTTPS CDN origins that hold approved
   * OpenAI keyframes (for example, ["https://cdn.elevay.example"]). An absent
   * or empty allowlist fails closed rather than trusting caller-provided URLs.
   */
  trustedKeyframeCdnOrigins?: readonly string[];
};

function completeHiggsfieldApiKey(): string {
  const apiKey = process.env.HF_API_KEY;
  // Do not trim, split, redact, or otherwise transform this provider credential.
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new Error("The complete server-side HF_API_KEY is unavailable.");
  }
  return apiKey;
}

function positivePersistedId(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive persisted identifier before Higgsfield submission.`);
  }
  return value;
}

function trustedOrigins(rawOrigins: readonly string[] | undefined): Set<string> {
  if (!rawOrigins?.length) {
    throw new Error("No deployment-owned trusted keyframe CDN origin is configured; Higgsfield submission is refused.");
  }

  const origins = new Set<string>();
  for (const rawOrigin of rawOrigins) {
    if (typeof rawOrigin !== "string") {
      throw new Error("Trusted keyframe CDN configuration is invalid; Higgsfield submission is refused.");
    }
    let origin: URL;
    try {
      origin = new URL(rawOrigin);
    } catch {
      throw new Error("Trusted keyframe CDN configuration is invalid; Higgsfield submission is refused.");
    }
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.origin !== rawOrigin.replace(/\/$/, "")
    ) {
      throw new Error("Trusted keyframe CDN configuration is invalid; Higgsfield submission is refused.");
    }
    origins.add(origin.origin);
  }
  return origins;
}

function trustedKeyframeUrl(rawUrl: unknown, allowedOrigins: Set<string>): string {
  if (typeof rawUrl !== "string") {
    throw new Error("Persisted keyframe must have a trusted credential-free CDN URL.");
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Persisted keyframe must have a trusted credential-free CDN URL.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.startsWith("[") ||
    !allowedOrigins.has(url.origin)
  ) {
    throw new Error("Persisted keyframe must have a trusted credential-free CDN URL.");
  }
  return url.href;
}

function assertSubmission(input: ElevayHiggsfieldProClipSubmission, dependencies: ElevayHiggsfieldProTransportDependencies) {
  if (!input || typeof input !== "object") {
    throw new Error("A persisted owner-reviewed Higgsfield clip submission is required.");
  }
  positivePersistedId(input.ownerReviewedRunId, "ownerReviewedRunId");
  positivePersistedId(input.persistedStepId, "persistedStepId");
  if (input.alreadyPersistedBeforeNetwork !== true) {
    throw new Error("The clip submission must be persisted before network access.");
  }
  if (!visibleAscii.test(input.idempotencyKey)) {
    throw new Error("A persisted externally supplied immutable idempotency key is required.");
  }
  if (typeof input.prompt !== "string" || input.prompt.trim().length < 8 || input.prompt.length > 2_500) {
    throw new Error("A bounded persisted Higgsfield motion prompt is required.");
  }
  const keyframe = input.keyframe;
  if (!keyframe || typeof keyframe !== "object") {
    throw new Error("SHA-256-pinned persisted keyframe metadata is required.");
  }
  if (!sha256Pattern.test(keyframe.sha256)) {
    throw new Error("Persisted keyframe metadata must include a lowercase SHA-256 pin.");
  }
  if (keyframe.width !== 864 || keyframe.height !== 1536) {
    throw new Error("Persisted keyframe must be native 864x1536 portrait.");
  }
  return {
    keyframeUrl: trustedKeyframeUrl(keyframe.trustedCdnUrl, trustedOrigins(dependencies.trustedKeyframeCdnOrigins)),
    prompt: input.prompt,
  };
}

function submissionNotReplayable(reason = ""): Error {
  // This intentionally avoids HTTP bodies, provider URLs, prompts, and credentials. Only a safe reason is added.
  return new Error(`Higgsfield Pro submission was not accepted. Its outcome may be ambiguous; do not replay automatically.${reason ? " Reason: " + reason : ""}`);
}

/** Plain-language reason for a rejected submission, from the HTTP status only (never the body). */
export function higgsfieldRejectionReason(status: number): string {
  if (status === 401 || status === 403) return `HTTP ${status}: Higgsfield rejected the API key or its permissions. No clip was created; fix the key, then press Retry.`;
  if (status === 402) return "HTTP 402: not enough Higgsfield API credits. No clip was created; top up the Higgsfield API (cloud) balance, then press Retry.";
  if (status === 400 || status === 422) return `HTTP ${status}: Higgsfield refused this request (prompt, image or settings). No clip was created; check the keyframe and motion prompt, then press Retry.`;
  if (status === 429) return "HTTP 429: Higgsfield rate limit. No clip was created; wait a few minutes, then press Retry.";
  if (status >= 500) return `HTTP ${status}: Higgsfield server error. The clip may or may not have started; check the Higgsfield dashboard before pressing Retry.`;
  return `HTTP ${status} from Higgsfield.`;
}

/**
 * Submit exactly one already-persisted 5-second 864x1536 keyframe for Higgsfield
 * Pro image-to-video. This primitive neither retries nor assembles, stores,
 * publishes, or exposes provider response bodies.
 */
export async function submitElevayHiggsfieldProClip(
  input: ElevayHiggsfieldProClipSubmission,
  dependencies: ElevayHiggsfieldProTransportDependencies = {},
): Promise<HiggsfieldAcceptedClip> {
  const safe = assertSubmission(input, dependencies);
  const apiKey = completeHiggsfieldApiKey();
  const request = dependencies.request ?? fetch;

  let response: Response;
  try {
    response = await request(ELEVAY_HIGGSFIELD_PRO_IMAGE_TO_VIDEO_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        // Kling 3.0 Pro has no negative_prompt field; the avoid-list travels inside the prompt. Native sound is off:
        // the reel's voice and music are added by the ELEVAY render.
        prompt: `${safe.prompt}\n\nAvoid: ${NEGATIVE_PROMPT}.`.slice(0, 2_500),
        image_url: safe.keyframeUrl,
        duration: 5,
        sound: "off",
        cfg_scale: 0.5,
      }),
      signal: AbortSignal.timeout(300_000),
    });
  } catch (error) {
    const timedOut = (error as any)?.name === "TimeoutError" || (error as any)?.name === "AbortError";
    throw submissionNotReplayable(timedOut ? "no answer from Higgsfield within 5 minutes. The clip may or may not have started; check the Higgsfield dashboard before pressing Retry." : "could not reach Higgsfield (network error). The clip may or may not have started; check the Higgsfield dashboard before pressing Retry.");
  }

  if (!response.ok) throw submissionNotReplayable(higgsfieldRejectionReason(response.status));

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw submissionNotReplayable("Higgsfield accepted the call but its reply was unreadable. Check the Higgsfield dashboard before pressing Retry.");
  }
  try {
    return parseHiggsfieldAcceptedClip(payload);
  } catch {
    throw submissionNotReplayable("Higgsfield replied without a valid request ID. Check the Higgsfield dashboard before pressing Retry.");
  }
}

function exactOwnedStatusUrl(input: ElevayOwnedHiggsfieldClipRequest): string {
  if (!input || typeof input !== "object") {
    throw new Error("An exact owned Higgsfield request ID and status URL are required.");
  }
  if (typeof input.requestId !== "string" || typeof input.statusUrl !== "string") {
    throw new Error("An exact owned Higgsfield request ID and status URL are required.");
  }
  // Use the same UUID/ownership contract used to parse every provider status.
  // This happens before any fetch, so malformed caller receipts cannot poll.
  try {
    parseHiggsfieldClipStatus({ request_id: input.requestId, status: "queued" }, input.requestId);
  } catch {
    throw new Error("An exact owned Higgsfield request ID and status URL are required.");
  }
  let status: URL;
  try {
    status = new URL(input.statusUrl);
  } catch {
    throw new Error("An exact owned Higgsfield request ID and status URL are required.");
  }
  if (
    status.origin !== HIGGSFIELD_API_ORIGIN ||
    status.pathname !== `/requests/${input.requestId}/status` ||
    status.username ||
    status.password ||
    status.search ||
    status.hash
  ) {
    throw new Error("An exact owned Higgsfield request ID and status URL are required.");
  }
  return status.href;
}

/**
 * Performs one read-only GET for an exact provider status receipt. It never
 * submits, retries, cancels, assembles, stores, or publishes a clip.
 */
export async function pollElevayHiggsfieldProClipStatus(
  input: ElevayOwnedHiggsfieldClipRequest,
  dependencies: Pick<ElevayHiggsfieldProTransportDependencies, "request"> = {},
) {
  const statusUrl = exactOwnedStatusUrl(input);
  const apiKey = completeHiggsfieldApiKey();
  const request = dependencies.request ?? fetch;

  let response: Response;
  try {
    response = await request(statusUrl, {
      method: "GET",
      headers: { Authorization: `Key ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("Higgsfield status could not be read; no automatic retry was performed.");
  }
  if (!response.ok) {
    throw new Error("Higgsfield status could not be read; no automatic retry was performed.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
    return parseHiggsfieldClipStatus(payload, input.requestId);
  } catch {
    throw new Error("Higgsfield status response was invalid; no automatic retry was performed.");
  }
}
