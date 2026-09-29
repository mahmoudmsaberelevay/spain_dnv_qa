import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Agentic Marketing System hub", () => {
  it("provides one discoverable Agentic Marketing tab and links each gated control from its central hub", () => {
    const app = read("client/src/App.tsx");
    const dashboard = read("client/src/pages/marketing/MarketingDashboard.tsx");
    const mobile = read("client/src/components/MobileLayout.tsx");
    const desktop = read("client/src/components/DashboardLayout.tsx");
    const page = read("client/src/pages/marketing/AgenticMarketingHub.tsx");
    const brandStudio = read("client/src/pages/marketing/BrandStudio.tsx");
    expect(app).toContain('path="/marketing/agentic-system"');
    expect(dashboard).toContain('href: "/marketing/agentic-system"');
    expect(mobile).toContain('label: "AI Agentic Marketing System", path: "/marketing/agentic-system"');
    expect(mobile).toContain('label: "Marketing Dashboard", path: "/marketing"');
    expect(desktop).toContain('label: "AI Agentic Marketing System", path: "/marketing/agentic-system"');
    expect(dashboard).toContain('title: "AI Agentic Marketing System"');
    expect(page).toContain("ELEVAY AI Agentic Marketing System");
    expect(page).toContain("Open Settings");
    expect(page).toContain("Open Production");
    expect(page).toContain('navigate("/marketing/weekly-results?view=setup")');
    expect(page).toContain('navigate("/marketing/weekly-results")');
    expect(dashboard).toContain("Start with Settings or Production");
    expect(dashboard).toContain('navigate("/marketing/weekly-results?view=setup")');
    expect(dashboard).toContain('navigate("/marketing/weekly-results")');
    expect(desktop).toContain('label: "Marketing Dashboard", path: "/marketing"');
    expect(desktop).not.toContain('label: "Brand Discovery — 35 Questions", path: "/marketing/brand-studio"');
    expect(desktop).not.toContain('label: "1. Setup"');
    expect(desktop).not.toContain('label: "2. Weekly Results"');
    expect(mobile).not.toContain('label: "Brand Studio", path: "/marketing/brand-studio"');
    expect(mobile).not.toContain('label: "1. Setup"');
    expect(mobile).not.toContain('label: "2. Weekly Results"');
    expect(brandStudio).toContain("Opening Brand Discovery questions");
    expect(brandStudio).toContain("autoStartAttempted");
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
