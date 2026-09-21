import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { clientApplicationQuestionnaires, clientCases } from "../drizzle/schema";
import {
  CARIBBEAN_QUESTIONNAIRE_STEPS,
  CARIBBEAN_QUESTIONNAIRE_VERSION,
  normalizeCaribbeanQuestionnaireAnswers,
  validateCaribbeanQuestionnaire,
  type CaribbeanQuestionnaireAnswers,
} from "../shared/caribbeanQuestionnaire";
import { clientDocumentationProgramLabel, isCaribbeanDocumentationProgram, type ClientDocumentationProgram } from "../shared/clientDocumentationPrograms";
import { getDb } from "./db";
import { recordClientLifecycleEvent } from "./clientLifecycleNotificationService";

function payloadSize(answers: CaribbeanQuestionnaireAnswers) {
  return Buffer.byteLength(JSON.stringify(answers), "utf8");
}

function validateCurrentStepKey(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 191 || !CARIBBEAN_QUESTIONNAIRE_STEPS.some(step => step.key === value)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid questionnaire step" });
  }
  return value;
}

export function serializeClientQuestionnaireSteps() {
  return CARIBBEAN_QUESTIONNAIRE_STEPS.map(step => ({
    ...step,
    required: step.optional !== true,
    fields: step.fields?.map(field => ({ ...field, required: true })),
  }));
}

async function requireCaribbeanCase(clientCaseId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [clientCase] = await db.select().from(clientCases).where(eq(clientCases.id, clientCaseId)).limit(1);
  if (!clientCase) throw new TRPCError({ code: "NOT_FOUND", message: "Client Documentation case not found" });
  if (!isCaribbeanDocumentationProgram(clientCase.program)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This questionnaire is available only for Caribbean citizenship cases" });
  }
  return { db, clientCase };
}

function serializeQuestionnaire(row: typeof clientApplicationQuestionnaires.$inferSelect | undefined, clientCase: typeof clientCases.$inferSelect) {
  return {
    publicId: row?.publicId ?? null,
    version: row?.questionnaireVersion ?? CARIBBEAN_QUESTIONNAIRE_VERSION,
    status: row?.status ?? "not_started",
    answers: (row?.answers && typeof row.answers === "object" ? row.answers : {}) as CaribbeanQuestionnaireAnswers,
    currentStepKey: row?.currentStepKey ?? CARIBBEAN_QUESTIONNAIRE_STEPS[0]?.key ?? null,
    startedAt: row?.startedAt ?? null,
    lastSavedAt: row?.lastSavedAt ?? null,
    submittedAt: row?.submittedAt ?? null,
    program: clientCase.program,
    programLabel: clientDocumentationProgramLabel(clientCase.program),
    journeyStage: clientCase.caribbeanJourneyStage ?? "questionnaire",
    stepCount: CARIBBEAN_QUESTIONNAIRE_STEPS.length,
    steps: serializeClientQuestionnaireSteps(),
  };
}

export async function getCaribbeanQuestionnaire(clientCaseId: number) {
  const { db, clientCase } = await requireCaribbeanCase(clientCaseId);
  const [row] = await db.select().from(clientApplicationQuestionnaires).where(eq(clientApplicationQuestionnaires.clientCaseId, clientCaseId)).limit(1);
  return serializeQuestionnaire(row, clientCase);
}

export async function saveCaribbeanQuestionnaireDraft(input: {
  clientCaseId: number;
  portalUserId: number;
  answers: unknown;
  currentStepKey?: unknown;
}) {
  const { db, clientCase } = await requireCaribbeanCase(input.clientCaseId);
  const answers = normalizeCaribbeanQuestionnaireAnswers(input.answers);
  if (payloadSize(answers) > 1_500_000) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Questionnaire draft is too large" });
  const currentStepKey = validateCurrentStepKey(input.currentStepKey);
  const [existing] = await db.select().from(clientApplicationQuestionnaires).where(eq(clientApplicationQuestionnaires.clientCaseId, input.clientCaseId)).limit(1);
  if (existing?.status === "submitted") throw new TRPCError({ code: "CONFLICT", message: "The submitted questionnaire is read-only" });
  const now = new Date();
  if (existing) {
    await db.update(clientApplicationQuestionnaires).set({ answers, currentStepKey, lastSavedAt: now, questionnaireVersion: CARIBBEAN_QUESTIONNAIRE_VERSION }).where(and(eq(clientApplicationQuestionnaires.id, existing.id), eq(clientApplicationQuestionnaires.status, "draft")));
  } else {
    await db.insert(clientApplicationQuestionnaires).values({
      publicId: randomUUID(),
      clientCaseId: input.clientCaseId,
      program: clientCase.program as Exclude<ClientDocumentationProgram, "spain">,
      questionnaireVersion: CARIBBEAN_QUESTIONNAIRE_VERSION,
      status: "draft",
      answers,
      currentStepKey,
      startedByPortalUserId: input.portalUserId,
      lastSavedAt: now,
    });
  }
  const [saved] = await db.select().from(clientApplicationQuestionnaires).where(eq(clientApplicationQuestionnaires.clientCaseId, input.clientCaseId)).limit(1);
  return serializeQuestionnaire(saved, clientCase);
}

