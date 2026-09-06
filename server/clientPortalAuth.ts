import type { Request } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import {
  clientPortalAuditLogs,
  clientPortalSessions,
  clientPortalUsers,
  type ClientPortalSession,
  type ClientPortalUser,
} from "../drizzle/schema";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type PortalRequestContext = {
  user: ClientPortalUser;
  session: ClientPortalSession;
  correlationId: string;
  ipAddress: string;
  userAgent: string;
};

function secretKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required for client portal authentication");
  return new TextEncoder().encode(`${ENV.cookieSecret}:elevay-client-portal:v1`);
}

export function hashPortalToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  const characters = Array.from(bytes, byte => alphabet[byte % alphabet.length]);
  return `${characters.slice(0, 4).join("")}-${characters.slice(4, 8).join("")}-${characters.slice(8, 12).join("")}`;
}

export async function hashPortalPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPortalPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

async function signAccessToken(user: ClientPortalUser, session: ClientPortalSession) {
  return new SignJWT({
    tokenType: "client_portal_access",
    portalUserId: user.id,
    portalUserPublicId: user.publicId,
    primaryClientCaseId: user.primaryClientCaseId,
    sessionPublicId: session.publicId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.publicId)
    .setIssuer("elevay-client-api")
    .setAudience("elevay-client-app")
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey());
}

export function requestIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim()) || req.socket.remoteAddress || "unknown";
}

export async function createPortalSession(input: {
  user: ClientPortalUser;
  req: Request;
  deviceName?: string;
  platform?: string;
  osVersion?: string;
  appVersion?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const refreshToken = randomBytes(48).toString("base64url");
  const sessionPublicId = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await db.insert(clientPortalSessions).values({
    publicId: sessionPublicId,
    portalUserId: input.user.id,
    refreshTokenHash: hashPortalToken(refreshToken),
    deviceName: input.deviceName?.slice(0, 255) ?? null,
    platform: input.platform?.slice(0, 50) ?? null,
    osVersion: input.osVersion?.slice(0, 100) ?? null,
    appVersion: input.appVersion?.slice(0, 50) ?? null,
    ipAddress: requestIp(input.req),
    expiresAt,
  });
  const [session] = await db.select().from(clientPortalSessions).where(eq(clientPortalSessions.publicId, sessionPublicId)).limit(1);
  if (!session) throw new Error("Failed to create portal session");
  return {
    accessToken: await signAccessToken(input.user, session),
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresAt: expiresAt.toISOString(),
    sessionId: session.publicId,
  };
}

export async function rotatePortalSession(input: { sessionId: string; refreshToken: string; req: Request }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const [row] = await db
    .select({ session: clientPortalSessions, user: clientPortalUsers })
    .from(clientPortalSessions)
    .innerJoin(clientPortalUsers, eq(clientPortalSessions.portalUserId, clientPortalUsers.id))
    .where(and(
      eq(clientPortalSessions.publicId, input.sessionId),
      isNull(clientPortalSessions.revokedAt),
      gt(clientPortalSessions.expiresAt, now),
      eq(clientPortalUsers.status, "active"),
    ))
    .limit(1);
  if (!row) return null;
  const presentedHash = hashPortalToken(input.refreshToken);
  const presentedBytes = Buffer.from(presentedHash, "hex");
  const storedBytes = Buffer.from(row.session.refreshTokenHash, "hex");
  if (presentedBytes.length !== storedBytes.length || !timingSafeEqual(presentedBytes, storedBytes)) {
    await db.update(clientPortalSessions).set({ revokedAt: now }).where(eq(clientPortalSessions.portalUserId, row.user.id));
    await writePortalAudit({ req: input.req, portalUserId: row.user.id, clientCaseId: row.user.primaryClientCaseId, action: "refresh_token_reuse", outcome: "denied", recordType: "session", recordPublicId: row.session.publicId });
    return null;
  }
  const nextRefreshToken = randomBytes(48).toString("base64url");
  await db.update(clientPortalSessions).set({
    refreshTokenHash: hashPortalToken(nextRefreshToken),
    lastSeenAt: now,
    ipAddress: requestIp(input.req),
  }).where(eq(clientPortalSessions.id, row.session.id));
  const rotated = { ...row.session, refreshTokenHash: hashPortalToken(nextRefreshToken), lastSeenAt: now };
  return {
    accessToken: await signAccessToken(row.user, rotated),
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: nextRefreshToken,
    refreshTokenExpiresAt: row.session.expiresAt.toISOString(),
    sessionId: row.session.publicId,
    user: row.user,
  };
}

export async function authenticatePortalRequest(req: Request): Promise<PortalRequestContext | null> {
  const authorization = req.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "elevay-client-api",
      audience: "elevay-client-app",
    });
    if (payload.tokenType !== "client_portal_access" || typeof payload.sessionPublicId !== "string" || typeof payload.portalUserId !== "number") return null;
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select({ session: clientPortalSessions, user: clientPortalUsers })
      .from(clientPortalSessions)
      .innerJoin(clientPortalUsers, eq(clientPortalSessions.portalUserId, clientPortalUsers.id))
      .where(and(
        eq(clientPortalSessions.publicId, payload.sessionPublicId),
        eq(clientPortalSessions.portalUserId, payload.portalUserId),
        isNull(clientPortalSessions.revokedAt),
        gt(clientPortalSessions.expiresAt, new Date()),
        eq(clientPortalUsers.status, "active"),
      ))
      .limit(1);
    if (!row) return null;
    const correlationId = (req.headers["x-correlation-id"] as string | undefined)?.slice(0, 64) || randomUUID();
    return {
      user: row.user,
      session: row.session,
      correlationId,
      ipAddress: requestIp(req),
      userAgent: (req.headers["user-agent"] ?? "").slice(0, 512),
    };
  } catch {
    return null;
  }
}

export async function writePortalAudit(input: {
  req: Request;
  portalUserId?: number;
  clientCaseId?: number | null;
  action: string;
  recordType?: string;
  recordPublicId?: string;
  outcome?: "success" | "denied" | "failure";
  details?: string;
  correlationId?: string;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(clientPortalAuditLogs).values({
      portalUserId: input.portalUserId ?? null,
      clientCaseId: input.clientCaseId ?? null,
      action: input.action.slice(0, 100),
      recordType: input.recordType?.slice(0, 100) ?? null,
      recordPublicId: input.recordPublicId?.slice(0, 64) ?? null,
      outcome: input.outcome ?? "success",
      ipAddress: requestIp(input.req),
      userAgent: (input.req.headers["user-agent"] ?? "").slice(0, 512),
      deviceName: (input.req.headers["x-device-name"] as string | undefined)?.slice(0, 255) ?? null,
      osVersion: (input.req.headers["x-os-version"] as string | undefined)?.slice(0, 100) ?? null,
      appVersion: (input.req.headers["x-app-version"] as string | undefined)?.slice(0, 50) ?? null,
      correlationId: input.correlationId?.slice(0, 64) ?? randomUUID(),
      details: input.details?.slice(0, 4000) ?? null,
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error("[ClientPortalAudit] Failed:", error instanceof Error ? error.message : String(error));
  }
}
