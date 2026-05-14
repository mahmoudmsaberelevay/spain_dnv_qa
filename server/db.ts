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
    // ── Email-first deduplication ─────────────────────────────────────────────
    // If a user with the same email already exists (e.g. manually pre-created
    // with a placeholder openId), update that row's openId to the real OAuth
    // openId instead of inserting a new row. This prevents duplicate accounts.
    if (user.email) {
      const existing = await db
        .select({ id: users.id, openId: users.openId })
        .from(users)
        .where(eq(users.email, user.email))
        .limit(1);
      if (existing.length > 0 && existing[0].openId !== user.openId) {
        // Existing account found with a different openId — update it in place
        const updateFields: Record<string, unknown> = {
          openId: user.openId,
          lastSignedIn: user.lastSignedIn ?? new Date(),
        };
        if (user.name) updateFields.name = user.name;
        if (user.loginMethod) updateFields.loginMethod = user.loginMethod;
        await db.update(users).set(updateFields).where(eq(users.id, existing[0].id));
        console.log(`[Database] Linked existing account (id=${existing[0].id}, email=${user.email}) to new openId`);
        return;
      }
    }
    // ── Standard openId upsert ────────────────────────────────────────────────
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
import { contracts, invoices, payments, InsertContract, InsertInvoice, InsertPayment, proformaInvoices, InsertProformaInvoice } from "../drizzle/schema";
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

export async function applyContractDiscount(id: number, discountValue: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const contract = await getContractById(id);
  if (!contract) throw new Error("Contract not found");
  // Only allow applying a discount once — if discountValue is already set, reject
  if (Number(contract.discountValue ?? 0) > 0) {
    throw new Error("A discount has already been applied to this contract and cannot be changed.");
  }
  const originalValue = Number(contract.contractValue);
  const newValue = Math.max(0, originalValue - discountValue);
  await db.update(contracts).set({
    contractValue: newValue.toFixed(2),
    discountValue: discountValue.toFixed(2),
  }).where(eq(contracts.id, id));
}

export async function updateContractStatus(id: number, status: "pending" | "signed" | "cancelled") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contracts).set({ status }).where(eq(contracts.id, id));
}

export async function updateContractDocUrl(id: number, docUrl: string, driveFileId?: string, driveLink?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contracts).set({ docUrl, driveFileId: driveFileId ?? null, driveLink: driveLink ?? null }).where(eq(contracts.id, id));
}

export async function getNextContractSequence(): Promise<number> {
  const db = await getDb();
  if (!db) return 1;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(contracts);
  return (result[0]?.count ?? 0) + 1;
}

export async function getNextContractSequenceForYear(yearPrefix: number): Promise<number> {
  const db = await getDb();
  if (!db) return 1;
  // Find the highest numeric suffix for contracts starting with this year prefix
  // This handles mixed-format codes (e.g. '260005' and '26027') correctly
  const prefixStr = String(yearPrefix);
  const result = await db
    .select({ maxCode: sql<string>`MAX(contractCode)` })
    .from(contracts)
    .where(sql`LEFT(contractCode, ${prefixStr.length}) = ${prefixStr} AND contractCode REGEXP '^[0-9]+$'`);
  const maxCode = result[0]?.maxCode;
  if (!maxCode) return 1;
  // Extract the numeric suffix after the year prefix
  const suffix = Number(maxCode.slice(prefixStr.length));
  return suffix + 1;
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

export async function updateInvoicePdfUrl(id: number, pdfUrl: string, driveFileId?: string, driveLink?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invoices).set({ pdfUrl, driveFileId: driveFileId ?? null, driveLink: driveLink ?? null }).where(eq(invoices.id, id));
}

// ─── Proforma Invoices ───────────────────────────────────────────────────────
export async function createProformaInvoice(data: InsertProformaInvoice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(proformaInvoices).values(data);
  const result = await db.select().from(proformaInvoices).where(eq(proformaInvoices.proformaCode, data.proformaCode)).limit(1);
  return result[0];
}

export async function getAllProformaInvoices() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(proformaInvoices).orderBy(desc(proformaInvoices.createdAt));
}

export async function getProformaInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(proformaInvoices).where(eq(proformaInvoices.id, id)).limit(1);
  return result[0];
}

export async function markProformaInvoicePaid(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(proformaInvoices).set({ status: "paid", paidAt: new Date() }).where(eq(proformaInvoices.id, id));
}

export async function updateProformaInvoicePdfUrl(id: number, pdfUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(proformaInvoices).set({ pdfUrl }).where(eq(proformaInvoices.id, id));
}

// ─── Payments ────────────────────────────────────────────────────────────────
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

// ─── Client Documentation DB Helpers ─────────────────────────────────────────
import { clientCases, clientDocuments, InsertClientCase, InsertClientDocument } from "../drizzle/schema";

export async function createClientCase(data: InsertClientCase) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(clientCases).values(data);
  return result;
}

export async function listClientCases(_userId?: number) {
  const db = await getDb();
  if (!db) return [];
  // Return ALL client cases regardless of who created them
  return db.select().from(clientCases).orderBy(clientCases.createdAt);
}

