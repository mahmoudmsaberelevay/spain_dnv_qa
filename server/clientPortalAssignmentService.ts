import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { recordClientLifecycleEvent } from "./clientLifecycleNotificationService";
import {
  clientCases,
  clientPortalApplicants,
  clientPortalApplications,
  clientPortalSessions,
  clientPortalUsers,
} from "../drizzle/schema";

export type ReplaceClientPortalAssignmentsInput = {
  portalUserPublicId: string;
  caseIds: number[];
  primaryCaseId: number;
  actorUserId: number;
  actorName: string;
};

export type ClientPortalAssignmentSnapshot = {
  id: number;
  clientCaseId: number;
  accessRevokedAt: Date | null;
};

export function planClientPortalAssignmentChanges(existing: ClientPortalAssignmentSnapshot[], requestedCaseIds: number[]) {
  const requested = new Set(requestedCaseIds);
  return {
    revokeIds: existing.filter(application => !application.accessRevokedAt && !requested.has(application.clientCaseId)).map(application => application.id),
    restoreIds: existing.filter(application => Boolean(application.accessRevokedAt) && requested.has(application.clientCaseId)).map(application => application.id),
    addCaseIds: requestedCaseIds.filter(caseId => !existing.some(application => application.clientCaseId === caseId)),
  };
}

export async function replaceClientPortalAssignments(input: ReplaceClientPortalAssignmentsInput) {
  const uniqueCaseIds = Array.from(new Set(input.caseIds));
  if (!uniqueCaseIds.length || uniqueCaseIds.length > 10) throw new TRPCError({ code: "BAD_REQUEST", message: "Select between 1 and 10 documentation folders" });
  if (!uniqueCaseIds.includes(input.primaryCaseId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Primary documentation folder must be selected" });

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [portalUser] = await db.select().from(clientPortalUsers).where(eq(clientPortalUsers.publicId, input.portalUserPublicId)).limit(1);
  if (!portalUser || portalUser.accountType !== "client") throw new TRPCError({ code: "NOT_FOUND", message: "Client Portal account not found" });
  const cases = await db.select().from(clientCases).where(inArray(clientCases.id, uniqueCaseIds));
  if (cases.length !== uniqueCaseIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more documentation folders were not found" });
  const primary = cases.find(clientCase => clientCase.id === input.primaryCaseId)!;
  const existing = await db.select().from(clientPortalApplications).where(eq(clientPortalApplications.portalUserId, portalUser.id));
  const existingByCase = new Map(existing.map(application => [application.clientCaseId, application]));
  const changePlan = planClientPortalAssignmentChanges(existing, uniqueCaseIds);
  const now = new Date();
  const newlyLinked: number[] = [];
  const restored: number[] = [];
  let removed = 0;

  await db.transaction(async tx => {
    for (const application of existing) {
      if (!changePlan.revokeIds.includes(application.id)) continue;
      await tx.update(clientPortalApplications).set({ accessRevokedAt: now, accessRevokedBy: input.actorUserId, isPrimary: false }).where(eq(clientPortalApplications.id, application.id));
      removed += 1;
    }

    for (const clientCase of cases) {
      const current = existingByCase.get(clientCase.id);
      const isPrimary = clientCase.id === input.primaryCaseId;
      if (current) {
        if (changePlan.restoreIds.includes(current.id)) restored.push(clientCase.id);
        await tx.update(clientPortalApplications).set({
          label: `${clientCase.applicationType} – ${clientCase.clientName}`,
          isPrimary,
          accessRevokedAt: null,
          accessRevokedBy: null,
        }).where(eq(clientPortalApplications.id, current.id));
      } else if (changePlan.addCaseIds.includes(clientCase.id)) {
        const applicationPublicId = randomUUID();
        await tx.insert(clientPortalApplications).values({
          publicId: applicationPublicId,
          portalUserId: portalUser.id,
          clientCaseId: clientCase.id,
          label: `${clientCase.applicationType} – ${clientCase.clientName}`,
          isPrimary,
        });
        const [application] = await tx.select().from(clientPortalApplications).where(eq(clientPortalApplications.publicId, applicationPublicId)).limit(1);
        if (application) await tx.insert(clientPortalApplicants).values({ publicId: randomUUID(), portalApplicationId: application.id, relation: "main", fullName: clientCase.clientName });
        newlyLinked.push(clientCase.id);
      }
      await tx.update(clientCases).set({ clientPortalSignedAt: now }).where(and(eq(clientCases.id, clientCase.id), isNull(clientCases.clientPortalSignedAt)));
    }

    await tx.update(clientPortalUsers).set({
      primaryClientCaseId: primary.id,
      consultant: primary.consultant,
      paralegal: primary.paralegal,
    }).where(eq(clientPortalUsers.id, portalUser.id));
    await tx.update(clientPortalSessions).set({ revokedAt: now }).where(and(eq(clientPortalSessions.portalUserId, portalUser.id), isNull(clientPortalSessions.revokedAt)));
  });

  for (const clientCaseId of [...newlyLinked, ...restored]) {
    await recordClientLifecycleEvent({
      clientCaseId,
      eventType: "portal_access_linked",
      idempotencyKey: `portal-user:${portalUser.id}:case:${clientCaseId}:access-linked`,
      actor: { type: "staff", staffUserId: input.actorUserId, name: input.actorName },
      titleEn: "Client Portal access updated",
      titleAr: "تم تحديث الوصول إلى بوابة العميل",
      bodyEn: "This documentation folder is now available in your secure ELEVAY Client Portal.",
      bodyAr: "أصبح ملف المستندات هذا متاحاً الآن في بوابة عميل إليفاي الآمنة.",
      entityType: "application",
    });
  }

  return {
    portalUserId: portalUser.id,
    selectedCount: uniqueCaseIds.length,
    addedCount: newlyLinked.length,
    restoredCount: restored.length,
    removedCount: removed,
    primaryCaseId: primary.id,
  };
}
