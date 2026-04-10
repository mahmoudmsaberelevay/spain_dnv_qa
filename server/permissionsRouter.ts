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
import {
  userPermissions,
  pendingInvites,
  users,
  userGroups,
  groupPermissions,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

async function requireDb(): Promise<NonNullable<Awaited<ReturnType<typeof getDb>>>> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// All pages that can be toggled per user / group
export const ALL_PAGE_KEYS = [
  "contracting",
  "finance",
  "docs",
  "analysis",
  "chat",
  "broadcast",
] as const;
export type PageKey = (typeof ALL_PAGE_KEYS)[number];

// The owner's email — hardcoded for security
const OWNER_EMAIL = "mahmoud.saberelevay@gmail.com";

// Helper: check if a user is the owner
function isOwner(user: { openId: string; email?: string | null }): boolean {
  return user.openId === ENV.ownerOpenId || user.email === OWNER_EMAIL;
}

// Middleware: only the owner can call this
const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isOwner(ctx.user)) {
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
    if (isOwner(ctx.user)) {
      const full: Record<string, boolean> = {};
      for (const k of ALL_PAGE_KEYS) full[k] = true;
      return { permissions: full, isOwner: true, groupId: null as number | null, groupName: null as string | null };
    }

    const db = await requireDb();

    // Check if user belongs to a group
    const userRow = await db
      .select({ groupId: users.groupId })
      .from(users)
      .where(eq(users.id, ctx.user.id));

    const groupId = userRow[0]?.groupId ?? null;

    const permissions: Record<string, boolean> = {};
    for (const k of ALL_PAGE_KEYS) permissions[k] = false;

    if (groupId) {
      // Use group permissions
      const rows = await db
        .select()
        .from(groupPermissions)
        .where(eq(groupPermissions.groupId, groupId));
      for (const row of rows) {
        permissions[row.pageKey] = row.canAccess;
      }
      const groupRow = await db
        .select({ name: userGroups.name })
        .from(userGroups)
        .where(eq(userGroups.id, groupId));
      return {
        permissions,
        isOwner: false,
        groupId,
        groupName: groupRow[0]?.name ?? null,
      };
    } else {
      // Use individual permissions
      const rows = await db
        .select()
        .from(userPermissions)
        .where(eq(userPermissions.userId, ctx.user.id));
      for (const row of rows) {
        permissions[row.pageKey] = row.canAccess;
      }
      return { permissions, isOwner: false, groupId: null, groupName: null };
    }
  }),

  // ── Owner: list all users (with groupId) ─────────────────────────────────
  listUsers: ownerProcedure.query(async () => {
    const db = await requireDb();
    const allUsers = await db
      .select({
        id: users.id,
        openId: users.openId,
        name: users.name,
        email: users.email,
        role: users.role,
        groupId: users.groupId,
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
      await db.delete(userPermissions).where(eq(userPermissions.userId, input.userId));
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
      const existing = await db
        .select()
        .from(userPermissions)
        .where(and(eq(userPermissions.userId, input.userId), eq(userPermissions.pageKey, input.pageKey)));

      if (existing.length > 0) {
        await db
          .update(userPermissions)
          .set({ canAccess: input.canAccess })
          .where(and(eq(userPermissions.userId, input.userId), eq(userPermissions.pageKey, input.pageKey)));
      } else {
        await db.insert(userPermissions).values({
          userId: input.userId,
          pageKey: input.pageKey,
          canAccess: input.canAccess,
        });
      }
      return { success: true };
    }),

  // ── Owner: add a user manually ────────────────────────────────────────────
  addUserManually: ownerProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        permissions: z.record(z.string(), z.boolean()).optional(),
        groupId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const existing = await db.select().from(users).where(eq(users.email, input.email));
      let userId: number;

      if (existing.length > 0) {
        userId = existing[0].id;
        await db.update(users).set({ name: input.name }).where(eq(users.id, userId));
      } else {
        const openId = `manual_${crypto.randomBytes(16).toString("hex")}`;
        await db.insert(users).values({
          openId,
          name: input.name,
          email: input.email,
          loginMethod: "manual",
          groupId: input.groupId ?? null,
          lastSignedIn: new Date(),
        });
        const created = await db.select().from(users).where(eq(users.openId, openId));
        userId = created[0].id;
      }

      if (input.groupId) {
        await db.update(users).set({ groupId: input.groupId }).where(eq(users.id, userId));
      } else if (input.permissions) {
        await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
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
    return db.select().from(pendingInvites).orderBy(pendingInvites.createdAt);
  }),

  // ── Owner: revoke an invite ───────────────────────────────────────────────
  revokeInvite: ownerProcedure
    .input(z.object({ inviteId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(pendingInvites).where(eq(pendingInvites.id, input.inviteId));
      return { success: true };
    }),

  // ── Owner: delete a user entirely ────────────────────────────────────────
  deleteUser: ownerProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot delete your own account." });
      }
      const db = await requireDb();
      await db.delete(userPermissions).where(eq(userPermissions.userId, input.userId));
      await db.delete(users).where(eq(users.id, input.userId));
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Owner: list all groups (with member count) ────────────────────────────
  listGroups: ownerProcedure.query(async () => {
    const db = await requireDb();
    const groups = await db.select().from(userGroups).orderBy(userGroups.createdAt);
    const allUsers = await db.select({ id: users.id, groupId: users.groupId }).from(users);

    return groups.map((g) => ({
      ...g,
      memberCount: allUsers.filter((u) => u.groupId === g.id).length,
    }));
  }),

  // ── Owner: create a new group ─────────────────────────────────────────────
  createGroup: ownerProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        color: z.string().default("#6366f1"),
        permissions: z.record(z.string(), z.boolean()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.insert(userGroups).values({
        name: input.name,
        description: input.description ?? null,
        color: input.color,
      });
      const created = await db
        .select()
        .from(userGroups)
        .where(eq(userGroups.name, input.name))
        .orderBy(userGroups.createdAt);
      const group = created[created.length - 1];

      // Set permissions for the group
      if (input.permissions) {
        const rows = ALL_PAGE_KEYS.map((key) => ({
          groupId: group.id,
          pageKey: key,
          canAccess: input.permissions![key] ?? false,
        }));
        await db.insert(groupPermissions).values(rows);
      }

      return { success: true, groupId: group.id };
    }),

  // ── Owner: update a group's name/description/color ───────────────────────
  updateGroup: ownerProcedure
    .input(
      z.object({
        groupId: z.number(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.color !== undefined) updates.color = input.color;
      await db.update(userGroups).set(updates).where(eq(userGroups.id, input.groupId));
      return { success: true };
    }),

  // ── Owner: delete a group (unassigns all members) ────────────────────────
  deleteGroup: ownerProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      // Unassign all users from this group
      await db
        .update(users)
        .set({ groupId: null })
        .where(eq(users.groupId, input.groupId));
      // Delete group permissions
      await db.delete(groupPermissions).where(eq(groupPermissions.groupId, input.groupId));
      // Delete the group
      await db.delete(userGroups).where(eq(userGroups.id, input.groupId));
      return { success: true };
    }),

  // ── Owner: get permissions for a group ───────────────────────────────────
  getGroupPermissions: ownerProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const rows = await db
        .select()
        .from(groupPermissions)
        .where(eq(groupPermissions.groupId, input.groupId));

      const permissions: Record<string, boolean> = {};
      for (const k of ALL_PAGE_KEYS) permissions[k] = false;
      for (const row of rows) {
        permissions[row.pageKey] = row.canAccess;
      }
      return permissions;
    }),

  // ── Owner: set all permissions for a group ────────────────────────────────
  setGroupPermissions: ownerProcedure
    .input(
      z.object({
        groupId: z.number(),
        permissions: z.record(z.string(), z.boolean()),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(groupPermissions).where(eq(groupPermissions.groupId, input.groupId));
      const rows = ALL_PAGE_KEYS.map((key) => ({
        groupId: input.groupId,
        pageKey: key,
        canAccess: input.permissions[key] ?? false,
      }));
      await db.insert(groupPermissions).values(rows);
      return { success: true };
    }),

  // ── Owner: toggle a single page permission for a group ───────────────────
  toggleGroupPermission: ownerProcedure
    .input(
      z.object({
        groupId: z.number(),
        pageKey: z.string(),
        canAccess: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const existing = await db
        .select()
        .from(groupPermissions)
        .where(and(eq(groupPermissions.groupId, input.groupId), eq(groupPermissions.pageKey, input.pageKey)));

      if (existing.length > 0) {
        await db
          .update(groupPermissions)
          .set({ canAccess: input.canAccess })
          .where(and(eq(groupPermissions.groupId, input.groupId), eq(groupPermissions.pageKey, input.pageKey)));
      } else {
        await db.insert(groupPermissions).values({
          groupId: input.groupId,
          pageKey: input.pageKey,
          canAccess: input.canAccess,
        });
      }
      return { success: true };
    }),

  // ── Owner: assign a user to a group ──────────────────────────────────────
  assignUserToGroup: ownerProcedure
    .input(z.object({ userId: z.number(), groupId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(users).set({ groupId: input.groupId }).where(eq(users.id, input.userId));
      return { success: true };
    }),

  // ── Owner: remove a user from their group ────────────────────────────────
  removeUserFromGroup: ownerProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(users).set({ groupId: null }).where(eq(users.id, input.userId));
      return { success: true };
    }),
});