export async function getClientCase(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(clientCases).where(eq(clientCases.id, id)).limit(1);
  return rows[0];
}

export async function updateClientCase(id: number, data: Partial<InsertClientCase>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clientCases).set(data).where(eq(clientCases.id, id));
}
export async function deleteClientCase(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Delete all checklist documents first, then the case itself
  await db.delete(clientDocuments).where(eq(clientDocuments.clientCaseId, id));
  await db.delete(clientCases).where(eq(clientCases.id, id));
}
export async function createClientDocuments(docs: InsertClientDocument[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (docs.length === 0) return;
  await db.insert(clientDocuments).values(docs);
}

export async function getClientDocuments(clientCaseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clientDocuments).where(eq(clientDocuments.clientCaseId, clientCaseId));
}

export async function updateClientDocument(id: number, data: Partial<InsertClientDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clientDocuments).set(data).where(eq(clientDocuments.id, id));
}

export async function updateClientDocumentsByIds(ids: number[], data: Partial<InsertClientDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ids.length === 0) return;
  const { inArray } = await import("drizzle-orm");
  await db.update(clientDocuments).set(data).where(inArray(clientDocuments.id, ids));
}

export async function getAllClientCasesForReminders() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clientCases);
}

export async function getAllClientDocumentsForReminders() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clientDocuments).where(eq(clientDocuments.received, true));
}

// ─── WhatsApp Quality Control DB Helpers ─────────────────────────────────────
import {
  whatsappConfig, whatsappGroups, waMessages, waMediaFiles,
  InsertWhatsappConfig, InsertWhatsappGroup, InsertWaMessage, InsertWaMediaFile,
} from "../drizzle/schema";
import { and as _and, desc as _desc, eq as _eq, gte as _gte, like as _like, lte as _lte, or as _or, sql as _sql } from "drizzle-orm";

