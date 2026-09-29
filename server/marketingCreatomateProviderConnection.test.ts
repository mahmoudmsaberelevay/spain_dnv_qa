import { describe, expect, it } from "vitest";
import { getMarketingProviderConnection, providerSecretPresence } from "../shared/marketingProviderConnections";

describe("Creatomate media-rendering provider policy", () => {
  it("maps only the protected Creatomate API key to the locked rendering alias", () => {
    const connection = getMarketingProviderConnection("template-render");
    expect(connection).not.toBeNull();
    expect(connection?.provider).toBe("Creatomate");
    expect(connection?.secretKeys).toEqual(["CREATOMATE_API_KEY"]);
    expect(connection?.webhookPath).toBe("/api/webhooks/marketing/creatomate");
    expect(connection?.executionBoundary).toContain("future rendering release");
  });

  it("reports API-key readiness without exposing a value or enabling renders", () => {
    const connection = getMarketingProviderConnection("template-render");
    expect(connection).not.toBeNull();
    const state = providerSecretPresence(connection!, { CREATOMATE_API_KEY: "x" } as NodeJS.ProcessEnv);
    expect(state).toEqual({ required: [{ key: "CREATOMATE_API_KEY", present: true }], allPresent: true });
    expect(state.required[0]).not.toHaveProperty("value");
  });
});
