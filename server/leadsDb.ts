import { getDb } from "./db";
import { finEmployees, leads, leadActivities, leadNotes, leadTasks } from "../drizzle/schema";
import { eq, desc, asc, like, or, and, sql, inArray, count } from "drizzle-orm";
import type { InsertLead, InsertLeadActivity, InsertLeadNote, InsertLeadTask } from "../drizzle/schema";
import { buildLeadPersonnelOptions } from "../shared/leadPersonnel";
import {
  getLeadTaskDayBounds,
  type LeadTaskLifecycle,
  type LeadTaskLifecycleCounts,
} from "../shared/leadTaskLifecycle";

const now = () => Date.now();
const operationalLeadCondition = eq(leads.isMetaTestLead, false);

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function listLeadPersonnelOptions() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const employeeRows = await db
    .select({
      id: finEmployees.id,
      name: finEmployees.name,
      role: finEmployees.role,
      isActive: finEmployees.isActive,
    })
    .from(finEmployees)
    .where(eq(finEmployees.isActive, true))
    .orderBy(asc(finEmployees.name), asc(finEmployees.id));

  return buildLeadPersonnelOptions(employeeRows);
}

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
  metaFormId?: string;
  metaCampaign?: string;
  metaAdset?: string;
  metaAd?: string;
  metaSyncStatus?: string;
  metaEventStatus?: string;
  specialNote?: "any" | "zoom_meeting" | "physical_meeting";
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(300, Math.max(10, filters?.pageSize ?? 100));
  const offset = (page - 1) * pageSize;

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
  if (filters?.interestedProgram) conditions.push(like(leads.interestedProgram, `%${filters.interestedProgram}%`));
  if (filters?.assignedTo) conditions.push(eq(leads.assignedTo, filters.assignedTo));
  if (filters?.priority) conditions.push(eq(leads.priority, filters.priority as any));
  if (filters?.dateFrom) conditions.push(sql`${leads.createdAt} >= ${filters.dateFrom}`);
  if (filters?.dateTo) conditions.push(sql`${leads.createdAt} <= ${filters.dateTo}`);
  if (filters?.lastActivityFrom) conditions.push(sql`${leads.lastContactAt} >= ${filters.lastActivityFrom}`);
  if (filters?.lastActivityTo) conditions.push(sql`${leads.lastContactAt} <= ${filters.lastActivityTo}`);
  if (filters?.metaFormId) conditions.push(eq(leads.metaFormId, filters.metaFormId));
  if (filters?.metaCampaign) conditions.push(eq(leads.metaCampaign, filters.metaCampaign));
  if (filters?.metaAdset) conditions.push(eq(leads.metaAdset, filters.metaAdset));
  if (filters?.metaAd) conditions.push(eq(leads.metaAd, filters.metaAd));
  if (filters?.metaSyncStatus) conditions.push(eq(leads.metaSyncStatus, filters.metaSyncStatus as any));
  if (filters?.metaEventStatus) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM meta_crm_event_log event_log
      WHERE event_log.leadId = ${leads.id}
        AND event_log.status = ${filters.metaEventStatus}
      )`);
  }
  if (filters?.specialNote === "any") {
    conditions.push(sql`${leads.specialNoteType} IS NOT NULL`);
  } else if (filters?.specialNote) {
    conditions.push(eq(leads.specialNoteType, filters.specialNote));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Run data + count in parallel for best performance
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(leads)
      .where(whereClause)
      .orderBy(desc(leads.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(leads).where(whereClause),
  ]);

  return {
    leads: rows,
    total: total as number,
    page,
    pageSize,
    totalPages: Math.ceil((total as number) / pageSize),
  };
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

export async function bulkDeleteLeads(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return 0;
  // Delete related records in bulk batches using IN clause (much faster than N individual queries)
  const batchSize = 200;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    await Promise.all([
      db.delete(leadTasks).where(inArray(leadTasks.leadId, batch)),
      db.delete(leadNotes).where(inArray(leadNotes.leadId, batch)),
      db.delete(leadActivities).where(inArray(leadActivities.leadId, batch)),
    ]);
    await db.delete(leads).where(inArray(leads.id, batch));
    deleted += batch.length;
  }
  return deleted;
}

export async function getLeadsByIds(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return [];
  // Single query with IN clause instead of N individual queries
  return db.select().from(leads).where(inArray(leads.id, ids));
}

/** Bulk update stage for multiple leads */
export async function bulkUpdateLeadsStage(ids: number[], stage: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return 0;
  const batchSize = 200;
  let updated = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    await db.update(leads)
      .set({ stage: stage as any, updatedAt: now() })
      .where(inArray(leads.id, batch));
    updated += batch.length;
  }
  return updated;
}

/** Bulk update assignedTo for multiple leads */
export async function bulkUpdateLeadsOwner(ids: number[], assignedTo: string | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (ids.length === 0) return 0;
  const batchSize = 200;
  let updated = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    await db.update(leads)
      .set({ assignedTo: assignedTo ?? null, updatedAt: now() })
      .where(inArray(leads.id, batch));
    updated += batch.length;
  }
  return updated;
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
    .where(operationalLeadCondition)
    .groupBy(leads.stage);
}

export async function getLeadSourceCounts() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db
    .select({ source: leads.leadSource, count: sql<number>`COUNT(*)` })
    .from(leads)
    .where(operationalLeadCondition)
    .groupBy(leads.leadSource);
}

export async function getLeadProgramCounts() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db
    .select({ program: leads.interestedProgram, count: sql<number>`COUNT(*)` })
    .from(leads)
    .where(operationalLeadCondition)
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
    .where(and(operationalLeadCondition, sql`YEAR(FROM_UNIXTIME(${leads.createdAt} / 1000)) = ${year}`))
    .groupBy(sql`MONTH(FROM_UNIXTIME(${leads.createdAt} / 1000))`);
}

export async function getLeadTotalCount() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(leads).where(operationalLeadCondition);
  return Number(row?.count ?? 0);
}

export async function getLeadCampaignCounts() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db
    .select({ campaign: leads.metaCampaign, count: sql<number>`COUNT(*)` })
    .from(leads)
    .where(and(operationalLeadCondition, sql`${leads.metaCampaign} IS NOT NULL AND ${leads.metaCampaign} != ''`))
    .groupBy(leads.metaCampaign)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(15);
}

export async function getLeadFormCounts() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db
    .select({ form: leads.metaFormName, count: sql<number>`COUNT(*)` })
    .from(leads)
    .where(and(operationalLeadCondition, sql`${leads.metaFormName} IS NOT NULL AND ${leads.metaFormName} != ''`))
    .groupBy(leads.metaFormName)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(20);
}

// ─── Reporting ────────────────────────────────────────────────────────────────

/** Get new leads count grouped by day within a date range */
export async function getNewLeadsReport(dateFrom: number, dateTo: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [{ total }] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(leads)
    .where(and(operationalLeadCondition, sql`${leads.createdAt} >= ${dateFrom} AND ${leads.createdAt} <= ${dateTo}`));
  const byDay = await db
    .select({
      day: sql<string>`DATE(FROM_UNIXTIME(${leads.createdAt} / 1000))`,
      count: sql<number>`COUNT(*)`,
    })
    .from(leads)
    .where(and(operationalLeadCondition, sql`${leads.createdAt} >= ${dateFrom} AND ${leads.createdAt} <= ${dateTo}`))
    .groupBy(sql`DATE(FROM_UNIXTIME(${leads.createdAt} / 1000))`)
    .orderBy(sql`DATE(FROM_UNIXTIME(${leads.createdAt} / 1000))`);
  return { total: Number(total), byDay };
}

/** Parse from/to stages from a stage_changed description string */
function parseStageFromDescription(description: string): { fromStage: string | null; toStage: string | null } {
  const match = description.match(/Stage changed from "([^"]+)" to "([^"]+)"/);
  if (match) return { fromStage: match[1], toStage: match[2] };
  return { fromStage: null, toStage: null };
}

/** Get stage change activities within a date range, optionally filtered by user, fromStage, toStage */
export async function getStageChangeReport(dateFrom: number, dateTo: number, userId?: number, fromStage?: string, toStage?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const conditions: any[] = [
    eq(leadActivities.activityType, "stage_changed"),
    sql`${leadActivities.createdAt} >= ${dateFrom}`,
    sql`${leadActivities.createdAt} <= ${dateTo}`,
  ];
  if (userId) conditions.push(eq(leadActivities.userId, userId));
  // Filter by fromStage/toStage using LIKE on description
  if (fromStage) conditions.push(sql`${leadActivities.description} LIKE ${`Stage changed from "${fromStage}"%`}`);
  if (toStage) conditions.push(sql`${leadActivities.description} LIKE ${`%to "${toStage}"%`}`);
  const rows = await db
    .select({
      id: leadActivities.id,
      leadId: leadActivities.leadId,
      userId: leadActivities.userId,
      description: leadActivities.description,
      createdAt: leadActivities.createdAt,
    })
    .from(leadActivities)
    .innerJoin(leads, eq(leadActivities.leadId, leads.id))
    .where(and(operationalLeadCondition, ...conditions))
    .orderBy(desc(leadActivities.createdAt))
    .limit(500);
  // Parse from/to stages for each row
  return rows.map(r => ({ ...r, ...parseStageFromDescription(r.description) }));
}

/** Get activity counts per user within a date range */
export async function getUserActivityReport(dateFrom: number, dateTo: number, userId?: number, activityTypes?: string[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const conditions: any[] = [
    sql`${leadActivities.createdAt} >= ${dateFrom}`,
    sql`${leadActivities.createdAt} <= ${dateTo}`,
  ];
  if (userId) conditions.push(eq(leadActivities.userId, userId));
  if (activityTypes && activityTypes.length > 0) {
    conditions.push(inArray(leadActivities.activityType as any, activityTypes));
  }
  // Summary: total per user
  const summary = await db
    .select({
      userId: leadActivities.userId,
      total: sql<number>`COUNT(*)`,
      byType: sql<string>`GROUP_CONCAT(DISTINCT ${leadActivities.activityType})`,
    })
    .from(leadActivities)
    .innerJoin(leads, eq(leadActivities.leadId, leads.id))
    .where(and(operationalLeadCondition, ...conditions))
    .groupBy(leadActivities.userId);
  // Breakdown per user per type
  const breakdown = await db
    .select({
      userId: leadActivities.userId,
      activityType: leadActivities.activityType,
      count: sql<number>`COUNT(*)`,
    })
    .from(leadActivities)
    .innerJoin(leads, eq(leadActivities.leadId, leads.id))
    .where(and(operationalLeadCondition, ...conditions))
    .groupBy(leadActivities.userId, leadActivities.activityType)
    .orderBy(leadActivities.userId, desc(sql`COUNT(*)`));
  return { summary, breakdown };
}

/** Get today's activity summary: counts per activity type (unique leads), and stage change breakdown */
export async function getTodayActivityReport() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Today's date range in UTC ms
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 86400000; // +24h

  // Count of DISTINCT leads with each activity type today
  const activityTypes = ["call", "whatsapp", "sms", "email", "meeting", "note_added", "stage_changed"];
  const activityCounts = await Promise.all(
    activityTypes.map(async (type) => {
      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${leadActivities.leadId})` })
        .from(leadActivities)
        .innerJoin(leads, eq(leadActivities.leadId, leads.id))
        .where(and(
          operationalLeadCondition,
          eq(leadActivities.activityType as any, type),
          sql`${leadActivities.createdAt} >= ${todayStart}`,
          sql`${leadActivities.createdAt} < ${todayEnd}`,
        ));
      return { activityType: type, leadCount: Number(count) };
    })
  );

  // Stage changes today: group by from→to pair, count distinct leads
  const stageRows = await db
    .select({
      description: leadActivities.description,
      leadId: leadActivities.leadId,
    })
    .from(leadActivities)
    .innerJoin(leads, eq(leadActivities.leadId, leads.id))
    .where(and(
      operationalLeadCondition,
      eq(leadActivities.activityType, "stage_changed"),
      sql`${leadActivities.createdAt} >= ${todayStart}`,
      sql`${leadActivities.createdAt} < ${todayEnd}`,
    ));

  // Parse and aggregate from→to pairs
  const pairMap: Record<string, Set<number>> = {};
  for (const row of stageRows) {
    const { fromStage, toStage } = parseStageFromDescription(row.description);
    if (fromStage && toStage) {
      const key = `${fromStage}→${toStage}`;
      if (!pairMap[key]) pairMap[key] = new Set();
      pairMap[key].add(row.leadId);
    }
  }
  const stageChangePairs = Object.entries(pairMap)
    .map(([pair, leads]) => {
      const [fromStage, toStage] = pair.split("→");
      return { fromStage, toStage, leadCount: leads.size };
    })
    .sort((a, b) => b.leadCount - a.leadCount);

  return { activityCounts, stageChangePairs, date: new Date(todayStart).toISOString().split("T")[0] };
}

