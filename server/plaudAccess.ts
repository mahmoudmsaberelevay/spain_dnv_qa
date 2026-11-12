import { createHash } from "node:crypto";
import { parse } from "cookie";
import type { Request } from "express";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { users, leadsPermissions } from "../drizzle/schema";
import { COOKIE_NAME } from "../shared/const";
import { getDb } from "./db";
import {
  requireCallActor,
  authorizeCallLead,
  type CallActor,
} from "./leadCallsAccess";

/** This module deliberately shares successful imports with every current signed CRM user.
 * The CRM has no separate disabled-user flag: a current database user and a valid,
 * unexpired app-bound signed session are required on every request. Cron identities
 * and decoded-only ctx.user objects are never accepted. */
export async function requirePlaudActor(req: Request): Promise<CallActor> {
  return requireCallActor(req);
}
export function requirePlaudSameOrigin(req: Request): void {
  const raw = req.headers.origin;
  if (!raw)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "PLAUD_ORIGIN_REQUIRED",
    });
  try {
    const origin = new URL(raw).origin;
    const host = req.get?.("host") ?? req.headers.host;
    const local = host && /^localhost:\d+$|^127\.0\.0\.1:\d+$/.test(host);
    const approved =
      origin === "https://elevay.vip" ||
      origin === "https://www.elevay.vip" ||
      (host &&
        /^\d+-[a-z0-9-]+\.manus\.computer$/.test(host) &&
        origin === `https://${host}`) ||
      (process.env.NODE_ENV !== "production" &&
        local &&
        origin === `http://${host}`);
    if (!approved || raw !== origin) throw new Error();
  } catch {
    throw new TRPCError({ code: "FORBIDDEN", message: "PLAUD_ORIGIN_DENIED" });
  }
}
export function plaudSessionHash(req: Request): string {
  const raw =
    req.cookies?.[COOKIE_NAME] ?? parse(req.headers.cookie ?? "")[COOKIE_NAME];
  if (typeof raw !== "string" || !raw)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "PLAUD_SESSION_REQUIRED",
    });
  return createHash("sha256")
    .update("elevay-plaud-session-v1\0")
    .update(raw)
    .digest("hex");
}
export async function requirePlaudLead(
  actor: CallActor,
  leadId: number,
  edit = false,
  dbOverride?: any
) {
  const db = dbOverride ?? (await getDb());
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "PLAUD_DATABASE_UNAVAILABLE",
    });
  return authorizeCallLead(db, actor, leadId, edit);
}
export async function requirePlaudImportLead(
  actor: CallActor,
  leadId: number,
  dbOverride?: any
) {
  const db = dbOverride ?? (await getDb());
  if (!db)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "PLAUD_DATABASE_UNAVAILABLE",
    });
  const lead = await authorizeCallLead(db, actor, leadId, true);
  if (actor.role !== "admin") {
    const rows = await db
      .select({ canImport: leadsPermissions.canImport })
      .from(leadsPermissions)
      .where(
        and(
          eq(leadsPermissions.userId, actor.id),
          eq(leadsPermissions.canImport, true)
        )
      );
    if (rows.length !== 1)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "PLAUD_LEAD_IMPORT_DENIED",
      });
  }
  return lead;
}
