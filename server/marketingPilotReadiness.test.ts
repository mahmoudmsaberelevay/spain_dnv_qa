import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPilotReadiness, EXECUTIVE_MEASUREMENT_WINDOW_DAYS } from "../shared/marketingExecutiveMeasurement";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const now = 1_790_680_000_000;

function readyInput() {
  return {
    now,
    activeBrandBookCount: 1,
    approvedStrategyPacketCount: 1,
    internallyApprovedPilotProposalCount: 1,
    monitoringCapturedAt: now - 1_000,
    reconciliationStatus: "success",
    reconciliationLastSuccessAt: now - 1_000,
    latestAttributionCoverageBps: 10_000,
    latestFailedInboxCount: 0,
    latestRetryInboxCount: 0,
    latestTestLeadLeakageCount: 0,
    metaEventAttentionCount: 0,
    pilotActualEvidenceAvailable: true,
    spendReconciliationAvailable: true,
  };
}

describe("Pilot Readiness and Executive Measurement", () => {
  it("requires real pilot attribution and spend reconciliation evidence before optimisation can be ready", () => {
    const input = readyInput();
    expect(buildPilotReadiness(input).status).toBe("ready");
    expect(buildPilotReadiness({ ...input, pilotActualEvidenceAvailable: false }).status).toBe("blocked");
    expect(buildPilotReadiness({ ...input, spendReconciliationAvailable: false }).status).toBe("blocked");
  });

  it("flags stale monitoring, test leakage, queue exceptions, and missing prerequisite controls without authorising an action", () => {
    const result = buildPilotReadiness({
      ...readyInput(),
      activeBrandBookCount: 0,
      monitoringCapturedAt: now - 27 * 60 * 60 * 1_000,
      latestTestLeadLeakageCount: 1,
      metaEventAttentionCount: 2,
    });
    expect(result.status).toBe("blocked");
    expect(result.gates.find(gate => gate.key === "brand_book")?.status).toBe("blocked");
    expect(result.gates.find(gate => gate.key === "monitoring")?.status).toBe("attention");
    expect(result.gates.find(gate => gate.key === "attribution_quality")?.status).toBe("attention");
  });

  it("uses a ninety-day aggregate window and exposes no individual CRM identity in the endpoint or page contract", () => {
    expect(EXECUTIVE_MEASUREMENT_WINDOW_DAYS).toBe(90);
    const router = read("server/marketingSystemRouter.ts");
    const page = read("client/src/pages/marketing/PilotReadinessDashboard.tsx");
    expect(router).toContain("getPilotReadinessExecutiveDashboard");
    expect(router).toContain('requireCapability(ctx.user, "view_analytics")');
    expect(router).toContain("INTERVAL 90 DAY");
    expect(router).not.toContain("getPilotReadinessExecutiveDashboard: protectedProcedure.mutation");
    expect(page).toContain("Aggregate CRM counts only");
    expect(page).toContain("cannot connect Meta, create or alter campaigns, spend money");
    expect(page).not.toContain("fullName");
    expect(page).not.toContain("phone");
    expect(page).not.toContain("email");
  });
});
