import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getMarketingProviderConnection, providerSecretPresence, summarizeMarketingAutopilotLock } from "../shared/marketingProviderConnections";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Meta Marketing provider readiness policy", () => {
  it("maps only protected server-side Meta prerequisites", () => {
    const connection = getMarketingProviderConnection("meta-marketing");
    expect(connection?.provider).toBe("Meta Marketing API");
    expect(connection?.secretKeys).toEqual([
      "META_SYSTEM_USER_ACCESS_TOKEN",
      "META_AD_ACCOUNT_ID",
      "META_APP_SECRET",
      "META_WEBHOOK_VERIFY_TOKEN",
    ]);
    expect(connection?.webhookPath).toBe("/api/webhooks/marketing/meta");

    const state = providerSecretPresence(connection!, {
      META_SYSTEM_USER_ACCESS_TOKEN: "configured",
      META_AD_ACCOUNT_ID: "123",
      META_APP_SECRET: "configured",
      META_WEBHOOK_VERIFY_TOKEN: "configured",
    });
    expect(state.required).toEqual([
      { key: "META_SYSTEM_USER_ACCESS_TOKEN", present: true },
      { key: "META_AD_ACCOUNT_ID", present: true },
      { key: "META_APP_SECRET", present: true },
      { key: "META_WEBHOOK_VERIFY_TOKEN", present: true },
    ]);
    expect(state.allPresent).toBe(true);
  });

  it("preserves Meta execution locks even when provider prerequisites are configured", () => {
    const connection = getMarketingProviderConnection("meta-marketing");
    expect(connection?.executionBoundary).toContain("No campaign");
    expect(connection?.executionBoundary).toContain("CAPI mutation");
    const lock = summarizeMarketingAutopilotLock({
      activeBrandBookCount: 1,
      approvedStrategyPacketCount: 1,
      internallyApprovedPilotProposalCount: 1,
      allProviderSecretsPresent: true,
      masterKillSwitchEnabled: true,
    });
    expect(lock.executionAllowed).toBe(false);
    expect(lock.blockers).toContain("The master automation kill switch is engaged.");
    expect(lock.blockers).toContain("The provider execution release has not been implemented; external actions remain intentionally blocked.");
  });

  it("keeps existing lead webhook, CAPI, campaign, and CRM safeguards outside connection readiness", () => {
    const router = read("server/marketingSystemRouter.ts");
    const leadService = read("server/metaLeadsService.ts");
    const legacyCapi = read("server/metaCapi.ts");

    expect(router).toContain("externalOperationsEnabled: false");
    expect(router).toContain("cannot call a provider, create a campaign, publish content, spend money, send CAPI events, or change CRM data");
    expect(leadService).toContain('process.env.META_CRM_PRODUCTION_ENABLED === "true"');
    expect(leadService).toContain("META_PRODUCTION_APPROVAL_REQUIRED");
    expect(legacyCapi).toContain("disabled: true");
  });
});
