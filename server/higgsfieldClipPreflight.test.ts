import { describe, expect, it, vi } from "vitest";
import { ELEVAY_CLIPS_PER_REEL, HIGGSFIELD_CANDIDATE_MODEL, quoteHiggsfieldReelClips } from "./higgsfieldClipPreflight";

const clips = Array.from({ length: ELEVAY_CLIPS_PER_REEL }, (_, index) => ({
  keyframeUrl: `https://assets.example.com/keyframe-${index}.png`,
  motionPrompt: `Slow cinematic camera movement for scene ${index + 1}, no words or logos.`,
}));

describe("Higgsfield non-generative reel-cost preflight", () => {
  it("quotes four five-second clips without calling a generation endpoint or changing the key", async () => {
    const request = vi.fn(async (_url: string, _options?: RequestInit) => new Response(JSON.stringify({ usd: "0.179" }), { status: 200 }));
    const result = await quoteHiggsfieldReelClips(clips, "complete-key-as-is", request as typeof fetch);
    expect(request).toHaveBeenCalledTimes(4);
    for (const [url, options] of request.mock.calls) {
      expect(url).toBe(`https://api.higgsfield.ai/estimate/${HIGGSFIELD_CANDIDATE_MODEL}`);
      expect(options?.method).toBe("POST");
      expect(options?.headers).toMatchObject({ Authorization: "Key complete-key-as-is" });
      expect(JSON.parse(options!.body as string)).toMatchObject({ duration: 5 });
    }
    expect(result).toMatchObject({ clips: 4, secondsEach: 5, estimatedClipUsd: 0.72, remainingForKeyframesVoiceAndAssemblyUsd: 0.78, generationEnabled: false });
  });

  it("does not trim or split the supplied credential", async () => {
    const request = vi.fn(async (_url: string, options?: RequestInit) => {
      expect((options?.headers as Record<string, string>).Authorization).toBe("Key   complete-key-as-is  ");
      return new Response(JSON.stringify({ usd: "0.10" }), { status: 200 });
    });
    await quoteHiggsfieldReelClips(clips, "  complete-key-as-is  ", request as typeof fetch);
  });

  it("fails closed if four clips alone exceed the item limit", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ usd: "0.51" }), { status: 200 }));
    await expect(quoteHiggsfieldReelClips(clips, "key", request as typeof fetch)).rejects.toThrow("exceed the USD 1.50 item cap");
  });

  it("does not call Higgsfield with a missing key or unsafe input", async () => {
    const request = vi.fn();
    await expect(quoteHiggsfieldReelClips(clips, "", request as typeof fetch)).rejects.toThrow("HF_API_KEY");
    await expect(quoteHiggsfieldReelClips([{ ...clips[0], keyframeUrl: "http://bad.example/image.png" }, ...clips.slice(1)], "key", request as typeof fetch)).rejects.toThrow("public HTTPS");
    expect(request).not.toHaveBeenCalled();
  });

  it("does not proceed after an authentication error or an untrusted quote", async () => {
    const unauthorized = vi.fn(async () => new Response(null, { status: 401 }));
    await expect(quoteHiggsfieldReelClips(clips, "key", unauthorized as typeof fetch)).rejects.toThrow("HTTP 401");
    const noPrice = vi.fn(async () => new Response(JSON.stringify({ credits: "1.5" }), { status: 200 }));
    await expect(quoteHiggsfieldReelClips(clips, "key", noPrice as typeof fetch)).rejects.toThrow("unusable");
  });
});
