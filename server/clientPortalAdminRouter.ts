import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { storageGet } from "./storage";
import { protectedProcedure, router } from "./_core/trpc";
import { auditCtxFromTrpc, writeAuditLog } from "./auditLog";
import { generateTemporaryPassword, hashPortalPassword } from "./clientPortalAuth";
import { pushClientNotification } from "./clientPortalRoutes";
import { runPublicContentSync } from "./publicContentService";
import {
  clientCases,
  clientPortalApplications,
  clientPortalApplicants,
  clientPortalDocuments,
  clientPortalMessages,
  clientPortalNotifications,
  clientPortalSessions,
  clientPortalUsers,
  publicContentSyncRuns,
  publicContentSyncSettings,
  publicPrograms,
  publicServiceProviders,
} from "../drizzle/schema";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});

const providerInput = z.object({
  publicId: z.string().uuid().optional(),
  providerType: z.enum(["lawyer", "accountant", "service_facilitator"]),
  name: z.string().trim().min(1).max(255),
  country: z.string().trim().min(1).max(128),
  city: z.string().trim().max(128).nullable().optional(),
  logoUrl: z.string().url().max(1024).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  services: z.array(z.string().trim().min(1).max(255)).max(50).default([]),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  currency: z.string().trim().max(10).nullable().optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  whatsapp: z.string().trim().max(64).nullable().optional(),
  email: z.string().email().max(320).nullable().optional(),
  website: z.string().url().max(1024).nullable().optional(),
  languages: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  availability: z.string().trim().max(255).nullable().optional(),
  displayOrder: z.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
});

