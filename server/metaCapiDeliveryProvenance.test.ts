import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractMetaResponseReceiptId,
  resolveMetaEventDeliveryContext,
} from "./metaLeadsService";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Meta CAPI delivery provenance", () => {
  it("holds real CRM events behind the production approval gate without dispatching a request", () => {
    expect(resolveMetaEventDeliveryContext({
      isTestLead: false,
      productionEnabled: false,
    })).toEqual({
      deliveryMode: "approval_gated",
      testEventCode: null,
      testEventCodeUsed: false,
      productionGateEnabledAtAttempt: false,
      blockedReason: "META_PRODUCTION_APPROVAL_REQUIRED",
    });
  });

  it("routes an explicit Test Events code to test mode even while production is disabled", () => {
    expect(resolveMetaEventDeliveryContext({
      isTestLead: true,
      testEventCode: "  TEST-123  ",
      productionEnabled: false,
    })).toEqual({
      deliveryMode: "test",
      testEventCode: "TEST-123",
      testEventCodeUsed: true,
      productionGateEnabledAtAttempt: false,
      blockedReason: null,
    });
  });

  it("requires an explicit Test Events code for a Test Lead", () => {
    const context = resolveMetaEventDeliveryContext({
      isTestLead: true,
      productionEnabled: false,
    });
    expect(context.deliveryMode).toBe("test");
    expect(context.blockedReason).toBe("META_TEST_EVENT_CODE_REQUIRED");
    expect(context.testEventCodeUsed).toBe(false);
  });

  it("marks approved real events as production mode", () => {
    expect(resolveMetaEventDeliveryContext({
      isTestLead: false,
      productionEnabled: true,
    }).deliveryMode).toBe("production");
  });

  it("retains only a privacy-safe Meta response receipt identifier", () => {
    expect(extractMetaResponseReceiptId({ fbtrace_id: "trace-123", events_received: 1 })).toBe("trace-123");
    expect(extractMetaResponseReceiptId({ events_received: 1 })).toBeNull();
  });
});

describe("Meta provenance implementation safeguards", () => {
  const schema = read("drizzle/schema.ts");
  const migration = read("drizzle/0058_meta_capi_delivery_provenance.sql");
  const service = read("server/metaLeadsService.ts");
  const monitoring = read("server/metaAssignmentMonitoring.ts");
  const connector = read("server/mcpServer.ts");
  const adminRouter = read("server/routers/leadsSettings.ts");
  const metaOps = read("client/src/pages/leads/MetaOperationsTab.tsx");

  it("persists delivery mode, gate state, dispatch time, receipt ID, and evidence code", () => {
    for (const field of [
      "deliveryMode",
      "testEventCodeUsed",
      "productionGateEnabledAtAttempt",
      "requestDispatchedAt",
      "metaResponseReceiptId",
      "deliveryEvidenceCode",
    ]) {
      expect(schema).toContain(field);
      expect(service).toContain(field);
    }
    expect(migration).toContain("LEGACY_SENT_STATUS_NO_PROVENANCE");
    expect(migration).not.toContain("testEventCode`");
  });

  it("does not count approval-gated or zero-attempt manual-review events as retry exhaustion", () => {
    expect(monitoring).toContain('eq(metaCrmEventLog.status, "dead_letter")');
    expect(monitoring).toContain("gte(metaCrmEventLog.attempts, 5)");
    expect(monitoring).toContain("approvalGatedEventCount");
  });

  it("adds a read-only Meta sync status filter without exposing PII or credentials", () => {
    expect(connector).toContain("metaSyncStatus:");
    expect(connector).toContain("getPrivacySafeMetaMonitoring(filters)");
    const safeQuery = monitoring.slice(
      monitoring.indexOf("export async function getPrivacySafeMetaMonitoring"),
      monitoring.indexOf("export async function collectMetaMonitoringSnapshot"),
    );
    expect(safeQuery).toContain("metaSyncStatus: leads.metaSyncStatus");
    expect(safeQuery).not.toContain("fullName:");
    expect(safeQuery).not.toContain("phone:");
    expect(safeQuery).not.toContain("email:");
    expect(safeQuery).not.toContain("accessToken");
  });

  it("returns gate-aware pending diagnostics and renders explicit loading and error states", () => {
    expect(adminRouter).toContain("oldestPendingAgeSeconds");
    expect(adminRouter).toContain("pendingNextAction");
    expect(metaOps).toContain('health.isLoading ? "Loading…"');
    expect(metaOps).toContain('assignmentPolicy.isLoading ? "Loading…"');
    expect(metaOps).toContain("Production approval gate is working");
    expect(metaOps).toContain("Legacy sent unknown");
  });
});
