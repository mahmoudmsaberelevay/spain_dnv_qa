import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Marketing System Work Orders integration contract", () => {
  it("requires role capability for creation and owner review before the dry-run path", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("await requireCapability(ctx.user, capabilityForWorkOrder(input.workType))");
    expect(router).toContain("await requireCapability(ctx.user, \"submit_work_orders\")");
    expect(router).toContain("await requireMarketingSystemAdministrator(ctx.user);");
    expect(router).toContain("Only an owner-approved work order can run a dry-run validation.");
    expect(router).toContain("Only the work-order creator or a scoped Agentic Marketing administrator can submit it.");
  });

  it("preserves source, Brand Book, cost and output-schema lineage on every new work order", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("MARKETING_WORK_ORDER_DEFAULT_SCHEMAS[input.workType]");
    expect(router).toContain("knowledgeClaimIdsJson");
    expect(router).toContain("brandBookVersion");
    expect(router).toContain("costCeilingUsd");
    expect(router).toContain("marketingWorkOrderCostLedger");
    expect(router).toContain("appendWorkOrderEvent");
    expect(router).toContain("findDisallowedWorkOrderData");
  });

  it("keeps data mutation non-destructive and makes cancellation auditable rather than deleting orders", () => {
    const router = read("server/marketingSystemRouter.ts");
    expect(router).toContain("cancelWorkOrder");
    expect(router).toContain("status: \"cancelled\"");
    expect(router).not.toContain("delete(marketingWorkOrders)");
    expect(router).not.toContain("delete(marketingWorkOrderArtifacts)");
    expect(router).not.toContain("delete(marketingWorkOrderEvents)");
  });

  it("wires the responsive CRM route and Marketing navigation entry", () => {
    const app = read("client/src/App.tsx");
    const dashboard = read("client/src/pages/marketing/MarketingDashboard.tsx");
    const mobile = read("client/src/components/MobileLayout.tsx");
    expect(app).toContain('path="/marketing/work-orders"');
    expect(dashboard).toContain('href: "/marketing/work-orders"');
    expect(mobile).toContain('label: "Work Orders", path: "/marketing/work-orders"');
  });
});
