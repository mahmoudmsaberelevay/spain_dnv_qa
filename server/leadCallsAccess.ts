import type { Request } from "express";
import { parse } from "cookie";
import { jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "../shared/const";
import {
  leads,
  leadsPermissions,
  leadCallAgentSettings,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";

export type CallActor = {
  id: number;
  name: string | null;
  email: string | null;
  openId: string | null;
  role: "admin" | "user";
};
export const callUserProjection = {
  id: users.id,
  name: users.name,
  email: users.email,
  openId: users.openId,
  role: users.role,
};
export type CallsDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export function callAccessError(): never {
  throw new TRPCError({ code: "FORBIDDEN", message: "Calling access denied" });
}
export async function verifyCallSession(
  req: Pick<Request, "headers"> & { cookies?: Record<string, unknown> },
  lookup: (identity: string) => Promise<CallActor | null>,
  secret = process.env.JWT_SECRET ?? "",
  appId = process.env.VITE_APP_ID ?? ""
): Promise<CallActor> {
  try {
    const parsed = req.cookies?.[COOKIE_NAME];
    const token =
      typeof parsed === "string"
        ? parsed
        : parse(req.headers.cookie ?? "")[COOKIE_NAME];
    if (!token || !secret) throw new Error("missing");
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] }
    );
    // Both existing password and OAuth login use signed sdk openId/appId sessions.
    if (
      typeof payload.exp !== "number" ||
      typeof payload.openId !== "string" ||
      !payload.openId ||
      typeof payload.appId !== "string" ||
      !appId ||
      payload.appId !== appId ||
      payload.openId.startsWith("cron_")
    )
      throw new Error("session");
    const actor = await lookup(payload.openId);
    if (!actor || !Number.isSafeInteger(actor.id) || actor.id <= 0)
      throw new Error("user");
    return actor;
  } catch {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "A valid signed CRM session is required",
    });
  }
}
export async function requireCallActor(req: Request): Promise<CallActor> {
  return verifyCallSession(req, async identity => {
    const db = await getDb();
    if (!db) return null;
    const predicate = /^\d+$/.test(identity)
      ? eq(users.id, Number(identity))
      : eq(users.openId, identity);
    const [actor] = await db
      .select(callUserProjection)
      .from(users)
      .where(predicate)
      .limit(1);
    return actor ?? null;
  });
}
const normalizedName = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
export function hasScopedLeadAccess(
  actor: CallActor,
  lead: { assignedConsultantUserId: number | null; assignedTo: string | null },
  permission: {
    canView: boolean | null;
    canEdit: boolean | null;
    canViewAll?: boolean | null;
  } | null,
  namedUsers: { id: number; name: string | null }[],
  edit = false
): boolean {
  if (actor.role === "admin") return true;
  if (!permission?.canView || (edit && !permission.canEdit)) return false;
  if (permission.canViewAll === true) return true;
  if (lead.assignedConsultantUserId !== null)
    return lead.assignedConsultantUserId === actor.id;
  const name = normalizedName(lead.assignedTo);
  if (!name) return false;
  const matches = namedUsers.filter(user => normalizedName(user.name) === name);
  return matches.length === 1 && matches[0].id === actor.id;
}
/** Deliberately works on transactions too; avoids trusting existing decoded ctx.user. */
export async function authorizeCallLead(
  db: CallsDb | any,
  actor: CallActor,
  leadId: number,
  edit = false
) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!lead)
    throw new TRPCError({ code: "NOT_FOUND", message: "Lead unavailable" });
  const permissions = await db
    .select()
    .from(leadsPermissions)
    .where(eq(leadsPermissions.userId, actor.id));
  // Conflicting duplicate permissions fail closed rather than choosing permissive row.
  const permission = permissions.length === 1 ? permissions[0] : null;
  const namedUsers =
    actor.role === "admin" || lead.assignedConsultantUserId !== null
      ? []
      : await db.select({ id: users.id, name: users.name }).from(users);
  if (!hasScopedLeadAccess(actor, lead, permission, namedUsers, edit))
    callAccessError();
  return lead;
}
export async function requireCallGrant(
  db: CallsDb | any,
  actor: CallActor,
  capability: "canCall" | "canListen"
) {
  const [grant] = await db
    .select()
    .from(leadCallAgentSettings)
    .where(
      and(
        eq(leadCallAgentSettings.userId, actor.id),
        eq(leadCallAgentSettings[capability], true)
      )
    )
    .limit(1);
  if (!grant) callAccessError();
  return grant;
}
export function requireCallAdmin(actor: CallActor) {
  if (actor.role !== "admin") callAccessError();
}
export function isCallPolicyOwner(
  actor: CallActor,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    actor.role === "admin" &&
    ((!!env.OWNER_OPEN_ID && actor.openId === env.OWNER_OPEN_ID) ||
      (!!env.ELEVAY_CALL_POLICY_OWNER_USER_ID &&
        String(actor.id) === env.ELEVAY_CALL_POLICY_OWNER_USER_ID))
  );
}