export async function submitCaribbeanQuestionnaire(input: {
  clientCaseId: number;
  portalUserId: number;
  actorName: string;
  answers: unknown;
}) {
  const { db, clientCase } = await requireCaribbeanCase(input.clientCaseId);
  const answers = normalizeCaribbeanQuestionnaireAnswers(input.answers);
  if (payloadSize(answers) > 1_500_000) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Questionnaire is too large" });
  const validation = validateCaribbeanQuestionnaire(answers);
  if (!validation.valid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Complete the required questionnaire fields before submitting (${validation.missing.slice(0, 5).join(", ")})`,
    });
  }
  const now = new Date();
  const [existing] = await db.select().from(clientApplicationQuestionnaires).where(eq(clientApplicationQuestionnaires.clientCaseId, input.clientCaseId)).limit(1);
  if (existing?.status === "submitted") return { ...serializeQuestionnaire(existing, clientCase), alreadySubmitted: true };
  const publicId = existing?.publicId ?? randomUUID();
  await db.transaction(async tx => {
    if (existing) {
      await tx.update(clientApplicationQuestionnaires).set({
        answers,
        currentStepKey: CARIBBEAN_QUESTIONNAIRE_STEPS[CARIBBEAN_QUESTIONNAIRE_STEPS.length - 1]?.key ?? null,
        questionnaireVersion: CARIBBEAN_QUESTIONNAIRE_VERSION,
        status: "submitted",
        submittedByPortalUserId: input.portalUserId,
        submittedAt: now,
        lastSavedAt: now,
      }).where(and(eq(clientApplicationQuestionnaires.id, existing.id), eq(clientApplicationQuestionnaires.status, "draft")));
    } else {
      await tx.insert(clientApplicationQuestionnaires).values({
        publicId,
        clientCaseId: input.clientCaseId,
        program: clientCase.program as Exclude<ClientDocumentationProgram, "spain">,
        questionnaireVersion: CARIBBEAN_QUESTIONNAIRE_VERSION,
        status: "submitted",
        answers,
        currentStepKey: CARIBBEAN_QUESTIONNAIRE_STEPS[CARIBBEAN_QUESTIONNAIRE_STEPS.length - 1]?.key ?? null,
        startedByPortalUserId: input.portalUserId,
        submittedByPortalUserId: input.portalUserId,
        submittedAt: now,
        lastSavedAt: now,
      });
    }
    await tx.update(clientCases).set({
      caribbeanJourneyStage: "document_collection",
      questionnaireSubmittedAt: now,
      questionnaireVersion: CARIBBEAN_QUESTIONNAIRE_VERSION,
    }).where(eq(clientCases.id, input.clientCaseId));
  });
  await recordClientLifecycleEvent({
    clientCaseId: input.clientCaseId,
    eventType: "caribbean_questionnaire_submitted",
    idempotencyKey: `caribbean-questionnaire:${input.clientCaseId}:${CARIBBEAN_QUESTIONNAIRE_VERSION}:submitted`,
    actor: { type: "client", portalUserId: input.portalUserId, name: input.actorName },
    titleEn: "Questionnaire submitted",
    titleAr: "تم إرسال الاستبيان",
    bodyEn: `The ${clientDocumentationProgramLabel(clientCase.program)} citizenship questionnaire has been submitted. The application moved to Document Collection.`,
    bodyAr: `تم إرسال استبيان برنامج ${clientDocumentationProgramLabel(clientCase.program)} وانتقل الطلب إلى مرحلة جمع المستندات.`,
    entityType: "questionnaire",
    entityPublicId: publicId,
    metadata: { version: CARIBBEAN_QUESTIONNAIRE_VERSION, program: clientCase.program },
    notifyStaff: true,
  });
  const [submitted] = await db.select().from(clientApplicationQuestionnaires).where(eq(clientApplicationQuestionnaires.clientCaseId, input.clientCaseId)).limit(1);
  const updatedCase = { ...clientCase, caribbeanJourneyStage: "document_collection" as const, questionnaireSubmittedAt: now, questionnaireVersion: CARIBBEAN_QUESTIONNAIRE_VERSION };
  return { ...serializeQuestionnaire(submitted, updatedCase), alreadySubmitted: false };
}
