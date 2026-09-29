import { describe, expect, it } from "vitest";

const apiKey = process.env.OPENAI_API_KEY;

describe("OpenAI editorial provider live credential", () => {
  it.skipIf(!apiKey)("accepts the protected API key on the read-only models endpoint", async () => {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    // Deliberately do not inspect or log model metadata or any credential-derived response data.
    expect(response.status).toBe(200);
    const payload = await response.json() as { object?: string; data?: unknown[] };
    expect(payload.object).toBe("list");
    expect(Array.isArray(payload.data)).toBe(true);
  }, 20_000);
});
