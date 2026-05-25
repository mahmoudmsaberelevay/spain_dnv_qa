import { getDb } from "./db";
import { leadSources, leadIntegrations, leadsPermissions, leads, users, leadPrograms, leadActivityPresets } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { InsertLeadSource, InsertLeadIntegration } from "../drizzle/schema";
import crypto from "crypto";

// ─── Lead Sources ─────────────────────────────────────────────────────────────

export async function listLeadSources() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leadSources).orderBy(leadSources.createdAt);
}

export async function createLeadSource(data: { name: string; color?: string }) {
  const db = await getDb();
  if (!db) return null;
  const now = Date.now();
  const [result] = await db.insert(leadSources).values({
    name: data.name,
    color: data.color ?? "#6366f1",
    isActive: true,
    isDefault: false,
    createdAt: now,
  });
  return result;
}

export async function updateLeadSource(id: number, data: { name?: string; color?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return;
  await db.update(leadSources).set(data).where(eq(leadSources.id, id));
}

export async function deleteLeadSource(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(leadSources).where(eq(leadSources.id, id));
}

// ─── Lead Programs ────────────────────────────────────────────────────────────

export async function listLeadPrograms() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leadPrograms).orderBy(leadPrograms.createdAt);
}

export async function createLeadProgram(data: { name: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(leadPrograms).values({ name: data.name, isActive: true, createdAt: Date.now() });
}

export async function updateLeadProgram(id: number, data: { name?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) return;
  await db.update(leadPrograms).set(data).where(eq(leadPrograms.id, id));
}

export async function deleteLeadProgram(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(leadPrograms).where(eq(leadPrograms.id, id));
}

// ─── Activity Presets ─────────────────────────────────────────────────────────

export async function listActivityPresets() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leadActivityPresets).orderBy(leadActivityPresets.createdAt);
}

export async function createActivityPreset(data: {
  label: string;
  activityType: "call" | "whatsapp" | "sms" | "email" | "meeting" | "note" | "stage_change" | "email_sent" | "other";
  score: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(leadActivityPresets).values({ ...data, isActive: true, isDefault: false, createdAt: Date.now() });
}

export async function updateActivityPreset(id: number, data: {
  label?: string;
  activityType?: "call" | "whatsapp" | "sms" | "email" | "meeting" | "note" | "stage_change" | "email_sent" | "other";
  score?: number;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(leadActivityPresets).set(data).where(eq(leadActivityPresets.id, id));
}

export async function deleteActivityPreset(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(leadActivityPresets).where(eq(leadActivityPresets.id, id));
}

// ─── Lead Integrations ────────────────────────────────────────────────────────

export async function listLeadIntegrations() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leadIntegrations).orderBy(leadIntegrations.createdAt);
}

export async function createLeadIntegration(data: {
  type: "meta" | "website";
  name: string;
  config?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return { webhookToken: "" };
  const now = Date.now();
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(leadIntegrations).values({
    type: data.type,
    name: data.name,
    config: data.config ? JSON.stringify(data.config) : null,
    isActive: true,
    webhookToken: token,
    createdAt: now,
    updatedAt: now,
  });
  return { webhookToken: token };
}

export async function updateLeadIntegration(id: number, data: {
  name?: string;
  config?: Record<string, unknown>;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (data.name !== undefined) update.name = data.name;
  if (data.isActive !== undefined) update.isActive = data.isActive;
  if (data.config !== undefined) update.config = JSON.stringify(data.config);
  await db.update(leadIntegrations).set(update).where(eq(leadIntegrations.id, id));
}

export async function deleteLeadIntegration(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(leadIntegrations).where(eq(leadIntegrations.id, id));
}

export async function getIntegrationByToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(leadIntegrations)
    .where(and(eq(leadIntegrations.webhookToken, token), eq(leadIntegrations.isActive, true)));
  return row ?? null;
}

export async function regenerateWebhookToken(id: number) {
  const db = await getDb();
  if (!db) return "";
  const token = crypto.randomBytes(32).toString("hex");
  await db.update(leadIntegrations)
    .set({ webhookToken: token, updatedAt: Date.now() })
    .where(eq(leadIntegrations.id, id));
  return token;
}

// ─── Leads Permissions ────────────────────────────────────────────────────────

export async function getLeadsPermissions() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: leadsPermissions.id,
      userId: leadsPermissions.userId,
      canView: leadsPermissions.canView,
      canCreate: leadsPermissions.canCreate,
      canEdit: leadsPermissions.canEdit,
      canDelete: leadsPermissions.canDelete,
      canExport: leadsPermissions.canExport,
      canImport: leadsPermissions.canImport,
      updatedAt: leadsPermissions.updatedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(leadsPermissions)
    .leftJoin(users, eq(leadsPermissions.userId, users.id));
  return rows;
}

export async function getAllUsersForPermissions() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, name: users.name, email: users.email }).from(users);
}

export async function upsertLeadsPermission(userId: number, perms: {
  canView?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
  canImport?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  const now = Date.now();
  const existing = await db.select().from(leadsPermissions).where(eq(leadsPermissions.userId, userId));
  if (existing.length > 0) {
    await db.update(leadsPermissions).set({ ...perms, updatedAt: now }).where(eq(leadsPermissions.userId, userId));
  } else {
    await db.insert(leadsPermissions).values({
      userId,
      canView: perms.canView ?? true,
      canCreate: perms.canCreate ?? false,
      canEdit: perms.canEdit ?? false,
      canDelete: perms.canDelete ?? false,
      canExport: perms.canExport ?? false,
      canImport: perms.canImport ?? false,
      updatedAt: now,
    });
  }
}

// ─── Export Leads ─────────────────────────────────────────────────────────────

export async function exportAllLeads() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leads).orderBy(leads.createdAt);
}
