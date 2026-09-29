import { describe, expect, it } from "vitest";
import {
  getMarketingSystemCapabilities,
  hasMarketingSystemCapability,
  isMarketingSystemRole,
} from "./marketingSystemAccess";

describe("Agentic Marketing System role policy", () => {
  it("recognizes only the four assignable marketing-system roles", () => {
    expect(isMarketingSystemRole("marketing_manager")).toBe(true);
    expect(isMarketingSystemRole("researcher")).toBe(true);
    expect(isMarketingSystemRole("creative_producer")).toBe(true);
    expect(isMarketingSystemRole("analyst")).toBe(true);
    expect(isMarketingSystemRole("admin")).toBe(false);
    expect(isMarketingSystemRole(null)).toBe(false);
  });

  it("keeps final publishing and campaign operations owner-only", () => {
    for (const role of ["marketing_manager", "researcher", "creative_producer", "analyst"] as const) {
      expect(hasMarketingSystemCapability(role, "approve_publishing")).toBe(false);
      expect(hasMarketingSystemCapability(role, "manage_campaigns")).toBe(false);
    }
    expect(hasMarketingSystemCapability("owner", "approve_publishing")).toBe(true);
    expect(hasMarketingSystemCapability("owner", "manage_campaigns")).toBe(true);
  });

  it("gives the intended production capabilities without granting an unassigned user anything", () => {
    expect(getMarketingSystemCapabilities(null)).toEqual([]);
    expect(hasMarketingSystemCapability("researcher", "create_research")).toBe(true);
    expect(hasMarketingSystemCapability("researcher", "manage_knowledge_sources")).toBe(true);
    expect(hasMarketingSystemCapability("researcher", "create_knowledge_claims")).toBe(true);
    expect(hasMarketingSystemCapability("researcher", "review_knowledge_claims")).toBe(false);
    expect(hasMarketingSystemCapability("researcher", "submit_work_orders")).toBe(true);
    expect(hasMarketingSystemCapability("researcher", "review_work_orders")).toBe(false);
    expect(hasMarketingSystemCapability("creative_producer", "create_creative")).toBe(true);
    expect(hasMarketingSystemCapability("creative_producer", "submit_work_orders")).toBe(true);
    expect(hasMarketingSystemCapability("analyst", "export_analytics")).toBe(true);
    expect(hasMarketingSystemCapability("analyst", "view_work_orders")).toBe(true);
    expect(hasMarketingSystemCapability("analyst", "submit_work_orders")).toBe(false);
    expect(hasMarketingSystemCapability("marketing_manager", "review_creative")).toBe(true);
    expect(hasMarketingSystemCapability("owner", "review_knowledge_claims")).toBe(true);
    expect(hasMarketingSystemCapability("owner", "review_work_orders")).toBe(true);
    expect(hasMarketingSystemCapability("owner", "run_work_order_dry_runs")).toBe(true);
  });
});
