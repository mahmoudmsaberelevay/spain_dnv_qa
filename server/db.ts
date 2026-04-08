import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, cases, documents, analysisResults, InsertCase, InsertDocument, InsertAnalysisResult } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Cases ────────────────────────────────────────────────────────────────────
export async function createCase(data: InsertCase) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(cases).values(data);
  return result;
}

export async function getCasesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cases).where(eq(cases.userId, userId)).orderBy(desc(cases.updatedAt));
}

export async function getCaseById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(cases).where(eq(cases.id, id)).limit(1);
  return result[0];
}

export async function updateCase(id: number, data: Partial<InsertCase>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cases).set(data).where(eq(cases.id, id));
}

export async function deleteCase(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(documents).where(eq(documents.caseId, id));
  await db.delete(analysisResults).where(eq(analysisResults.caseId, id));
  await db.delete(cases).where(eq(cases.id, id));
}

// ─── Documents ────────────────────────────────────────────────────────────────
export async function createDocument(data: InsertDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(documents).values(data);
  return result;
}

export async function getDocumentsByCaseId(caseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(eq(documents.caseId, caseId)).orderBy(desc(documents.createdAt));
}

export async function getDocumentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return result[0];
}

export async function updateDocument(id: number, data: Partial<InsertDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documents).set(data).where(eq(documents.id, id));
}

export async function deleteDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(documents).where(eq(documents.id, id));
}

// ─── Analysis Results ─────────────────────────────────────────────────────────
export async function upsertAnalysisResult(data: InsertAnalysisResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(analysisResults).values(data).onDuplicateKeyUpdate({ set: data });
}

export async function getAnalysisResultByCaseId(caseId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(analysisResults).where(eq(analysisResults.caseId, caseId)).limit(1);
  return result[0];
}

// ─── Contracting Module ───────────────────────────────────────────────────────
import { contracts, invoices, payments, InsertContract, InsertInvoice, InsertPayment } from "../drizzle/schema";
import { sql } from "drizzle-orm";

export async function createContract(data: InsertContract) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(contracts).values(data);
  const result = await db.select().from(contracts).where(eq(contracts.contractCode, data.contractCode)).limit(1);
  return result[0];
}

export async function getAllContracts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contracts).orderBy(desc(contracts.createdAt));
}

export async function getContractById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  return result[0];
}

export async function updateContractStatus(id: number, status: "pending" | "signed" | "cancelled") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contracts).set({ status }).where(eq(contracts.id, id));
}

export async function updateContractDocUrl(id: number, docUrl: string, driveFileId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contracts).set({ docUrl, driveFileId: driveFileId ?? null }).where(eq(contracts.id, id));
}

export async function getNextContractSequence(): Promise<number> {
  const db = await getDb();
  if (!db) return 1;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(contracts);
  return (result[0]?.count ?? 0) + 1;
}

export async function createInvoice(data: InsertInvoice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(invoices).values(data);
  const result = await db.select().from(invoices).where(eq(invoices.invoiceCode, data.invoiceCode)).limit(1);
  return result[0];
}

export async function getAllInvoices() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invoices).orderBy(desc(invoices.createdAt));
}

export async function getInvoicesByContractId(contractId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invoices).where(eq(invoices.contractId, contractId)).orderBy(desc(invoices.createdAt));
}

export async function getInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return result[0];
}

export async function markInvoicePaid(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invoices).set({ status: "paid", paidAt: new Date() }).where(eq(invoices.id, id));
}

export async function updateInvoicePdfUrl(id: number, pdfUrl: string, driveFileId?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invoices).set({ pdfUrl, driveFileId: driveFileId ?? null }).where(eq(invoices.id, id));
}

export async function createPayment(data: InsertPayment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(payments).values(data);
}

export async function getTotalPaidByContractId(contractId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ total: sql<number>`COALESCE(SUM(amountEur), 0)` }).from(payments).where(eq(payments.contractId, contractId));
  return Number(result[0]?.total ?? 0);
}

export async function getPaymentsByContractId(contractId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payments).where(eq(payments.contractId, contractId)).orderBy(desc(payments.paidAt));
}

export async function getContractStats() {
  const db = await getDb();
  if (!db) return { total: 0, pending: 0, signed: 0, cancelled: 0, totalValue: 0 };
  const all = await db.select().from(contracts);
  const total = all.length;
  const pending = all.filter(c => c.status === "pending").length;
  const signed = all.filter(c => c.status === "signed").length;
  const cancelled = all.filter(c => c.status === "cancelled").length;
  const totalValue = all.filter(c => c.status !== "cancelled").reduce((sum, c) => sum + Number(c.contractValue), 0);
  return { total, pending, signed, cancelled, totalValue };
}

export async function getFamilyMemberDistribution() {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select().from(contracts);
  const dist: Record<number, number> = {};
  for (const c of all) {
    dist[c.familyMembers] = (dist[c.familyMembers] ?? 0) + 1;
  }
  return Object.entries(dist).map(([members, count]) => ({ members: Number(members), count }));
}

export async function getRecentContracts(limit = 5) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contracts).orderBy(desc(contracts.createdAt)).limit(limit);
}

export async function getConsultantStats() {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select().from(contracts).where(eq(contracts.status, "signed"));
  const stats: Record<string, { count: number; value: number }> = {};
  for (const c of all) {
    const name = c.consultantName ?? "Unassigned";
    if (!stats[name]) stats[name] = { count: 0, value: 0 };
    stats[name].count++;
    stats[name].value += Number(c.contractValue);
  }
  return Object.entries(stats).map(([name, s]) => ({ name, ...s }));
}
