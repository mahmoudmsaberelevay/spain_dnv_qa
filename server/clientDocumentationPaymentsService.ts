import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import {
  clientCases,
  clientDocuments,
  clientDocumentationPayments,
  finClients,
  type InsertClientCase,
  type InsertClientDocument,
} from "../drizzle/schema";
import { getDb } from "./db";

export type ClientDocumentationPaymentInput = {
  paymentName: string;
  amountEur: number;
  paymentMilestone?: "signed" | "submission" | "approval" | null;
  dueDate?: string | null;
  receiptName?: string | null;
  receiptDriveLink?: string | null;
  notes?: string | null;
  sortOrder?: number;
};

type PaymentRow = typeof clientDocumentationPayments.$inferSelect;

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function dateKey(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function milestoneLabel(value: string | null | undefined) {
  if (value === "signed") return "Signed";
  if (value === "submission") return "Submission";
  if (value === "approval") return "Approval";
  return null;
}

const MILESTONE_PAYMENT_NAMES = {
  signed: "First payment",
  submission: "Second payment",
  approval: "Third payment",
} as const;

function validatePaymentDefinition(input: ClientDocumentationPaymentInput) {
  if (input.paymentMilestone) {
    if (normalizeName(input.paymentName) !== MILESTONE_PAYMENT_NAMES[input.paymentMilestone]) throw new Error("PAYMENT_MILESTONE_NAME_MISMATCH");
    if (input.dueDate) throw new Error("MILESTONE_PAYMENT_DATE_NOT_ALLOWED");
    return;
  }
  if (!input.dueDate) throw new Error("PAYMENT_DUE_DATE_REQUIRED");
}

export function cairoDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function money(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Math.round((Number.isFinite(parsed) ? parsed : 0) * 100) / 100;
}

export function calculateClientDocumentationPaymentSummary(payments: PaymentRow[], now = new Date()) {
  const active = payments.filter(payment => !payment.archivedAt);
  const today = cairoDateKey(now);
  const enriched = active.map(payment => {
    const due = payment.dueDate ? dateKey(payment.dueDate as string | Date) : null;
    const amount = money(payment.amountEur);
    const status = payment.paidDate
      ? "paid"
      : !due
        ? "awaiting_milestone"
      : due < today
        ? "overdue"
        : due === today
          ? "due_today"
          : "upcoming";
    return { ...payment, amountEur: amount, dueDate: due, milestoneLabel: milestoneLabel(payment.paymentMilestone), paidDate: payment.paidDate ? dateKey(payment.paidDate as string | Date) : null, status };
  });
  const contractValueEur = money(enriched.reduce((sum, payment) => sum + payment.amountEur, 0));
  const paidTotalEur = money(enriched.filter(payment => payment.status === "paid").reduce((sum, payment) => sum + payment.amountEur, 0));
  const dueTotalEur = money(enriched.filter(payment => payment.status === "due_today" || payment.status === "overdue").reduce((sum, payment) => sum + payment.amountEur, 0));
  const overdueTotalEur = money(enriched.filter(payment => payment.status === "overdue").reduce((sum, payment) => sum + payment.amountEur, 0));
  const nextPayment = [...enriched]
    .filter(payment => payment.status !== "paid")
    .sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") || a.sortOrder - b.sortOrder || a.id - b.id)[0] ?? null;
  return {
    payments: enriched,
    summary: {
      contractValueEur,
      paidTotalEur,
      remainingBalanceEur: money(contractValueEur - paidTotalEur),
      dueTotalEur,
      overdueTotalEur,
      paymentCount: enriched.length,
      paidCount: enriched.filter(payment => payment.status === "paid").length,
      nextPayment,
    },
  };
}

export async function createClientDocumentationBundle(input: {
  clientCase: InsertClientCase;
  documents: Omit<InsertClientDocument, "clientCaseId">[];
  payments: ClientDocumentationPaymentInput[];
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  input.payments.forEach(validatePaymentDefinition);
  return db.transaction(async tx => {
    if (input.clientCase.finClientId) {
      const [linked] = await tx.select({ id: finClients.id, clientCode: finClients.clientCode })
        .from(finClients)
        .where(eq(finClients.id, input.clientCase.finClientId))
        .limit(1);
      if (!linked || linked.clientCode !== input.clientCase.clientCode) throw new Error("FIN_CLIENT_MISMATCH");
    }
    const [result] = await tx.insert(clientCases).values(input.clientCase);
    const clientCaseId = Number((result as { insertId?: number }).insertId ?? 0);
    if (!clientCaseId) throw new Error("CLIENT_CASE_CREATE_FAILED");
    if (input.documents.length) {
      await tx.insert(clientDocuments).values(input.documents.map(document => ({ ...document, clientCaseId })));
    }
    await tx.insert(clientDocumentationPayments).values(input.payments.map((payment, index) => ({
      clientCaseId,
      paymentName: normalizeName(payment.paymentName),
      amountEur: payment.amountEur.toFixed(2),
      paymentMilestone: payment.paymentMilestone ?? null,
      dueDate: payment.dueDate ?? null,
      paidDate: payment.paymentMilestone === "signed" ? cairoDateKey() : null,
      receiptName: payment.receiptName ? normalizeName(payment.receiptName) : null,
      receiptDriveLink: payment.receiptDriveLink?.trim() || null,
      notes: payment.notes?.trim() || null,
      sortOrder: payment.sortOrder ?? index,
      createdByUserId: input.userId,
    })));
    return { clientCaseId };
  });
}

export async function getClientDocumentationPaymentSchedule(clientCaseId: number, now = new Date()) {
  const db = await getDb();
  if (!db) return calculateClientDocumentationPaymentSummary([], now);
  const [payments, [clientCase]] = await Promise.all([
    db.select().from(clientDocumentationPayments)
      .where(and(eq(clientDocumentationPayments.clientCaseId, clientCaseId), isNull(clientDocumentationPayments.archivedAt)))
      .orderBy(asc(clientDocumentationPayments.sortOrder), asc(clientDocumentationPayments.dueDate), asc(clientDocumentationPayments.id)),
    db.select({ expectedSubmissionDate: clientCases.expectedSubmissionDate, submissionDate: clientCases.submissionDate, approvalDate: clientCases.approvalDate }).from(clientCases).where(eq(clientCases.id, clientCaseId)).limit(1),
  ]);
  const hydrated = payments.map(payment => {
    const milestoneDate = payment.paymentMilestone === "submission"
      ? clientCase?.expectedSubmissionDate ?? clientCase?.submissionDate ?? null
      : payment.paymentMilestone === "approval"
        ? clientCase?.approvalDate ?? null
        : null;
    return { ...payment, dueDate: payment.dueDate ?? (milestoneDate ? dateKey(milestoneDate) : null) };
  });
  return calculateClientDocumentationPaymentSummary(hydrated, now);
}

async function assertNameAvailable(clientCaseId: number, paymentName: string, excludeId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [
    eq(clientDocumentationPayments.clientCaseId, clientCaseId),
    isNull(clientDocumentationPayments.archivedAt),
    sql`LOWER(TRIM(${clientDocumentationPayments.paymentName})) = ${normalizeName(paymentName).toLowerCase()}`,
  ];
  if (excludeId) conditions.push(ne(clientDocumentationPayments.id, excludeId));
  const [existing] = await db.select({ id: clientDocumentationPayments.id }).from(clientDocumentationPayments).where(and(...conditions)).limit(1);
  if (existing) throw new Error("PAYMENT_NAME_EXISTS");
}

async function assertMilestoneAvailable(clientCaseId: number, milestone: ClientDocumentationPaymentInput["paymentMilestone"], excludeId?: number) {
  if (!milestone) return;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [
    eq(clientDocumentationPayments.clientCaseId, clientCaseId),
    eq(clientDocumentationPayments.paymentMilestone, milestone),
    isNull(clientDocumentationPayments.archivedAt),
  ];
  if (excludeId) conditions.push(ne(clientDocumentationPayments.id, excludeId));
  const [existing] = await db.select({ id: clientDocumentationPayments.id }).from(clientDocumentationPayments).where(and(...conditions)).limit(1);
  if (existing) throw new Error("PAYMENT_MILESTONE_EXISTS");
}

export async function addClientDocumentationPayment(clientCaseId: number, input: ClientDocumentationPaymentInput, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  validatePaymentDefinition(input);
  await assertNameAvailable(clientCaseId, input.paymentName);
  await assertMilestoneAvailable(clientCaseId, input.paymentMilestone);
  const [maxRow] = await db.select({ maxOrder: sql<number>`COALESCE(MAX(${clientDocumentationPayments.sortOrder}), -1)` })
    .from(clientDocumentationPayments)
    .where(and(eq(clientDocumentationPayments.clientCaseId, clientCaseId), isNull(clientDocumentationPayments.archivedAt)));
  const [result] = await db.insert(clientDocumentationPayments).values({
    clientCaseId,
    paymentName: normalizeName(input.paymentName),
    amountEur: input.amountEur.toFixed(2),
    paymentMilestone: input.paymentMilestone ?? null,
    dueDate: input.dueDate ?? null,
    paidDate: input.paymentMilestone === "signed" ? cairoDateKey() : null,
    receiptName: input.receiptName ? normalizeName(input.receiptName) : null,
    receiptDriveLink: input.receiptDriveLink?.trim() || null,
    notes: input.notes?.trim() || null,
    sortOrder: Number(maxRow?.maxOrder ?? -1) + 1,
    createdByUserId: userId,
  });
  return Number((result as { insertId?: number }).insertId ?? 0);
}

export async function updateClientDocumentationPayment(input: { id: number; clientCaseId: number } & ClientDocumentationPaymentInput, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  validatePaymentDefinition(input);
  const [existing] = await db.select().from(clientDocumentationPayments)
    .where(and(eq(clientDocumentationPayments.id, input.id), eq(clientDocumentationPayments.clientCaseId, input.clientCaseId), isNull(clientDocumentationPayments.archivedAt)))
    .limit(1);
  if (!existing) throw new Error("PAYMENT_NOT_FOUND");
  if (existing.paidDate && (
    normalizeName(existing.paymentName) !== normalizeName(input.paymentName) ||
    money(existing.amountEur) !== money(input.amountEur) ||
    (existing.paymentMilestone ?? null) !== (input.paymentMilestone ?? null) ||
    (existing.dueDate ? dateKey(existing.dueDate) : null) !== (input.dueDate ?? null)
  )) throw new Error("PAYMENT_HISTORY_PROTECTED");
  if (existing.receiptDriveLink && !input.receiptDriveLink) throw new Error("PAYMENT_RECEIPT_PROTECTED");
  await assertNameAvailable(input.clientCaseId, input.paymentName, input.id);
  await assertMilestoneAvailable(input.clientCaseId, input.paymentMilestone, input.id);
  await db.update(clientDocumentationPayments).set({
    paymentName: normalizeName(input.paymentName),
    amountEur: input.amountEur.toFixed(2),
    paymentMilestone: input.paymentMilestone ?? null,
    dueDate: input.dueDate ?? null,
    receiptName: input.receiptName ? normalizeName(input.receiptName) : null,
    receiptDriveLink: input.receiptDriveLink?.trim() || null,
    notes: input.notes?.trim() || null,
    updatedByUserId: userId,
  }).where(eq(clientDocumentationPayments.id, input.id));
  return existing;
}

export async function markClientDocumentationPaymentPaid(input: { id: number; clientCaseId: number; paidDate: string; receiptName?: string | null; receiptDriveLink?: string | null }, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db.select().from(clientDocumentationPayments)
    .where(and(eq(clientDocumentationPayments.id, input.id), eq(clientDocumentationPayments.clientCaseId, input.clientCaseId), isNull(clientDocumentationPayments.archivedAt)))
    .limit(1);
  if (!existing) throw new Error("PAYMENT_NOT_FOUND");
  if (existing.paidDate) throw new Error("PAYMENT_ALREADY_PAID");
  await db.update(clientDocumentationPayments).set({
    paidDate: input.paidDate,
    receiptName: input.receiptName ? normalizeName(input.receiptName) : existing.receiptName,
    receiptDriveLink: input.receiptDriveLink?.trim() || existing.receiptDriveLink,
    updatedByUserId: userId,
  }).where(eq(clientDocumentationPayments.id, input.id));
  return existing;
}

export async function archiveClientDocumentationPayment(id: number, clientCaseId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db.select().from(clientDocumentationPayments)
    .where(and(eq(clientDocumentationPayments.id, id), eq(clientDocumentationPayments.clientCaseId, clientCaseId), isNull(clientDocumentationPayments.archivedAt)))
    .limit(1);
  if (!existing) throw new Error("PAYMENT_NOT_FOUND");
  if (existing.paidDate || existing.receiptDriveLink) throw new Error("PAYMENT_HISTORY_PROTECTED");
  await db.update(clientDocumentationPayments).set({ archivedAt: new Date(), updatedByUserId: userId }).where(eq(clientDocumentationPayments.id, id));
  return existing;
}

export async function setClientDocumentationContractDriveLink(clientCaseId: number, contractDriveLink: string, finClientId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [clientCase] = await db.select({ id: clientCases.id, clientCode: clientCases.clientCode }).from(clientCases).where(eq(clientCases.id, clientCaseId)).limit(1);
  if (!clientCase) throw new Error("CLIENT_CASE_NOT_FOUND");
  if (finClientId) {
    const [linked] = await db.select({ id: finClients.id, clientCode: finClients.clientCode }).from(finClients).where(eq(finClients.id, finClientId)).limit(1);
    if (!linked || linked.clientCode !== clientCase.clientCode) throw new Error("FIN_CLIENT_MISMATCH");
  }
  await db.update(clientCases).set({ contractDriveLink: contractDriveLink.trim(), finClientId: finClientId ?? null }).where(eq(clientCases.id, clientCaseId));
}
