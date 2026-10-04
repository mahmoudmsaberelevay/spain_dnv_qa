import { describe, expect, it } from "vitest";
import { buildHiggsfieldClipRequest, parseHiggsfieldAcceptedClip, parseHiggsfieldClipStatus } from "./higgsfieldClipRequestContract";

const id = "00000000-0000-4000-8000-000000000001";
const input = {
  keyframeUrl: "https://cdn.elevay.example/frames/first.png",
  motionPrompt: "A premium editorial tracking shot in modern Cairo interiors, coherent business attire.",
  idempotencyKey: "elevay-week-2026-10-11-reel-1-clip-1-v1",
};

describe("Higgsfield clip protocol (no network or generation)", () => {
  it("builds exactly one five-second image-to-video body with a persisted idempotency key", () => {
    const request = buildHiggsfieldClipRequest(input);
    expect(request.url).toBe("https://api.higgsfield.ai/kling-video/v2.5-turbo/standard/image-to-video");
    expect(request.method).toBe("POST");
    expect(request.idempotencyKey).toBe(input.idempotencyKey);
    expect(request.body).toMatchObject({ image_url: input.keyframeUrl, duration: 5, prompt: input.motionPrompt });
    expect(request.body).not.toHaveProperty("aspect_ratio");
    expect(request.body).not.toHaveProperty("sound");
    expect(JSON.stringify(request)).not.toMatch(/HF_API_KEY|Authorization/);
  });

  it("rejects untrusted frames, short prompts and keys that cannot safely be replayed", () => {
    expect(() => buildHiggsfieldClipRequest({ ...input, keyframeUrl: "http://localhost/a.png" })).toThrow(/HTTPS/);
    expect(() => buildHiggsfieldClipRequest({ ...input, keyframeUrl: "https://person:secret@cdn.example/a.png" })).toThrow(/credential-free/);
    expect(() => buildHiggsfieldClipRequest({ ...input, keyframeUrl: "https://127.0.0.1/a.png" })).toThrow(/local or IP-address/);
    expect(() => buildHiggsfieldClipRequest({ ...input, motionPrompt: "short" })).toThrow(/motion prompt/);
    expect(() => buildHiggsfieldClipRequest({ ...input, idempotencyKey: "has whitespace" })).toThrow(/idempotency key/);
  });

  it("accepts only a queued UUID with provider-owned status and cancel URLs", () => {
    const accepted = parseHiggsfieldAcceptedClip({ status: "queued", request_id: id,
      status_url: `https://api.higgsfield.ai/requests/${id}/status`,
      cancel_url: `https://api.higgsfield.ai/requests/${id}/cancel` });
    expect(accepted.requestId).toBe(id);
    expect(() => parseHiggsfieldAcceptedClip({ status: "queued", request_id: id,
      status_url: `https://evil.example/requests/${id}/status`,
      cancel_url: `https://api.higgsfield.ai/requests/${id}/cancel` })).toThrow(/unexpected status/);
    expect(() => parseHiggsfieldAcceptedClip({ status: "queued", request_id: id,
      status_url: "https://api.higgsfield.ai/requests/different/status",
      cancel_url: `https://api.higgsfield.ai/requests/${id}/cancel` })).toThrow(/unexpected status/);
    expect(() => parseHiggsfieldAcceptedClip({ status: "completed", request_id: id })).toThrow(/queued request/);
  });

  it("rejects mismatched status IDs and accepts only completed output with an HTTPS video", () => {
    expect(parseHiggsfieldClipStatus({ request_id: id, status: "queued" }, id)).toEqual({ requestId: id, state: "queued", videoUrl: null });
    expect(() => parseHiggsfieldClipStatus({ request_id: "00000000-0000-4000-8000-000000000002", status: "completed", video: { url: "https://cdn.example/out.mp4" } }, id)).toThrow(/owned request/);
    expect(() => parseHiggsfieldClipStatus({ request_id: id, status: "completed" }, id)).toThrow(/HTTPS URL/);
    expect(() => parseHiggsfieldClipStatus({ request_id: id, status: "completed", video: { url: "http://localhost/out.mp4" } }, id)).toThrow(/HTTPS/);
    expect(parseHiggsfieldClipStatus({ request_id: id, status: "completed", video: { url: "https://cdn.example/out.mp4" } }, id)).toEqual({ requestId: id, state: "completed", videoUrl: "https://cdn.example/out.mp4" });
  });
});
