import { describe, expect, it } from "vitest";

const apiKey = process.env.CREATOMATE_API_KEY;

describe("Creatomate media-rendering provider", () => {
  it("validates the protected key through the read-only template-list endpoint", async () => {
    expect(apiKey).toBeTruthy();
    const response = await fetch("https://api.creatomate.com/v2/templates", {
      headers: { Authorization: `Bearer ${apiKey!}` },
    });
    expect(response.ok).toBe(true);
    const templates = await response.json() as unknown;
    expect(Array.isArray(templates)).toBe(true);
  }, 30_000);
});
