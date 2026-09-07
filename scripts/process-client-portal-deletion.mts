import { and, eq, inArray, or } from "drizzle-orm";
import {
  clientPortalApplicants,
  clientPortalApplications,
  clientPortalAuditLogs,
  clientPortalDeliveryOutbox,
  clientPortalDocuments,
  clientPortalMessages,
  clientPortalNotifications,
  clientPortalSessions,
  clientPortalUsers,
} from "../drizzle/schema";
import { getDb } from "../server/db";

const identifier = (process.env.PORTAL_IDENTIFIER || "").trim().toLowerCase();
const confirmed = process.env.CONFIRM_DELETE === "DELETE";
if (!identifier) throw new Error("PORTAL_IDENTIFIER is required");
const db = await getDb();
if (!db) throw new Error("Database unavailable");
const [user] = await db.select().from(clientPortalUsers).where(or(eq(clientPortalUsers.username, identifier), eq(clientPortalUsers.email, identifier))).limit(1);
if (!user || user.accountType !== "client") throw new Error("Client portal account not found");
if (!user.deletionRequestedAt) throw new Error("No in-app deletion request is recorded for this account");

const applications = await db.select({ id: clientPortalApplications.id }).from(clientPortalApplications).where(eq(clientPortalApplications.portalUserId, user.id));
const applicationIds = applications.map(item => item.id);
const documents = applicationIds.length ? await db.select({ id: clientPortalDocuments.id, fileKey: clientPortalDocuments.fileKey }).from(clientPortalDocuments).where(inArray(clientPortalDocuments.portalApplicationId, applicationIds)) : [];
const sessions = await db.select({ pushToken: clientPortalSessions.pushToken }).from(clientPortalSessions).where(eq(clientPortalSessions.portalUserId, user.id));
const pushTokens = sessions.map(item => item.pushToken).filter((value): value is string => Boolean(value));

const preview = {
  mode: confirmed ? "delete" : "preview",
  publicId: user.publicId,
  username: user.username,
  email: user.email,
  deletionRequestedAt: user.deletionRequestedAt,
  applications: applicationIds.length,
  documents: documents.length,
  storageReferencesToDrop: documents.map(item => item.fileKey),
  sessions: sessions.length,
  sourceClientDocumentationPreserved: true,
  securityAuditRetainedAnonymously: true,
};
console.log(JSON.stringify(preview, null, 2));
if (!confirmed) {
  console.log("Dry run only. After identity and retention review, rerun with CONFIRM_DELETE=DELETE.");
  process.exit(0);
}

await db.transaction(async tx => {
  if (applicationIds.length) {
    await tx.delete(clientPortalMessages).where(inArray(clientPortalMessages.portalApplicationId, applicationIds));
    await tx.delete(clientPortalDocuments).where(inArray(clientPortalDocuments.portalApplicationId, applicationIds));
    await tx.delete(clientPortalApplicants).where(inArray(clientPortalApplicants.portalApplicationId, applicationIds));
    await tx.delete(clientPortalApplications).where(inArray(clientPortalApplications.id, applicationIds));
  }
  await tx.delete(clientPortalNotifications).where(eq(clientPortalNotifications.portalUserId, user.id));
  await tx.delete(clientPortalSessions).where(eq(clientPortalSessions.portalUserId, user.id));
  await tx.update(clientPortalAuditLogs).set({ portalUserId: null, recordPublicId: null, ipAddress: null, userAgent: null, deviceName: null, osVersion: null, appVersion: null, details: "Portal account deleted; security event retained without account or device identifiers" }).where(eq(clientPortalAuditLogs.portalUserId, user.id));
  if (pushTokens.length) await tx.delete(clientPortalDeliveryOutbox).where(or(eq(clientPortalDeliveryOutbox.recipient, user.email), inArray(clientPortalDeliveryOutbox.recipient, pushTokens)));
  else await tx.delete(clientPortalDeliveryOutbox).where(eq(clientPortalDeliveryOutbox.recipient, user.email));
  await tx.delete(clientPortalUsers).where(eq(clientPortalUsers.id, user.id));
});

console.log(JSON.stringify({ ok: true, deletedAt: new Date().toISOString(), sourceClientDocumentationPreserved: true, unreferencedStorageObjects: documents.length }, null, 2));
process.exit(0);
