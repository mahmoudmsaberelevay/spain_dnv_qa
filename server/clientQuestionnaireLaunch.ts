import { createHash, randomBytes, randomUUID } from "crypto";
import type { Request } from "express";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import {
  clientCases,
  clientPortalApplications,
  clientPortalSessions,
  clientPortalUsers,
  clientQuestionnaireLaunchTokens,
} from "../drizzle/schema";
import { isCaribbeanDocumentationProgram } from "../shared/clientDocumentationPrograms";
import { createPortalSession, writePortalAudit } from "./clientPortalAuth";
import { getDb } from "./db";

const LAUNCH_TOKEN_TTL_MS = 5 * 60 * 1000;
const LAUNCH_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class QuestionnaireLaunchError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

export function questionnaireLaunchTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isValidQuestionnaireLaunchToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

export function affectedQuestionnaireLaunchRows(result: unknown) {
  const metadata = Array.isArray(result) ? result[0] : result;
  if (!metadata || typeof metadata !== "object") return 0;
  return Number((metadata as { affectedRows?: number }).affectedRows ?? 0);
}

export function questionnaireLaunchRecordIsEligible(input: {
  now: Date;
  expiresAt: Date;
  usedAt: Date | null;
  program: string | null | undefined;
  portalUserStatus: string;
  launchPortalUserId: number;
  applicationPortalUserId: number;
  launchClientCaseId: number;
  applicationClientCaseId: number;
  launchSourceSessionId: number;
  sourceSessionId: number;
  sourceSessionPortalUserId: number;
  sourceSessionExpiresAt: Date;
  sourceSessionRevokedAt: Date | null;
  applicationAccessRevokedAt: Date | null;
}) {
  return input.usedAt === null
    && input.expiresAt > input.now
    && isCaribbeanDocumentationProgram(input.program)
    && input.portalUserStatus === "active"
    && input.launchPortalUserId === input.applicationPortalUserId
    && input.launchPortalUserId === input.sourceSessionPortalUserId
    && input.launchClientCaseId === input.applicationClientCaseId
    && input.launchSourceSessionId === input.sourceSessionId
    && input.sourceSessionExpiresAt > input.now
    && input.sourceSessionRevokedAt === null
    && input.applicationAccessRevokedAt === null;
}

