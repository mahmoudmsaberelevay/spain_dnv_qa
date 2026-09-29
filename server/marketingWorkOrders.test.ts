import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  capabilityForWorkOrder,
  findDisallowedWorkOrderData,
  MARKETING_WORK_ORDER_ALLOWED_NEXT_STATES,
  MARKETING_WORK_ORDER_DEFAULT_SCHEMAS,
  workOrderCanTransition,
  workOrderRequiresApprovedClaims,
  workOrderRequiresBrandBook,
} from "../shared/marketingWorkOrders";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Agentic Marketing Phase 3 controlled work-order policy", () => {
  it("defines typed output schemas, blocked terminal states, and an explicit review state machine", () => {
    expect(MARKETING_WORK_ORDER_DEFAULT_SCHEMAS.source_research.artifactType).toBe("FactProposal");
    expect(MARKETING_WORK_ORDER_DEFAULT_SCHEMAS.creative_package.artifactType).toBe("CreativePackage");
    expect(MARKETING_WORK_ORDER_ALLOWED_NEXT_STATES.draft).toEqual(["submitted", "cancelled"]);
    expect(workOrderCanTransition("submitted", "approved")).toBe(true);
    expect(workOrderCanTransition("draft", "approved")).toBe(false);
    expect(workOrderCanTransition("rejected", "submitted")).toBe(false);
  });

  it("keeps research minimally gated while requiring an approved Brand Book and claims for downstream creative work", () => {
    expect(workOrderRequiresBrandBook("source_research")).toBe(false);
    expect(workOrderRequiresApprovedClaims("source_research")).toBe(false);
    expect(workOrderRequiresBrandBook("creative_package")).toBe(true);
    expect(workOrderRequiresApprovedClaims("creative_package")).toBe(true);
    expect(capabilityForWorkOrder("source_research")).toBe("create_research");
    expect(capabilityForWorkOrder("media_render_brief")).toBe("create_creative");
    expect(capabilityForWorkOrder("qa_review")).toBe("review_creative");
  });

  it("rejects contact and client identity data from model-ready work-order text", () => {
    expect(findDisallowedWorkOrderData("Use info@example.com to reach the client")).toBe("email address");
    expect(findDisallowedWorkOrderData("Call +20 100 123 4567 after the consultation")).toBe("phone or contact number");
    expect(findDisallowedWorkOrderData("Use the passport number for this brief")).toBe("client identity reference");
    expect(findDisallowedWorkOrderData("Compare official programme source dates without personal data.")).toBeNull();
  });

  it("uses an additive lineage schema and forbids provider execution in the dry-run contract", () => {
    const migration = read("drizzle/0093_agentic_marketing_work_orders.sql");
    const router = read("server/marketingSystemRouter.ts");
    const page = read("client/src/pages/marketing/WorkOrders.tsx");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_work_orders`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_work_order_artifacts`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_work_order_events`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `marketing_work_order_cost_ledger`");
    expect(migration).not.toMatch(/\b(DROP|DELETE|UPDATE|ALTER|TRUNCATE)\b/i);
    expect(router).toContain("Phase 3 has no provider-execution path by design.");
    expect(router).toContain("executionAllowed: false");
    expect(router).toContain("No provider request, media generation, publication, campaign change, or charge occurred.");
    expect(page).toContain("This workspace is not an autonomous agent, publishing tool, client-messaging tool, or spend-control panel.");
  });
});
