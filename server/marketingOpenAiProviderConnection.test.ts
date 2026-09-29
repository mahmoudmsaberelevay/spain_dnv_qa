import { describe, expect, it } from "vitest";
import { getMarketingProviderConnection, providerSecretPresence } from "../shared/marketingProviderConnections";

describe("OpenAI editorial provider connection", () => {
  it("uses only the protected OPENAI_API_KEY mapping and does not treat a browser ChatGPT session as a credential", () => {
    const connection = getMarketingProviderConnection("openai-editorial");
    expect(connection).not.toBeNull();
    expect(connection?.provider).toBe("OpenAI API");
    expect(connection?.secretKeys).toEqual(["OPENAI_API_KEY"]);
    expect(connection?.executionBoundary).toContain("No content request");
    expect(providerSecretPresence(connection!, {}).allPresent).toBe(false);
    expect(providerSecretPresence(connection!, { OPENAI_API_KEY: "server-side-test-key" }).allPresent).toBe(true);
  });
});
