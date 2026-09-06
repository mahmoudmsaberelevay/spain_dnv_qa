import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  leadActivities,
  leadMetaAttributions,
  leads,
  leadsPermissions,
  metaAssignmentPolicies,
  metaCrmEventLog,
  metaLeadAssignmentAudits,
  metaMonitoringSnapshots,
  metaNotificationLog,
  metaReconciliationState,
  metaWebhookInbox,
  metaWebhookSecurityEvents,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { sendMetaLeadAlert, sendMetaOperationalAlert } from "./emailService";

export const META_DEFAULT_CONSULTANT_POLICY = "META_DEFAULT_CONSULTANT";
export const META_MONITORING_BASELINE_MS = 1_788_547_867_000;
const NOURAN_NORMALIZED_NAME = "nouran mamdouh";
const CONSULTANT_ACTIVE_WINDOW_MS = 180 * 24 * 60 * 60_000;
const MONITORING_WINDOW_MS = 24 * 60 * 60_000;
const NOTIFICATION_RETRY_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

export type MetaMatchMethod = "new_lead" | "meta_lead_id" | "phone" | "email";
export type MetaAssignmentOutcome = "assigned" | "preserved" | "pending" | "manual_review" | "skipped_test";

type SafeConsultantCandidate = {
  id: number;
  name: string;
  hasCompanyEmail: boolean;
  recentlyActive: boolean;
  hasLeadsAccess: boolean;
};

export type ResolvedMetaConsultant = {
  status: "resolved";
  id: number;
  name: string;
  email: string;
  backfillBaselineAt: number;
} | {
  status: "missing" | "ambiguous" | "inactive" | "policy_mismatch";
  safeCode: string;
  candidates: SafeConsultantCandidate[];
};

export type MetaLeadMatch = {
  status: "new" | "matched" | "ambiguous";
  method: MetaMatchMethod | null;
  lead: typeof leads.$inferSelect | null;
  candidateLeadIds: number[];
};

function normalizeName(value: string | null | undefined) {
  return (value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function safeCode(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  if (/assignment policy/i.test(value)) return "META_ASSIGNMENT_POLICY_UNAVAILABLE";
  if (/ambiguous/i.test(value)) return "META_CONTACT_MATCH_AMBIGUOUS";
  if (/email/i.test(value)) return "META_NOTIFICATION_DELIVERY_FAILED";
  return "META_OPERATION_FAILED";
}

function percentile(values: number[], percentileValue: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue * sorted.length) - 1));
  return Math.round(sorted[index]);
}

export function evaluateConsultantResolution(input: {
  candidates: SafeConsultantCandidate[];
  policyConsultantUserId: number | null;
}) {
  const active = input.candidates.filter(candidate =>
    candidate.hasCompanyEmail && candidate.recentlyActive && candidate.hasLeadsAccess,
  );
  if (active.length === 0) return { status: "missing" as const, safeCode: "META_DEFAULT_CONSULTANT_MISSING" };
  if (active.length > 1) return { status: "ambiguous" as const, safeCode: "META_DEFAULT_CONSULTANT_AMBIGUOUS" };
  if (!input.policyConsultantUserId || input.policyConsultantUserId !== active[0].id) {
    return { status: "policy_mismatch" as const, safeCode: "META_DEFAULT_CONSULTANT_POLICY_MISMATCH" };
  }
  return { status: "resolved" as const, candidate: active[0] };
}

export async function resolveMetaDefaultConsultant(): Promise<ResolvedMetaConsultant> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const timestamp = Date.now();
  const candidateRows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    lastSignedIn: users.lastSignedIn,
    canView: leadsPermissions.canView,
  }).from(users)
    .innerJoin(leadsPermissions, eq(leadsPermissions.userId, users.id))
    .where(and(
      sql`LOWER(TRIM(REGEXP_REPLACE(COALESCE(${users.name}, ''), '[[:space:]]+', ' '))) = ${NOURAN_NORMALIZED_NAME}`,
      eq(leadsPermissions.canView, true),
    ));
  const candidates: SafeConsultantCandidate[] = candidateRows.map(row => ({
    id: row.id,
    name: row.name || "Nouran Mamdouh",
    hasCompanyEmail: Boolean(row.email?.toLowerCase().endsWith("@elevay.com")),
    recentlyActive: new Date(row.lastSignedIn).getTime() >= timestamp - CONSULTANT_ACTIVE_WINDOW_MS,
    hasLeadsAccess: Boolean(row.canView),
  }));
  const [policy] = await db.select().from(metaAssignmentPolicies)
    .where(and(eq(metaAssignmentPolicies.policyKey, META_DEFAULT_CONSULTANT_POLICY), eq(metaAssignmentPolicies.isActive, true)))
    .limit(1);
  const evaluation = evaluateConsultantResolution({
    candidates,
    policyConsultantUserId: policy?.consultantUserId ?? null,
  });
  if (evaluation.status !== "resolved") {
    return { status: evaluation.status, safeCode: evaluation.safeCode, candidates };
  }
  const row = candidateRows.find(candidate => candidate.id === evaluation.candidate.id);
  if (!row?.email || normalizeName(row.name) !== NOURAN_NORMALIZED_NAME) {
    return { status: "inactive", safeCode: "META_DEFAULT_CONSULTANT_INACTIVE", candidates };
  }
  return {
    status: "resolved",
    id: row.id,
    name: row.name || "Nouran Mamdouh",
    email: row.email,
    backfillBaselineAt: policy?.backfillBaselineAt ?? META_MONITORING_BASELINE_MS,
  };
}

