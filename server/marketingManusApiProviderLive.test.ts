import { describe, expect, it } from "vitest";

const apiKey = process.env.MANUS_API_KEY;

describe("Manus API v2 orchestration provider", () => {
  it("validates the protected key through the read-only webhook public-key endpoint", async () => {
    expect(apiKey).toBeTruthy();
    const response = await fetch("https://api.manus.ai/v2/webhook.publicKey", {
      headers: { "x-manus-api-key": apiKey! },
    });
    expect(response.ok).toBe(true);
    const payload = await response.json() as { ok?: boolean; public_key?: string; algorithm?: string };
    expect(payload.ok).toBe(true);
    expect(payload.algorithm).toBe("RSA-SHA256");
    expect(payload.public_key).toContain("BEGIN PUBLIC KEY");
  }, 30_000);
});
