import { eq, desc, and, gte, lte, or, like } from "drizzle-orm";
import { getDb } from "./db";
import { paralegalClientRecords, InsertParalegalClientRecord, finClients } from "../drizzle/schema";

// ─── Paralegal Client Records ─────────────────────────────────────────────────
export async function listParalegalClientRecords(opts?: { dateFrom?: Date; dateTo?: Date }) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (opts?.dateFrom) conditions.push(gte(paralegalClientRecords.recordDate, opts.dateFrom));
  if (opts?.dateTo) conditions.push(lte(paralegalClientRecords.recordDate, opts.dateTo));
  
  const query = db.select().from(paralegalClientRecords);
  if (conditions.length > 0) query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  return await query.orderBy(desc(paralegalClientRecords.recordDate));
}

export async function getParalegalClientRecord(id: number) {
  const db = await getDb(); if (!db) return null;
  const result = await db.select().from(paralegalClientRecords).where(eq(paralegalClientRecords.id, id));
  return result[0] || null;
}

export async function createParalegalClientRecord(data: InsertParalegalClientRecord) {
  const db = await getDb(); if (!db) return null;
  const result = await db.insert(paralegalClientRecords).values(data);
  return result;
}

export async function updateParalegalClientRecord(id: number, data: Partial<InsertParalegalClientRecord>) {
  const db = await getDb(); if (!db) return null;
  return await db.update(paralegalClientRecords)
    .set(data)
    .where(eq(paralegalClientRecords.id, id));
}

export async function deleteParalegalClientRecord(id: number) {
  const db = await getDb(); if (!db) return null;
  return await db.delete(paralegalClientRecords).where(eq(paralegalClientRecords.id, id));
}

// ─── Fetch Clients from Financial Module ─────────────────────────────────────
export async function listFinancialClients(searchTerm?: string) {
  const db = await getDb(); if (!db) return [];
  
  const query = db.select({
    id: finClients.id,
    clientName: finClients.clientName,
    clientCode: finClients.clientCode,
  }).from(finClients);

  if (searchTerm) {
    // Search by client name or code
    const likePattern = `%${searchTerm}%`;
    query.where(
      or(
        like(finClients.clientName, likePattern),
        like(finClients.clientCode, likePattern)
      )
    );
  }

  return await query.limit(100);
}
