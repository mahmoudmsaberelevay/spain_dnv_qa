import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { clientApplicationActivities, clientCases, clientPortalApplications } from "../drizzle/schema";
import { getDb } from "../server/db";

const db = await getDb();
if (!db) throw new Error("DATABASE_UNAVAILABLE");
const applications = await db.select({ application: clientPortalApplications, clientCase: clientCases }).from(clientPortalApplications).innerJoin(clientCases, eq(clientPortalApplications.clientCaseId, clientCases.id));
let attempted = 0;

for (const { application, clientCase } of applications) {
  const events = [
    { key: "portal-linked", type: "portal_access_linked", at: application.createdAt, en: "Client portal connected", ar: "تم ربط بوابة العميل", bodyEn: "Your ELEVAY Client access is connected to this documentation folder.", bodyAr: "تم ربط وصولك إلى تطبيق إليفاي بمجلد المستندات هذا." },
    clientCase.spainTeamReceivedDate ? { key: `stage-spain-${String(clientCase.spainTeamReceivedDate).slice(0, 10)}`, type: "stage_spain_team_received", at: new Date(clientCase.spainTeamReceivedDate), en: "Documents received by the Spain team", ar: "استلم فريق إسبانيا المستندات", bodyEn: "The Spain team received the application documents.", bodyAr: "استلم فريق إسبانيا مستندات الطلب." } : null,
    clientCase.submissionDate ? { key: `stage-submission-${String(clientCase.submissionDate).slice(0, 10)}`, type: "stage_submission", at: new Date(clientCase.submissionDate), en: "Application submitted", ar: "تم تقديم الطلب", bodyEn: "The application was officially submitted.", bodyAr: "تم تقديم الطلب رسميًا." } : null,
    clientCase.approvalDate ? { key: `stage-approved-${String(clientCase.approvalDate).slice(0, 10)}`, type: "stage_approved", at: new Date(clientCase.approvalDate), en: "Application approved", ar: "تمت الموافقة على الطلب", bodyEn: "The application was approved.", bodyAr: "تمت الموافقة على الطلب." } : null,
    clientCase.biometricsDate ? { key: `biometrics-${String(clientCase.biometricsDate).slice(0, 10)}`, type: "biometrics_completed", at: new Date(clientCase.biometricsDate), en: "Biometrics completed", ar: "تم استكمال البصمات", bodyEn: "The biometrics step was completed.", bodyAr: "تم استكمال خطوة البصمات." } : null,
    clientCase.residencyCardReadyDate ? { key: `card-ready-${String(clientCase.residencyCardReadyDate).slice(0, 10)}`, type: "residency_card_ready", at: new Date(`${clientCase.residencyCardReadyDate}T12:00:00Z`), en: "Residency card ready", ar: "بطاقة الإقامة جاهزة", bodyEn: "The residency card was marked ready for collection.", bodyAr: "تم تحديد بطاقة الإقامة كجاهزة للاستلام." } : null,
  ].filter(Boolean) as Array<{ key: string; type: string; at: Date; en: string; ar: string; bodyEn: string; bodyAr: string }>;

  for (const event of events) {
    attempted += 1;
    await db.insert(clientApplicationActivities).values({ publicId: randomUUID(), clientCaseId: clientCase.id, actorType: "system", actorName: "ELEVAY", eventType: event.type, titleEn: event.en, titleAr: event.ar, bodyEn: event.bodyEn, bodyAr: event.bodyAr, entityType: "application", entityPublicId: application.publicId, idempotencyKey: `backfill:case:${clientCase.id}:${event.key}`.slice(0, 191), occurredAt: event.at }).onDuplicateKeyUpdate({ set: { idempotencyKey: `backfill:case:${clientCase.id}:${event.key}`.slice(0, 191) } });
  }
}

console.log(JSON.stringify({ linkedApplications: applications.length, eventsAttempted: attempted }, null, 2));
process.exit(0);
