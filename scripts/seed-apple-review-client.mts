import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  clientCases,
  clientDocuments,
  clientPortalApplicants,
  clientPortalApplications,
  clientPortalSessions,
  clientPortalUsers,
  users,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { hashPortalPassword } from "../server/clientPortalAuth";

const username = (process.env.APP_REVIEW_USERNAME || "").trim().toLowerCase();
const email = (process.env.APP_REVIEW_EMAIL || "").trim().toLowerCase();
const password = process.env.APP_REVIEW_PASSWORD || "";
if (!/^[a-z0-9._-]{4,100}$/.test(username)) throw new Error("APP_REVIEW_USERNAME is required and must use safe username characters");
if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("APP_REVIEW_EMAIL is required");
if (Buffer.byteLength(password, "utf8") < 10 || Buffer.byteLength(password, "utf8") > 72) throw new Error("APP_REVIEW_PASSWORD must be 10–72 UTF-8 bytes");

const db = await getDb();
if (!db) throw new Error("Database unavailable");
const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
const [fallback] = owner ? [] : await db.select({ id: users.id }).from(users).limit(1);
const staffUserId = owner?.id || fallback?.id;
if (!staffUserId) throw new Error("No CRM staff user exists to own the demo case");

const clientCode = "APP-REVIEW-001";
let [clientCase] = await db.select().from(clientCases).where(eq(clientCases.clientCode, clientCode)).limit(1);
const expectedSubmissionDate = new Date("2026-09-30T09:00:00.000Z");
const expectedApprovalDate = new Date("2026-12-15T09:00:00.000Z");
if (!clientCase) {
  await db.insert(clientCases).values({
    userId: staffUserId,
    clientName: "Apple Review Demo Client",
    clientCode,
    applicationType: "freelancer",
    maritalStatus: "family",
    consultant: "Mahmoud",
    paralegal: "Madonna",
    stage: "preparation",
    expectedSubmissionDate,
    expectedApprovalDate,
    childrenData: [{ name: "Demo Dependent", age: 8 }],
    spouseName: "Demo Spouse",
  });
  [clientCase] = await db.select().from(clientCases).where(eq(clientCases.clientCode, clientCode)).limit(1);
} else {
  await db.update(clientCases).set({
    clientName: "Apple Review Demo Client",
    applicationType: "freelancer",
    maritalStatus: "family",
    consultant: "Mahmoud",
    paralegal: "Madonna",
    stage: "preparation",
    expectedSubmissionDate,
    expectedApprovalDate,
    childrenData: [{ name: "Demo Dependent", age: 8 }],
    spouseName: "Demo Spouse",
  }).where(eq(clientCases.id, clientCase.id));
}
if (!clientCase) throw new Error("Failed to create demo client case");

const checklist = [
  { docKey: "passport_main", docName: "Main Applicant Passport", category: "main" as const, received: true, requiresMofa: false, requiresEmbassy: false },
  { docKey: "bank_statement", docName: "Six-Month Bank Statement", category: "main" as const, received: true, requiresMofa: false, requiresEmbassy: false },
  { docKey: "employment_letter", docName: "Employment or Freelance Evidence", category: "main" as const, received: false, requiresMofa: true, requiresEmbassy: false },
  { docKey: "police_clearance", docName: "Police Clearance Certificate", category: "main" as const, received: false, requiresMofa: true, requiresEmbassy: true },
  { docKey: "marriage_certificate", docName: "Marriage Certificate", category: "family" as const, received: true, requiresMofa: true, requiresEmbassy: true },
  { docKey: "dependent_birth_certificate", docName: "Dependent Birth Certificate", category: "family" as const, received: false, requiresMofa: true, requiresEmbassy: true },
];
for (const item of checklist) {
  const [existing] = await db.select().from(clientDocuments).where(and(eq(clientDocuments.clientCaseId, clientCase.id), eq(clientDocuments.docKey, item.docKey))).limit(1);
  const values = { ...item, receivedDate: item.received ? new Date("2026-09-05T10:00:00.000Z") : null, mofaAttested: false, embassyAttested: false };
  if (existing) await db.update(clientDocuments).set(values).where(eq(clientDocuments.id, existing.id));
  else await db.insert(clientDocuments).values({ clientCaseId: clientCase.id, ...values });
}

const passwordHash = await hashPortalPassword(password);
let [portalUser] = await db.select().from(clientPortalUsers).where(eq(clientPortalUsers.username, username)).limit(1);
if (!portalUser) [portalUser] = await db.select().from(clientPortalUsers).where(eq(clientPortalUsers.email, email)).limit(1);
if (!portalUser) {
  const publicId = randomUUID();
  await db.insert(clientPortalUsers).values({
    publicId,
    primaryClientCaseId: clientCase.id,
    username,
    email,
    passwordHash,
    accountType: "client",
    isReviewAccount: true,
    status: "active",
    mustChangePassword: false,
    consultant: "Mahmoud",
    paralegal: "Madonna",
    locale: "en",
    notificationPreferences: { push: false, email: false, messages: true, documents: true, workflow: true },
    createdBy: staffUserId,
  });
  [portalUser] = await db.select().from(clientPortalUsers).where(eq(clientPortalUsers.publicId, publicId)).limit(1);
} else {
  await db.update(clientPortalUsers).set({
    primaryClientCaseId: clientCase.id,
    username,
    email,
    passwordHash,
    accountType: "client",
    isReviewAccount: true,
    status: "active",
    mustChangePassword: false,
    consultant: "Mahmoud",
    paralegal: "Madonna",
    locale: "en",
    notificationPreferences: { push: false, email: false, messages: true, documents: true, workflow: true },
    failedLoginAttempts: 0,
    lockedUntil: null,
    deletionRequestedAt: null,
  }).where(eq(clientPortalUsers.id, portalUser.id));
  await db.update(clientPortalSessions).set({ revokedAt: new Date() }).where(and(eq(clientPortalSessions.portalUserId, portalUser.id), isNull(clientPortalSessions.revokedAt)));
}
if (!portalUser) throw new Error("Failed to create demo portal user");

let [application] = await db.select().from(clientPortalApplications).where(and(eq(clientPortalApplications.portalUserId, portalUser.id), eq(clientPortalApplications.clientCaseId, clientCase.id))).limit(1);
if (!application) {
  const publicId = randomUUID();
  await db.insert(clientPortalApplications).values({ publicId, portalUserId: portalUser.id, clientCaseId: clientCase.id, label: "Spain Digital Nomad Visa — Review Demo", isPrimary: true });
  [application] = await db.select().from(clientPortalApplications).where(eq(clientPortalApplications.publicId, publicId)).limit(1);
} else {
  await db.update(clientPortalApplications).set({ label: "Spain Digital Nomad Visa — Review Demo", isPrimary: true }).where(eq(clientPortalApplications.id, application.id));
}
if (!application) throw new Error("Failed to create demo application");
const [applicant] = await db.select().from(clientPortalApplicants).where(and(eq(clientPortalApplicants.portalApplicationId, application.id), eq(clientPortalApplicants.relation, "main"))).limit(1);
if (applicant) await db.update(clientPortalApplicants).set({ fullName: "Apple Review Demo Client" }).where(eq(clientPortalApplicants.id, applicant.id));
else await db.insert(clientPortalApplicants).values({ publicId: randomUUID(), portalApplicationId: application.id, relation: "main", fullName: "Apple Review Demo Client" });

console.log(JSON.stringify({ ok: true, username, email, clientCode, applicationPublicId: application.publicId, mustChangePassword: false, containsRealClientData: false }, null, 2));
process.exit(0);