// ─── All Tasks (for Tasks page) ───────────────────────────────────────────────
export type LeadTaskPageFilters = {
  assignedTo?: string;
  taskType?: string;
  search?: string;
  leadIds?: number[];
  lifecycle?: LeadTaskLifecycle;
  page?: number;
  pageSize?: number;
  now?: number;
};

function buildLeadTaskLifecycleCondition(
  lifecycle: LeadTaskLifecycle,
  todayStart: number,
  todayEnd: number,
) {
  if (lifecycle === "completed") return eq(leadTasks.completed, true);
  if (lifecycle === "overdue") {
    return and(eq(leadTasks.completed, false), sql`${leadTasks.dueDate} < ${todayStart}`);
  }
  if (lifecycle === "pending") {
    return and(
      eq(leadTasks.completed, false),
      sql`${leadTasks.dueDate} >= ${todayStart}`,
      sql`${leadTasks.dueDate} <= ${todayEnd}`,
    );
  }
  if (lifecycle === "coming") {
    return and(eq(leadTasks.completed, false), sql`${leadTasks.dueDate} > ${todayEnd}`);
  }
  return undefined;
}

export async function getLeadTaskFilterOptions() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [leadRows, taskTypeRows] = await Promise.all([
    db
      .select({ id: leads.id, fullName: leads.fullName })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(operationalLeadCondition)
      .groupBy(leads.id, leads.fullName)
      .orderBy(asc(leads.fullName), asc(leads.id)),
    db
      .select({ taskType: leadTasks.taskType, taskCount: count() })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(operationalLeadCondition)
      .groupBy(leadTasks.taskType)
      .orderBy(asc(leadTasks.taskType)),
  ]);

  return {
    leads: leadRows,
    taskTypes: taskTypeRows.map(row => ({
      taskType: row.taskType,
      taskCount: Number(row.taskCount),
    })),
  };
}

