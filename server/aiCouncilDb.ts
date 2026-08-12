import { and, desc, eq } from "drizzle-orm";
import {
  aiCouncilCases,
  aiCouncilDecisions,
  aiCouncilOpinions,
  type InsertAiCouncilCase,
  type InsertAiCouncilDecision,
  type InsertAiCouncilOpinion,
} from "../drizzle/schema";
import { getDb } from "./db";

export const COUNCIL_ROLES = [
  "strategy",
  "critical_review",
  "research_execution",
  "financial",
  "opposition",
  "chairperson",
] as const;

export type CouncilRole = (typeof COUNCIL_ROLES)[number];
export type CouncilCaseStatus = "draft" | "running" | "awaiting_manus" | "ready_for_decision" | "finalized" | "failed";
export type CouncilOpinionStatus = "queued" | "running" | "completed" | "needs_input" | "failed" | "unavailable";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

export async function createCouncilCase(data: InsertAiCouncilCase) {
  const db = await requireDb();
  const [result] = await db.insert(aiCouncilCases).values(data);
  return getCouncilCaseById(Number((result as { insertId: number }).insertId));
}

export async function listCouncilCases() {
  const db = await requireDb();
  return db.select().from(aiCouncilCases).orderBy(desc(aiCouncilCases.updatedAt));
}

export async function getCouncilCaseById(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(aiCouncilCases).where(eq(aiCouncilCases.id, id)).limit(1);
  return rows[0];
}

export async function updateCouncilCase(id: number, data: Partial<InsertAiCouncilCase>) {
  const db = await requireDb();
  await db.update(aiCouncilCases).set(data).where(eq(aiCouncilCases.id, id));
  return getCouncilCaseById(id);
}

export async function listCouncilOpinions(councilCaseId: number) {
  const db = await requireDb();
  return db.select().from(aiCouncilOpinions)
    .where(eq(aiCouncilOpinions.councilCaseId, councilCaseId))
    .orderBy(desc(aiCouncilOpinions.createdAt), desc(aiCouncilOpinions.id));
}

export async function getCouncilOpinionById(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(aiCouncilOpinions).where(eq(aiCouncilOpinions.id, id)).limit(1);
  return rows[0];
}

export async function getLatestCouncilOpinion(councilCaseId: number, role: CouncilRole) {
  const db = await requireDb();
  const rows = await db.select().from(aiCouncilOpinions)
    .where(and(eq(aiCouncilOpinions.councilCaseId, councilCaseId), eq(aiCouncilOpinions.role, role)))
    .orderBy(desc(aiCouncilOpinions.attempt), desc(aiCouncilOpinions.id))
    .limit(1);
  return rows[0];
}

export async function getCouncilOpinionByExternalTaskId(externalTaskId: string) {
  const db = await requireDb();
  const rows = await db.select().from(aiCouncilOpinions)
    .where(eq(aiCouncilOpinions.externalTaskId, externalTaskId))
    .limit(1);
  return rows[0];
}

export async function getNextCouncilOpinionAttempt(councilCaseId: number, role: CouncilRole) {
  const latest = await getLatestCouncilOpinion(councilCaseId, role);
  return (latest?.attempt ?? 0) + 1;
}

export async function createCouncilOpinion(data: InsertAiCouncilOpinion) {
  const db = await requireDb();
  const [result] = await db.insert(aiCouncilOpinions).values(data);
  return getCouncilOpinionById(Number((result as { insertId: number }).insertId));
}

export async function updateCouncilOpinion(id: number, data: Partial<InsertAiCouncilOpinion>) {
  const db = await requireDb();
  await db.update(aiCouncilOpinions).set(data).where(eq(aiCouncilOpinions.id, id));
  return getCouncilOpinionById(id);
}

export async function getCouncilDecision(councilCaseId: number) {
  const db = await requireDb();
  const rows = await db.select().from(aiCouncilDecisions)
    .where(eq(aiCouncilDecisions.councilCaseId, councilCaseId)).limit(1);
  return rows[0];
}

export async function createCouncilDecision(data: InsertAiCouncilDecision) {
  const existing = await getCouncilDecision(data.councilCaseId);
  if (existing) throw new Error("A final council decision already exists for this case.");
  const db = await requireDb();
  const [result] = await db.insert(aiCouncilDecisions).values(data);
  const id = Number((result as { insertId: number }).insertId);
  const rows = await db.select().from(aiCouncilDecisions).where(eq(aiCouncilDecisions.id, id)).limit(1);
  return rows[0];
}

export async function getCouncilCaseWorkspace(councilCaseId: number) {
  const councilCase = await getCouncilCaseById(councilCaseId);
  if (!councilCase) return undefined;
  const [opinions, decision] = await Promise.all([
    listCouncilOpinions(councilCaseId),
    getCouncilDecision(councilCaseId),
  ]);
  return { councilCase, opinions, decision };
}