export async function createQuestionnaireLaunch(input: {
  portalUserId: number;
  portalApplicationId: number;
  clientCaseId: number;
  sourceSessionId: number;
}) {
  const db = await getDb();
  if (!db) throw new QuestionnaireLaunchError("service_unavailable", 503);
  const now = new Date();
  await db.delete(clientQuestionnaireLaunchTokens).where(lt(clientQuestionnaireLaunchTokens.expiresAt, new Date(now.getTime() - LAUNCH_TOKEN_RETENTION_MS)));
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + LAUNCH_TOKEN_TTL_MS);
  await db.insert(clientQuestionnaireLaunchTokens).values({
    publicId: randomUUID(),
    tokenHash: questionnaireLaunchTokenHash(token),
    portalUserId: input.portalUserId,
    portalApplicationId: input.portalApplicationId,
    clientCaseId: input.clientCaseId,
    sourceSessionId: input.sourceSessionId,
    expiresAt,
  });
  return {
    // The native app is associated with elevay.vip, including legacy cached
    // catch-all rules. www.elevay.vip is intentionally not an associated app
    // domain, so the existing binary opens this secure web questionnaire in
    // Safari; the host redirects to the same ELEVAY page while preserving the
    // URL fragment token.
    url: `https://www.elevay.vip/client-questionnaire#launch=${encodeURIComponent(token)}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function consumeQuestionnaireLaunch(input: { token: unknown; req: Request }) {
  if (!isValidQuestionnaireLaunchToken(input.token)) {
    throw new QuestionnaireLaunchError("questionnaire_launch_invalid", 401);
  }
  const db = await getDb();
  if (!db) throw new QuestionnaireLaunchError("service_unavailable", 503);
  const now = new Date();
  const tokenHash = questionnaireLaunchTokenHash(input.token);
  const [owned] = await db
    .select({
      launch: clientQuestionnaireLaunchTokens,
      application: clientPortalApplications,
      clientCase: clientCases,
      portalUser: clientPortalUsers,
      sourceSession: clientPortalSessions,
    })
    .from(clientQuestionnaireLaunchTokens)
    .innerJoin(clientPortalApplications, eq(clientQuestionnaireLaunchTokens.portalApplicationId, clientPortalApplications.id))
    .innerJoin(clientCases, eq(clientQuestionnaireLaunchTokens.clientCaseId, clientCases.id))
    .innerJoin(clientPortalUsers, eq(clientQuestionnaireLaunchTokens.portalUserId, clientPortalUsers.id))
    .innerJoin(clientPortalSessions, eq(clientQuestionnaireLaunchTokens.sourceSessionId, clientPortalSessions.id))
    .where(and(
      eq(clientQuestionnaireLaunchTokens.tokenHash, tokenHash),
      isNull(clientQuestionnaireLaunchTokens.usedAt),
      gt(clientQuestionnaireLaunchTokens.expiresAt, now),
      eq(clientPortalApplications.portalUserId, clientQuestionnaireLaunchTokens.portalUserId),
      eq(clientPortalApplications.clientCaseId, clientQuestionnaireLaunchTokens.clientCaseId),
      isNull(clientPortalApplications.accessRevokedAt),
      eq(clientPortalUsers.status, "active"),
      eq(clientPortalSessions.portalUserId, clientQuestionnaireLaunchTokens.portalUserId),
      isNull(clientPortalSessions.revokedAt),
      gt(clientPortalSessions.expiresAt, now),
    ))
    .limit(1);
  if (!owned || !questionnaireLaunchRecordIsEligible({
    now,
    expiresAt: owned.launch.expiresAt,
    usedAt: owned.launch.usedAt,
    program: owned.clientCase.program,
    portalUserStatus: owned.portalUser.status,
    launchPortalUserId: owned.launch.portalUserId,
    applicationPortalUserId: owned.application.portalUserId,
    launchClientCaseId: owned.launch.clientCaseId,
    applicationClientCaseId: owned.application.clientCaseId,
    launchSourceSessionId: owned.launch.sourceSessionId,
    sourceSessionId: owned.sourceSession.id,
    sourceSessionPortalUserId: owned.sourceSession.portalUserId,
    sourceSessionExpiresAt: owned.sourceSession.expiresAt,
    sourceSessionRevokedAt: owned.sourceSession.revokedAt,
    applicationAccessRevokedAt: owned.application.accessRevokedAt,
  })) {
    throw new QuestionnaireLaunchError("questionnaire_launch_invalid", 401);
  }
  const claim = await db.update(clientQuestionnaireLaunchTokens).set({ usedAt: now }).where(and(
    eq(clientQuestionnaireLaunchTokens.id, owned.launch.id),
    isNull(clientQuestionnaireLaunchTokens.usedAt),
    gt(clientQuestionnaireLaunchTokens.expiresAt, now),
  ));
  if (affectedQuestionnaireLaunchRows(claim) !== 1) {
    throw new QuestionnaireLaunchError("questionnaire_launch_already_used", 401);
  }
  const session = await createPortalSession({
    user: owned.portalUser,
    req: input.req,
    deviceName: "Questionnaire Web Link",
    platform: "web",
  });
  await writePortalAudit({
    req: input.req,
    portalUserId: owned.portalUser.id,
    clientCaseId: owned.clientCase.id,
    action: "questionnaire_launch_consumed",
    recordType: "client_application",
    recordPublicId: owned.application.publicId,
  });
  return {
    ...session,
    applicationId: owned.application.publicId,
    redirectPath: "/client-questionnaire",
  };
}
