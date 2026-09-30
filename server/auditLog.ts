import { getDb } from "./db";
import { auditLogs } from "../drizzle/schema";
import type { Request } from "express";

export type AuditAction =
  | "login"
  | "logout"
  | "view"
  | "create"
  | "update"
  | "delete"
  | "export"
  | "bulk_delete"
  | "bulk_update"
  | "sync"
  | "import"
  | "download"
  | "share_prepare";

export interface AuditContext {
  userId?: number;
  userEmail?: string;
  userName?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function writeAuditLog(
  ctx: AuditContext,
  action: AuditAction,
  resource: string,
  resourceId?: string | number,
  details?: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(auditLogs).values({
      userId: ctx.userId ?? null,
      userEmail: ctx.userEmail ?? null,
      userName: ctx.userName ?? null,
      action,
      resource,
      resourceId: resourceId != null ? String(resourceId) : null,
      details: details ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ? ctx.userAgent.substring(0, 512) : null,
      createdAt: Date.now(),
    });
  } catch (err) {
    // Audit log failures should never crash the main request
    console.error("[AuditLog] Failed to write audit log:", err);
  }
}

/** Extract audit context from an Express request */
export function auditCtxFromReq(req: Request, user?: { id: number; email?: string | null; name?: string | null }): AuditContext {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  return {
    userId: user?.id,
    userEmail: user?.email ?? undefined,
    userName: user?.name ?? undefined,
    ipAddress: ip,
    userAgent: req.headers["user-agent"] ?? undefined,
  };
}

/** Extract audit context from a tRPC context */
export function auditCtxFromTrpc(ctx: {
  user?: { id: number; email?: string | null; name?: string | null } | null;
  req?: Request;
}): AuditContext {
  if (!ctx.req) return { userId: ctx.user?.id ?? undefined, userEmail: ctx.user?.email ?? undefined, userName: ctx.user?.name ?? undefined };
  return auditCtxFromReq(ctx.req, ctx.user ?? undefined);
}
