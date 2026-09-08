import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decideMetaAssignment,
  evaluateConsultantResolution,
  META_DEFAULT_CONSULTANT_POLICY,
  META_MONITORING_BASELINE_MS,
} from "./metaAssignmentMonitoring";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const validCandidate = {
  id: 19,
  name: "Nouran Mamdouh",
  hasCompanyEmail: true,
  recentlyActive: true,
  hasLeadsAccess: true,
};

describe("Meta default consultant resolution", () => {
  it("resolves exactly one active Nouran record that matches the persisted policy", () => {
    expect(evaluateConsultantResolution({ candidates: [validCandidate], policyConsultantUserId: 19 }))
      .toEqual({ status: "resolved", candidate: validCandidate });
  });

  it("fails closed for missing, inactive, ambiguous, or policy-mismatched records", () => {
    expect(evaluateConsultantResolution({ candidates: [], policyConsultantUserId: 19 }).status).toBe("missing");
    expect(evaluateConsultantResolution({ candidates: [{ ...validCandidate, recentlyActive: false }], policyConsultantUserId: 19 }).status).toBe("missing");
    expect(evaluateConsultantResolution({ candidates: [validCandidate, { ...validCandidate, id: 20 }], policyConsultantUserId: 19 }).status).toBe("ambiguous");
    expect(evaluateConsultantResolution({ candidates: [validCandidate], policyConsultantUserId: 99 }).status).toBe("policy_mismatch");
  });

  it("uses the named server policy and exact PDF monitoring baseline", () => {
    expect(META_DEFAULT_CONSULTANT_POLICY).toBe("META_DEFAULT_CONSULTANT");
    expect(META_MONITORING_BASELINE_MS).toBe(1_788_547_867_000);
  });
});

describe("Meta Lead assignment decisions", () => {
  it("assigns a new or unassigned real Meta Lead when the policy is resolved", () => {
    expect(decideMetaAssignment({ isTestLead: false, ambiguousMatch: false, existingConsultant: null, policyResolved: true })).toBe("assigned");
  });

  it("preserves an existing consultant", () => {
    expect(decideMetaAssignment({ isTestLead: false, ambiguousMatch: false, existingConsultant: "Existing Consultant", policyResolved: true })).toBe("preserved");
  });

  it("never assigns a Test Lead and routes ambiguity to manual review", () => {
    expect(decideMetaAssignment({ isTestLead: true, ambiguousMatch: false, existingConsultant: null, policyResolved: true })).toBe("skipped_test");
    expect(decideMetaAssignment({ isTestLead: false, ambiguousMatch: true, existingConsultant: null, policyResolved: true })).toBe("manual_review");
  });

  it("leaves a real Lead assignment pending when the policy cannot be resolved", () => {
    expect(decideMetaAssignment({ isTestLead: false, ambiguousMatch: false, existingConsultant: null, policyResolved: false })).toBe("pending");
  });
});

