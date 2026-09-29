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
      "research", "static_assets", "carousel_visuals", "reel_storyboards", "short_form_reels",
    ]);
    expect(connection?.purpose).toContain("approved static assets");
    expect(connection?.purpose).toContain("short-form 9:16 reels");
    expect(connection?.executionBoundary).toContain("Task creation is blocked");
    expect(connection?.executionBoundary).toContain("final-preview");
  });

  it("reports secret readiness without exposing the secret value", () => {
    const connection = getMarketingProviderConnection("manus-orchestrator");
    expect(connection).not.toBeNull();
    const state = providerSecretPresence(connection!, { MANUS_API_KEY: "x" } as NodeJS.ProcessEnv);
    expect(state).toEqual({ required: [{ key: "MANUS_API_KEY", present: true }], allPresent: true });
    expect(state.required[0]).not.toHaveProperty("value");
  });
});
