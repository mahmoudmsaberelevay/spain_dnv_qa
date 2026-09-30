import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Arabic voice-over reliability contract", () => {
  it("maps an inaccessible approved voice to a clear protected API precondition", () => {
    const router = read("server/marketingRouter.ts");
    expect(router).toContain("ElevenLabsVoiceUnavailableError");
    expect(router).toContain('code: "PRECONDITION_FAILED"');
  });

  it("bounds provider calls and rejects invalid audio before storage", () => {
    const adapter = read("server/elevenLabsTts.ts");
    expect(adapter).toContain("AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS)");
    expect(adapter).toContain("isValidMp3Buffer(audioBuffer)");
    expect(adapter).toContain('contentType.startsWith("audio/")');
    expect(adapter).toContain("ElevenLabsVoiceUnavailableError");
  });

  it("shows a human-readable fallback when a stale session or proxy returns HTML instead of tRPC JSON", () => {
    const page = read("client/src/pages/marketing/ArabicVoiceOver.tsx");
    expect(page).toContain("Unexpected token.*DOCTYPE");
    expect(page).toContain("did not reach the API as JSON");
    expect(page).toContain("onError={() => setPlaybackError");
  });
});
