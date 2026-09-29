import { describe, expect, it } from "vitest";

const apiKey = process.env.ANTHROPIC_API_KEY;

describe("Claude editorial provider live credential", () => {
  it.skipIf(!apiKey)("accepts the protected API key on the read-only Anthropic models endpoint", async () => {
    const response = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });

    // Deliberately do not inspect or log model metadata or any credential-derived response data.
    expect(response.status).toBe(200);
    const payload = await response.json() as { data?: unknown[]; has_more?: boolean };
    expect(Array.isArray(payload.data)).toBe(true);
    expect(typeof payload.has_more).toBe("boolean");
  }, 20_000);
});
