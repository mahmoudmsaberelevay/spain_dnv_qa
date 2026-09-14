import { createHmac, timingSafeEqual } from "crypto";
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import {
  clientApplicationActivities,
  clientCases,
  clientDocumentationPayments,
  clientDocuments,
  clientPortalApplicants,
  clientPortalApplications,
  clientPortalDocuments,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { auditCtxFromReq, writeAuditLog } from "./auditLog";
import type { EmployeeMobileContext } from "./clientEmployeeAuth";
import { projectClientProcessTimeline } from "./clientProcessTimeline";
import { getDb } from "./db";
import { storageGet } from "./storage";
import type { Request } from "express";

function folderSigningKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for employee folder identifiers");
  return ENV.cookieSecret;
}

export function encodeEmployeeFolderId(caseId: number) {
  const payload = Buffer.from(String(caseId), "utf8").toString("base64url");
  const signature = createHmac("sha256", folderSigningKey()).update(`client-folder:${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

export function decodeEmployeeFolderId(publicId: string) {
  const [payload, signature] = publicId.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", folderSigningKey()).update(`client-folder:${payload}`).digest("base64url");
  const actualBytes = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  const caseId = Number(Buffer.from(payload, "base64url").toString("utf8"));
  return Number.isInteger(caseId) && caseId > 0 ? caseId : null;
}

async function getClientCase(publicId: string) {
  const caseId = decodeEmployeeFolderId(publicId);
  if (!caseId) return null;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [clientCase] = await db.select().from(clientCases).where(eq(clientCases.id, caseId)).limit(1);
  return clientCase ?? null;
}

function applicationProjection(clientCase: typeof clientCases.$inferSelect) {
  return {
    publicId: encodeEmployeeFolderId(clientCase.id),
    label: clientCase.clientName,
    clientCode: clientCase.clientCode,
    applicationType: clientCase.applicationType,
    stage: clientCase.stage,
    consultant: clientCase.consultant,
    paralegal: clientCase.paralegal,
    isPrimary: false,
    updatedAt: clientCase.updatedAt,
  };
}

export async function listEmployeeFolders(input: { search?: string; page?: number; pageSize?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const search = input.search?.trim().slice(0, 100) ?? "";
  const pageSize = Math.max(1, Math.min(50, Math.floor(input.pageSize || 30)));
  const page = Math.max(1, Math.min(10_000, Math.floor(input.page || 1)));
  const where = search
    ? or(
        like(clientCases.clientName, `%${search}%`),
        like(clientCases.clientCode, `%${search}%`),
        like(clientCases.consultant, `%${search}%`),
        like(clientCases.paralegal, `%${search}%`),
      )
    : undefined;
  const [rows, totals] = await Promise.all([
    where
      ? db.select().from(clientCases).where(where).orderBy(asc(clientCases.clientName), asc(clientCases.id)).limit(pageSize).offset((page - 1) * pageSize)
      : db.select().from(clientCases).orderBy(asc(clientCases.clientName), asc(clientCases.id)).limit(pageSize).offset((page - 1) * pageSize),
    where
      ? db.select({ count: sql<number>`count(*)` }).from(clientCases).where(where)
      : db.select({ count: sql<number>`count(*)` }).from(clientCases),
  ]);
  const total = Number(totals[0]?.count || 0);
  return {
    items: rows.map(applicationProjection),
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  };
}

export async function getEmployeeFolderDetails(publicId: string) {
  const clientCase = await getClientCase(publicId);
  if (!clientCase) return null;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const applications = await db.select().from(clientPortalApplications)
    .where(eq(clientPortalApplications.clientCaseId, clientCase.id))
    .orderBy(desc(clientPortalApplications.isPrimary), desc(clientPortalApplications.createdAt))
    .limit(1);
  const applicants = applications[0]
    ? await db.select({ publicId: clientPortalApplicants.publicId, relation: clientPortalApplicants.relation, fullName: clientPortalApplicants.fullName, birthDate: clientPortalApplicants.birthDate })
        .from(clientPortalApplicants)
        .where(eq(clientPortalApplicants.portalApplicationId, applications[0].id))
        .orderBy(asc(clientPortalApplicants.id))
    : [];
  const folderItems = await db.select({
    docKey: clientDocuments.docKey,
    docName: clientDocuments.docName,
    category: clientDocuments.category,
    received: clientDocuments.received,
    receivedDate: clientDocuments.receivedDate,
    documentLink: clientDocuments.documentLink,
    requiresMofa: clientDocuments.requiresMofa,
    mofaSubmitted: clientDocuments.mofaSubmitted,
    mofaSubmittedDate: clientDocuments.mofaSubmittedDate,
    mofaReceived: clientDocuments.mofaReceived,
    mofaReceivedDate: clientDocuments.mofaReceivedDate,
    requiresEmbassy: clientDocuments.requiresEmbassy,
    embassySubmitted: clientDocuments.embassySubmitted,
    embassySubmittedDate: clientDocuments.embassySubmittedDate,
    embassyReceived: clientDocuments.embassyReceived,
    embassyReceivedDate: clientDocuments.embassyReceivedDate,
  }).from(clientDocuments).where(eq(clientDocuments.clientCaseId, clientCase.id)).orderBy(asc(clientDocuments.category), asc(clientDocuments.id));
  const portalFamilyMembers = applicants.filter(applicant => applicant.relation !== "main");
  const legacyChildren = Array.isArray(clientCase.childrenData) ? clientCase.childrenData.length : 0;
  const legacyFamilyMembers = (clientCase.spouseName?.trim() ? 1 : 0) + legacyChildren;
  const familyMemberCount = applicants.length ? portalFamilyMembers.length : legacyFamilyMembers;
  return {
    ...applicationProjection(clientCase),
    clientSummary: {
      clientName: clientCase.clientName,
      householdType: clientCase.maritalStatus,
      familyMemberCount,
      totalApplicants: Math.max(1, applicants.length || familyMemberCount + 1),
      spouseIncluded: applicants.length ? applicants.some(applicant => applicant.relation === "spouse") : Boolean(clientCase.spouseName?.trim()),
      childrenIncluded: applicants.length ? applicants.filter(applicant => applicant.relation === "child").length : legacyChildren,
    },
    dates: {
      hasSchengenVisa: clientCase.schengenVisaValid,
      requiresSchengenAppointment: clientCase.schengenVisaValid === false,
      schengenAppointmentDate: clientCase.schengenAppointmentDate,
      embassyEmailSentAt: clientCase.embassyEmailDate,
      expectedSubmissionDate: clientCase.expectedSubmissionDate,
      spainTeamReceivedDate: clientCase.spainTeamReceivedDate,
      translatorSubmittedDate: clientCase.translationDate,
      submissionDate: clientCase.submissionDate,
      expectedApprovalDate: clientCase.expectedApprovalDate,
      approvalDate: clientCase.approvalDate,
      travelDate: clientCase.travelDate,
      arrivalConfirmedDate: clientCase.arrivalConfirmedDate,
      biometricsAppointmentDate: clientCase.biometricsAppointmentDate,
      biometricsCompletedDate: clientCase.biometricsDate,
      bankAccountCompletedDate: clientCase.bankAccountCompletedDate,
      residencyCardReadyDate: clientCase.residencyCardReadyDate,
    },
    links: {
      submissionReceipt: clientCase.submissionReceiptLink,
      approvalLetter: clientCase.approvalLetterLink,
      ticket: clientCase.ticketLink,
      hotel: clientCase.hotelLink,
    },
    applicants,
    documentationFolder: {
      name: `${clientCase.clientName} – Documentation`,
      clientCode: clientCase.clientCode,
      total: folderItems.length,
      received: folderItems.filter(item => item.received).length,
      items: folderItems,
    },
  };
}

export async function getEmployeeFolderDocuments(publicId: string) {
  const clientCase = await getClientCase(publicId);
  if (!clientCase) return null;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const folderItems = await db.select({
    internalId: clientDocuments.id,
    docKey: clientDocuments.docKey,
    docName: clientDocuments.docName,
    category: clientDocuments.category,
    received: clientDocuments.received,
    receivedDate: clientDocuments.receivedDate,
    documentLink: clientDocuments.documentLink,
    requiresMofa: clientDocuments.requiresMofa,
    mofaSubmitted: clientDocuments.mofaSubmitted,
    mofaSubmittedDate: clientDocuments.mofaSubmittedDate,
    mofaReceived: clientDocuments.mofaReceived,
    mofaReceivedDate: clientDocuments.mofaReceivedDate,
    requiresEmbassy: clientDocuments.requiresEmbassy,
    embassySubmitted: clientDocuments.embassySubmitted,
    embassySubmittedDate: clientDocuments.embassySubmittedDate,
    embassyReceived: clientDocuments.embassyReceived,
    embassyReceivedDate: clientDocuments.embassyReceivedDate,
  }).from(clientDocuments).where(eq(clientDocuments.clientCaseId, clientCase.id)).orderBy(asc(clientDocuments.category), asc(clientDocuments.id));
  const rows = await db.select({ document: clientPortalDocuments, applicantName: clientPortalApplicants.fullName })
    .from(clientPortalDocuments)
    .innerJoin(clientPortalApplications, eq(clientPortalDocuments.portalApplicationId, clientPortalApplications.id))
    .leftJoin(clientPortalApplicants, eq(clientPortalDocuments.applicantId, clientPortalApplicants.id))
    .where(eq(clientPortalApplications.clientCaseId, clientCase.id))
    .orderBy(desc(clientPortalDocuments.createdAt));
  const uploads = rows.map(({ document, applicantName }) => ({
    publicId: document.publicId,
    checklistDocumentKey: folderItems.find(item => item.internalId === document.clientDocumentId)?.docKey ?? null,
    documentType: document.documentType,
    fileName: document.fileName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    source: document.source,
    reviewStatus: document.reviewStatus,
    clientComment: document.clientComment,
    applicantName,
    createdAt: document.createdAt,
  }));
  return {
    folder: {
      name: `${clientCase.clientName} – Documentation`,
      clientCode: clientCase.clientCode,
      total: folderItems.length,
      received: folderItems.filter(item => item.received).length,
      items: folderItems.map(({ internalId: _internalId, ...item }) => ({
        ...item,
        linkedUploads: uploads.filter(upload => upload.checklistDocumentKey === item.docKey),
      })),
    },
    uploads,
  };
}

export async function getEmployeeFolderTimeline(publicId: string) {
  const clientCase = await getClientCase(publicId);
  if (!clientCase) return null;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [documents, payments, applications] = await Promise.all([
    db.select({
      received: clientDocuments.received,
      receivedDate: clientDocuments.receivedDate,
      mofaSubmitted: clientDocuments.mofaSubmitted,
      mofaSubmittedDate: clientDocuments.mofaSubmittedDate,
      embassySubmitted: clientDocuments.embassySubmitted,
      embassySubmittedDate: clientDocuments.embassySubmittedDate,
    }).from(clientDocuments).where(eq(clientDocuments.clientCaseId, clientCase.id)),
    db.select({
      paymentName: clientDocumentationPayments.paymentName,
      paidDate: clientDocumentationPayments.paidDate,
      sortOrder: clientDocumentationPayments.sortOrder,
    }).from(clientDocumentationPayments).where(and(eq(clientDocumentationPayments.clientCaseId, clientCase.id), sql`${clientDocumentationPayments.archivedAt} IS NULL`)).orderBy(asc(clientDocumentationPayments.sortOrder), asc(clientDocumentationPayments.id)),
    db.select({ createdAt: clientPortalApplications.createdAt }).from(clientPortalApplications).where(eq(clientPortalApplications.clientCaseId, clientCase.id)).orderBy(asc(clientPortalApplications.createdAt)).limit(1),
  ]);
  return projectClientProcessTimeline({ clientCase, documents, payments, applicationCreatedAt: applications[0]?.createdAt ?? clientCase.createdAt });
}

export async function getEmployeeFolderActivity(publicId: string) {
  const clientCase = await getClientCase(publicId);
  if (!clientCase) return null;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select({
    publicId: clientApplicationActivities.publicId,
    actorType: clientApplicationActivities.actorType,
    actorName: clientApplicationActivities.actorName,
    eventType: clientApplicationActivities.eventType,
    titleEn: clientApplicationActivities.titleEn,
    titleAr: clientApplicationActivities.titleAr,
    bodyEn: clientApplicationActivities.bodyEn,
    bodyAr: clientApplicationActivities.bodyAr,
    entityType: clientApplicationActivities.entityType,
    entityPublicId: clientApplicationActivities.entityPublicId,
    metadata: clientApplicationActivities.metadata,
    occurredAt: clientApplicationActivities.occurredAt,
  }).from(clientApplicationActivities).where(eq(clientApplicationActivities.clientCaseId, clientCase.id)).orderBy(desc(clientApplicationActivities.occurredAt)).limit(250);
}

export async function getEmployeeDocumentAccess(input: { folderPublicId: string; documentPublicId: string; context: EmployeeMobileContext; req: Request }) {
  const clientCase = await getClientCase(input.folderPublicId);
  if (!clientCase) return null;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.select({ fileKey: clientPortalDocuments.fileKey })
    .from(clientPortalDocuments)
    .innerJoin(clientPortalApplications, eq(clientPortalDocuments.portalApplicationId, clientPortalApplications.id))
    .where(and(eq(clientPortalDocuments.publicId, input.documentPublicId), eq(clientPortalApplications.clientCaseId, clientCase.id)))
    .limit(1);
  if (!row) return null;
  const file = await storageGet(row.fileKey);
  await writeAuditLog(auditCtxFromReq(input.req, input.context.user), "download", "client_portal_document", input.documentPublicId, `Employee mobile access for client case ${clientCase.clientCode}`);
  return { url: file.url, expiresSoon: true };
}
