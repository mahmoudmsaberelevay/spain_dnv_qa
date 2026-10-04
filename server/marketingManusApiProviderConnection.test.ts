import { describe, expect, it } from "vitest";
import { getMarketingProviderConnection, providerSecretPresence } from "../shared/marketingProviderConnections";

describe("Manus API v2 orchestration provider policy", () => {
  it("maps only the protected MANUS_API_KEY to the locked orchestration alias", () => {
    const connection = getMarketingProviderConnection("manus-orchestrator");
    expect(connection).not.toBeNull();
    expect(connection?.provider).toBe("Manus API v2");
    expect(connection?.secretKeys).toEqual(["MANUS_API_KEY"]);
    expect(connection?.webhookPath).toBe("/api/webhooks/marketing/manus");
    expect(connection?.creativeCapabilities).toEqual([
      "research", "workflow_orchestration", "reel_assembly", "logo_outro", "audio_mix", "export",
    ]);
    expect(connection?.purpose).toContain("Higgsfield-generated clips");
    expect(connection?.executionBoundary).toContain("No Manus-native footage generation");
    expect(connection?.executionBoundary).toContain("review/QA gates");
  });

  it("reports secret readiness without exposing the secret value", () => {
    const connection = getMarketingProviderConnection("manus-orchestrator");
    expect(connection).not.toBeNull();
    const state = providerSecretPresence(connection!, { MANUS_API_KEY: "x" } as NodeJS.ProcessEnv);
    expect(state).toEqual({ required: [{ key: "MANUS_API_KEY", present: true }], allPresent: true });
    expect(state.required[0]).not.toHaveProperty("value");
  });
});
