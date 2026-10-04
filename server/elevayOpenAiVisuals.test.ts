import { describe, expect, it, vi } from "vitest";
import { createElevayOpenAiKeyframe, ELEVAY_OPENAI_VISUAL_MODEL, ELEVAY_OPENAI_VISUAL_QUALITY, ELEVAY_REEL_KEYFRAME_SIZE } from "./elevayOpenAiVisuals";

function image(width = 864, height = 1536) {
  const png = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return png;
}
const prompt = "Premium, realistic architectural dawn over a calm Mediterranean-inspired stone terrace. Nine-by-sixteen vertical editorial composition. Warm indirect natural light, soft blue-and-cream palette, no people, no flags, no passports, no writing and no artificial logos.";

describe("server-only direct OpenAI visuals", () => {
  it("creates one exactly 9:16 keyframe and records metered provenance without exposing credentials", async () => {
    const save = vi.fn(async (key: string, data: Buffer, mime: string) => ({ key, url: "https://cdn.example.org/elevay/frame.png" }));
    const request = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: image().toString("base64") }], usage: { input_tokens: 200, output_tokens: 1800 } }), { status: 200 }));
    const output = await createElevayOpenAiKeyframe({ purpose: "reel_keyframe", prompt }, { request: request as typeof fetch, save: save as any, apiKey: "test-openai-key" });
    expect(output).toMatchObject({ provider: "openai", model: ELEVAY_OPENAI_VISUAL_MODEL, width: 864, height: 1536, measuredCostUsd: 0.055 });
    expect(output.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(save).toHaveBeenCalledWith(expect.stringMatching(/^marketing\/openai\/reel_keyframe\//), expect.any(Buffer), "image/png");
    const [, init] = request.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(ELEVAY_OPENAI_VISUAL_MODEL).toBe("gpt-image-2.5-sunburst");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: ELEVAY_OPENAI_VISUAL_MODEL, size: ELEVAY_REEL_KEYFRAME_SIZE, n: 1, quality: ELEVAY_OPENAI_VISUAL_QUALITY });
    expect(JSON.stringify(output)).not.toContain("test-openai-key");
  });

  it("fails closed on wrong aspect or an invalid response before storage", async () => {
    const save = vi.fn();
    const request = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: image(1024, 1024).toString("base64") }] }), { status: 200 }));
    await expect(createElevayOpenAiKeyframe({ purpose: "reel_keyframe", prompt }, { request: request as typeof fetch, save: save as any, apiKey: "test-key" })).rejects.toThrow("native 9:16");
    expect(save).not.toHaveBeenCalled();
  });

  it("blocks contact data and non-portrait reel settings before a paid request", async () => {
    const request = vi.fn();
    await expect(createElevayOpenAiKeyframe({ purpose: "reel_keyframe", prompt: `${prompt} mail me at test@example.com` }, { request: request as typeof fetch, apiKey: "test-key" })).rejects.toThrow("contact");
    await expect(createElevayOpenAiKeyframe({ purpose: "reel_keyframe", prompt, size: "1024x1024" }, { request: request as typeof fetch, apiKey: "test-key" })).rejects.toThrow("native 9:16");
    expect(request).not.toHaveBeenCalled();
  });
});