describe("durable implementation safeguards", () => {
  const assignment = read("server/metaAssignmentMonitoring.ts");
  const service = read("server/metaLeadsService.ts");
  const webhook = read("server/metaAdsWebhook.ts");
  const router = read("server/routers/leadsSettings.ts");
  const connector = read("server/mcpServer.ts");
  const email = read("server/emailService.ts");
  const contactMatcher = read("server/leadContactMatcher.ts");
  const notificationRecipients = read("server/systemNotificationRecipients.ts");
  const html = read("client/index.html");
  const migration = read("drizzle/0055_meta_nouran_assignment_monitoring.sql");
  const suppressionMigration = read("drizzle/0056_meta_notification_suppression.sql");

  it("creates Lead, attribution, assignment, and audit inside one transaction", () => {
    expect(service).toContain("transactionResult = await db.transaction(async tx =>");
    expect(service).toContain("await addAttribution(leadId, attribution, true, tx)");
    expect(service).toContain("await applyMetaAssignment({");
    expect(service).toContain("}, tx)");
    expect(assignment).toContain("metaLeadAssignmentAudits");
    expect(assignment).toContain("assignmentKey: `meta_default:${input.metaLeadId}`");
  });

  it("prevents real and Test Lead contact matching from crossing markers", () => {
    expect(assignment).toContain("isMetaTestLead: input.isTestLead");
    expect(contactMatcher).toContain("eq(leads.isMetaTestLead, input.isMetaTestLead ?? false)");
    expect(service).toContain("if (!isTestLead && assignment.outcome === \"assigned\")");
    expect(service).toContain("metaAssignmentStatus: isTestLead ? \"not_applicable\" : \"pending\"");
  });

  it("uses durable, deterministic notification keys and no browser-side token storage", () => {
    expect(assignment).toContain("notificationKey: `lead_alert:${input.metaLeadId}`");
    expect(migration).toContain("notification_key_unique");
    expect(email).toContain("assignedEmail?: string | null");
    expect(email).toContain("const recipients = new Set(MAHMOUD_EMAILS)");
    expect(email).toContain("isAllowedSystemEmailSender(sender)");
    expect(notificationRecipients).toContain('endsWith("@elevay.com")');
    expect(html).not.toContain("connect.facebook.net/en_US/fbevents.js");
  });

  it("runs backfill as a PII-free dry run and excludes unsafe records", () => {
    expect(assignment).toContain("candidateLeadIds: rows.map(row => row.id)");
    expect(assignment).toContain("eq(leads.isMetaTestLead, false)");
    expect(assignment).toContain("a.ambiguousMatch = 0");
    expect(assignment).toContain("system:meta_backfill");
    expect(assignment).toContain("auditKey: `meta_backfill:${leadId}`");
  });

  it("suppresses historical backfill notifications while preserving new-ingestion alerts", () => {
    const backfillBlock = assignment.slice(
      assignment.indexOf("export async function applyMetaAssignmentBackfill"),
      assignment.indexOf("export async function recoverUnassignedMetaLeads"),
    );
    expect(backfillBlock).not.toContain("queueMetaLeadAlert");
    expect(suppressionMigration).toContain("META_BACKFILL_NOTIFICATION_SUPPRESSED");
    expect(suppressionMigration).toContain("'suppressed'");
    expect(service).toContain("await queueMetaLeadAlert({ leadId, metaLeadId: meta.id })");
  });

  it("records signed webhook and signature failures without request payloads", () => {
    expect(webhook).toContain('recordMetaWebhookSecurityEvent("signed_accepted"');
    expect(webhook).toContain('recordMetaWebhookSecurityEvent("signature_failure"');
    expect(assignment).toContain("metaWebhookSecurityEvents").and.toContain("safeCode: safeCodeValue");
  });

  it("keeps every Meta monitoring and backfill procedure administrator-only", () => {
    expect(router).toContain("monitoring: adminProcedure");
    expect(router).toContain("assignmentPolicy: adminProcedure");
    expect(router).toContain("assignmentBackfillDryRun: adminProcedure");
    expect(router).toContain("runAssignmentBackfill: adminProcedure");
    expect(router).toContain("privacySafeMonitoring: adminProcedure");
  });

  it("exposes a read-only privacy-safe connector operation with no raw contact fields", () => {
    expect(connector).toContain('server.registerTool("get_meta_lead_monitoring"');
    expect(connector).toContain("getPrivacySafeMetaMonitoring(filters)");
    const safeQuery = assignment.slice(
      assignment.indexOf("export async function getPrivacySafeMetaMonitoring"),
      assignment.indexOf("export async function collectMetaMonitoringSnapshot"),
    );
    expect(safeQuery).not.toContain("fullName:");
    expect(safeQuery).not.toContain("phone:");
    expect(safeQuery).not.toContain("email:");
    expect(safeQuery).not.toContain("field_data");
    expect(safeQuery).not.toContain("accessToken");
  });

  it("keeps production CAPI approval-gated and Test Leads outside production sending", () => {
    expect(service).toContain('process.env.META_CRM_PRODUCTION_ENABLED === "true"');
    expect(service).toContain('delivery.blockedReason === "META_TEST_EVENT_CODE_REQUIRED"');
    expect(service).toContain('delivery.blockedReason === "META_PRODUCTION_APPROVAL_REQUIRED"');
    expect(assignment).toContain("productionSendingEnabled");
  });

  it("recovers assignment, retries notifications, and stores monitoring on Heartbeat reconciliation", () => {
    expect(service).toContain("const assignments = await recoverUnassignedMetaLeads()");
    expect(service).toContain("const notifications = await processMetaNotificationOutbox");
    expect(service).toContain("const monitoring = await collectMetaMonitoringSnapshot()");
  });
});
