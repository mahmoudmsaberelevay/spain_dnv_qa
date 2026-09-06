import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../server/db";
import { hashPortalPassword } from "../server/clientPortalAuth";
import { clientCases, clientPortalApplications, clientPortalAuditLogs, clientPortalSessions, clientPortalUsers, publicPrograms } from "../drizzle/schema";

const API = process.env.CLIENT_PORTAL_TEST_API || "http://127.0.0.1:3000";
const db = await getDb();
if (!db) throw new Error("Database unavailable");
const cases = await db.select().from(clientCases).limit(2);
if (cases.length < 2) throw new Error("At least two CRM client cases are required for the isolation test");

const suffix = Date.now().toString(36);
const temporaryPassword = `Tmp-${suffix}-Secure!`;
const permanentPassword = `Perm-${suffix}-Secure!`;
const usersToDelete: number[] = [];
const applicationsToDelete: number[] = [];

async function api(path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

try {
  for (let index = 0; index < 2; index += 1) {
    const publicId = randomUUID();
    await db.insert(clientPortalUsers).values({
      publicId,
      primaryClientCaseId: cases[index].id,
      username: `portal-e2e-${suffix}-${index}`,
      email: `portal-e2e-${suffix}-${index}@example.invalid`,
      passwordHash: await hashPortalPassword(temporaryPassword),
      mustChangePassword: true,
      locale: "en",
      createdBy: 1,
    });
    const [user] = await db.select().from(clientPortalUsers).where(eq(clientPortalUsers.publicId, publicId)).limit(1);
    if (!user) throw new Error("Could not create verification account");
    usersToDelete.push(user.id);
    const applicationPublicId = randomUUID();
    await db.insert(clientPortalApplications).values({ publicId: applicationPublicId, portalUserId: user.id, clientCaseId: cases[index].id, label: `E2E ${cases[index].applicationType}`, isPrimary: true });
    const [application] = await db.select().from(clientPortalApplications).where(eq(clientPortalApplications.publicId, applicationPublicId)).limit(1);
    if (!application) throw new Error("Could not create verification application");
    applicationsToDelete.push(application.id);
  }

  const [firstUser, secondUser] = await db.select().from(clientPortalUsers).where(inArray(clientPortalUsers.id, usersToDelete));
  const [firstApplication, secondApplication] = await db.select().from(clientPortalApplications).where(inArray(clientPortalApplications.id, applicationsToDelete));
  if (!firstUser || !secondUser || !firstApplication || !secondApplication) throw new Error("Verification fixtures are incomplete");

  const login = await api("/client-api/auth/login", { method: "POST", body: JSON.stringify({ identifier: firstUser.email, password: temporaryPassword, deviceName: "E2E verifier", platform: "test", appVersion: "1.0.0" }) });
  if (login.status !== 200 || !login.body.mustChangePassword || !login.body.accessToken) throw new Error(`Temporary login failed: ${login.status}`);

  const blocked = await api("/client-api/me/applications", {}, login.body.accessToken);
  if (blocked.status !== 403 || blocked.body.error !== "password_change_required") throw new Error(`Mandatory password change was not enforced: ${blocked.status}`);

  const changed = await api("/client-api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: temporaryPassword, newPassword: permanentPassword }) }, login.body.accessToken);
  if (changed.status !== 200 || !changed.body.requiresLogin) throw new Error(`Password change failed: ${changed.status}`);

  const relogin = await api("/client-api/auth/login", { method: "POST", body: JSON.stringify({ identifier: firstUser.username, password: permanentPassword, deviceName: "E2E verifier", platform: "test", appVersion: "1.0.0" }) });
  if (relogin.status !== 200 || relogin.body.mustChangePassword || !relogin.body.accessToken) throw new Error(`Permanent login failed: ${relogin.status}`);

  const ownApplications = await api("/client-api/me/applications", {}, relogin.body.accessToken);
  if (ownApplications.status !== 200 || ownApplications.body.length !== 1 || ownApplications.body[0].publicId !== firstApplication.publicId) throw new Error("Owned application projection failed");

  const crossClient = await api(`/client-api/applications/${secondApplication.publicId}`, {}, relogin.body.accessToken);
  if (crossClient.status !== 404) throw new Error(`Cross-client isolation failed: ${crossClient.status}`);

  const me = await api("/client-api/me", {}, relogin.body.accessToken);
  if (me.status !== 200 || "passwordHash" in me.body || "id" in me.body) throw new Error("Client profile leaked internal fields");

  const programsResponse = await api("/public-api/programs");
  if (programsResponse.status !== 200 || programsResponse.body.length < 10 || !programsResponse.body.some((program: any) => program.imageUrl)) throw new Error("Public program catalog or synchronized images are incomplete");

  const programRows = await db.select().from(publicPrograms);
  const auditRows = await db.select().from(clientPortalAuditLogs).where(eq(clientPortalAuditLogs.portalUserId, firstUser.id));
  console.log(JSON.stringify({ ok: true, forcedPasswordChange: true, crossClientIsolation: true, profileRedaction: true, programCount: programRows.length, synchronizedImages: programRows.filter(row => Boolean(row.imageUrl)).length, auditEvents: auditRows.length }, null, 2));
} finally {
  if (usersToDelete.length) {
    await db.delete(clientPortalAuditLogs).where(inArray(clientPortalAuditLogs.portalUserId, usersToDelete));
    await db.delete(clientPortalSessions).where(inArray(clientPortalSessions.portalUserId, usersToDelete));
  }
  if (applicationsToDelete.length) await db.delete(clientPortalApplications).where(inArray(clientPortalApplications.id, applicationsToDelete));
  if (usersToDelete.length) await db.delete(clientPortalUsers).where(inArray(clientPortalUsers.id, usersToDelete));
}

process.exit(0);