export async function getActiveConfig() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(whatsappConfig).where(_eq(whatsappConfig.isActive, true)).limit(1);
  return rows[0] ?? null;
}
export async function getAllConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(whatsappConfig).orderBy(_desc(whatsappConfig.createdAt));
}
export async function upsertConfig(data: Omit<InsertWhatsappConfig, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(whatsappConfig).where(_eq(whatsappConfig.phoneNumberId, data.phoneNumberId)).limit(1);
  if (existing.length > 0) {
    await db.update(whatsappConfig).set({ ...data, updatedAt: new Date() }).where(_eq(whatsappConfig.phoneNumberId, data.phoneNumberId));
  } else {
    await db.insert(whatsappConfig).values(data);
  }
}
export async function deleteConfig(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(whatsappConfig).where(_eq(whatsappConfig.id, id));
}
export async function upsertGroup(data: Omit<InsertWhatsappGroup, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(whatsappGroups).where(_eq(whatsappGroups.groupId, data.groupId)).limit(1);
  if (existing.length > 0) {
    await db.update(whatsappGroups).set({ ...data, updatedAt: new Date() }).where(_eq(whatsappGroups.groupId, data.groupId));
  } else {
    await db.insert(whatsappGroups).values(data);
  }
}
export async function getGroupById(groupId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(whatsappGroups).where(_eq(whatsappGroups.groupId, groupId)).limit(1);
  return rows[0] ?? null;
}
export async function getAllGroups() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(whatsappGroups).orderBy(_desc(whatsappGroups.messageCount));
}
export async function updateGroupStats(groupId: string) {
  const db = await getDb();
  if (!db) return;
  const countResult = await db.select({ count: _sql<number>`count(*)` }).from(waMessages).where(_eq(waMessages.groupId, groupId));
  const lastMsgResult = await db.select({ ts: waMessages.createdAt }).from(waMessages).where(_eq(waMessages.groupId, groupId)).orderBy(_desc(waMessages.createdAt)).limit(1);
  await db.update(whatsappGroups).set({
    messageCount: Number(countResult[0]?.count ?? 0),
    lastMessageAt: lastMsgResult[0]?.ts ?? undefined,
  }).where(_eq(whatsappGroups.groupId, groupId));
}
export async function insertWaMessage(data: InsertWaMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select({ id: waMessages.id }).from(waMessages).where(_eq(waMessages.messageId, data.messageId)).limit(1);
  if (existing.length > 0) return; // deduplicate
  await db.insert(waMessages).values(data);
}
export async function getWaMessages(filter: { groupId?: string; limit?: number; offset?: number; search?: string } = {}) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };
  const conditions: any[] = [];
  if (filter.groupId) conditions.push(_eq(waMessages.groupId, filter.groupId));
  if (filter.search) conditions.push(_like(waMessages.textContent, `%${filter.search}%`));
  const whereClause = conditions.length > 0 ? _and(...conditions) : undefined;
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  const [rows, countResult] = await Promise.all([
    db.select().from(waMessages).where(whereClause).orderBy(_desc(waMessages.createdAt)).limit(limit).offset(offset),
    db.select({ count: _sql<number>`count(*)` }).from(waMessages).where(whereClause),
  ]);
  return { rows, total: Number(countResult[0]?.count ?? 0) };
}
export async function getWaMessageStats() {
  const db = await getDb();
  if (!db) return { total: 0, today: 0, groups: 0, media: 0 };
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [totalResult, todayResult, groupsResult, mediaResult] = await Promise.all([
    db.select({ count: _sql<number>`count(*)` }).from(waMessages),
    db.select({ count: _sql<number>`count(*)` }).from(waMessages).where(_gte(waMessages.createdAt, todayStart)),
    db.select({ count: _sql<number>`count(*)` }).from(whatsappGroups),
    db.select({ count: _sql<number>`count(*)` }).from(waMessages).where(_or(_eq(waMessages.messageType, "image"), _eq(waMessages.messageType, "video"), _eq(waMessages.messageType, "audio"), _eq(waMessages.messageType, "document"))),
  ]);
  return {
    total: Number(totalResult[0]?.count ?? 0),
    today: Number(todayResult[0]?.count ?? 0),
    groups: Number(groupsResult[0]?.count ?? 0),
    media: Number(mediaResult[0]?.count ?? 0),
  };
}
export async function insertWaMediaFile(data: InsertWaMediaFile) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(waMediaFiles).values(data);
}
export async function updateWaMediaFile(id: number, data: Partial<InsertWaMediaFile>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(waMediaFiles).set(data).where(_eq(waMediaFiles.id, id));
}
export async function getWaMediaByMessageId(messageId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(waMediaFiles).where(_eq(waMediaFiles.messageId, messageId));
}
export async function getWaMediaFiles(filter: { mimeTypePrefix?: string; dateFrom?: Date; dateTo?: Date; limit?: number; offset?: number } = {}) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };
  const conditions: any[] = [_eq(waMediaFiles.downloadStatus, "downloaded")];
  if (filter.mimeTypePrefix) conditions.push(_like(waMediaFiles.mimeType, `${filter.mimeTypePrefix}%`));
  if (filter.dateFrom) conditions.push(_gte(waMediaFiles.createdAt, filter.dateFrom));
  if (filter.dateTo) conditions.push(_lte(waMediaFiles.createdAt, filter.dateTo));
  const whereClause = _and(...conditions);
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  const [rows, countResult] = await Promise.all([
    db.select().from(waMediaFiles).where(whereClause).orderBy(_desc(waMediaFiles.createdAt)).limit(limit).offset(offset),
    db.select({ count: _sql<number>`count(*)` }).from(waMediaFiles).where(whereClause),
  ]);
  return { rows, total: Number(countResult[0]?.count ?? 0) };
}
export async function getWaConversations() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    groupId: waMessages.groupId,
    lastMessageAt: _sql<Date>`MAX(${waMessages.createdAt})`,
    messageCount: _sql<number>`COUNT(*)`,
    lastText: _sql<string>`SUBSTRING_INDEX(GROUP_CONCAT(${waMessages.textContent} ORDER BY ${waMessages.createdAt} DESC SEPARATOR '|||'), '|||', 1)`,
    lastSender: _sql<string>`SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(${waMessages.senderName}, ${waMessages.senderPhone}) ORDER BY ${waMessages.createdAt} DESC SEPARATOR '|||'), '|||', 1)`,
    lastType: _sql<string>`SUBSTRING_INDEX(GROUP_CONCAT(${waMessages.messageType} ORDER BY ${waMessages.createdAt} DESC SEPARATOR '|||'), '|||', 1)`,
  }).from(waMessages).groupBy(waMessages.groupId).orderBy(_desc(_sql`MAX(${waMessages.createdAt})`));
  const groups = await db.select().from(whatsappGroups);
  const groupMap = new Map(groups.map((g) => [g.groupId, g]));
  return rows.map((r) => {
    const meta = groupMap.get(r.groupId);
    const isGroup = r.groupId.includes("@g.us") || r.groupId.includes("-");
    return {
      id: r.groupId,
      name: meta?.name || (isGroup ? r.groupId : r.lastSender || r.groupId),
      isGroup,
      lastMessage: r.lastText || `[${r.lastType}]`,
      lastSender: r.lastSender,
      lastMessageAt: r.lastMessageAt,
      messageCount: Number(r.messageCount),
      isActive: meta?.isActive ?? true,
    };
  });
}

// ─── Client Workflows ─────────────────────────────────────────────────────────
import { clientWorkflows, InsertClientWorkflow } from "../drizzle/schema";

export async function createClientWorkflow(data: InsertClientWorkflow) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(clientWorkflows).values(data);
  const id = (result as any).insertId as number;
  const rows = await db.select().from(clientWorkflows).where(eq(clientWorkflows.id, id)).limit(1);
  return rows[0];
}

export async function listClientWorkflows() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clientWorkflows).orderBy(desc(clientWorkflows.createdAt));
}

export async function getClientWorkflowById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(clientWorkflows).where(eq(clientWorkflows.id, id)).limit(1);
  return rows[0];
}

export async function deleteClientWorkflow(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clientWorkflows).where(eq(clientWorkflows.id, id));
}