export async function getAllTasksWithLeads(filters: LeadTaskPageFilters = {}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const lifecycle = filters.lifecycle ?? "all";
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(25, filters.pageSize ?? 100));
  const offset = (page - 1) * pageSize;
  const { start: todayStart, end: todayEnd } = getLeadTaskDayBounds(filters.now);

  const baseConditions: any[] = [operationalLeadCondition];
  if (filters.assignedTo) baseConditions.push(eq(leadTasks.assignedTo, filters.assignedTo));
  if (filters.taskType) baseConditions.push(eq(leadTasks.taskType, filters.taskType as any));
  if (filters.leadIds) {
    if (filters.leadIds.length === 0) {
      return {
        tasks: [],
        total: 0,
        page,
        pageSize,
        totalPages: 1,
        lifecycleCounts: { all: 0, completed: 0, pending: 0, coming: 0, overdue: 0 },
      };
    }
    baseConditions.push(inArray(leadTasks.leadId, filters.leadIds));
  }
  if (filters.search?.trim()) {
    const search = `%${filters.search.trim()}%`;
    baseConditions.push(or(
      like(leadTasks.notes, search),
      like(leads.fullName, search),
      sql`CAST(${leads.id} AS CHAR) LIKE ${search}`,
    ));
  }

  const lifecycleCondition = buildLeadTaskLifecycleCondition(lifecycle, todayStart, todayEnd);
  const rowConditions = lifecycleCondition
    ? [...baseConditions, lifecycleCondition]
    : baseConditions;
  const baseWhere = and(...baseConditions);
  const rowWhere = and(...rowConditions);
  const ordering = lifecycle === "completed"
    ? [desc(leadTasks.completedAt), desc(leadTasks.id)]
    : lifecycle === "all"
      ? [
          asc(sql`CASE WHEN ${leadTasks.completed} = FALSE THEN 0 ELSE 1 END`),
          asc(leadTasks.dueDate),
          desc(leadTasks.id),
        ]
      : [asc(leadTasks.dueDate), desc(leadTasks.id)];

  const lifecycleCountsQuery = db
    .select({
      all: count(),
      completed: sql<number>`SUM(CASE WHEN ${leadTasks.completed} = TRUE THEN 1 ELSE 0 END)`,
      pending: sql<number>`SUM(CASE WHEN ${leadTasks.completed} = FALSE AND ${leadTasks.dueDate} >= ${todayStart} AND ${leadTasks.dueDate} <= ${todayEnd} THEN 1 ELSE 0 END)`,
      coming: sql<number>`SUM(CASE WHEN ${leadTasks.completed} = FALSE AND ${leadTasks.dueDate} > ${todayEnd} THEN 1 ELSE 0 END)`,
      overdue: sql<number>`SUM(CASE WHEN ${leadTasks.completed} = FALSE AND ${leadTasks.dueDate} < ${todayStart} THEN 1 ELSE 0 END)`,
    })
    .from(leadTasks)
    .innerJoin(leads, eq(leadTasks.leadId, leads.id))
    .where(baseWhere);

  const [rows, [{ total }], [rawLifecycleCounts]] = await Promise.all([
    db
      .select({
        id: leadTasks.id,
        leadId: leadTasks.leadId,
        assignedTo: leadTasks.assignedTo,
        createdBy: leadTasks.createdBy,
        taskType: leadTasks.taskType,
        dueDate: leadTasks.dueDate,
        completed: leadTasks.completed,
        completedAt: leadTasks.completedAt,
        notes: leadTasks.notes,
        createdAt: leadTasks.createdAt,
        leadName: leads.fullName,
        leadStage: leads.stage,
        leadPhone: leads.phone,
      })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(rowWhere)
      .orderBy(...ordering)
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(leadTasks)
      .innerJoin(leads, eq(leadTasks.leadId, leads.id))
      .where(rowWhere),
    lifecycleCountsQuery,
  ]);

  const lifecycleCounts: LeadTaskLifecycleCounts = {
    all: Number(rawLifecycleCounts?.all ?? 0),
    completed: Number(rawLifecycleCounts?.completed ?? 0),
    pending: Number(rawLifecycleCounts?.pending ?? 0),
    coming: Number(rawLifecycleCounts?.coming ?? 0),
    overdue: Number(rawLifecycleCounts?.overdue ?? 0),
  };

  const totalNumber = Number(total ?? 0);
  return {
    tasks: rows,
    total: totalNumber,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalNumber / pageSize)),
    lifecycleCounts,
  };
}
