import { describe, expect, it } from "vitest";
import { ELEVAY_ARABIC_VOICE_DEFAULTS, isValidMp3Buffer } from "./elevenLabsTts";

const apiKey = process.env.ELEVENLABS_API_KEY;

describe("ELEVAY approved ElevenLabs voice access", () => {
  it("generates a short verified Arabic MP3 from the configured approved voice", async () => {
    expect(apiKey, "ELEVENLABS_API_KEY must be configured server-side").toBeTruthy();

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId}?output_format=${ELEVAY_ARABIC_VOICE_DEFAULTS.outputFormat}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey!,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: "[thoughtful] هذا اختبار قصير للتأكد من جودة صوت ELEVAY باللغة العربية.",
          model_id: ELEVAY_ARABIC_VOICE_DEFAULTS.modelId,
          language_code: ELEVAY_ARABIC_VOICE_DEFAULTS.languageCode,
          voice_settings: { stability: ELEVAY_ARABIC_VOICE_DEFAULTS.stability },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );

    const buffer = Buffer.from(await response.arrayBuffer());
    expect(response.ok, `ElevenLabs returned HTTP ${response.status}`).toBe(true);
    expect(response.headers.get("content-type")?.toLowerCase()).toContain("audio/");
    expect(buffer.length).toBeGreaterThan(256);
    expect(isValidMp3Buffer(buffer)).toBe(true);
  }, 75_000);
});
