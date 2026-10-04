import { describe, expect, it, vi } from "vitest";
import { quoteElevayHiggsfieldProClips } from "./higgsfieldProClipQuote";

const scenes = [1, 2, 3, 4].map(n => ({ keyframeUrl: `https://cdn.example.org/elevay/frame-${n}.png`, motionPrompt: `Gentle stable dolly shot of premium, realistically illuminated seaside stone architecture scene ${n}.`, idempotencyKey: `elevay:test:keyframe-${n}` }));
describe("four-clip Higgsfield Pro quote (never generation)", () => {
  it("returns four account-specific prices without old per-item or monthly cap", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ usd: "0.298" }), { status: 200 }));
    const output = await quoteElevayHiggsfieldProClips(scenes, { apiKey: "full-unmodified-key", request: request as typeof fetch });
    expect(output).toMatchObject({ clips: [{ clip: 1, estimatedUsd: 0.298 }, { clip: 2, estimatedUsd: 0.298 }, { clip: 3, estimatedUsd: 0.298 }, { clip: 4, estimatedUsd: 0.298 }], estimatedTotalUsd: 1.192, quoteOnly: true });
    expect(request).toHaveBeenCalledTimes(4);
    const [url, options] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.higgsfield.ai/estimate/kling-video/v2.5-turbo/pro/image-to-video");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({ Authorization: "Key full-unmodified-key" });
    expect(JSON.parse(String(options.body))).toMatchObject({ duration: 5, image_url: scenes[0].keyframeUrl });
    expect(JSON.stringify(output)).not.toContain("full-unmodified-key");
  });
  it("rejects fewer or more than four scenes before any request", async () => {
    const request = vi.fn();
    await expect(quoteElevayHiggsfieldProClips(scenes.slice(0, 3), { apiKey: "key", request: request as typeof fetch })).rejects.toThrow("exactly four");
    expect(request).not.toHaveBeenCalled();
  });
  it("fails closed on invalid cost or HTTP failure without logging response bodies", async () => {
    await expect(quoteElevayHiggsfieldProClips(scenes, { apiKey: "key", request: vi.fn(async () => new Response(JSON.stringify({ usd: "NaN" }), { status: 200 })) as typeof fetch })).rejects.toThrow("unusable quote");
    await expect(quoteElevayHiggsfieldProClips(scenes, { apiKey: "key", request: vi.fn(async () => new Response("sensitive-body", { status: 403 })) as typeof fetch })).rejects.toThrow("HTTP 403");
  });
});
