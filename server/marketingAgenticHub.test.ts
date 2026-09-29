import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Agentic Marketing System hub", () => {
  it("provides one discoverable Marketing entry and links each gated control in the approved sequence", () => {
    const app = read("client/src/App.tsx");
    const dashboard = read("client/src/pages/marketing/MarketingDashboard.tsx");
    const mobile = read("client/src/components/MobileLayout.tsx");
    const desktop = read("client/src/components/DashboardLayout.tsx");
    const page = read("client/src/pages/marketing/AgenticMarketingHub.tsx");
    expect(app).toContain('path="/marketing/agentic-system"');
    expect(dashboard).toContain('href: "/marketing/agentic-system"');
    expect(mobile).toContain('label: "Agentic Marketing System", path: "/marketing/agentic-system"');
    expect(mobile).toContain('label: "Marketing Dashboard", path: "/marketing"');
    expect(desktop).toContain('label: "Agentic Marketing System", path: "/marketing/agentic-system"');
    expect(desktop).toContain('label: "Marketing Dashboard", path: "/marketing"');
    for (const path of ["/marketing/brand-studio", "/marketing/knowledge-library", "/marketing/work-orders", "/marketing/content-studio", "/marketing/meta-ads-strategy", "/marketing/meta-ads-strategy-packet"]) {
      expect(page).toContain(path);
    }
  });

  it("keeps the hub informative and explicitly free of external action controls", () => {
    const page = read("client/src/pages/marketing/AgenticMarketingHub.tsx");
    expect(page).toContain("the current system does not connect Meta, create campaigns, spend money, publish content, call a provider or modify CAPI");
    expect(page).not.toContain("createCampaign");
    expect(page).not.toContain("launchCampaign");
  });
});
