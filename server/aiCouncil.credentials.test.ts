import { describe, expect, it } from "vitest";

async function expectAuthorized(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers });
  expect(response.ok, `Credential validation failed for ${new URL(url).host} with status ${response.status}`).toBe(true);
}

describe("Administrative AI Council provider credentials", () => {
  it("authorizes lightweight server-side provider checks without exposing credentials", async () => {
    const openAiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const manusKey = process.env.MANUS_API_KEY;

    expect(openAiKey).toBeTruthy();
    expect(anthropicKey).toBeTruthy();
    expect(manusKey).toBeTruthy();

    await expectAuthorized("https://api.openai.com/v1/models?limit=1", {
      Authorization: `Bearer ${openAiKey}`,
    });

    await expectAuthorized("https://api.anthropic.com/v1/models?limit=1", {
      "x-api-key": anthropicKey!,
      "anthropic-version": "2023-06-01",
    });

    await expectAuthorized("https://api.manus.ai/v2/webhook.publicKey", {
      "x-manus-api-key": manusKey!,
    });
  }, 30_000);
});
