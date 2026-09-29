import { describe, expect, it } from "vitest";
import { getMarketingProviderConnection, providerSecretPresence } from "../shared/marketingProviderConnections";

describe("Claude editorial provider connection", () => {
  it("uses only the protected ANTHROPIC_API_KEY mapping and retains its no-execution boundary", () => {
    const connection = getMarketingProviderConnection("editorial-challenge");
    expect(connection).not.toBeNull();
    expect(connection?.provider).toBe("Anthropic API");
    expect(connection?.secretKeys).toEqual(["ANTHROPIC_API_KEY"]);
    expect(connection?.executionBoundary).toContain("No provider request");
    expect(providerSecretPresence(connection!, {}).allPresent).toBe(false);
    expect(providerSecretPresence(connection!, { ANTHROPIC_API_KEY: "server-side-test-key" }).allPresent).toBe(true);
  });
});
