import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ELEVAY_HIGGSFIELD_PRO_IMAGE_TO_VIDEO_ENDPOINT,
  pollElevayHiggsfieldProClipStatus,
  submitElevayHiggsfieldProClip,
  type ElevayHiggsfieldProClipSubmission,
} from "./elevayHiggsfieldProTransport";

const requestId = "00000000-0000-4000-8000-000000000001";
const trustedOrigin = "https://cdn.elevay.example";
const apiKey = " full-unmodified-HF_API_KEY ";

const input: ElevayHiggsfieldProClipSubmission = {
  ownerReviewedRunId: 41,
  persistedStepId: 87,
  alreadyPersistedBeforeNetwork: true,
  idempotencyKey: "owner-persisted-run-41-step-87-clip-1-v1",
  prompt: "A premium editorial tracking shot in modern Cairo interiors, coherent business attire.",
  keyframe: {
    trustedCdnUrl: "https://cdn.elevay.example/marketing/openai/reel-keyframe.png",
    sha256: "a".repeat(64),
    width: 864,
    height: 1536,
  },
};

const dependencies = (request: typeof fetch) => ({ request, trustedKeyframeCdnOrigins: [trustedOrigin] });
const acceptedResponse = () => new Response(JSON.stringify({
  status: "queued",
  request_id: requestId,
  status_url: `https://api.higgsfield.ai/requests/${requestId}/status`,
  cancel_url: `https://api.higgsfield.ai/requests/${requestId}/cancel`,
}), { status: 200 });

let previousApiKey: string | undefined;

beforeEach(() => {
  previousApiKey = process.env.HF_API_KEY;
  process.env.HF_API_KEY = apiKey;
});

afterEach(() => {
  if (previousApiKey === undefined) delete process.env.HF_API_KEY;
  else process.env.HF_API_KEY = previousApiKey;
});

describe("server-only ELEVAY Higgsfield Pro transport", () => {
  it("posts one exact five-second Pro image-to-video request with the complete untouched Key credential", async () => {
    const request = vi.fn(async () => acceptedResponse());

    await expect(submitElevayHiggsfieldProClip(input, dependencies(request as typeof fetch))).resolves.toEqual({
      requestId,
      statusUrl: `https://api.higgsfield.ai/requests/${requestId}/status`,
      cancelUrl: `https://api.higgsfield.ai/requests/${requestId}/cancel`,
    });

    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ELEVAY_HIGGSFIELD_PRO_IMAGE_TO_VIDEO_ENDPOINT);
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    });
    expect(JSON.stringify(options.headers)).not.toContain("Bearer");
    expect(JSON.parse(String(options.body))).toEqual({
      prompt: input.prompt,
      image_url: input.keyframe.trustedCdnUrl,
      duration: 5,
      negative_prompt: "speech, dialogue, text, captions, logos, contact details, malformed anatomy or wardrobe",
    });
  });

  it("refuses missing durable persistence, an externally supplied idempotency key, or valid pinned provenance before network access", async () => {
    const request = vi.fn();
    const cases: Array<Partial<ElevayHiggsfieldProClipSubmission>> = [
      { ownerReviewedRunId: 0 },
      { persistedStepId: 0 },
      { alreadyPersistedBeforeNetwork: false as true },
      { idempotencyKey: "" },
      { keyframe: { ...input.keyframe, sha256: "not-a-sha256" } },
      { keyframe: { ...input.keyframe, width: 1024 as 864 } },
      { keyframe: { ...input.keyframe, trustedCdnUrl: "https://evil.example/keyframe.png" } },
      { keyframe: { ...input.keyframe, trustedCdnUrl: "https://cdn.elevay.example/keyframe.png?secret=never-send" } },
    ];

    for (const invalid of cases) {
      await expect(submitElevayHiggsfieldProClip({ ...input, ...invalid }, dependencies(request as typeof fetch))).rejects.toThrow();
    }
    await expect(submitElevayHiggsfieldProClip(input, { request: request as typeof fetch })).rejects.toThrow(/trusted keyframe CDN origin/);
    expect(request).not.toHaveBeenCalled();
  });

  it("never replays a submission after network, HTTP, JSON, or invalid-acceptance ambiguity", async () => {
    const networkFailure = vi.fn(async () => { throw new Error("connection reset"); });
    await expect(submitElevayHiggsfieldProClip(input, dependencies(networkFailure as typeof fetch))).rejects.toThrow(/do not replay automatically/);
    expect(networkFailure).toHaveBeenCalledTimes(1);

    const httpFailure = vi.fn(async () => new Response("provider-private-body", { status: 503 }));
    await expect(submitElevayHiggsfieldProClip(input, dependencies(httpFailure as typeof fetch))).rejects.toThrow(/do not replay automatically/);
    expect(httpFailure).toHaveBeenCalledTimes(1);

    const malformedAcceptance = vi.fn(async () => new Response(JSON.stringify({ status: "queued" }), { status: 200 }));
    await expect(submitElevayHiggsfieldProClip(input, dependencies(malformedAcceptance as typeof fetch))).rejects.toThrow(/do not replay automatically/);
    expect(malformedAcceptance).toHaveBeenCalledTimes(1);
  });

  it("polls only the exact owned status URL once and parses provider status without a POST or idempotency header", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ request_id: requestId, status: "in_progress" }), { status: 200 }));
    await expect(pollElevayHiggsfieldProClipStatus({
      requestId,
      statusUrl: `https://api.higgsfield.ai/requests/${requestId}/status`,
    }, { request: request as typeof fetch })).resolves.toEqual({ requestId, state: "in_progress", videoUrl: null });

    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.higgsfield.ai/requests/${requestId}/status`);
    expect(options.method).toBe("GET");
    expect(options.headers).toEqual({ Authorization: `Key ${apiKey}`, Accept: "application/json" });
    expect(options.headers).not.toHaveProperty("Idempotency-Key");

    const foreign = vi.fn();
    await expect(pollElevayHiggsfieldProClipStatus({ requestId, statusUrl: "https://evil.example/status" }, { request: foreign as typeof fetch })).rejects.toThrow(/exact owned/);
    expect(foreign).not.toHaveBeenCalled();
  });
});
