/**
 * permissionsRouter — manages user access via 5 top-level modules.
 *
 * MODULE ACCESS LEVELS:
 *   full   → can view + create + edit + delete everything in the module
 *   viewer → can only view (read-only), no create/edit/delete
 *   none   → blocked (PageGuard shows 403)
 *
 * MODULES:
 *   contracting  → Contracts, Receipts, Proforma Invoices, Analytics
 *   clientDocs   → Client Documentation
 *   appAnalysis  → Application Analysis
 *   financial    → All Financial sub-pages
 *   waQc         → WhatsApp Quality Control
 *
 * DEFAULT (new users): contracting=full, clientDocs=full, appAnalysis=none, financial=none, waQc=none
 *
 * PAGE KEY MAPPING (used by PageGuard):
 *   contracting  → contracts, receipts (proforma uses receipts key)
 *   clientDocs   → client_docs
 *   appAnalysis  → analysis_dashboard, cases
 *   financial    → fin_dashboard, fin_accounts, fin_income, fin_expenses,
 *                  fin_transfers, fin_reports, fin_employees, fin_categories,
 *                  fin_commissions, fin_clients, fin_bulk_upload, fin_settlement
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import {
  modulePermissions,
  userPermissions,
  pendingInvites,
  users,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────
export type ModuleName = "contracting" | "clientDocs" | "appAnalysis" | "financial" | "waQc";
export type AccessLevel = "none" | "viewer" | "full";

export const ALL_MODULES: ModuleName[] = ["contracting", "clientDocs", "appAnalysis", "financial", "waQc"];

// Default access for new / existing users
export const DEFAULT_MODULE_ACCESS: Record<ModuleName, AccessLevel> = {
  contracting: "full",
  clientDocs: "full",
  appAnalysis: "none",
  financial: "none",
  waQc: "none",
};

// Maps module → page keys used by PageGuard
export const MODULE_PAGE_KEYS: Record<ModuleName, string[]> = {
  contracting: ["contracts", "receipts"],
  clientDocs: ["client_docs"],
  appAnalysis: ["analysis_dashboard", "cases"],
  financial: [
    "fin_dashboard", "fin_accounts", "fin_income", "fin_expenses",
    "fin_transfers", "fin_reports", "fin_employees", "fin_categories",
    "fin_commissions", "fin_clients", "fin_bulk_upload", "fin_settlement",
    "fin_upcoming",
  ],
  waQc: ["wa_qc"],
};

// All page keys (for backward compat)
export const ALL_PAGE_KEYS = [
  "contracts", "receipts",
  "analysis_dashboard", "cases",
  "client_docs",
  "fin_dashboard", "fin_accounts", "fin_income", "fin_expenses",
  "fin_transfers", "fin_reports", "fin_employees", "fin_categories",
  "fin_commissions", "fin_clients", "fin_bulk_upload", "fin_settlement", "fin_upcoming",
  "wa_qc",
  "settings", "chat", "broadcast",
] as const;
export type PageKey = (typeof ALL_PAGE_KEYS)[number];

// Super-admin emails — full access to everything
const SUPER_ADMIN_EMAILS = [
  "mahmoud.saberelevay@gmail.com",
  "mahmoud.saber@elevay.com",
];

function isOwner(user: { openId: string; email?: string | null }): boolean {
  return user.openId === ENV.ownerOpenId || SUPER_ADMIN_EMAILS.includes((user.email ?? "").toLowerCase());
}

// Helper: resolve page-level booleans from module access level
function moduleToPageFlags(level: AccessLevel): { canAccess: boolean; canEdit: boolean; canCreate: boolean } {
  return {
    canAccess: level !== "none",
    canEdit: level === "full",
    canCreate: level === "full",
  };
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// Fetch module access map for a user (falls back to defaults if no rows)
export async function getUserModuleAccess(userId: number): Promise<Record<ModuleName, AccessLevel>> {
  const db = await requireDb();
  const rows = await db
    .select({ module: modulePermissions.module, accessLevel: modulePermissions.accessLevel })
    .from(modulePermissions)
    .where(eq(modulePermissions.userId, userId));

  const result = { ...DEFAULT_MODULE_ACCESS };
  for (const row of rows) {
    if (ALL_MODULES.includes(row.module as ModuleName)) {
      result[row.module as ModuleName] = row.accessLevel as AccessLevel;
    }
  }
  return result;
}

// Ensure a user has module permission rows (seed defaults if missing)
async function ensureUserModuleDefaults(userId: number) {
  const db = await requireDb();
  for (const mod of ALL_MODULES) {
    const existing = await db
      .select({ id: modulePermissions.id })
      .from(modulePermissions)
      .where(and(eq(modulePermissions.userId, userId), eq(modulePermissions.module, mod)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(modulePermissions).values({
        userId,
        module: mod,
        accessLevel: DEFAULT_MODULE_ACCESS[mod],
      });
    }
  }
}

// ── Router ────────────────────────────────────────────────────────────────────
const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isOwner(ctx.user)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the platform owner can access this." });
  }
  return next({ ctx });
});

export const permissionsRouter = router({

  // ── Any authenticated user: get their own permission map ──────────────────
  getMyPermissions: protectedProcedure.query(async ({ ctx }) => {
    if (isOwner(ctx.user)) {
      const full: Record<string, boolean> = {};
      for (const k of ALL_PAGE_KEYS) { full[k] = true; }
      const moduleAccess: Record<string, AccessLevel> = {};
      for (const m of ALL_MODULES) moduleAccess[m] = "full";
      return {
        permissions: full,
        editPermissions: { ...full },
        createPermissions: { ...full },
        moduleAccess,
        isOwner: true,
      };
    }

    // Ensure defaults exist
    await ensureUserModuleDefaults(ctx.user.id);
    const moduleAccess = await getUserModuleAccess(ctx.user.id);

    // Build page-level flags from module access
    const permissions: Record<string, boolean> = {};
    const editPermissions: Record<string, boolean> = {};
    const createPermissions: Record<string, boolean> = {};

    for (const k of ALL_PAGE_KEYS) {
      permissions[k] = false;
      editPermissions[k] = false;
      createPermissions[k] = false;
    }

    // settings is always accessible to logged-in users
    permissions["settings"] = true;
    permissions["chat"] = true;
    permissions["broadcast"] = true;

    for (const [mod, level] of Object.entries(moduleAccess) as [ModuleName, AccessLevel][]) {
      const flags = moduleToPageFlags(level);
      for (const pageKey of MODULE_PAGE_KEYS[mod]) {
        permissions[pageKey] = flags.canAccess;
        editPermissions[pageKey] = flags.canEdit;
        createPermissions[pageKey] = flags.canCreate;
      }
    }

    return {
      permissions,
      editPermissions,
      createPermissions,
      moduleAccess,
      isOwner: false,
    };
  }),

  // ── Owner: list all users ─────────────────────────────────────────────────
  listUsers: ownerProcedure.query(async () => {
    const db = await requireDb();
    return db.select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    }).from(users).orderBy(users.createdAt);
  }),

  // ── Owner: get module access for a specific user ──────────────────────────
  getUserModuleAccess: ownerProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      await ensureUserModuleDefaults(input.userId);
      return getUserModuleAccess(input.userId);
    }),

  // ── Owner: set module access level for a user ─────────────────────────────
  setModuleAccess: ownerProcedure
    .input(z.object({
      userId: z.number(),
      module: z.enum(["contracting", "clientDocs", "appAnalysis", "financial", "waQc"]),
      accessLevel: z.enum(["none", "viewer", "full"]),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const existing = await db
        .select({ id: modulePermissions.id })
        .from(modulePermissions)
        .where(and(eq(modulePermissions.userId, input.userId), eq(modulePermissions.module, input.module)))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(modulePermissions)
          .set({ accessLevel: input.accessLevel })
          .where(and(eq(modulePermissions.userId, input.userId), eq(modulePermissions.module, input.module)));
      } else {
        await db.insert(modulePermissions).values({
          userId: input.userId,
          module: input.module,
          accessLevel: input.accessLevel,
        });
      }

      // Also sync legacy userPermissions rows for backward compat
      const pageKeys = MODULE_PAGE_KEYS[input.module];
      const flags = moduleToPageFlags(input.accessLevel);
      for (const pageKey of pageKeys) {
        const legacyExisting = await db
          .select({ id: userPermissions.id })
          .from(userPermissions)
          .where(and(eq(userPermissions.userId, input.userId), eq(userPermissions.pageKey, pageKey)))
          .limit(1);
        if (legacyExisting.length > 0) {
          await db.update(userPermissions)
            .set({ canAccess: flags.canAccess, canEdit: flags.canEdit, canCreate: flags.canCreate })
            .where(and(eq(userPermissions.userId, input.userId), eq(userPermissions.pageKey, pageKey)));
        } else {
          await db.insert(userPermissions).values({
            userId: input.userId,
            pageKey,
            canAccess: flags.canAccess,
            canEdit: flags.canEdit,
            canCreate: flags.canCreate,
          });
        }
      }

      return { success: true };
    }),

  // ── Owner: set ALL module access levels for a user at once ───────────────
  setAllModuleAccess: ownerProcedure
    .input(z.object({
      userId: z.number(),
      access: z.object({
        contracting: z.enum(["none", "viewer", "full"]),
        clientDocs: z.enum(["none", "viewer", "full"]),
        appAnalysis: z.enum(["none", "viewer", "full"]),
        financial: z.enum(["none", "viewer", "full"]),
        waQc: z.enum(["none", "viewer", "full"]).optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      for (const [mod, level] of Object.entries(input.access) as [ModuleName, AccessLevel][]) {
        const existing = await db
          .select({ id: modulePermissions.id })
          .from(modulePermissions)
          .where(and(eq(modulePermissions.userId, input.userId), eq(modulePermissions.module, mod)))
          .limit(1);

        if (existing.length > 0) {
          await db.update(modulePermissions)
            .set({ accessLevel: level })
            .where(and(eq(modulePermissions.userId, input.userId), eq(modulePermissions.module, mod)));
        } else {
          await db.insert(modulePermissions).values({ userId: input.userId, module: mod, accessLevel: level });
        }

        // Sync legacy
        const flags = moduleToPageFlags(level);
        for (const pageKey of MODULE_PAGE_KEYS[mod]) {
          const legacyExisting = await db
            .select({ id: userPermissions.id })
            .from(userPermissions)
            .where(and(eq(userPermissions.userId, input.userId), eq(userPermissions.pageKey, pageKey)))
            .limit(1);
          if (legacyExisting.length > 0) {
            await db.update(userPermissions)
              .set({ canAccess: flags.canAccess, canEdit: flags.canEdit, canCreate: flags.canCreate })
              .where(and(eq(userPermissions.userId, input.userId), eq(userPermissions.pageKey, pageKey)));
          } else {
            await db.insert(userPermissions).values({
              userId: input.userId, pageKey,
              canAccess: flags.canAccess, canEdit: flags.canEdit, canCreate: flags.canCreate,
            });
          }
        }
      }
      return { success: true };
    }),

  // ── Owner: add a user manually ────────────────────────────────────────────
  addUserManually: ownerProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      access: z.object({
        contracting: z.enum(["none", "viewer", "full"]).default("full"),
        clientDocs: z.enum(["none", "viewer", "full"]).default("full"),
        appAnalysis: z.enum(["none", "viewer", "full"]).default("none"),
        financial: z.enum(["none", "viewer", "full"]).default("none"),
      }).optional(),
    }))
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
          openId, name: input.name, email: input.email,
          loginMethod: "manual", lastSignedIn: new Date(),
        });
        const created = await db.select().from(users).where(eq(users.openId, openId));
        userId = created[0].id;
      }

      const access = input.access ?? DEFAULT_MODULE_ACCESS;
      for (const [mod, level] of Object.entries(access) as [ModuleName, AccessLevel][]) {
        const ex = await db.select({ id: modulePermissions.id }).from(modulePermissions)
          .where(and(eq(modulePermissions.userId, userId), eq(modulePermissions.module, mod))).limit(1);
        if (ex.length > 0) {
          await db.update(modulePermissions).set({ accessLevel: level })
            .where(and(eq(modulePermissions.userId, userId), eq(modulePermissions.module, mod)));
        } else {
          await db.insert(modulePermissions).values({ userId, module: mod, accessLevel: level });
        }
      }

      return { success: true, userId };
    }),

  // ── Owner: generate an invite link ───────────────────────────────────────
  createInvite: ownerProcedure
    .input(z.object({
      email: z.string().email(),
      access: z.object({
        contracting: z.enum(["none", "viewer", "full"]).default("full"),
        clientDocs: z.enum(["none", "viewer", "full"]).default("full"),
        appAnalysis: z.enum(["none", "viewer", "full"]).default("none"),
        financial: z.enum(["none", "viewer", "full"]).default("none"),
      }).optional(),
      origin: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const token = crypto.randomBytes(32).toString("hex");
      // Store access as permissions map for backward compat
      const access = input.access ?? DEFAULT_MODULE_ACCESS;
      const permissions: Record<string, boolean> = {};
      for (const [mod, level] of Object.entries(access) as [ModuleName, AccessLevel][]) {
        for (const pageKey of MODULE_PAGE_KEYS[mod]) {
          permissions[pageKey] = level !== "none";
        }
      }
      await db.insert(pendingInvites).values({ email: input.email, token, invitePermissions: permissions });
      return { inviteUrl: `${input.origin}/join?token=${token}`, token };
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
      await db.delete(modulePermissions).where(eq(modulePermissions.userId, input.userId));
      await db.delete(userPermissions).where(eq(userPermissions.userId, input.userId));
      await db.delete(users).where(eq(users.id, input.userId));
      return { success: true };
    }),

  // ── Backward compat: getUserPermissions (still used by old code) ──────────
  getUserPermissions: ownerProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      await ensureUserModuleDefaults(input.userId);
      const moduleAccess = await getUserModuleAccess(input.userId);
      const permissions: Record<string, { canAccess: boolean; canEdit: boolean }> = {};
      for (const k of ALL_PAGE_KEYS) permissions[k] = { canAccess: false, canEdit: false };
      for (const [mod, level] of Object.entries(moduleAccess) as [ModuleName, AccessLevel][]) {
        const flags = moduleToPageFlags(level);
        for (const pageKey of MODULE_PAGE_KEYS[mod]) {
          permissions[pageKey] = { canAccess: flags.canAccess, canEdit: flags.canEdit };
        }
      }
      permissions["settings"] = { canAccess: true, canEdit: false };
      return permissions;
    }),

  // ── Backward compat stubs (kept so old Settings UI doesn't crash) ─────────
  setPagePermission: ownerProcedure
    .input(z.object({ userId: z.number(), pageKey: z.string(), canAccess: z.boolean(), canEdit: z.boolean() }))
    .mutation(async ({ input }) => {
      // Find which module this page key belongs to and update the whole module
      const db = await requireDb();
      for (const [mod, keys] of Object.entries(MODULE_PAGE_KEYS) as [ModuleName, string[]][]) {
        if (keys.includes(input.pageKey)) {
          const level: AccessLevel = input.canEdit ? "full" : input.canAccess ? "viewer" : "none";
          const ex = await db.select({ id: modulePermissions.id }).from(modulePermissions)
            .where(and(eq(modulePermissions.userId, input.userId), eq(modulePermissions.module, mod))).limit(1);
          if (ex.length > 0) {
            await db.update(modulePermissions).set({ accessLevel: level })
              .where(and(eq(modulePermissions.userId, input.userId), eq(modulePermissions.module, mod)));
          } else {
            await db.insert(modulePermissions).values({ userId: input.userId, module: mod, accessLevel: level });
          }
          break;
        }
      }
      return { success: true };
    }),

  togglePermission: ownerProcedure
    .input(z.object({ userId: z.number(), pageKey: z.string(), canAccess: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      for (const [mod, keys] of Object.entries(MODULE_PAGE_KEYS) as [ModuleName, string[]][]) {
        if (keys.includes(input.pageKey)) {
          const level: AccessLevel = input.canAccess ? "full" : "none";
          const ex = await db.select({ id: modulePermissions.id }).from(modulePermissions)
            .where(and(eq(modulePermissions.userId, input.userId), eq(modulePermissions.module, mod))).limit(1);
          if (ex.length > 0) {
            await db.update(modulePermissions).set({ accessLevel: level })
              .where(and(eq(modulePermissions.userId, input.userId), eq(modulePermissions.module, mod)));
          } else {
            await db.insert(modulePermissions).values({ userId: input.userId, module: mod, accessLevel: level });
          }
          break;
        }
      }
      return { success: true };
    }),

  setUserPermissions: ownerProcedure
    .input(z.object({ userId: z.number(), permissions: z.record(z.string(), z.boolean()) }))
    .mutation(() => ({ success: true })), // no-op, use setModuleAccess instead

  // Stub group procedures (kept for backward compat)
  listGroups: ownerProcedure.query(async () => []),
  createGroup: ownerProcedure.input(z.object({ name: z.string(), description: z.string().optional(), color: z.string().optional(), permissions: z.record(z.string(), z.boolean()).optional() })).mutation(async () => ({ success: true, groupId: 0 })),
  updateGroup: ownerProcedure.input(z.object({ groupId: z.number(), name: z.string().optional(), description: z.string().optional(), color: z.string().optional() })).mutation(async () => ({ success: true })),
  deleteGroup: ownerProcedure.input(z.object({ groupId: z.number() })).mutation(async () => ({ success: true })),
  getGroupPermissions: ownerProcedure.input(z.object({ groupId: z.number() })).query(async () => ({})),
  setGroupPermissions: ownerProcedure.input(z.object({ groupId: z.number(), permissions: z.record(z.string(), z.boolean()) })).mutation(async () => ({ success: true })),
  toggleGroupPermission: ownerProcedure.input(z.object({ groupId: z.number(), pageKey: z.string(), canAccess: z.boolean() })).mutation(async () => ({ success: true })),
  assignUserToGroup: ownerProcedure.input(z.object({ userId: z.number(), groupId: z.number() })).mutation(async () => ({ success: true })),
  removeUserFromGroup: ownerProcedure.input(z.object({ userId: z.number() })).mutation(async () => ({ success: true })),
});