export async function resolveMetaLeadMatch(input: {
  metaLeadId: string;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
  isTestLead: boolean;
}): Promise<MetaLeadMatch> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [directLead] = await db.select().from(leads).where(eq(leads.metaLeadId, input.metaLeadId)).limit(1);
  if (directLead) return { status: "matched", method: "meta_lead_id", lead: directLead, candidateLeadIds: [directLead.id] };
  const [directAttribution] = await db.select({ leadId: leadMetaAttributions.leadId })
    .from(leadMetaAttributions).where(eq(leadMetaAttributions.metaLeadId, input.metaLeadId)).limit(1);
  if (directAttribution) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, directAttribution.leadId)).limit(1);
    if (lead) return { status: "matched", method: "meta_lead_id", lead, candidateLeadIds: [lead.id] };
  }
  const contactConditions = [];
  if (input.normalizedPhone) contactConditions.push(eq(leads.normalizedPhone, input.normalizedPhone));
  if (input.normalizedEmail) contactConditions.push(eq(leads.normalizedEmail, input.normalizedEmail));
  if (!contactConditions.length) return { status: "new", method: "new_lead", lead: null, candidateLeadIds: [] };
  const rows = await db.select().from(leads).where(and(
    eq(leads.isMetaTestLead, input.isTestLead),
    or(...contactConditions),
  )).orderBy(asc(leads.createdAt)).limit(10);
  const distinct = Array.from(new Map(rows.map(row => [row.id, row])).values());
  if (distinct.length > 1) {
    return { status: "ambiguous", method: null, lead: null, candidateLeadIds: distinct.map(row => row.id) };
  }
  if (!distinct.length) return { status: "new", method: "new_lead", lead: null, candidateLeadIds: [] };
  const lead = distinct[0];
  const method: MetaMatchMethod = input.normalizedPhone && lead.normalizedPhone === input.normalizedPhone ? "phone" : "email";
  return { status: "matched", method, lead, candidateLeadIds: [lead.id] };
}

export function decideMetaAssignment(input: {
  isTestLead: boolean;
  ambiguousMatch: boolean;
  existingConsultant: string | null;
  policyResolved: boolean;
}): MetaAssignmentOutcome {
  if (input.isTestLead) return "skipped_test";
  if (input.ambiguousMatch) return "manual_review";
  if (input.existingConsultant?.trim()) return "preserved";
  if (!input.policyResolved) return "pending";
  return "assigned";
}

