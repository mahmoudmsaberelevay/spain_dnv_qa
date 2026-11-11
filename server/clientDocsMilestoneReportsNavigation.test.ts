import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Client Documentation Milestone Reports integration", () => {
  it("registers a separate Documentation-guarded page without replacing existing routes", () => {
    const app = read("client/src/App.tsx");
    expect(app).toContain('import ClientDocsMilestoneReports from "./pages/ClientDocsMilestoneReports"');
    expect(app).toMatch(/<Route path="\/docs\/milestone-reports">\s*<PageGuard pageKey="client_docs"><ClientDocsMilestoneReports \/><\/PageGuard>/);
    for (const path of ["/docs", "/docs/dashboard", "/docs/clients/:id", "/docs/workflow", "/docs/national-visa"]) {
      expect(app).toContain(`<Route path="${path}">`);
    }
  });

  it("offers one report link under Documentation in both navigation layouts", () => {
    for (const path of ["client/src/components/DashboardLayout.tsx", "client/src/components/MobileLayout.tsx"]) {
      const source = read(path);
      expect(source.match(/path: "\/docs\/milestone-reports"/g)).toHaveLength(1);
      expect(source).toMatch(/id: "docs",[\s\S]*?label: "Milestone Reports", path: "\/docs\/milestone-reports"/);
    }
  });

  it("does not highlight Clients for other Documentation subpages", () => {
    expect(read("client/src/components/DashboardLayout.tsx")).toContain('(item.path !== "/docs" || location.startsWith("/docs/clients/"))');
  });

  it("wires a separate read-only namespace and refreshes on saved milestones", () => {
    expect(read("server/routers.ts")).toContain("documentationMilestoneReports: clientDocumentationMilestoneReportsRouter");
    expect(read("client/src/components/ClientDocumentationSpainMilestones.tsx")).toContain("utils.documentationMilestoneReports.report.invalidate()");
  });
});
