import { describe, expect, it } from "vitest";

const apiKey = process.env.ELEVENLABS_API_KEY;

describe("Existing ELEVAY ElevenLabs voice provider", () => {
  it("validates the protected key through the read-only user-subscription endpoint", async () => {
    expect(apiKey).toBeTruthy();
    const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": apiKey! },
    });
    expect(response.ok).toBe(true);
    const payload = await response.json() as { status?: unknown; tier?: unknown };
    expect(typeof payload.status).toBe("string");
    expect(typeof payload.tier).toBe("string");
  }, 30_000);
});
