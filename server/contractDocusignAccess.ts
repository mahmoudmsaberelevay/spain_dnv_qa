import type { Request } from "express";
import { TRPCError } from "@trpc/server";
import { requireCallActor, type CallActor } from "./leadCallsAccess";
import { getUserModuleAccess, isOwner } from "./permissionsRouter";
export type DocusignActor = CallActor & { canManage: boolean };
export async function requireDocusignActor(req: Request, manage = false): Promise<DocusignActor> {
  const actor = await requireCallActor(req); // signed identity + current DB user; never decoded ctx.user
  const access = isOwner(actor) ? "full" : (await getUserModuleAccess(actor.id)).contracting;
  if (!["full", "viewer"].includes(access) || (manage && access !== "full")) throw new TRPCError({ code: "FORBIDDEN", message: "Contracting access required" });
  return { ...actor, canManage: access === "full" };
}
const publicAttempts = new Map<string, { reset: number; count: number }>();
/** Only capability POSTs from our public page; no cross-origin/CORS or GET sessions. */
export function requireSigningOrigin(req: Request, now = Date.now()) {
  if (!["https://elevay.vip", "https://www.elevay.vip"].includes(String(req.headers.origin ?? ""))) throw new TRPCError({ code: "FORBIDDEN", message: "Signing request unavailable" });
  // req.ip is Express-normalized by server deployment, not a directly trusted client header.
  const key = String(req.ip || req.socket?.remoteAddress || "unknown");
  if (publicAttempts.size > 10000) { for (const [ip, item] of Array.from(publicAttempts)) if (item.reset <= now) publicAttempts.delete(ip); }
  if (publicAttempts.size > 10000 && !publicAttempts.has(key)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please try later" });
  const item = publicAttempts.get(key); const next = !item || item.reset <= now ? { reset: now + 60000, count: 1 } : { ...item, count: item.count + 1 };
  publicAttempts.set(key, next);
  if (next.count > 12) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please try later" });
}
