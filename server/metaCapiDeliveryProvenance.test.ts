import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractMetaResponseReceiptId,
  resolveMetaEventDeliveryContext,
  validateMetaTestEventRetryCandidate,
} from "./metaLeadsService";
import { dedupePrivacySafeMetaMonitoringRows } from "./metaAssignmentMonitoring";

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

  it("permits Retry as Test only for an explicitly marked Test Lead event held in manual review", () => {
    expect(validateMetaTestEventRetryCandidate(null)).toBe("META_TEST_EVENT_NOT_FOUND");
    expect(validateMetaTestEventRetryCandidate({ isTestLead: false, status: "manual_review" })).toBe("META_TEST_EVENT_REAL_LEAD_BLOCKED");
    expect(validateMetaTestEventRetryCandidate({ isTestLead: true, status: "pending" })).toBe("META_TEST_EVENT_NOT_IN_MANUAL_REVIEW");
    expect(validateMetaTestEventRetryCandidate({ isTestLead: true, status: "manual_review" })).toBeNull();
  });

  it("deduplicates one event joined to repeated webhook-delivery records", () => {
    const rows = dedupePrivacySafeMetaMonitoringRows([
      { attributionId: 1, eventLogId: 7, inboxProcessedAt: 100, inboxAttempts: 1, value: "older" },
      { attributionId: 1, eventLogId: 7, inboxProcessedAt: 200, inboxAttempts: 1, value: "newer" },
      { attributionId: 1, eventLogId: 8, inboxProcessedAt: 150, inboxAttempts: 1, value: "different-event" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.eventLogId === 7)?.value).toBe("newer");
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
  const holdMigration = read("drizzle/0059_meta_test_events_manual_review.sql");
  const cleanupMigration = read("drizzle/0060_meta_test_lead_assignment_cleanup.sql");

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

  it("holds new and existing unsent Test Lead events in manual review without touching real Lead events", () => {
    expect(service).toContain("const heldForManualReview = invalidHistoricalTime || isTestLead");
    expect(service).toContain('status: heldForManualReview ? "manual_review" : "pending"');
    expect(service).toContain('deliveryEvidenceCode: isTestLead ? "META_TEST_EVENT_CODE_REQUIRED" : null');
    expect(holdMigration).toContain("WHERE `isTestLead` = 1");
    expect(holdMigration).toContain("AND `status` IN ('pending', 'failed', 'retrying', 'approval_gated')");
    expect(holdMigration).not.toContain("WHERE `isTestLead` = 0");
  });

  it("uses a privacy-safe one-event Test Events control with a masked ephemeral code and explicit confirmation", () => {
    expect(monitoring).toContain("eventLogId: metaCrmEventLog.id");
    expect(metaOps).toContain('testLeadStatus: "test"');
    expect(metaOps).toContain('type="password"');
    expect(metaOps).toContain('autoComplete="off"');
    expect(metaOps).toContain("Confirm one Meta Test Event");
    expect(metaOps).toContain("eventLogId: pendingTestEvent.eventLogId");
    expect(metaOps).toContain('setTestEventCode("")');
    expect(adminRouter).toContain("retryMetaCrmEvent(input.eventLogId, input.testEventCode)");
  });

  it("prevents real Lead failures from presenting a Test retry action", () => {
    const failuresSection = metaOps.slice(
      metaOps.indexOf("Failures & Manual Review"),
      metaOps.indexOf("Controlled Meta Test Events"),
    );
    expect(failuresSection).toContain("They cannot be retried as Test Events");
    expect(failuresSection).not.toContain("Retry as Test");
    expect(service).toContain("META_TEST_EVENT_REAL_LEAD_BLOCKED");
    expect(service).toContain('eq(metaCrmEventLog.isTestLead, true)');
    expect(service).toContain('eq(metaCrmEventLog.status, "manual_review")');
  });

  it("removes synthetic assignments without deleting Lead, attribution, inbox, event, activity, or audit history", () => {
    expect(cleanupMigration).toContain("WHERE `isMetaTestLead` = 1");
    expect(cleanupMigration).toContain("`metaAssignmentStatus` = 'not_applicable'");
    expect(cleanupMigration).toContain("`outcome` = 'skipped_test'");
    expect(cleanupMigration).not.toMatch(/\bDELETE\b/i);
  });
});
