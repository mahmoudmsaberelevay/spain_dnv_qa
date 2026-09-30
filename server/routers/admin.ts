import { adminProcedure, router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { auditLogs, modulePermissions, users } from "../../drizzle/schema";
import { and, desc, eq, gte, like, lte } from "drizzle-orm";
import { getDatabaseBackupStatus } from "../scheduledDbBackupService";
import { exportDatabaseBackup } from "../backupHandlers";
import { auditCtxFromTrpc, writeAuditLog } from "../auditLog";
import { TRPCError } from "@trpc/server";

export const adminRouter = router({
  listAuditLogs: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(200).default(50),
      action: z.string().optional(),
      resource: z.string().optional(),
      userEmail: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });

      const conditions = [];
      if (input.action) conditions.push(eq(auditLogs.action, input.action));
      if (input.resource) conditions.push(eq(auditLogs.resource, input.resource));
      if (input.userEmail) conditions.push(like(auditLogs.userEmail, `%${input.userEmail}%`));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const offset = (input.page - 1) * input.pageSize;
      const [logs, matchingLogs] = await Promise.all([
        db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(input.pageSize).offset(offset),
        db.select({ id: auditLogs.id }).from(auditLogs).where(where),
      ]);

      return { logs, total: matchingLogs.length, page: input.page, pageSize: input.pageSize };
    }),

  getWeeklyBackupStatus: adminProcedure.query(async () => getDatabaseBackupStatus()),

  exportFullBackup: adminProcedure.mutation(async ({ ctx }) => {
    const result = await exportDatabaseBackup();
    if (!result.success || !result.fileUrl) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.message });
    }
    await writeAuditLog(auditCtxFromTrpc(ctx), "export", "full_backup", undefined, "Full database backup exported");
    return { url: result.fileUrl, message: result.message };
  }),

  getAllUsers: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    return await db.select().from(users).orderBy(users.name);
  }),

  getUserPermissions: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      return await db
        .select()
        .from(modulePermissions)
        .where(eq(modulePermissions.userId, input.userId));
    }),

  updateUserPermissions: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        permissions: z.array(
          z.object({
            module: z.string(),
            accessLevel: z.enum(["none", "level1", "full"]),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.id !== 120001) {
        throw new Error("Unauthorized");
      }

      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      await db.delete(modulePermissions).where(eq(modulePermissions.userId, input.userId));

      for (const perm of input.permissions) {
        await db.insert(modulePermissions).values({
          userId: input.userId,
          module: perm.module,
          accessLevel: perm.accessLevel,
        });
      }

      return { success: true };
    }),
});
