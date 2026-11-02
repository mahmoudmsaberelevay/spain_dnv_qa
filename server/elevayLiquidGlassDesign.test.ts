import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("ELEVAY Liquid Glass visual system", () => {
  it("defines the supplied ELEVAY palette and accessible material fallbacks", () => {
    const css = read("client/src/index.css");

    expect(css).toContain("--elevay-logo-blue: #a1c6cf");
    expect(css).toContain("--elevay-navy: #1a3a5c");
    expect(css).toContain("--elevay-gold: #c9a84c");
    expect(css).toContain("--elevay-blue: #5ba3b8");
    expect(css).toContain("--elevay-deep-navy: #0a1628");
    expect(css).toContain("prefers-reduced-transparency: reduce");
    expect(css).toContain(".elevay-glass-panel");
    expect(css).toContain(".elevay-floating-surface");
    expect(css).toContain(".elevay-control-surface");
  });

  it("applies shared glass treatments to cards, controls, data tables, dialogs, drawers, and charts", () => {
    expect(read("client/src/components/ui/card.tsx")).toContain("elevay-glass-panel");
    expect(read("client/src/components/ui/input.tsx")).toContain("elevay-control-surface");
    expect(read("client/src/components/ui/select.tsx")).toContain("elevay-floating-surface");
    expect(read("client/src/components/ui/table.tsx")).toContain("elevay-data-table");
    expect(read("client/src/components/ui/dialog.tsx")).toContain("elevay-overlay");
    expect(read("client/src/components/ui/sheet.tsx")).toContain("elevay-sheet-surface");
    expect(read("client/src/components/ui/chart.tsx")).toContain("elevay-floating-surface");
  });

  it("uses the system across desktop and mobile navigation plus core dashboards", () => {
    const desktop = read("client/src/components/DashboardLayout.tsx");
    const mobile = read("client/src/components/MobileLayout.tsx");
    const financial = read("client/src/pages/FinancialDashboard.tsx");
    const leads = read("client/src/pages/leads/LeadsDashboard.tsx");
    const marketing = read("client/src/pages/marketing/MarketingDashboard.tsx");

    expect(desktop).toContain("elevay-app-shell");
    expect(desktop).toContain("elevay-topbar");
    expect(mobile).toContain("elevay-bottom-nav");
    expect(mobile).toContain("elevay-sheet-surface");
    expect(financial).toContain("elevay-featured-panel");
    expect(financial).toContain("metric-positive");
    expect(leads).toContain("#5BA3B8");
    expect(leads).toContain("#C9A84C");
    expect(marketing).toContain("marketing-workspace");
    expect(marketing).toContain("elevay-marketing-tool-card");
  });
});
