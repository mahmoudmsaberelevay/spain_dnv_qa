import type { Request } from "express";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  clientEmployeeSessions,
  modulePermissions,
  users,
  type ClientEmployeeSession,
  type User,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { auditCtxFromReq, writeAuditLog } from "./auditLog";
import { getDb } from "./db";
import { isOwner } from "./permissionsRouter";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EXTERNAL_EMPLOYEE_EMAILS = new Set([
  "mahmoud.saberelevay@gmail.com",
  "walid.mammdouh@gmail.com",
]);

export type EmployeeMobileContext = {
  user: User;
  session: ClientEmployeeSession;
  locale: "en" | "ar";
  correlationId: string;
};

function secretKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for employee mobile authentication");
  return new TextEncoder().encode(`${ENV.cookieSecret}:elevay-client-employee:v1`);
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeEmployeeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isAllowedEmployeeEmail(value: string) {
  const email = normalizeEmployeeEmail(value);
  return email.endsWith("@elevay.com") || EXTERNAL_EMPLOYEE_EMAILS.has(email);
}

export async function hasFullClientDocsAccess(user: Pick<User, "id" | "openId" | "email">) {
  if (isOwner(user)) return true;
  const db = await getDb();
  if (!db) return false;
  const [permission] = await db.select({ accessLevel: modulePermissions.accessLevel })
    .from(modulePermissions)
    .where(and(eq(modulePermissions.userId, user.id), eq(modulePermissions.module, "clientDocs")))
    .limit(1);
  // The CRM's established default for users without seeded rows is full.
  return (permission?.accessLevel ?? "full") === "full";
}

