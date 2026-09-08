import { randomUUID } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  clientDocuments,
  clientPortalApplicants,
  clientPortalApplications,
  clientPortalDocuments,
  clientPortalUsers,
} from "../drizzle/schema";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { storageGet, storagePut } from "./storage";
import { TRPCError } from "@trpc/server";
import { recordClientLifecycleEvent } from "./clientLifecycleNotificationService";

export const clientPortalDocumentReviewRouter = router({
  uploadStageEvidence: protectedProcedure
    .input(z.object({
      clientCaseId: z.number().int().positive(),
      kind: z.enum(["submission_receipt", "approval_letter"]),
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"]),
      fileSize: z.number().int().positive().max(25 * 1024 * 1024),
      base64: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const bytes = Buffer.from(input.base64, "base64");
      if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or oversized file" });
      const safeName = input.fileName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-120) || "evidence.pdf";
      const publicId = randomUUID();
      const key = `client-portal/cases/${input.clientCaseId}/staff/${publicId}-${safeName}`;
      const stored = await storagePut(key, bytes, input.mimeType);
      const [application] = await db.select({ id: clientPortalApplications.id }).from(clientPortalApplications).where(and(eq(clientPortalApplications.clientCaseId, input.clientCaseId), isNull(clientPortalApplications.accessRevokedAt))).limit(1);
      if (application) {
        const label = input.kind === "submission_receipt" ? "Official submission receipt" : "Approval letter";
        await db.insert(clientPortalDocuments).values({ publicId, portalApplicationId: application.id, documentType: label, fileName: input.fileName, fileKey: stored.key, mimeType: input.mimeType, fileSize: bytes.length, source: "staff", visibleToClient: true, reviewStatus: "accepted", uploadedByStaffUserId: ctx.user.id, reviewedByUserId: ctx.user.id, reviewedAt: new Date() });
        await recordClientLifecycleEvent({ clientCaseId: input.clientCaseId, eventType: input.kind, idempotencyKey: `document:${publicId}:staff-upload`, actor: { type: "staff", staffUserId: ctx.user.id, name: ctx.user.name || ctx.user.email || "ELEVAY Team" }, titleEn: `${label} added`, titleAr: input.kind === "submission_receipt" ? "تمت إضافة إيصال التقديم الرسمي" : "تمت إضافة خطاب الموافقة", bodyEn: `${label} is now available in your application activity.`, bodyAr: input.kind === "submission_receipt" ? "إيصال التقديم الرسمي متاح الآن ضمن نشاط طلبك." : "خطاب الموافقة متاح الآن ضمن نشاط طلبك.", entityType: "document", entityPublicId: publicId, metadata: { kind: input.kind } });
      }
      return { url: stored.url, documentPublicId: application ? publicId : null };
    }),

  listForClientCase: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          publicId: clientPortalDocuments.publicId,
          fileName: clientPortalDocuments.fileName,
          documentType: clientPortalDocuments.documentType,
          mimeType: clientPortalDocuments.mimeType,
          fileSize: clientPortalDocuments.fileSize,
          source: clientPortalDocuments.source,
          reviewStatus: clientPortalDocuments.reviewStatus,
          clientComment: clientPortalDocuments.clientComment,
          staffComment: clientPortalDocuments.staffComment,
          createdAt: clientPortalDocuments.createdAt,
          applicantName: clientPortalApplicants.fullName,
          checklistName: clientDocuments.docName,
          checklistKey: clientDocuments.docKey,
          uploaderName: clientPortalUsers.username,
        })
        .from(clientPortalDocuments)
        .innerJoin(clientPortalApplications, eq(clientPortalDocuments.portalApplicationId, clientPortalApplications.id))
        .innerJoin(clientPortalUsers, eq(clientPortalApplications.portalUserId, clientPortalUsers.id))
        .leftJoin(clientPortalApplicants, eq(clientPortalDocuments.applicantId, clientPortalApplicants.id))
        .leftJoin(clientDocuments, eq(clientPortalDocuments.clientDocumentId, clientDocuments.id))
        .where(and(eq(clientPortalApplications.clientCaseId, input.clientCaseId), isNull(clientPortalApplications.accessRevokedAt)))
        .orderBy(desc(clientPortalDocuments.createdAt));
      return rows;
    }),

  access: protectedProcedure
    .input(z.object({ clientCaseId: z.number().int().positive(), documentPublicId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const [row] = await db
        .select({ fileKey: clientPortalDocuments.fileKey })
        .from(clientPortalDocuments)
        .innerJoin(clientPortalApplications, eq(clientPortalDocuments.portalApplicationId, clientPortalApplications.id))
        .where(and(eq(clientPortalDocuments.publicId, input.documentPublicId), eq(clientPortalApplications.clientCaseId, input.clientCaseId), isNull(clientPortalApplications.accessRevokedAt)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const file = await storageGet(row.fileKey);
      return { url: file.url, expiresSoon: true };
    }),

  review: protectedProcedure
    .input(z.object({
      clientCaseId: z.number().int().positive(),
      documentPublicId: z.string().uuid(),
      reviewStatus: z.enum(["submitted", "under_review", "accepted", "replacement_required"]),
      staffComment: z.string().trim().max(2000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
      const [row] = await db
        .select({ id: clientPortalDocuments.id, documentType: clientPortalDocuments.documentType })
        .from(clientPortalDocuments)
        .innerJoin(clientPortalApplications, eq(clientPortalDocuments.portalApplicationId, clientPortalApplications.id))
        .where(and(eq(clientPortalDocuments.publicId, input.documentPublicId), eq(clientPortalApplications.clientCaseId, input.clientCaseId), isNull(clientPortalApplications.accessRevokedAt)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(clientPortalDocuments).set({ reviewStatus: input.reviewStatus, staffComment: input.staffComment?.trim() || null, reviewedByUserId: ctx.user.id, reviewedAt: new Date() }).where(eq(clientPortalDocuments.id, row.id));
      await recordClientLifecycleEvent({ clientCaseId: input.clientCaseId, eventType: "document_review_updated", idempotencyKey: `document:${input.documentPublicId}:review:${input.reviewStatus}`, actor: { type: "staff", staffUserId: ctx.user.id, name: ctx.user.name || ctx.user.email || "ELEVAY Team" }, titleEn: "Document review updated", titleAr: "تم تحديث مراجعة المستند", bodyEn: `${row.documentType} is now ${input.reviewStatus.replace("_", " ")}.`, bodyAr: `حالة مراجعة مستند ${row.documentType}: ${input.reviewStatus.replace("_", " ")}.`, entityType: "document", entityPublicId: input.documentPublicId, metadata: { reviewStatus: input.reviewStatus } });
      return { success: true };
    }),
});
