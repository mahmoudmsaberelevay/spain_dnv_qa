import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { clientCases } from "../drizzle/schema";
import { CARIBBEAN_JOURNEY_LABELS, CARIBBEAN_JOURNEY_STAGES, isCaribbeanDocumentationProgram, type CaribbeanJourneyStage } from "../shared/clientDocumentationPrograms";
import { getDb } from "./db";
import { recordClientLifecycleEvent } from "./clientLifecycleNotificationService";

export const CARIBBEAN_TIMELINE_DATE_FIELDS = [
  "expectedSubmissionDate",
  "submissionDate",
  "approvalDate",
  "naturalizationIssuingDate",
  "naturalizationIssuedDate",
  "passportsIssuingDate",
  "passportsIssuedDate",
] as const;

export type CaribbeanTimelineDateField = typeof CARIBBEAN_TIMELINE_DATE_FIELDS[number];

const stageRank = new Map(CARIBBEAN_JOURNEY_STAGES.map((stage, index) => [stage, index]));

export function resolveCaribbeanStageAfterDateUpdate(stage: CaribbeanJourneyStage, expectedSubmissionDate: string | null) {
  return expectedSubmissionDate && (stageRank.get(stage) ?? 0) < (stageRank.get("in_process") ?? 0)
    ? "in_process" as const
    : stage;
}

function parseDate(value: string | null | undefined, field: string) {
  if (value === null || value === undefined || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TRPCError({ code: "BAD_REQUEST", message: `Enter a valid date for ${field}` });
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new TRPCError({ code: "BAD_REQUEST", message: `Enter a valid date for ${field}` });
  return value;
}

function storedDateOnly(value: Date | string | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function timestampValue(value: string | null) {
  return value ? new Date(`${value}T12:00:00Z`) : null;
}

function assertChronology(values: Record<CaribbeanTimelineDateField, string | null>) {
  const sequence: Array<[CaribbeanTimelineDateField, string | null]> = [
    ["expectedSubmissionDate", values.expectedSubmissionDate],
    ["submissionDate", values.submissionDate],
    ["approvalDate", values.approvalDate],
    ["naturalizationIssuingDate", values.naturalizationIssuingDate],
    ["naturalizationIssuedDate", values.naturalizationIssuedDate],
    ["passportsIssuingDate", values.passportsIssuingDate],
    ["passportsIssuedDate", values.passportsIssuedDate],
  ];
  let previous: [CaribbeanTimelineDateField, string] | null = null;
  for (const [field, value] of sequence) {
    if (!value) continue;
    if (previous && value < previous[1]) throw new TRPCError({ code: "BAD_REQUEST", message: `${field} cannot be before ${previous[0]}` });
    previous = [field, value];
  }
}

function requiredFieldForStage(stage: CaribbeanJourneyStage): CaribbeanTimelineDateField | null {
  if (stage === "in_process") return "expectedSubmissionDate";
  if (stage === "submitted") return "submissionDate";
  if (stage === "approved") return "approvalDate";
  if (stage === "naturalization_issuing") return "naturalizationIssuingDate";
  if (stage === "naturalization_issued") return "naturalizationIssuedDate";
  if (stage === "passports_issuing") return "passportsIssuingDate";
  if (stage === "passports_issued") return "passportsIssuedDate";
  return null;
}

export async function updateCaribbeanDocumentationTimeline(input: {
  clientCaseId: number;
  stage: CaribbeanJourneyStage;
  dates: Partial<Record<CaribbeanTimelineDateField, string | null>>;
  actor: { staffUserId: number; name: string };
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [clientCase] = await db.select().from(clientCases).where(eq(clientCases.id, input.clientCaseId)).limit(1);
  if (!clientCase) throw new TRPCError({ code: "NOT_FOUND", message: "Client Documentation case not found" });
  if (!isCaribbeanDocumentationProgram(clientCase.program)) throw new TRPCError({ code: "BAD_REQUEST", message: "This timeline is available only for Caribbean programs" });
  const existingDates: Record<CaribbeanTimelineDateField, string | null> = {
    expectedSubmissionDate: storedDateOnly(clientCase.expectedSubmissionDate),
    submissionDate: storedDateOnly(clientCase.submissionDate),
    approvalDate: storedDateOnly(clientCase.approvalDate),
    naturalizationIssuingDate: clientCase.naturalizationIssuingDate,
    naturalizationIssuedDate: clientCase.naturalizationIssuedDate,
    passportsIssuingDate: clientCase.passportsIssuingDate,
    passportsIssuedDate: clientCase.passportsIssuedDate,
  };
  const dates = { ...existingDates };
  for (const field of CARIBBEAN_TIMELINE_DATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input.dates, field)) dates[field] = parseDate(input.dates[field], field);
  }
  assertChronology(dates);
  const resolvedStage = resolveCaribbeanStageAfterDateUpdate(input.stage, dates.expectedSubmissionDate);
  const requiredField = requiredFieldForStage(resolvedStage);
  if (requiredField && !dates[requiredField]) throw new TRPCError({ code: "BAD_REQUEST", message: `${CARIBBEAN_JOURNEY_LABELS[resolvedStage]} requires its date` });
  if (resolvedStage !== "questionnaire" && !clientCase.questionnaireSubmittedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "The client must submit the questionnaire first" });

  const currentRank = stageRank.get(clientCase.caribbeanJourneyStage ?? "questionnaire") ?? 0;
  const requestedRank = stageRank.get(resolvedStage) ?? 0;
  await db.update(clientCases).set({
    caribbeanJourneyStage: resolvedStage,
    expectedSubmissionDate: timestampValue(dates.expectedSubmissionDate),
    submissionDate: timestampValue(dates.submissionDate),
    approvalDate: timestampValue(dates.approvalDate),
    naturalizationIssuingDate: dates.naturalizationIssuingDate,
    naturalizationIssuedDate: dates.naturalizationIssuedDate,
    passportsIssuingDate: dates.passportsIssuingDate,
    passportsIssuedDate: dates.passportsIssuedDate,
  }).where(eq(clientCases.id, input.clientCaseId));

  await recordClientLifecycleEvent({
    clientCaseId: input.clientCaseId,
    eventType: "caribbean_timeline_updated",
    idempotencyKey: `caribbean-stage:${input.clientCaseId}:${resolvedStage}:${Date.now()}`,
    actor: { type: "staff", staffUserId: input.actor.staffUserId, name: input.actor.name },
    titleEn: `Application status: ${CARIBBEAN_JOURNEY_LABELS[resolvedStage]}`,
    titleAr: `حالة الطلب: ${CARIBBEAN_JOURNEY_LABELS[resolvedStage]}`,
    bodyEn: requestedRank >= currentRank ? "Your Caribbean citizenship application has moved to this stage." : "The ELEVAY team corrected the recorded application stage.",
    bodyAr: requestedRank >= currentRank ? "انتقل طلب الجنسية الكاريبية إلى هذه المرحلة." : "قام فريق إليفاي بتصحيح المرحلة المسجلة للطلب.",
    entityType: "caribbean_timeline",
    metadata: { stage: input.stage, dates },
  });
  return { ok: true, stage: resolvedStage, dates };
}

