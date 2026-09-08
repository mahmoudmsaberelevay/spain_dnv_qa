import { and, eq } from "drizzle-orm";
import { clientCases, clientDocuments } from "../drizzle/schema";
import { getDb } from "./db";

export type ClientDocumentAuthorityMilestone =
  | "mofa_submitted"
  | "mofa_received"
  | "embassy_submitted"
  | "embassy_received";

export type SpainCaseStage = "preparation" | "spain_team_received" | "submission" | "approved";

export type SpainCaseMilestone =
  | "translator_submitted"
  | "travel_booked"
  | "arrival_confirmed"
  | "biometrics_appointment"
  | "biometrics_completed"
  | "bank_account_completed"
  | "residency_card_ready";

const STAGE_RANK: Record<SpainCaseStage, number> = {
  preparation: 0,
  spain_team_received: 1,
  submission: 2,
  approved: 3,
};

function requireDb<T>(db: T | null): T {
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db;
}

export function normalizeHttpLink(value: string): string {
  const trimmed = value.trim();
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("INVALID_LINK");
  return trimmed;
}

export function assertIsoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("INVALID_DATE");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("INVALID_DATE");
  return value;
}

function timestampDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function assertNotBefore(value: string, reference: Date | string | null | undefined, errorCode: string) {
  const referenceKey = timestampDateKey(reference);
  if (referenceKey && value < referenceKey) throw new Error(errorCode);
}

export async function setClientDocumentEvidenceLink(input: {
  clientCaseId: number;
  documentId: number;
  documentLink: string;
}) {
  const db = requireDb(await getDb());
  const [document] = await db.select().from(clientDocuments).where(and(
    eq(clientDocuments.id, input.documentId),
    eq(clientDocuments.clientCaseId, input.clientCaseId),
  )).limit(1);
  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  const documentLink = normalizeHttpLink(input.documentLink);
  await db.update(clientDocuments).set({ documentLink }).where(eq(clientDocuments.id, input.documentId));
  return { document, documentLink };
}

export async function recordClientDocumentAuthorityMilestone(input: {
  clientCaseId: number;
  documentId: number;
  milestone: ClientDocumentAuthorityMilestone;
  date: string;
}) {
  const db = requireDb(await getDb());
  const date = assertIsoDate(input.date);
  const [document] = await db.select().from(clientDocuments).where(and(
    eq(clientDocuments.id, input.documentId),
    eq(clientDocuments.clientCaseId, input.clientCaseId),
  )).limit(1);
  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  if (!document.received) throw new Error("DOCUMENT_NOT_RECEIVED");

  const update: Partial<typeof clientDocuments.$inferInsert> = {};
  if (input.milestone.startsWith("mofa_")) {
    if (!document.requiresMofa) throw new Error("MOFA_NOT_REQUIRED");
    assertNotBefore(date, document.receivedDate, "DATE_BEFORE_DOCUMENT_RECEIVED");
    if (input.milestone === "mofa_submitted") {
      update.mofaSubmitted = true;
      update.mofaSubmittedDate = date;
    } else {
      if (!document.mofaSubmitted || !document.mofaSubmittedDate) throw new Error("MOFA_NOT_SUBMITTED");
      assertNotBefore(date, document.mofaSubmittedDate, "MOFA_RECEIVED_BEFORE_SUBMITTED");
      update.mofaReceived = true;
      update.mofaReceivedDate = date;
      update.mofaAttested = true;
      update.mofaAttestedDate = new Date(`${date}T12:00:00Z`);
    }
  } else {
    if (!document.requiresEmbassy) throw new Error("EMBASSY_NOT_REQUIRED");
    assertNotBefore(date, document.receivedDate, "DATE_BEFORE_DOCUMENT_RECEIVED");
    if (document.requiresMofa && !document.mofaReceived && input.milestone === "embassy_submitted") {
      throw new Error("MOFA_NOT_RECEIVED");
    }
    if (input.milestone === "embassy_submitted") {
      update.embassySubmitted = true;
      update.embassySubmittedDate = date;
    } else {
      if (!document.embassySubmitted || !document.embassySubmittedDate) throw new Error("EMBASSY_NOT_SUBMITTED");
      assertNotBefore(date, document.embassySubmittedDate, "EMBASSY_RECEIVED_BEFORE_SUBMITTED");
      update.embassyReceived = true;
      update.embassyReceivedDate = date;
      update.embassyAttested = true;
      update.embassyAttestedDate = new Date(`${date}T12:00:00Z`);
    }
  }

  await db.update(clientDocuments).set(update).where(eq(clientDocuments.id, input.documentId));
  return { document, milestone: input.milestone, date };
}

export function calculateExpectedApprovalDate(submissionDate: string): Date {
  const start = new Date(`${assertIsoDate(submissionDate)}T12:00:00Z`);
  let workingDays = 0;
  const cursor = new Date(start);
  while (workingDays < 25) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) workingDays += 1;
  }
  return cursor;
}