async function signEmployeeAccessToken(user: User, session: ClientEmployeeSession) {
  return new SignJWT({
    tokenType: "client_employee_access",
    staffUserId: user.id,
    sessionPublicId: session.publicId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(`employee:${user.id}`)
    .setIssuer("elevay-client-api")
    .setAudience("elevay-client-app")
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey());
}

function employeeProfile(user: User, session: ClientEmployeeSession) {
  return {
    publicId: `employee-${user.id}`,
    username: user.name || user.email || "ELEVAY Employee",
    email: user.email || "",
    mobile: null,
    locale: session.locale === "ar" ? "ar" as const : "en" as const,
    consultant: null,
    paralegal: null,
    mustChangePassword: false,
    notificationPreferences: { news: true },
    accountType: "employee" as const,
    permissions: { clientDocuments: "full" as const },
  };
}

export async function createEmployeeMobileSession(input: {
  user: User;
  req: Request;
  locale?: "en" | "ar";
  deviceName?: string;
  platform?: string;
  osVersion?: string;
  appVersion?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const refreshToken = randomBytes(48).toString("base64url");
  const publicId = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await db.insert(clientEmployeeSessions).values({
    publicId,
    staffUserId: input.user.id,
    refreshTokenHash: hashToken(refreshToken),
    deviceName: input.deviceName?.slice(0, 255) ?? null,
    platform: input.platform?.slice(0, 50) ?? null,
    osVersion: input.osVersion?.slice(0, 100) ?? null,
    appVersion: input.appVersion?.slice(0, 50) ?? null,
    locale: input.locale === "ar" ? "ar" : "en",
    ipAddress: auditCtxFromReq(input.req).ipAddress ?? "unknown",
    expiresAt,
  });
  const [session] = await db.select().from(clientEmployeeSessions).where(eq(clientEmployeeSessions.publicId, publicId)).limit(1);
  if (!session) throw new Error("Failed to create employee mobile session");
  await writeAuditLog(auditCtxFromReq(input.req, input.user), "login", "client_employee_session", session.publicId, "Employee signed in to ELEVAY Client with existing CRM credentials");
  return {
    accessToken: await signEmployeeAccessToken(input.user, session),
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresAt: expiresAt.toISOString(),
    sessionId: session.publicId,
    mustChangePassword: false,
    user: employeeProfile(input.user, session),
  };
}

export async function rotateEmployeeMobileSession(input: { sessionId: string; refreshToken: string; req: Request }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const [row] = await db.select({ session: clientEmployeeSessions, user: users })
    .from(clientEmployeeSessions)
    .innerJoin(users, eq(clientEmployeeSessions.staffUserId, users.id))
    .where(and(
      eq(clientEmployeeSessions.publicId, input.sessionId),
      isNull(clientEmployeeSessions.revokedAt),
      gt(clientEmployeeSessions.expiresAt, now),
    ))
    .limit(1);
  if (!row || !row.user.email || !isAllowedEmployeeEmail(row.user.email) || !await hasFullClientDocsAccess(row.user)) return null;
  const presented = Buffer.from(hashToken(input.refreshToken), "hex");
  const stored = Buffer.from(row.session.refreshTokenHash, "hex");
  if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) {
    await db.update(clientEmployeeSessions).set({ revokedAt: now }).where(eq(clientEmployeeSessions.staffUserId, row.user.id));
    await writeAuditLog(auditCtxFromReq(input.req, row.user), "logout", "client_employee_session", row.session.publicId, "Refresh token reuse denied; all employee mobile sessions revoked");
    return null;
  }
  const nextRefreshToken = randomBytes(48).toString("base64url");
  await db.update(clientEmployeeSessions).set({
    refreshTokenHash: hashToken(nextRefreshToken),
    lastSeenAt: now,
    ipAddress: auditCtxFromReq(input.req).ipAddress ?? "unknown",
  }).where(eq(clientEmployeeSessions.id, row.session.id));
  const rotated = { ...row.session, refreshTokenHash: hashToken(nextRefreshToken), lastSeenAt: now };
  return {
    accessToken: await signEmployeeAccessToken(row.user, rotated),
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: nextRefreshToken,
    refreshTokenExpiresAt: row.session.expiresAt.toISOString(),
    sessionId: row.session.publicId,
    mustChangePassword: false,
    user: employeeProfile(row.user, rotated),
  };
}

export async function authenticateEmployeeMobileRequest(req: Request): Promise<EmployeeMobileContext | null> {
  const authorization = req.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: "elevay-client-api", audience: "elevay-client-app" });
    if (payload.tokenType !== "client_employee_access" || typeof payload.sessionPublicId !== "string" || typeof payload.staffUserId !== "number") return null;
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select({ session: clientEmployeeSessions, user: users })
      .from(clientEmployeeSessions)
      .innerJoin(users, eq(clientEmployeeSessions.staffUserId, users.id))
      .where(and(
        eq(clientEmployeeSessions.publicId, payload.sessionPublicId),
        eq(clientEmployeeSessions.staffUserId, payload.staffUserId),
        isNull(clientEmployeeSessions.revokedAt),
        gt(clientEmployeeSessions.expiresAt, new Date()),
      ))
      .limit(1);
    if (!row || !row.user.email || !isAllowedEmployeeEmail(row.user.email) || !await hasFullClientDocsAccess(row.user)) return null;
    return {
      user: row.user,
      session: row.session,
      locale: row.session.locale === "ar" ? "ar" : "en",
      correlationId: (req.headers["x-correlation-id"] as string | undefined)?.slice(0, 64) || randomUUID(),
    };
  } catch {
    return null;
  }
}

export async function revokeEmployeeMobileSession(context: EmployeeMobileContext, req: Request) {
  const db = await getDb();
  if (db) await db.update(clientEmployeeSessions).set({ revokedAt: new Date() }).where(eq(clientEmployeeSessions.id, context.session.id));
  await writeAuditLog(auditCtxFromReq(req, context.user), "logout", "client_employee_session", context.session.publicId, "Employee signed out of ELEVAY Client");
}

export async function updateEmployeeMobileLocale(context: EmployeeMobileContext, locale: "en" | "ar") {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(clientEmployeeSessions).set({ locale }).where(eq(clientEmployeeSessions.id, context.session.id));
}

export function serializeEmployeeProfile(context: EmployeeMobileContext) {
  return employeeProfile(context.user, context.session);
}
