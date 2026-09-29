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
    const workspace = read("client/src/pages/marketing/WeeklyResults.tsx");
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
    expect(page).toContain('href: "/marketing/weekly-results?view=setup"');
    expect(page).toContain('href: "/marketing/weekly-results"');
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
    expect(page).not.toContain("Supporting governed controls");
    for (const path of ["/marketing/brand-studio", "/marketing/knowledge-library", "/marketing/work-orders", "/marketing/meta-ads-strategy", "/marketing/meta-ads-strategy-packet", "/marketing/campaign-pilot-proposal", "/marketing/pilot-readiness", "/marketing/weekly-executive-briefs", "/marketing/provider-connections"]) {
      expect(workspace).toContain(path);
    }
    expect(workspace).toContain("/marketing/content-studio");
  });

  it("keeps the hub informative and explicitly free of external action controls", () => {
    const page = read("client/src/pages/marketing/AgenticMarketingHub.tsx");
    expect(page).toContain("provider execution, media rendering, Meta campaign creation, spend, publishing, scheduling and CAPI changes remain locked");
    expect(page).not.toContain("createCampaign");
    expect(page).not.toContain("launchCampaign");
  });
});
