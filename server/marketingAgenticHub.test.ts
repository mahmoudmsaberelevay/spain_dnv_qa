import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("retired Agentic Marketing System hub", () => {
  it("removes the legacy Agentic Marketing System from the Marketing module navigation", () => {
    const app = read("client/src/App.tsx");
    const dashboard = read("client/src/pages/marketing/MarketingDashboard.tsx");
    const mobile = read("client/src/components/MobileLayout.tsx");
    const desktop = read("client/src/components/DashboardLayout.tsx");
    expect(app).toContain('<Redirect to="/marketing" />');
    expect(dashboard).not.toContain("AI Agentic Marketing System");
    expect(mobile).not.toContain('label: "AI Agentic Marketing System", path: "/marketing/agentic-system"');
    expect(mobile).toContain('label: "Marketing Dashboard", path: "/marketing"');
    expect(desktop).not.toContain('label: "AI Agentic Marketing System", path: "/marketing/agentic-system"');
    expect(desktop).toContain('label: "Marketing Dashboard", path: "/marketing"');
  });

  it("keeps a safe redirect for old bookmarked legacy hub links", () => {
    const app = read("client/src/App.tsx");
    expect(app).toContain('<Route path="/marketing/agentic-system">');
    expect(app).toContain('<Redirect to="/marketing" />');
  });
});
