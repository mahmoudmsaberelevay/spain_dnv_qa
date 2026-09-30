import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ELEVAY_ARABIC_VOICE_DEFAULTS, prepareThoughtfulArabicScript } from "./elevenLabsTts";
import { getMarketingProviderConnection, providerSecretPresence } from "../shared/marketingProviderConnections";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Existing ELEVAY ElevenLabs voice provider policy", () => {
  it("maps only the protected ElevenLabs key to the locked Arabic voice alias", () => {
    const connection = getMarketingProviderConnection("elevay-arabic-voice");
    expect(connection).not.toBeNull();
    expect(connection?.provider).toBe("Existing ELEVAY Voice Adapter");
    expect(connection?.secretKeys).toEqual(["ELEVENLABS_API_KEY"]);
    expect(connection?.webhookPath).toBeNull();
    expect(connection?.executionBoundary).toContain("finalized-script, cost, and content-approval gates");
    expect(providerSecretPresence(connection!, { ELEVENLABS_API_KEY: "x" } as NodeJS.ProcessEnv).allPresent).toBe(true);
  });

  it("retains the approved Arabic Eleven v3 defaults and thoughtful delivery behavior", () => {
    expect(ELEVAY_ARABIC_VOICE_DEFAULTS).toEqual({
      voiceId: "nc8XQG8lRYRZDnjvKW0H",
      modelId: "eleven_v3",
      languageCode: "ar",
      outputFormat: "mp3_44100_128",
      stability: 0.5,
    });
    expect(prepareThoughtfulArabicScript("النص المعتمد")).toBe("[thoughtful] النص المعتمد");
  });

  it("keeps the Marketing System from invoking voice synthesis during provider readiness", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).not.toContain("generateElevayArabicVoiceOver");
    expect(router).toContain("externalOperationsEnabled: false");
  });
});
