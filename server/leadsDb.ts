import { getDb } from "./db";
import { leads, leadActivities, leadNotes, leadTasks } from "../drizzle/schema";
import { eq, desc, like, or, and, sql } from "drizzle-orm";
import type { InsertLead, InsertLeadActivity, InsertLeadNote, InsertLeadTask } from "../drizzle/schema";

const now = () => Date.now();

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function createLead(data: Omit<InsertLead, "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const ts = now();
  const [result] = await db.insert(leads).values({ ...data, createdAt: ts, updatedAt: ts });
  return (result as any).insertId as number;
}

export async function getLeadById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return row ?? null;
}

export async function listLeads(filters?: {
  search?: string;
  stage?: string;
  leadSource?: string;
  interestedProgram?: string;
  assignedTo?: string;
  priority?: string;
  dateFrom?: number;
  dateTo?: number;
  lastActivityFrom?: number;
  lastActivityTo?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  let query = db.select().from(leads).$dynamic();

  const conditions: any[] = [];

  if (filters?.search) {
    const s = `%${filters.search}%`;
    conditions.push(
      or(
        like(leads.fullName, s),
        like(leads.phone, s),
        like(leads.email, s),
        like(leads.whatsapp, s)
      )
    );
  }
  if (filters?.stage) conditions.push(eq(leads.stage, filters.stage as any));
  if (filters?.leadSource) conditions.push(eq(leads.leadSource, filters.leadSource));
  if (filters?.interestedProgram) conditions.push(eq(leads.interestedProgram, filters.interestedProgram));
  if (filters?.assignedTo) conditions.push(eq(leads.assignedTo, filters.assignedTo));
  if (filters?.priority) conditions.push(eq(leads.priority, filters.priority as any));
  if (filters?.dateFrom) conditions.push(sql`${leads.createdAt} >= ${filters.dateFrom}`);
  if (filters?.dateTo) conditions.push(sql`${leads.createdAt} <= ${filters.dateTo}`);
  if (filters?.lastActivityFrom) conditions.push(sql`${leads.lastContactAt} >= ${filters.lastActivityFrom}`);
  if (filters?.lastActivityTo) conditions.push(sql`${leads.lastContactAt} <= ${filters.lastActivityTo}`);
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  return query.orderBy(desc(leads.createdAt));
}

export async function updateLead(id: number, data: Partial<InsertLead>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(leads).set({ ...data, updatedAt: now() }).where(eq(leads.id, id));
}

export async function deleteLead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(leadTasks).where(eq(leadTasks.leadId, id));
  await db.delete(leadNotes).where(eq(leadNotes.leadId, id));
  await db.delete(leadActivities).where(eq(leadActivities.leadId, id));
  await db.delete(leads).where(eq(leads.id, id));
}

export async function checkDuplicate(phone?: string, email?: string, whatsapp?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const conditions: any[] = [];
  if (phone) conditions.push(eq(leads.phone, phone));
  if (email) conditions.push(eq(leads.email, email));
  if (whatsapp) conditions.push(eq(leads.whatsapp, whatsapp));
  if (conditions.length === 0) return null;
  const [row] = await db.select({ id: leads.id, fullName: leads.fullName }).from(leads).where(or(...conditions)).limit(1);
  return row ?? null;
}

// ─── Activities ───────────────────────────────────────────────────────────────

export async function addLeadActivity(data: Omit<InsertLeadActivity, "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(leadActivities).values({ ...data, createdAt: now() });
}

export async function getLeadActivities(leadId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.select().from(leadActivities).where(eq(leadActivities.leadId, leadId)).orderBy(desc(leadActivities.createdAt));
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function addLeadNote(data: Omit<InsertLeadNote, "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const ts = now();
  const [result] = await db.insert(leadNotes).values({ ...data, createdAt: ts, updatedAt: ts });
  return (result as any).insertId as number;
}

export async function getLeadNotes(leadId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.select().from(leadNotes).where(eq(leadNotes.leadId, leadId)).orderBy(desc(leadNotes.isPinned), desc(leadNotes.createdAt));
}

export async function updateLeadNote(id: number, data: Partial<InsertLeadNote>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(leadNotes).set({ ...data, updatedAt: now() }).where(eq(leadNotes.id, id));
}

export async function deleteLeadNote(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(leadNotes).where(eq(leadNotes.id, id));
}

export async function getLeadNoteById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.select().from(leadNotes).where(eq(leadNotes.id, id)).limit(1);
  return row ?? null;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function createLeadTask(data: Omit<InsertLeadTask, "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(leadTasks).values({ ...data, createdAt: now() });
  return (result as any).insertId as number;
}

export async function getLeadTasks(leadId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.select().from(leadTasks).where(eq(leadTasks.leadId, leadId)).orderBy(leadTasks.dueDate);
}

export async function completeLeadTask(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(leadTasks).set({ completed: true, completedAt: now() }).where(eq(leadTasks.id, id));
}

export async function deleteLeadTask(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(leadTasks).where(eq(leadTasks.id, id));
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getLeadStageCounts() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db
    .select({ stage: leads.stage, count: sql<number>`COUNT(*)` })
    .from(leads)
    .groupBy(leads.stage);
}

export async function getLeadSourceCounts() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db
    .select({ source: leads.leadSource, count: sql<number>`COUNT(*)` })
    .from(leads)
    .groupBy(leads.leadSource);
}

export async function getLeadProgramCounts() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db
    .select({ program: leads.interestedProgram, count: sql<number>`COUNT(*)` })
    .from(leads)
    .groupBy(leads.interestedProgram);
}

export async function getMonthlyLeadConversions(year: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db
    .select({
      month: sql<number>`MONTH(FROM_UNIXTIME(${leads.createdAt} / 1000))`,
      total: sql<number>`COUNT(*)`,
      converted: sql<number>`SUM(CASE WHEN ${leads.stage} = 'client' THEN 1 ELSE 0 END)`,
    })
    .from(leads)
    .where(sql`YEAR(FROM_UNIXTIME(${leads.createdAt} / 1000)) = ${year}`)
    .groupBy(sql`MONTH(FROM_UNIXTIME(${leads.createdAt} / 1000))`);
}

export async function getLeadTotalCount() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(leads);
  return Number(row?.count ?? 0);
}