export const clientPortalAdminRouter = router({
  listClientCases: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select({ id: clientCases.id, clientCode: clientCases.clientCode, clientName: clientCases.clientName, applicationType: clientCases.applicationType, consultant: clientCases.consultant, paralegal: clientCases.paralegal, stage: clientCases.stage }).from(clientCases).orderBy(asc(clientCases.clientName)).limit(1000);
  }),

  listAccounts: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select({ portalUser: clientPortalUsers, clientName: clientCases.clientName, clientCode: clientCases.clientCode }).from(clientPortalUsers).innerJoin(clientCases, eq(clientPortalUsers.primaryClientCaseId, clientCases.id)).orderBy(desc(clientPortalUsers.createdAt));
    const sessions = await db.select({ portalUserId: clientPortalSessions.portalUserId, count: sql<number>`count(*)` }).from(clientPortalSessions).where(isNull(clientPortalSessions.revokedAt)).groupBy(clientPortalSessions.portalUserId);
    const counts = new Map(sessions.map(row => [row.portalUserId, Number(row.count)]));
    const applications = await db.select({ publicId: clientPortalApplications.publicId, portalUserId: clientPortalApplications.portalUserId, label: clientPortalApplications.label, isPrimary: clientPortalApplications.isPrimary }).from(clientPortalApplications).orderBy(desc(clientPortalApplications.isPrimary), asc(clientPortalApplications.createdAt));
    return rows.map(row => ({
      ...row.portalUser,
      passwordHash: undefined,
      passwordResetTokenHash: undefined,
      clientName: row.clientName,
      clientCode: row.clientCode,
      activeSessions: counts.get(row.portalUser.id) ?? 0,
      applications: applications.filter(application => application.portalUserId === row.portalUser.id),
    }));
  }),

  createAccount: adminProcedure.input(z.object({
    caseIds: z.array(z.number().int().positive()).min(1).max(10),
    primaryCaseId: z.number().int().positive(),
    username: z.string().trim().min(4).max(100).regex(/^[A-Za-z0-9._-]+$/),
    email: z.string().trim().email().max(320),
    mobile: z.string().trim().max(64).optional(),
    password: z.string().min(10).max(72).optional(),
    locale: z.enum(["en", "ar"]).default("en"),
  })).mutation(async ({ ctx, input }) => {
    if (!input.caseIds.includes(input.primaryCaseId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Primary case must be selected" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const cases = await db.select().from(clientCases).where(inArray(clientCases.id, input.caseIds));
    if (cases.length !== new Set(input.caseIds).size) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more client cases were not found" });
    const primary = cases.find(row => row.id === input.primaryCaseId)!;
    const password = input.password || generateTemporaryPassword();
    const publicId = randomUUID();
    try {
      await db.insert(clientPortalUsers).values({
        publicId,
        primaryClientCaseId: input.primaryCaseId,
        username: input.username.toLowerCase(),
        email: input.email.toLowerCase(),
        mobile: input.mobile || null,
        passwordHash: await hashPortalPassword(password),
        consultant: primary.consultant,
        paralegal: primary.paralegal,
        locale: input.locale,
        mustChangePassword: true,
        notificationPreferences: { push: true, email: true, messages: true, documents: true, workflow: true },
        createdBy: ctx.user.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/duplicate/i.test(message)) throw new TRPCError({ code: "CONFLICT", message: "Username or email already has client access" });
      throw error;
    }
    const [portalUser] = await db.select().from(clientPortalUsers).where(eq(clientPortalUsers.publicId, publicId)).limit(1);
    if (!portalUser) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    for (const clientCase of cases) {
      const applicationPublicId = randomUUID();
      await db.insert(clientPortalApplications).values({ publicId: applicationPublicId, portalUserId: portalUser.id, clientCaseId: clientCase.id, label: `${clientCase.applicationType} – ${clientCase.clientName}`, isPrimary: clientCase.id === input.primaryCaseId });
      const [application] = await db.select().from(clientPortalApplications).where(eq(clientPortalApplications.publicId, applicationPublicId)).limit(1);
      if (application) await db.insert(clientPortalApplicants).values({ publicId: randomUUID(), portalApplicationId: application.id, relation: "main", fullName: clientCase.clientName });
    }
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "client_portal_account", portalUser.id, `Created client portal access for ${primary.clientName}`);
    return { publicId: portalUser.publicId, username: portalUser.username, email: portalUser.email, temporaryPassword: password };
  }),

  linkDocumentationFolder: adminProcedure.input(z.object({
    portalUserPublicId: z.string().uuid(),
    clientCaseId: z.number().int().positive(),
    makePrimary: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [portalUser] = await db.select().from(clientPortalUsers).where(eq(clientPortalUsers.publicId, input.portalUserPublicId)).limit(1);
    const [clientCase] = await db.select().from(clientCases).where(eq(clientCases.id, input.clientCaseId)).limit(1);
    if (!portalUser || !clientCase) throw new TRPCError({ code: "NOT_FOUND", message: "Client account or documentation folder was not found" });
    const [existing] = await db.select().from(clientPortalApplications).where(and(eq(clientPortalApplications.portalUserId, portalUser.id), eq(clientPortalApplications.clientCaseId, clientCase.id))).limit(1);
    if (existing) return { publicId: existing.publicId, alreadyLinked: true };
    if (input.makePrimary) await db.update(clientPortalApplications).set({ isPrimary: false }).where(eq(clientPortalApplications.portalUserId, portalUser.id));
    const publicId = randomUUID();
    await db.insert(clientPortalApplications).values({ publicId, portalUserId: portalUser.id, clientCaseId: clientCase.id, label: `${clientCase.applicationType} – ${clientCase.clientName}`, isPrimary: input.makePrimary });
    const [application] = await db.select().from(clientPortalApplications).where(eq(clientPortalApplications.publicId, publicId)).limit(1);
    if (application) await db.insert(clientPortalApplicants).values({ publicId: randomUUID(), portalApplicationId: application.id, relation: "main", fullName: clientCase.clientName });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "client_portal_documentation_folder", clientCase.id, `Linked ${clientCase.clientName} folder to portal account ${portalUser.username}`);
    return { publicId, alreadyLinked: false };
  }),

  setAccountStatus: adminProcedure.input(z.object({ publicId: z.string().uuid(), status: z.enum(["active", "disabled"]) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [user] = await db.select().from(clientPortalUsers).where(eq(clientPortalUsers.publicId, input.publicId)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    await db.update(clientPortalUsers).set({ status: input.status }).where(eq(clientPortalUsers.id, user.id));
    if (input.status === "disabled") await db.update(clientPortalSessions).set({ revokedAt: new Date() }).where(and(eq(clientPortalSessions.portalUserId, user.id), isNull(clientPortalSessions.revokedAt)));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "client_portal_account", user.id, `Client access ${input.status}`);
    return { ok: true };
  }),

  resetTemporaryPassword: adminProcedure.input(z.object({ publicId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [user] = await db.select().from(clientPortalUsers).where(eq(clientPortalUsers.publicId, input.publicId)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    const temporaryPassword = generateTemporaryPassword();
    await db.update(clientPortalUsers).set({ passwordHash: await hashPortalPassword(temporaryPassword), mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null }).where(eq(clientPortalUsers.id, user.id));
    await db.update(clientPortalSessions).set({ revokedAt: new Date() }).where(and(eq(clientPortalSessions.portalUserId, user.id), isNull(clientPortalSessions.revokedAt)));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "client_portal_password", user.id, "Issued temporary password and revoked active sessions");
    return { temporaryPassword };
  }),

  forceLogout: adminProcedure.input(z.object({ publicId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [user] = await db.select().from(clientPortalUsers).where(eq(clientPortalUsers.publicId, input.publicId)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    await db.update(clientPortalSessions).set({ revokedAt: new Date() }).where(and(eq(clientPortalSessions.portalUserId, user.id), isNull(clientPortalSessions.revokedAt)));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "client_portal_sessions", user.id, "Revoked all client sessions");
    return { ok: true };
  }),

  listMessages: adminProcedure.input(z.object({ applicationPublicId: z.string().uuid() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [application] = await db.select().from(clientPortalApplications).where(eq(clientPortalApplications.publicId, input.applicationPublicId)).limit(1);
    if (!application) throw new TRPCError({ code: "NOT_FOUND" });
    return db.select().from(clientPortalMessages).where(eq(clientPortalMessages.portalApplicationId, application.id)).orderBy(asc(clientPortalMessages.createdAt));
  }),

  replyToClient: adminProcedure.input(z.object({ applicationPublicId: z.string().uuid(), body: z.string().trim().min(1).max(5000), visibility: z.enum(["client", "internal"]).default("client") })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [application] = await db.select().from(clientPortalApplications).where(eq(clientPortalApplications.publicId, input.applicationPublicId)).limit(1);
    if (!application) throw new TRPCError({ code: "NOT_FOUND" });
    const publicId = randomUUID();
    await db.insert(clientPortalMessages).values({ publicId, portalApplicationId: application.id, senderType: "staff", senderStaffUserId: ctx.user.id, visibility: input.visibility, body: input.body });
    if (input.visibility === "client") {
      await db.insert(clientPortalNotifications).values({ publicId: randomUUID(), portalUserId: application.portalUserId, type: "new_message", titleEn: "New message from Elevay", titleAr: "رسالة جديدة من إليفاي", bodyEn: input.body.slice(0, 500), bodyAr: input.body.slice(0, 500), entityType: "message", entityPublicId: publicId, createdAt: Date.now() });
      await pushClientNotification(application.portalUserId, "New message from Elevay", input.body.slice(0, 180), { type: "new_message", applicationPublicId: application.publicId, entityPublicId: publicId });
    }
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "client_portal_message", publicId, `${input.visibility} reply`);
    return { publicId };
  }),

  listDocuments: adminProcedure.input(z.object({ applicationPublicId: z.string().uuid() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [application] = await db.select().from(clientPortalApplications).where(eq(clientPortalApplications.publicId, input.applicationPublicId)).limit(1);
    if (!application) throw new TRPCError({ code: "NOT_FOUND" });
    return db.select().from(clientPortalDocuments).where(eq(clientPortalDocuments.portalApplicationId, application.id)).orderBy(desc(clientPortalDocuments.createdAt));
  }),

  getDocumentAccess: adminProcedure.input(z.object({ publicId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [document] = await db.select().from(clientPortalDocuments).where(eq(clientPortalDocuments.publicId, input.publicId)).limit(1);
    if (!document) throw new TRPCError({ code: "NOT_FOUND" });
    const file = await storageGet(document.fileKey);
    await writeAuditLog(auditCtxFromTrpc(ctx), "view", "client_portal_document", document.id, "Opened client portal document");
    return { url: file.url };
  }),

  reviewDocument: adminProcedure.input(z.object({ publicId: z.string().uuid(), reviewStatus: z.enum(["submitted", "under_review", "accepted", "replacement_required"]), visibleToClient: z.boolean(), clientComment: z.string().max(2000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [document] = await db.select().from(clientPortalDocuments).where(eq(clientPortalDocuments.publicId, input.publicId)).limit(1);
    if (!document) throw new TRPCError({ code: "NOT_FOUND" });
    const [application] = await db.select().from(clientPortalApplications).where(eq(clientPortalApplications.id, document.portalApplicationId)).limit(1);
    await db.update(clientPortalDocuments).set({ reviewStatus: input.reviewStatus, visibleToClient: input.visibleToClient, clientComment: input.clientComment ?? document.clientComment, reviewedAt: new Date() }).where(eq(clientPortalDocuments.id, document.id));
    if (application && input.visibleToClient) {
      const replacement = input.reviewStatus === "replacement_required";
      const titleEn = replacement ? "Document replacement required" : "Document status updated";
      const titleAr = replacement ? "مطلوب استبدال المستند" : "تم تحديث حالة المستند";
      const bodyEn = input.clientComment || `Your document is now ${input.reviewStatus.replaceAll("_", " ")}.`;
      const bodyAr = input.clientComment || `تم تحديث حالة مستندك إلى ${input.reviewStatus.replaceAll("_", " ")}.`;
      await db.insert(clientPortalNotifications).values({ publicId: randomUUID(), portalUserId: application.portalUserId, type: "document_status", titleEn, titleAr, bodyEn, bodyAr, entityType: "document", entityPublicId: document.publicId, createdAt: Date.now() });
      await pushClientNotification(application.portalUserId, titleEn, bodyEn.slice(0, 180), { type: "document_status", applicationPublicId: application.publicId, entityPublicId: document.publicId });
    }
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "client_portal_document", document.id, `Review status: ${input.reviewStatus}`);
    return { ok: true };
  }),

  listPrograms: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(publicPrograms).orderBy(asc(publicPrograms.category), asc(publicPrograms.displayOrder), asc(publicPrograms.nameEn));
  }),

  updateProgram: adminProcedure.input(z.object({
    publicId: z.string().uuid(), nameEn: z.string().trim().min(1).max(255), nameAr: z.string().trim().max(255).nullable().optional(), summaryEn: z.string().max(10000).nullable().optional(), summaryAr: z.string().max(10000).nullable().optional(), imageUrl: z.string().url().max(1024).nullable().optional(), displayOrder: z.number().int().min(0).max(10000), isActive: z.boolean(), clearOverride: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select().from(publicPrograms).where(eq(publicPrograms.publicId, input.publicId)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
    await db.update(publicPrograms).set({ nameEn: input.nameEn, nameAr: input.nameAr ?? null, summaryEn: input.summaryEn ?? null, summaryAr: input.summaryAr ?? null, imageUrl: input.imageUrl ?? null, displayOrder: input.displayOrder, isActive: input.isActive, isOverridden: !input.clearOverride }).where(eq(publicPrograms.id, existing.id));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "public_program", existing.id, input.clearOverride ? "Returned program to website sync" : "Applied manual content override");
    return { ok: true };
  }),

  listProviders: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(publicServiceProviders).orderBy(asc(publicServiceProviders.displayOrder), asc(publicServiceProviders.name));
  }),

  saveProvider: adminProcedure.input(providerInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const values = { providerType: input.providerType, name: input.name, country: input.country, city: input.city ?? null, logoUrl: input.logoUrl ?? null, description: input.description ?? null, services: input.services, price: input.price ?? null, currency: input.currency ?? null, phone: input.phone ?? null, whatsapp: input.whatsapp ?? null, email: input.email ?? null, website: input.website ?? null, languages: input.languages, availability: input.availability ?? null, displayOrder: input.displayOrder, isActive: input.isActive };
    if (input.publicId) {
      const [existing] = await db.select().from(publicServiceProviders).where(eq(publicServiceProviders.publicId, input.publicId)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(publicServiceProviders).set(values).where(eq(publicServiceProviders.id, existing.id));
      await writeAuditLog(auditCtxFromTrpc(ctx), "update", "public_service_provider", existing.id, `Updated ${input.name}`);
      return { publicId: existing.publicId };
    }
    const publicId = randomUUID();
    await db.insert(publicServiceProviders).values({ publicId, ...values });
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "public_service_provider", publicId, `Created ${input.name}`);
    return { publicId };
  }),

  runContentSync: adminProcedure.mutation(async ({ ctx }) => {
    const result = await runPublicContentSync("manual");
    await writeAuditLog(auditCtxFromTrpc(ctx), "sync", "public_programs", undefined, `Found ${result.programsFound}, created ${result.programsCreated}, updated ${result.programsUpdated}`);
    return result;
  }),

  contentSyncStatus: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [settings] = await db.select().from(publicContentSyncSettings).where(eq(publicContentSyncSettings.id, 1)).limit(1);
    const runs = await db.select().from(publicContentSyncRuns).orderBy(desc(publicContentSyncRuns.startedAt)).limit(20);
    return { settings: settings ?? null, runs };
  }),
});
