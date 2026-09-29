import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MARKETING_AUTOPILOT_MODE,
  MARKETING_PROVIDER_CONNECTIONS,
  summarizeMarketingAutopilotLock,
} from "../shared/marketingProviderConnections";
import { getMarketingSystemCapabilities } from "./marketingSystemAccess";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Provider Connection Center and scoped administrator", () => {
  it("keeps a full Agentic Marketing administrator scoped to the Marketing System capability set", () => {
    expect(getMarketingSystemCapabilities("marketing_system_admin")).toEqual(getMarketingSystemCapabilities("owner"));
    const policy = read("server/marketingSystemAccess.ts");
    expect(policy).toContain('"marketing_system_admin"');
    expect(policy).toContain("scoped to the Agentic Marketing System");
  });

  it("requires the scoped administrator guard for final Agentic Marketing controls", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("async function requireMarketingSystemAdministrator");
    expect(router).toContain('role !== "owner" && role !== "marketing_system_admin"');
    expect(router).not.toContain("requireOwner(ctx.user)");
  });

  it("lists the requested providers without embedding provider secrets or an execution path", () => {
    expect(MARKETING_AUTOPILOT_MODE).toBe("full_autopilot");
    expect(MARKETING_PROVIDER_CONNECTIONS.map(connection => connection.provider)).toEqual(expect.arrayContaining([
      "Manus API v2", "OpenAI API", "Anthropic API", "Creatomate", "Runway", "Existing ELEVAY Voice Adapter", "Meta Marketing API",
    ]));
    const page = read("client/src/pages/marketing/ProviderConnectionCenter.tsx");
    const router = read("server/marketingSystemRouter.ts");
    expect(page).toContain("Provider Connection Center");
    expect(page).toContain("no keys are shown or accepted here");
    expect(router).toContain("externalOperationsEnabled: false");
    expect(page).not.toContain('type="password"');
    expect(page).not.toContain("apiKey");
  });

  it("keeps full autopilot blocked even when the static readiness inputs are otherwise satisfied", () => {
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

  it("registers the center in desktop, mobile and hub navigation", () => {
    expect(read("client/src/App.tsx")).toContain('path="/marketing/provider-connections"');
    expect(read("client/src/pages/marketing/MarketingDashboard.tsx")).toContain("Provider Connection Center");
    expect(read("client/src/components/MobileLayout.tsx")).toContain("Provider Connection Center");
    expect(read("client/src/pages/marketing/AgenticMarketingHub.tsx")).toContain("Provider Connection Center");
  });
});