export async function recordAmbiguousMetaInquiry(input: {
  inboxId: number;
  metaLeadId: string;
  candidateLeadIds: number[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const timestamp = Date.now();
  await db.transaction(async tx => {
    await tx.update(metaWebhookInbox).set({
      status: "manual_review",
      ambiguousMatch: true,
      requiresManualReview: true,
      manualReviewReason: "CONTACT_MATCH_AMBIGUOUS",
      assignmentStatus: "manual_review",
      lastErrorCode: "META_CONTACT_MATCH_AMBIGUOUS",
      lastError: "Multiple existing Lead records matched normalized contact identifiers",
      updatedAt: timestamp,
    }).where(eq(metaWebhookInbox.id, input.inboxId));
    await tx.insert(metaLeadAssignmentAudits).values({
      assignmentKey: `meta_default:${input.metaLeadId}`,
      leadId: null,
      metaLeadId: input.metaLeadId,
      previousConsultant: null,
      newConsultantUserId: null,
      newConsultant: null,
      outcome: "manual_review",
      createdAt: timestamp,
    }).onDuplicateKeyUpdate({ set: { assignmentKey: `meta_default:${input.metaLeadId}` } });
  });
  await queueMetaAdminAlert({
    notificationKey: `admin:ambiguous:${input.metaLeadId}`,
    safeAlertCode: "META_CONTACT_MATCH_AMBIGUOUS",
    leadId: input.candidateLeadIds[0] ?? null,
  });
}

export async function applyMetaAssignment(input: {
  leadId: number;
  metaLeadId: string;
  isTestLead: boolean;
  matchMethod: MetaMatchMethod;
  routingConsultant: ResolvedMetaConsultant;
  auditKey?: string;
  systemActor?: string;
}, executor?: any) {
  const db = executor || await getDb();
  if (!db) throw new Error("Database unavailable");
  const timestamp = Date.now();
  const execute = async (tx: any) => {
    const assignmentKey = input.auditKey || `meta_default:${input.metaLeadId}`;
    const [existingAudit] = await tx.select().from(metaLeadAssignmentAudits)
      .where(eq(metaLeadAssignmentAudits.assignmentKey, assignmentKey)).limit(1);
    if (existingAudit) {
      return {
        outcome: existingAudit.outcome as MetaAssignmentOutcome,
        consultant: input.routingConsultant.status === "resolved" ? input.routingConsultant : null,
        duplicate: true,
      };
    }
    const [lead] = await tx.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
    if (!lead) throw new Error(`Lead ${input.leadId} not found`);
    const outcome = decideMetaAssignment({
      isTestLead: input.isTestLead,
      ambiguousMatch: false,
      existingConsultant: lead.assignedTo,
      policyResolved: input.routingConsultant.status === "resolved",
    });
    const resolved = input.routingConsultant.status === "resolved" ? input.routingConsultant : null;
    if (outcome === "assigned" && resolved) {
      await tx.update(leads).set({
        assignedTo: resolved.name,
        assignedConsultantUserId: resolved.id,
        metaAssignmentStatus: "assigned",
        metaAssignmentErrorCode: null,
        metaAssignmentUpdatedAt: timestamp,
        updatedAt: timestamp,
      }).where(and(eq(leads.id, lead.id), or(sql`${leads.assignedTo} IS NULL`, eq(leads.assignedTo, ""))));
      await tx.insert(leadActivities).values({
        leadId: lead.id,
        userId: null,
        activityType: "assigned",
        description: `Assigned automatically to ${resolved.name} by META_DEFAULT_CONSULTANT`,
        score: 0,
        createdAt: timestamp,
      });
      await tx.update(metaNotificationLog).set({
        status: "suppressed",
        recipientCount: 0,
        lastError: "META_ASSIGNMENT_ALERT_RESOLVED",
        nextAttemptAt: null,
        updatedAt: timestamp,
      }).where(and(
        eq(metaNotificationLog.notificationType, "admin_alert"),
        eq(metaNotificationLog.leadId, lead.id),
        eq(metaNotificationLog.safeAlertCode, "META_REAL_LEAD_UNASSIGNED_OVER_10_MINUTES"),
        or(eq(metaNotificationLog.status, "pending"), eq(metaNotificationLog.status, "failed")),
      ));
    } else if (outcome === "preserved") {
      await tx.update(leads).set({
        metaAssignmentStatus: "preserved",
        metaAssignmentErrorCode: null,
        metaAssignmentUpdatedAt: timestamp,
        updatedAt: timestamp,
      }).where(eq(leads.id, lead.id));
    } else if (outcome === "pending") {
      const errorCode = input.routingConsultant.status === "resolved" ? "META_ASSIGNMENT_PENDING" : input.routingConsultant.safeCode;
      await tx.update(leads).set({
        metaAssignmentStatus: "pending",
        metaAssignmentErrorCode: errorCode,
        metaAssignmentUpdatedAt: timestamp,
        updatedAt: timestamp,
      }).where(eq(leads.id, lead.id));
    }
    await tx.insert(metaLeadAssignmentAudits).values({
      assignmentKey,
      leadId: lead.id,
      metaLeadId: input.metaLeadId,
      previousConsultant: lead.assignedTo || null,
      newConsultantUserId: outcome === "assigned" ? resolved?.id ?? null : null,
      newConsultant: outcome === "assigned" ? resolved?.name ?? null : null,
      outcome,
      systemActor: input.systemActor || "system:meta_ingestion",
      createdAt: timestamp,
    }).onDuplicateKeyUpdate({ set: { assignmentKey } });
    return { outcome, consultant: resolved, duplicate: false };
  };
  return executor ? execute(executor) : db.transaction(execute);
}

export async function updateMetaAttributionRouting(input: {
  metaLeadId: string;
  matchMethod: MetaMatchMethod;
  duplicateIndicator: boolean;
  consultant: ResolvedMetaConsultant;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const resolved = input.consultant.status === "resolved" ? input.consultant : null;
  await db.update(leadMetaAttributions).set({
    routingConsultantUserId: resolved?.id ?? null,
    routingConsultantDisplayName: resolved?.name ?? null,
    matchMethod: input.matchMethod,
    duplicateIndicator: input.duplicateIndicator,
    ambiguousMatch: false,
    updatedAt: Date.now(),
  }).where(eq(leadMetaAttributions.metaLeadId, input.metaLeadId));
}

export async function updateMetaInboxOutcome(input: {
  inboxId: number;
  matchMethod: MetaMatchMethod;
  duplicateIndicator: boolean;
  assignmentStatus: MetaAssignmentOutcome;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(metaWebhookInbox).set({
    matchMethod: input.matchMethod,
    duplicateIndicator: input.duplicateIndicator,
    assignmentStatus: input.assignmentStatus === "skipped_test" ? "not_applicable" : input.assignmentStatus,
    requiresManualReview: input.assignmentStatus === "manual_review",
    updatedAt: Date.now(),
  }).where(eq(metaWebhookInbox.id, input.inboxId));
}

export async function queueMetaLeadAlert(input: {
  leadId: number;
  metaLeadId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const timestamp = Date.now();
  await db.insert(metaNotificationLog).values({
    notificationKey: `lead_alert:${input.metaLeadId}`,
    notificationType: "lead_alert",
    leadId: input.leadId,
    metaLeadId: input.metaLeadId,
    safeAlertCode: "META_REAL_LEAD_ASSIGNED",
    status: "pending",
    attempts: 0,
    recipientCount: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onDuplicateKeyUpdate({ set: { notificationKey: `lead_alert:${input.metaLeadId}` } });
}

export async function queueMetaAdminAlert(input: {
  notificationKey: string;
  safeAlertCode: string;
  leadId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const timestamp = Date.now();
  await db.insert(metaNotificationLog).values({
    notificationKey: input.notificationKey,
    notificationType: "admin_alert",
    leadId: input.leadId ?? null,
    safeAlertCode: input.safeAlertCode,
    status: "pending",
    attempts: 0,
    recipientCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onDuplicateKeyUpdate({ set: { notificationKey: input.notificationKey } });
}

const ADMIN_ALERT_SUMMARIES: Record<string, string> = {
  META_DEFAULT_CONSULTANT_MISSING: "The configured default Meta consultant could not be resolved safely.",
  META_DEFAULT_CONSULTANT_AMBIGUOUS: "Multiple active consultant records matched the Meta assignment policy.",
  META_DEFAULT_CONSULTANT_POLICY_MISMATCH: "The Meta assignment policy no longer matches the single active Nouran record.",
  META_DEFAULT_CONSULTANT_INACTIVE: "The configured Meta consultant is inactive or unavailable.",
  META_CONTACT_MATCH_AMBIGUOUS: "A Meta inquiry matched multiple existing Lead records and requires manual review.",
  META_REAL_LEAD_UNASSIGNED_OVER_10_MINUTES: "A real Meta Lead has remained unassigned for more than 10 minutes.",
  META_WEBHOOK_STALE: "No signed Meta webhook has been received within the monitoring threshold.",
  META_RECONCILIATION_STALE: "Meta reconciliation is stale or failed.",
  META_EVENT_RETRY_EXHAUSTED: "A Meta CRM event exhausted its retry allowance.",
  META_WEBHOOK_ACCEPTANCE_BELOW_99: "Signed Meta webhook acceptance is below the 99% objective.",
  META_LEAD_ID_COVERAGE_BELOW_98: "Meta Lead ID coverage is below the 98% objective.",
  META_INGESTION_DELAY_ABOVE_5_MINUTES: "Meta Lead ingestion P95 is above five minutes.",
  META_STAGE_ORDER_VIOLATION: "A CRM event is missing the required earlier Meta funnel event.",
  META_DUPLICATE_ATTRIBUTION: "Duplicate immutable Meta attribution was detected.",
  META_TEST_LEAD_REPORTING_LEAKAGE: "A Meta Test Lead marker is inconsistent across operational reporting layers.",
};

export async function processMetaNotificationOutbox(limit = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const timestamp = Date.now();
  const rows = await db.select().from(metaNotificationLog).where(and(
    inArray(metaNotificationLog.status, ["pending", "failed"]),
    or(sql`${metaNotificationLog.nextAttemptAt} IS NULL`, lte(metaNotificationLog.nextAttemptAt, timestamp)),
  )).orderBy(asc(metaNotificationLog.createdAt)).limit(Math.max(1, Math.min(50, limit)));
  let sent = 0;
  let failed = 0;
  for (const notification of rows) {
    const attempt = notification.attempts + 1;
    try {
      let delivered = false;
      if (notification.notificationType === "lead_alert" && notification.leadId && notification.metaLeadId) {
        const [lead] = await db.select().from(leads).where(eq(leads.id, notification.leadId)).limit(1);
        if (!lead || lead.isMetaTestLead) {
          await db.update(metaNotificationLog).set({ status: "sent", sentAt: timestamp, updatedAt: timestamp })
            .where(eq(metaNotificationLog.id, notification.id));
          continue;
        }
        const [consultant] = lead.assignedConsultantUserId
          ? await db.select({ email: users.email }).from(users).where(eq(users.id, lead.assignedConsultantUserId)).limit(1)
          : [];
        delivered = await sendMetaLeadAlert({
          leadName: lead.fullName,
          phone: lead.phone || lead.whatsapp || "Not provided",
          assignedTo: lead.assignedTo,
          assignedEmail: consultant?.email || null,
          program: lead.interestedProgram,
          campaign: lead.metaCampaign,
        });
      } else {
        delivered = await sendMetaOperationalAlert({
          safeCode: notification.safeAlertCode || "META_OPERATIONAL_ALERT",
          summary: ADMIN_ALERT_SUMMARIES[notification.safeAlertCode || ""] || "Meta Leads requires administrator review.",
          leadId: notification.leadId,
        });
      }
      if (!delivered) throw new Error("Email delivery failed");
      await db.update(metaNotificationLog).set({ status: "sent", attempts: attempt, sentAt: Date.now(), lastError: null, nextAttemptAt: null, updatedAt: Date.now() })
        .where(eq(metaNotificationLog.id, notification.id));
      sent += 1;
    } catch (error) {
      await db.update(metaNotificationLog).set({
        status: "failed",
        attempts: attempt,
        lastError: safeCode(error),
        nextAttemptAt: Date.now() + NOTIFICATION_RETRY_MS[Math.min(attempt - 1, NOTIFICATION_RETRY_MS.length - 1)],
        updatedAt: Date.now(),
      }).where(eq(metaNotificationLog.id, notification.id));
      failed += 1;
    }
  }
  return { sent, failed };
}

export async function recordMetaWebhookSecurityEvent(
  eventType: "signed_accepted" | "signature_failure" | "verification_failure",
  safeCodeValue: string,
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(metaWebhookSecurityEvents).values({ eventType, safeCode: safeCodeValue, occurredAt: Date.now() });
}

function backfillConditions(baselineAt: number) {
  return and(
    eq(leads.isMetaTestLead, false),
    or(sql`${leads.assignedTo} IS NULL`, eq(leads.assignedTo, "")),
    gte(leads.createdAt, baselineAt),
    sql`COALESCE(${leads.metaSyncStatus}, 'pending') <> 'manual_review'`,
    sql`EXISTS (SELECT 1 FROM lead_meta_attributions a WHERE a.leadId = ${leads.id} AND a.isTestLead = 0 AND a.ambiguousMatch = 0)`,
    sql`NOT EXISTS (SELECT 1 FROM lead_meta_attributions a WHERE a.leadId = ${leads.id} AND a.isTestLead = 1)`,
    sql`NOT EXISTS (SELECT 1 FROM meta_webhook_inbox i WHERE i.leadId = ${leads.id} AND (i.isTestLead = 1 OR i.requiresManualReview = 1 OR i.ambiguousMatch = 1))`,
    sql`NOT EXISTS (SELECT 1 FROM meta_crm_event_log e WHERE e.leadId = ${leads.id} AND e.isTestLead = 1)`,
  );
}

export async function getMetaAssignmentBackfillDryRun() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const consultant = await resolveMetaDefaultConsultant();
  const baselineAt = consultant.status === "resolved" ? consultant.backfillBaselineAt : META_MONITORING_BASELINE_MS;
  const rows = await db.select({ id: leads.id }).from(leads).where(backfillConditions(baselineAt)).orderBy(asc(leads.id));
  return {
    policyStatus: consultant.status,
    consultant: consultant.status === "resolved" ? { id: consultant.id, name: consultant.name } : null,
    safeCandidates: consultant.status === "resolved" ? [] : consultant.candidates,
    baselineAt,
    candidateCount: rows.length,
    candidateLeadIds: rows.map(row => row.id),
  };
}

export async function applyMetaAssignmentBackfill() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const consultant = await resolveMetaDefaultConsultant();
  if (consultant.status !== "resolved") {
    await queueMetaAdminAlert({
      notificationKey: `admin:assignment-policy:${consultant.safeCode}`,
      safeAlertCode: consultant.safeCode,
    });
    return { appliedCount: 0, policyStatus: consultant.status, candidateLeadIds: [] as number[] };
  }
  const dryRun = await getMetaAssignmentBackfillDryRun();
  const appliedLeadIds: number[] = [];
  for (const leadId of dryRun.candidateLeadIds) {
    const [attribution] = await db.select({ metaLeadId: leadMetaAttributions.metaLeadId, matchMethod: leadMetaAttributions.matchMethod })
      .from(leadMetaAttributions).where(and(eq(leadMetaAttributions.leadId, leadId), eq(leadMetaAttributions.isTestLead, false)))
      .orderBy(desc(leadMetaAttributions.metaLeadCreatedAt)).limit(1);
    if (!attribution) continue;
    const result = await applyMetaAssignment({
      leadId,
      metaLeadId: attribution.metaLeadId,
      isTestLead: false,
      matchMethod: (attribution.matchMethod || "meta_lead_id") as MetaMatchMethod,
      routingConsultant: consultant,
      auditKey: `meta_backfill:${leadId}`,
      systemActor: "system:meta_backfill",
    });
    if (result.outcome === "assigned") {
      appliedLeadIds.push(leadId);
    }
  }
  return { appliedCount: appliedLeadIds.length, policyStatus: "resolved" as const, candidateLeadIds: appliedLeadIds };
}

export async function recoverUnassignedMetaLeads() {
  return applyMetaAssignmentBackfill();
}

export type MetaMonitoringFilters = {
  dateFrom?: number;
  dateTo?: number;
  program?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  formId?: string;
  consultant?: string;
  leadStatus?: string;
  metaEventStatus?: string;
  testLeadStatus?: "real" | "test" | "all";
  limit?: number;
};

export async function getPrivacySafeMetaMonitoring(filters: MetaMonitoringFilters = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const conditions: any[] = [];
  if (filters.dateFrom) conditions.push(gte(leadMetaAttributions.metaLeadCreatedAt, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(leadMetaAttributions.metaLeadCreatedAt, filters.dateTo));
  if (filters.program) conditions.push(eq(leadMetaAttributions.program, filters.program));
  if (filters.campaignId) conditions.push(eq(leadMetaAttributions.metaCampaignId, filters.campaignId));
  if (filters.adSetId) conditions.push(eq(leadMetaAttributions.metaAdSetId, filters.adSetId));
  if (filters.adId) conditions.push(eq(leadMetaAttributions.metaAdId, filters.adId));
  if (filters.formId) conditions.push(eq(leadMetaAttributions.metaFormId, filters.formId));
  if (filters.consultant) conditions.push(or(
    eq(leads.assignedTo, filters.consultant),
    sql`CAST(${leads.assignedConsultantUserId} AS CHAR) = ${filters.consultant}`,
  ));
  if (filters.leadStatus) conditions.push(eq(leads.stage, filters.leadStatus as any));
  if (filters.metaEventStatus) conditions.push(eq(metaCrmEventLog.status, filters.metaEventStatus as any));
  if ((filters.testLeadStatus || "real") === "real") conditions.push(eq(leadMetaAttributions.isTestLead, false));
  if (filters.testLeadStatus === "test") conditions.push(eq(leadMetaAttributions.isTestLead, true));
  const rows = await db.select({
    leadId: leads.id,
    leadCreatedAt: leads.createdAt,
    leadUpdatedAt: leads.updatedAt,
    leadStatus: leads.stage,
    consultantId: leads.assignedConsultantUserId,
    consultantDisplayName: leads.assignedTo,
    assignmentStatus: leads.metaAssignmentStatus,
    metaLeadId: leadMetaAttributions.metaLeadId,
    pageId: leadMetaAttributions.metaPageId,
    formId: leadMetaAttributions.metaFormId,
    campaignId: leadMetaAttributions.metaCampaignId,
    adSetId: leadMetaAttributions.metaAdSetId,
    adId: leadMetaAttributions.metaAdId,
    program: leadMetaAttributions.program,
    source: leadMetaAttributions.source,
    metaCreatedAt: leadMetaAttributions.metaLeadCreatedAt,
    firstReceivedAt: leadMetaAttributions.firstReceivedAt,
    attributionId: leadMetaAttributions.id,
    matchMethod: leadMetaAttributions.matchMethod,
    isMetaTestLead: leadMetaAttributions.isTestLead,
    duplicateIndicator: leadMetaAttributions.duplicateIndicator,
    ambiguousMatch: leadMetaAttributions.ambiguousMatch,
    inboxStatus: metaWebhookInbox.status,
    inboxAttempts: metaWebhookInbox.attempts,
    inboxProcessedAt: metaWebhookInbox.processedAt,
    inboxSafeErrorCode: metaWebhookInbox.lastErrorCode,
    inboxManualReview: metaWebhookInbox.requiresManualReview,
    eventName: metaCrmEventLog.eventName,
    eventTime: metaCrmEventLog.eventTime,
    eventId: metaCrmEventLog.eventId,
    eventStatus: metaCrmEventLog.status,
    eventAttempts: metaCrmEventLog.attempts,
    eventNextRetryAt: metaCrmEventLog.nextAttemptAt,
    eventSentAt: metaCrmEventLog.sentAt,
    eventSafeErrorCode: metaCrmEventLog.errorCode,
    metaLeadIdPresent: metaCrmEventLog.hasLeadId,
    phoneHashAvailable: metaCrmEventLog.hasPhoneHash,
    emailHashAvailable: metaCrmEventLog.hasEmailHash,
  }).from(leadMetaAttributions)
    .innerJoin(leads, eq(leads.id, leadMetaAttributions.leadId))
    .leftJoin(metaWebhookInbox, eq(metaWebhookInbox.metaLeadId, leadMetaAttributions.metaLeadId))
    .leftJoin(metaCrmEventLog, and(eq(metaCrmEventLog.leadId, leads.id), eq(metaCrmEventLog.metaLeadId, leadMetaAttributions.metaLeadId)))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(leadMetaAttributions.metaLeadCreatedAt), asc(metaCrmEventLog.eventTime))
    .limit(Math.max(1, Math.min(500, filters.limit || 100)));
  return rows.map(row => ({
    ...row,
    ingestionDelaySeconds: row.inboxProcessedAt && row.metaCreatedAt
      ? Math.max(0, Math.round((row.inboxProcessedAt - row.metaCreatedAt) / 1000))
      : null,
    attributionPresent: Boolean(row.attributionId),
    assignmentPresent: Boolean(row.consultantId || row.consultantDisplayName),
  }));
}

export async function collectMetaMonitoringSnapshot() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const timestamp = Date.now();
  const windowStart = timestamp - MONITORING_WINDOW_MS;
  const [securityCounts, inboxCounts, realMetaTotals, duplicateRows, stageViolationRows, leakageRows, reconciliation, delayRows, exhaustedEvents, notificationCounts] = await Promise.all([
    db.select({ eventType: metaWebhookSecurityEvents.eventType, total: count() }).from(metaWebhookSecurityEvents)
      .where(gte(metaWebhookSecurityEvents.occurredAt, windowStart)).groupBy(metaWebhookSecurityEvents.eventType),
    db.select({ status: metaWebhookInbox.status, ingestionSource: metaWebhookInbox.ingestionSource, total: count() }).from(metaWebhookInbox)
      .where(and(eq(metaWebhookInbox.isTestLead, false), gte(metaWebhookInbox.receivedAt, windowStart)))
      .groupBy(metaWebhookInbox.status, metaWebhookInbox.ingestionSource),
    db.select({
      total: sql<number>`COUNT(DISTINCT ${leadMetaAttributions.leadId})`,
      withLeadId: sql<number>`COUNT(DISTINCT CASE WHEN ${leadMetaAttributions.metaLeadId} IS NOT NULL THEN ${leadMetaAttributions.leadId} END)`,
      withAttribution: sql<number>`COUNT(DISTINCT ${leadMetaAttributions.leadId})`,
      withProgram: sql<number>`COUNT(DISTINCT CASE WHEN ${leadMetaAttributions.program} IS NOT NULL AND ${leadMetaAttributions.program} <> '' THEN ${leadMetaAttributions.leadId} END)`,
      assigned: sql<number>`COUNT(DISTINCT CASE WHEN ${leads.assignedTo} IS NOT NULL AND ${leads.assignedTo} <> '' THEN ${leads.id} END)`,
      unassignedOverTenMinutes: sql<number>`COUNT(DISTINCT CASE WHEN (${leads.assignedTo} IS NULL OR ${leads.assignedTo} = '') AND ${leads.createdAt} <= ${timestamp - 10 * 60_000} THEN ${leads.id} END)`,
      ambiguous: sql<number>`COUNT(DISTINCT CASE WHEN ${leadMetaAttributions.ambiguousMatch} = 1 THEN ${leadMetaAttributions.leadId} END)`,
    }).from(leadMetaAttributions).innerJoin(leads, eq(leads.id, leadMetaAttributions.leadId))
      .where(and(eq(leadMetaAttributions.isTestLead, false), gte(leadMetaAttributions.metaLeadCreatedAt, windowStart))),
    db.select({ metaLeadId: leadMetaAttributions.metaLeadId, total: count() }).from(leadMetaAttributions)
      .where(eq(leadMetaAttributions.isTestLead, false)).groupBy(leadMetaAttributions.metaLeadId).having(sql`COUNT(*) > 1`),
    db.select({ total: count() }).from(metaCrmEventLog).where(and(
      eq(metaCrmEventLog.isTestLead, false),
      sql`${metaCrmEventLog.eventName} <> 'Initial Lead from Facebook'`,
      sql`NOT EXISTS (SELECT 1 FROM meta_crm_event_log earlier WHERE earlier.leadId = ${metaCrmEventLog.leadId} AND earlier.eventName = 'Initial Lead from Facebook' AND earlier.eventTime <= ${metaCrmEventLog.eventTime})`,
    )),
    db.select({ total: count() }).from(leads).where(or(
      and(eq(leads.isMetaTestLead, true), isNotNull(leads.assignedTo)),
      sql`EXISTS (SELECT 1 FROM lead_meta_attributions a WHERE a.leadId = ${leads.id} AND a.isTestLead <> ${leads.isMetaTestLead})`,
    )),
    db.select().from(metaReconciliationState).orderBy(desc(metaReconciliationState.updatedAt)).limit(1),
    db.select({ createdAt: leadMetaAttributions.metaLeadCreatedAt, processedAt: metaWebhookInbox.processedAt })
      .from(leadMetaAttributions).innerJoin(metaWebhookInbox, eq(metaWebhookInbox.metaLeadId, leadMetaAttributions.metaLeadId))
      .where(and(
        eq(leadMetaAttributions.isTestLead, false),
        gte(leadMetaAttributions.metaLeadCreatedAt, windowStart),
        eq(metaWebhookInbox.ingestionSource, "webhook"),
        eq(metaWebhookInbox.signatureValidated, true),
        isNotNull(metaWebhookInbox.processedAt),
      ))
      .limit(5_000),
    db.select({ id: metaCrmEventLog.id, leadId: metaCrmEventLog.leadId }).from(metaCrmEventLog)
      .where(and(eq(metaCrmEventLog.isTestLead, false), inArray(metaCrmEventLog.status, ["dead_letter", "manual_review"])))
      .orderBy(desc(metaCrmEventLog.updatedAt)).limit(50),
    db.select({ status: metaNotificationLog.status, total: count() }).from(metaNotificationLog)
      .where(gte(metaNotificationLog.createdAt, windowStart)).groupBy(metaNotificationLog.status),
  ]);
  const security = Object.fromEntries(securityCounts.map(row => [row.eventType, Number(row.total || 0)]));
  const signedWebhookCount = Number(security.signed_accepted || 0);
  const signatureFailureCount = Number(security.signature_failure || 0);
  const processedInboxCount = inboxCounts.filter(row => row.status === "processed").reduce((sum, row) => sum + Number(row.total || 0), 0);
  const failedInboxCount = inboxCounts.filter(row => ["failed", "dead_letter", "manual_review"].includes(row.status)).reduce((sum, row) => sum + Number(row.total || 0), 0);
  const retryInboxCount = inboxCounts.filter(row => row.status === "retrying").reduce((sum, row) => sum + Number(row.total || 0), 0);
  const reconciliationLeadCount = inboxCounts.filter(row => row.ingestionSource === "reconciliation").reduce((sum, row) => sum + Number(row.total || 0), 0);
  const totals = realMetaTotals[0];
  const totalRealMetaLeads = Number(totals?.total || 0);
  const bps = (value: number) => totalRealMetaLeads ? Math.round(value / totalRealMetaLeads * 10_000) : null;
  const delays = delayRows.map(row => Math.max(0, (Number(row.processedAt) - Number(row.createdAt)) / 1000));
  const p50 = percentile(delays, 0.5);
  const p95 = percentile(delays, 0.95);
  const unassignedRows = await db.select({ id: leads.id }).from(leads).where(and(
    eq(leads.isMetaTestLead, false),
    or(sql`${leads.assignedTo} IS NULL`, eq(leads.assignedTo, "")),
    lte(leads.createdAt, timestamp - 10 * 60_000),
    sql`EXISTS (SELECT 1 FROM lead_meta_attributions a WHERE a.leadId = ${leads.id} AND a.isTestLead = 0)`,
  )).orderBy(asc(leads.createdAt)).limit(50);
  const manualReviewCount = await db.select({ total: count() }).from(metaWebhookInbox)
    .where(and(eq(metaWebhookInbox.isTestLead, false), or(eq(metaWebhookInbox.requiresManualReview, true), eq(metaWebhookInbox.status, "manual_review"))));
  const productionSendingEnabled = process.env.META_CRM_PRODUCTION_ENABLED === "true";
  const snapshot = {
    capturedAt: timestamp,
    signedWebhookCount,
    signatureFailureCount,
    processedInboxCount,
    failedInboxCount,
    retryInboxCount,
    p50IngestionDelaySeconds: p50,
    p95IngestionDelaySeconds: p95,
    metaLeadIdCoverageBps: bps(Number(totals?.withLeadId || 0)),
    attributionCoverageBps: bps(Number(totals?.withAttribution || 0)),
    programCoverageBps: bps(Number(totals?.withProgram || 0)),
    assignmentCoverageBps: bps(Number(totals?.assigned || 0)),
    unassignedOverTenMinutes: Number(totals?.unassignedOverTenMinutes || 0),
    duplicateAttributionCount: duplicateRows.length,
    ambiguousMatchCount: Number(totals?.ambiguous || 0),
    manualReviewCount: Number(manualReviewCount[0]?.total || 0),
    stageOrderViolationCount: Number(stageViolationRows[0]?.total || 0),
    testLeadLeakageCount: Number(leakageRows[0]?.total || 0),
    productionSendingEnabled,
  };
  await db.insert(metaMonitoringSnapshots).values(snapshot);
  const reconciliationFresh = Boolean(reconciliation[0]?.lastSuccessAt && timestamp - Number(reconciliation[0].lastSuccessAt) <= 26 * 60 * 60_000);
  const webhookAcceptanceRate = signedWebhookCount + signatureFailureCount
    ? signedWebhookCount / (signedWebhookCount + signatureFailureCount)
    : null;
  const warnings: Array<{ code: string; leadId?: number }> = [];
  if (webhookAcceptanceRate !== null && webhookAcceptanceRate < 0.99) warnings.push({ code: "META_WEBHOOK_ACCEPTANCE_BELOW_99" });
  if (snapshot.metaLeadIdCoverageBps !== null && snapshot.metaLeadIdCoverageBps < 9_800) warnings.push({ code: "META_LEAD_ID_COVERAGE_BELOW_98" });
  if (p95 !== null && p95 > 300) warnings.push({ code: "META_INGESTION_DELAY_ABOVE_5_MINUTES" });
  if (!signedWebhookCount && reconciliationLeadCount > 0) warnings.push({ code: "META_WEBHOOK_STALE" });
  if (!reconciliationFresh) warnings.push({ code: "META_RECONCILIATION_STALE" });
  if (snapshot.duplicateAttributionCount > 0) warnings.push({ code: "META_DUPLICATE_ATTRIBUTION" });
  if (snapshot.stageOrderViolationCount > 0) warnings.push({ code: "META_STAGE_ORDER_VIOLATION" });
  if (snapshot.testLeadLeakageCount > 0) warnings.push({ code: "META_TEST_LEAD_REPORTING_LEAKAGE" });
  exhaustedEvents.forEach(event => warnings.push({ code: "META_EVENT_RETRY_EXHAUSTED", leadId: event.leadId }));
  unassignedRows.forEach(row => warnings.push({ code: "META_REAL_LEAD_UNASSIGNED_OVER_10_MINUTES", leadId: row.id }));
  const day = new Date(timestamp).toISOString().slice(0, 10);
  for (const warning of warnings) {
    await queueMetaAdminAlert({
      notificationKey: `admin:monitor:${day}:${warning.code}:${warning.leadId || "all"}`,
      safeAlertCode: warning.code,
      leadId: warning.leadId,
    });
  }
  return {
    ...snapshot,
    webhookAcceptanceRate,
    lastSignedWebhookAt: signedWebhookCount
      ? (await db.select({ occurredAt: metaWebhookSecurityEvents.occurredAt }).from(metaWebhookSecurityEvents)
          .where(eq(metaWebhookSecurityEvents.eventType, "signed_accepted")).orderBy(desc(metaWebhookSecurityEvents.occurredAt)).limit(1))[0]?.occurredAt ?? null
      : null,
    reconciliationFresh,
    reconciliation: reconciliation[0] ?? null,
    recentUnassignedLeadIds: unassignedRows.map(row => row.id),
    eventRetryExhaustedCount: exhaustedEvents.length,
    notificationByStatus: notificationCounts.map(row => ({ status: row.status, total: Number(row.total || 0) })),
    warnings,
    objectives: {
      webhookAcceptance: webhookAcceptanceRate,
      metaLeadIdCoverage: snapshot.metaLeadIdCoverageBps === null ? null : snapshot.metaLeadIdCoverageBps / 10_000,
      leadIngestionP95Seconds: p95,
      unassignedOverTenMinutes: snapshot.unassignedOverTenMinutes,
      duplicateAttribution: snapshot.duplicateAttributionCount,
      eventDeliverySuccess: productionSendingEnabled ? "Data not available" : "Data not available until Production CAPI approval",
      marketingQualifiedCoverage: productionSendingEnabled ? "Data not available" : "Data not available until Production CAPI approval",
      convertedCoverage: productionSendingEnabled ? "Data not available" : "Data not available until Production CAPI approval",
    },
  };
}