export async function advanceCaribbeanCaseToLegalizationWhenComplete(clientCaseId: number, actor: { staffUserId: number; name: string }) {
  const db = await getDb();
  if (!db) return false;
  const [clientCase] = await db.select().from(clientCases).where(eq(clientCases.id, clientCaseId)).limit(1);
  if (!clientCase || !isCaribbeanDocumentationProgram(clientCase.program) || !clientCase.questionnaireSubmittedAt) return false;
  const { clientDocuments } = await import("../drizzle/schema");
  const documents = await db.select({ received: clientDocuments.received }).from(clientDocuments).where(eq(clientDocuments.clientCaseId, clientCaseId));
  if (!documents.length || documents.some(document => !document.received)) return false;
  const currentRank = stageRank.get(clientCase.caribbeanJourneyStage ?? "questionnaire") ?? 0;
  if (currentRank > stageRank.get("document_collection")!) return false;
  const now = new Date();
  await db.update(clientCases).set({ caribbeanJourneyStage: "legalization", caribbeanLegalizationStartedAt: clientCase.caribbeanLegalizationStartedAt ?? now }).where(eq(clientCases.id, clientCaseId));
  await recordClientLifecycleEvent({
    clientCaseId,
    eventType: "caribbean_document_collection_completed",
    idempotencyKey: `caribbean-documents:${clientCaseId}:complete`,
    actor: { type: "staff", staffUserId: actor.staffUserId, name: actor.name },
    titleEn: "Document collection completed",
    titleAr: "اكتمل جمع المستندات",
    bodyEn: "All checklist documents have been received. The application moved to the Legalization Process.",
    bodyAr: "تم استلام جميع مستندات القائمة وانتقل الطلب إلى مرحلة التصديق.",
    entityType: "caribbean_timeline",
    metadata: { stage: "legalization" },
  });
  return true;
}