export async function updateSpainCaseStage(input: {
  clientCaseId: number;
  stage: SpainCaseStage;
  stageDate?: string | null;
  evidenceLink?: string | null;
}) {
  const db = requireDb(await getDb());
  const [clientCase] = await db.select().from(clientCases).where(eq(clientCases.id, input.clientCaseId)).limit(1);
  if (!clientCase) throw new Error("CLIENT_NOT_FOUND");
  const update: Partial<typeof clientCases.$inferInsert> = { stage: input.stage };

  if (input.stage === "spain_team_received") {
    if (!input.stageDate) throw new Error("STAGE_DATE_REQUIRED");
    update.spainTeamReceivedDate = assertIsoDate(input.stageDate);
  }
  if (input.stage === "submission") {
    if (!clientCase.spainTeamReceivedDate) throw new Error("SPAIN_TEAM_NOT_RECEIVED");
    if (!input.stageDate) throw new Error("STAGE_DATE_REQUIRED");
    if (!input.evidenceLink) throw new Error("EVIDENCE_LINK_REQUIRED");
    const submissionDate = assertIsoDate(input.stageDate);
    assertNotBefore(submissionDate, clientCase.spainTeamReceivedDate, "SUBMISSION_BEFORE_SPAIN_TEAM_RECEIVED");
    update.submissionDate = new Date(`${submissionDate}T12:00:00Z`);
    update.submissionReceiptLink = normalizeHttpLink(input.evidenceLink);
    update.expectedApprovalDate = calculateExpectedApprovalDate(submissionDate);
  }
  if (input.stage === "approved") {
    if (!clientCase.submissionDate) throw new Error("APPLICATION_NOT_SUBMITTED");
    if (!input.stageDate) throw new Error("STAGE_DATE_REQUIRED");
    if (!input.evidenceLink) throw new Error("EVIDENCE_LINK_REQUIRED");
    const approvalDate = assertIsoDate(input.stageDate);
    assertNotBefore(approvalDate, clientCase.submissionDate, "APPROVAL_BEFORE_SUBMISSION");
    update.approvalDate = new Date(`${approvalDate}T12:00:00Z`);
    update.approvalLetterLink = normalizeHttpLink(input.evidenceLink);
  }

  if (STAGE_RANK[input.stage] < STAGE_RANK[clientCase.stage as SpainCaseStage]) {
    // Correcting a stage never erases previously recorded legal milestone evidence.
  }
  await db.update(clientCases).set(update).where(eq(clientCases.id, input.clientCaseId));
  return { clientCase, update };
}

export async function recordSpainCaseMilestone(input: {
  clientCaseId: number;
  milestone: SpainCaseMilestone;
  date: string;
  ticketLink?: string | null;
  hotelLink?: string | null;
}) {
  const db = requireDb(await getDb());
  const date = assertIsoDate(input.date);
  const [clientCase] = await db.select().from(clientCases).where(eq(clientCases.id, input.clientCaseId)).limit(1);
  if (!clientCase) throw new Error("CLIENT_NOT_FOUND");
  const update: Partial<typeof clientCases.$inferInsert> = {};

  switch (input.milestone) {
    case "translator_submitted":
      update.translationDate = new Date(`${date}T12:00:00Z`);
      break;
    case "travel_booked":
      if (!clientCase.approvalDate) throw new Error("APPLICATION_NOT_APPROVED");
      if (!input.ticketLink || !input.hotelLink) throw new Error("TRAVEL_LINKS_REQUIRED");
      assertNotBefore(date, clientCase.approvalDate, "TRAVEL_BEFORE_APPROVAL");
      update.travelDate = date;
      update.ticketLink = normalizeHttpLink(input.ticketLink);
      update.hotelLink = normalizeHttpLink(input.hotelLink);
      break;
    case "arrival_confirmed":
      if (!clientCase.travelDate) throw new Error("TRAVEL_NOT_RECORDED");
      assertNotBefore(date, clientCase.travelDate, "ARRIVAL_BEFORE_TRAVEL");
      update.arrivalConfirmedDate = date;
      break;
    case "biometrics_appointment":
      if (!clientCase.approvalDate) throw new Error("APPLICATION_NOT_APPROVED");
      assertNotBefore(date, clientCase.approvalDate, "BIOMETRICS_BEFORE_APPROVAL");
      update.biometricsAppointmentDate = date;
      break;
    case "biometrics_completed":
      if (!clientCase.biometricsAppointmentDate) throw new Error("BIOMETRICS_APPOINTMENT_NOT_RECORDED");
      assertNotBefore(date, clientCase.biometricsAppointmentDate, "BIOMETRICS_COMPLETED_BEFORE_APPOINTMENT");
      update.biometricsDate = new Date(`${date}T12:00:00Z`);
      break;
    case "bank_account_completed":
      if (!clientCase.approvalDate) throw new Error("APPLICATION_NOT_APPROVED");
      assertNotBefore(date, clientCase.approvalDate, "BANK_ACCOUNT_BEFORE_APPROVAL");
      update.bankAccountCompletedDate = date;
      break;
    case "residency_card_ready":
      if (!clientCase.biometricsDate) throw new Error("BIOMETRICS_NOT_COMPLETED");
      if (!clientCase.bankAccountCompletedDate) throw new Error("BANK_ACCOUNT_NOT_COMPLETED");
      assertNotBefore(date, clientCase.biometricsDate, "CARD_READY_BEFORE_BIOMETRICS");
      assertNotBefore(date, clientCase.bankAccountCompletedDate, "CARD_READY_BEFORE_BANK_ACCOUNT");
      update.residencyCardReadyDate = date;
      break;
  }

  await db.update(clientCases).set(update).where(eq(clientCases.id, input.clientCaseId));
  return { clientCase, update, milestone: input.milestone, date };
}
