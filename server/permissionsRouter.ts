/**
 * permissionsRouter — owner-only procedures for managing user access.
 *
 * All write procedures require the caller to be the platform owner (OWNER_OPEN_ID).
 * Regular users can call getMyPermissions to read their own access map.
 *
 * PAGE KEYS (must match frontend route guards):
 *   contracting, finance, docs, analysis, chat, broadcast
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { ENV } from "./_core/env";
import { getDb } from "./db";

async function requireDb(): Promise<NonNullable<Awaited<ReturnType<typeof getDb>>>> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}
import {
  userPermissions,
  pendingInvites,
  users,
} from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import crypto from "crypto";

// All pages that can be toggled per user
export const ALL_PAGE_KEYS = [
  "contracting",
  "finance",
  "docs",
  "analysis",
  "chat",
  "broadcast",
] as const;
export type PageKey = (typeof ALL_PAGE_KEYS)[number];

// Middleware: only the owner (OWNER_OPEN_ID) can call this
const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.openId !== ENV.ownerOpenId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the platform owner can access this.",
    });
  }
  return next({ ctx });
});

export const permissionsRouter = router({
  // ── Any authenticated user: get their own permission map ──────────────────
  getMyPermissions: protectedProcedure.query(async ({ ctx }) => {
    // Owner always has full access
    if (ctx.user.openId === ENV.ownerOpenId) {
      const full: Record<string, boolean> = {};
      for (const k of ALL_PAGE_KEYS) full[k] = true;
      return { permissions: full, isOwner: true };
    }

    const db = await requireDb();
    const rows = await db
      .select()
      .from(userPermissions)
      .where(eq(userPermissions.userId, ctx.user.id));

    const permissions: Record<string, boolean> = {};
    for (const k of ALL_PAGE_KEYS) permissions[k] = false;
    for (const row of rows) {
      permissions[row.pageKey] = row.canAccess;
    }
    return { permissions, isOwner: false };
  }),

  // ── Owner: list all users ─────────────────────────────────────────────────
  listUsers: ownerProcedure.query(async () => {
    const db = await requireDb();
    const allUsers = await db
      .select({
        id: users.id,
        openId: users.openId,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      })
      .from(users)
      .orderBy(users.createdAt);
    return allUsers;
  }),

  // ── Owner: get permissions for a specific user ────────────────────────────
  getUserPermissions: ownerProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const rows = await db
        .select()
        .from(userPermissions)
        .where(eq(userPermissions.userId, input.userId));

      const permissions: Record<string, boolean> = {};
      for (const k of ALL_PAGE_KEYS) permissions[k] = false;
      for (const row of rows) {
        permissions[row.pageKey] = row.canAccess;
      }
      return permissions;
    }),

  // ── Owner: set all permissions for a user at once ────────────────────────
  setUserPermissions: ownerProcedure
    .input(
      z.object({
        userId: z.number(),
        permissions: z.record(z.string(), z.boolean()),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();

      // Delete existing rows for this user
      await db
        .delete(userPermissions)
        .where(eq(userPermissions.userId, input.userId));

      // Insert new rows
      const rows = ALL_PAGE_KEYS.map((key) => ({
        userId: input.userId,
        pageKey: key,
        canAccess: input.permissions[key] ?? false,
      }));
      await db.insert(userPermissions).values(rows);

      return { success: true };
    }),

  // ── Owner: toggle a single page permission for a user ────────────────────
  togglePermission: ownerProcedure
    .input(
      z.object({
        userId: z.number(),
        pageKey: z.string(),
        canAccess: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();

      // Check if row exists
      const existing = await db
        .select()
        .from(userPermissions)
        .where(
          and(
            eq(userPermissions.userId, input.userId),
            eq(userPermissions.pageKey, input.pageKey)
          )
        );

      if (existing.length > 0) {
        await db
          .update(userPermissions)
          .set({ canAccess: input.canAccess })
          .where(
            and(
              eq(userPermissions.userId, input.userId),
              eq(userPermissions.pageKey, input.pageKey)
            )
          );
      } else {
        await db.insert(userPermissions).values({
          userId: input.userId,
          pageKey: input.pageKey,
          canAccess: input.canAccess,
        });
      }

      return { success: true };
    }),

  // ── Owner: add a user manually (creates a placeholder user record) ────────
  addUserManually: ownerProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        permissions: z.record(z.string(), z.boolean()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();

      // Check if user with this email already exists
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email));

      let userId: number;

      if (existing.length > 0) {
        userId = existing[0].id;
        // Update name if provided
        await db
          .update(users)
          .set({ name: input.name })
          .where(eq(users.id, userId));
      } else {
        // Create a placeholder user (no openId yet — they'll link on first login)
        const openId = `manual_${crypto.randomBytes(16).toString("hex")}`;
        await db.insert(users).values({
          openId,
          name: input.name,
          email: input.email,
          loginMethod: "manual",
          lastSignedIn: new Date(),
        });
        const created = await db
          .select()
          .from(users)
          .where(eq(users.openId, openId));
        userId = created[0].id;
      }

      // Set permissions if provided
      if (input.permissions) {
        await db
          .delete(userPermissions)
          .where(eq(userPermissions.userId, userId));
        const rows = ALL_PAGE_KEYS.map((key) => ({
          userId,
          pageKey: key,
          canAccess: input.permissions![key] ?? false,
        }));
        await db.insert(userPermissions).values(rows);
      }

      return { success: true, userId };
    }),

  // ── Owner: generate an invite link ───────────────────────────────────────
  createInvite: ownerProcedure
    .input(
      z.object({
        email: z.string().email(),
        permissions: z.record(z.string(), z.boolean()),
        origin: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const token = crypto.randomBytes(32).toString("hex");

      await db.insert(pendingInvites).values({
        email: input.email,
        token,
        invitePermissions: input.permissions,
      });

      const inviteUrl = `${input.origin}/join?token=${token}`;
      return { inviteUrl, token };
    }),

  // ── Owner: list pending invites ───────────────────────────────────────────
  listInvites: ownerProcedure.query(async () => {
    const db = await requireDb();
    return db
      .select()
      .from(pendingInvites)
      .orderBy(pendingInvites.createdAt);
  }),

  // ── Owner: revoke an invite ───────────────────────────────────────────────
  revokeInvite: ownerProcedure
    .input(z.object({ inviteId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db
        .delete(pendingInvites)
        .where(eq(pendingInvites.id, input.inviteId));
      return { success: true };
    }),

  // ── Owner: delete a user entirely ────────────────────────────────────────
  deleteUser: ownerProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Prevent owner from deleting themselves
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot delete your own account.",
        });
      }
      const db = await requireDb();
      await db
        .delete(userPermissions)
        .where(eq(userPermissions.userId, input.userId));
      await db.delete(users).where(eq(users.id, input.userId));
      return { success: true };
    }),
});
