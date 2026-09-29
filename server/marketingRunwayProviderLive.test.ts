import { describe, expect, it } from "vitest";

const apiKey = process.env.RUNWAY_API_KEY;

describe("Runway optional media provider", () => {
  it("validates the protected API key through the non-generative workflow-list endpoint", async () => {
    expect(apiKey).toBeTruthy();

    const response = await fetch("https://api.dev.runwayml.com/v1/workflows", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": "2024-11-06",
      },
    });

    expect(response.ok).toBe(true);
    const payload = await response.json() as { data?: unknown };
    expect(Array.isArray(payload.data)).toBe(true);
  }, 30_000);
});
