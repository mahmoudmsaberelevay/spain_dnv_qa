import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getMarketingProviderConnection, providerSecretPresence, summarizeMarketingAutopilotLock } from "../shared/marketingProviderConnections";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Runway provider policy", () => {
  it("uses only a protected API key and does not claim an unsupported callback secret", () => {
    const connection = getMarketingProviderConnection("specialty-motion");
    expect(connection).not.toBeNull();
    expect(connection?.provider).toBe("Runway");
    expect(connection?.secretKeys).toEqual(["RUNWAY_API_KEY"]);
    expect(connection?.webhookPath).toBeNull();
    expect(connection?.executionBoundary).toContain("Readiness does not create any task");
    expect(providerSecretPresence(connection!, { RUNWAY_API_KEY: "key-present" } as NodeJS.ProcessEnv).allPresent).toBe(true);
  });

  it("has no Runway generation, task-dispatch, callback, worker, or scheduler implementation", () => {
    const providerRegistry = read("shared/marketingProviderConnections.ts");
    const router = read("server/marketingSystemRouter.ts");
    expect(providerRegistry).not.toContain("RUNWAY_WEBHOOK_SECRET");
    expect(providerRegistry).not.toContain("webhooks/marketing/runway");
    expect(router).toContain("per-clip cap and explicit approval before use");
  });

  it("keeps every external Marketing action blocked when Runway readiness is complete", () => {
    const lock = summarizeMarketingAutopilotLock({
      activeBrandBookCount: 1,
      approvedStrategyPacketCount: 1,
      internallyApprovedPilotProposalCount: 1,
      allProviderSecretsPresent: true,
      masterKillSwitchEnabled: false,
    });
    expect(lock.executionAllowed).toBe(false);
    expect(lock.blockers).toContain("The provider execution release has not been implemented; external actions remain intentionally blocked.");
  });
});
