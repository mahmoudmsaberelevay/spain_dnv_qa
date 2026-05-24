import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getLastBackupStatus } from "./weeklyBackupScheduler";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { auditLogs, users } from "../drizzle/schema";
import { desc, gte, lte, eq, and, like } from "drizzle-orm";
import { writeAuditLog, auditCtxFromTrpc } from "./auditLog";

// ── Admin guard ────────────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const adminRouter = router({
  // ── Audit Logs ───────────────────────────────────────────────────────────────
  listAuditLogs: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(200).default(50),
      action: z.string().optional(),
      resource: z.string().optional(),
      userEmail: z.string().optional(),
      dateFrom: z.number().optional(),
      dateTo: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [];
      if (input.action) conditions.push(eq(auditLogs.action, input.action));
      if (input.resource) conditions.push(eq(auditLogs.resource, input.resource));
      if (input.userEmail) conditions.push(like(auditLogs.userEmail, `%${input.userEmail}%`));
      if (input.dateFrom) conditions.push(gte(auditLogs.createdAt, input.dateFrom));
      if (input.dateTo) conditions.push(lte(auditLogs.createdAt, input.dateTo));

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const offset = (input.page - 1) * input.pageSize;

      const [rows, countRows] = await Promise.all([
        dbConn
          .select()
          .from(auditLogs)
          .where(where)
          .orderBy(desc(auditLogs.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        dbConn
          .select({ count: auditLogs.id })
          .from(auditLogs)
          .where(where),
      ]);

      return {
        logs: rows,
        total: countRows.length,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // ── Full Backup ───────────────────────────────────────────────────────────────
  exportFullBackup: adminProcedure
    .mutation(async ({ ctx }) => {
      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Dynamically import all tables from schema
      const schema = await import("../drizzle/schema");

      const backup: Record<string, unknown[]> = {};
      const tableNames = [
        "users", "cases", "documents", "analysisResults",
        "contracts", "invoices", "payments", "commissions",
        "accounts", "categories", "employees", "transactions",
        "clientCases", "clientDocuments",
        "leads", "leadActivities", "leadNotes", "leadTasks", "leadIntegrations",
        "auditLogs",
      ] as const;

      for (const tableName of tableNames) {
        try {
          const tableSchema = (schema as Record<string, unknown>)[tableName];
          if (tableSchema && typeof tableSchema === "object" && "getSQL" in tableSchema) {
            // It's a drizzle table
            const rows = await dbConn.select().from(tableSchema as Parameters<typeof dbConn.select>[0]);
            backup[tableName] = rows;
          }
        } catch {
          backup[tableName] = [];
        }
      }

      await writeAuditLog(auditCtxFromTrpc(ctx), "export", "full_backup", undefined, `Full database backup exported`);

      // Convert to JSON string
      const json = JSON.stringify(backup, null, 2);
      const sizeKb = Math.round(json.length / 1024);

      // Upload to S3
      const { storagePut } = await import("./storage");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const key = `backups/elevay-backup-${timestamp}.json`;
      const { url } = await storagePut(key, Buffer.from(json, "utf-8"), "application/json");

      return {
        url,
        sizeKb,
        timestamp: Date.now(),
        tables: Object.keys(backup).map(t => ({ name: t, rows: (backup[t] as unknown[]).length })),
      };
    }),

  // ── Weekly Backup Status ──────────────────────────────────────────────────────
  getWeeklyBackupStatus: adminProcedure
    .query(() => {
      return getLastBackupStatus();
    }),

  // ── User List (for admin management) ─────────────────────────────────────────
  listUsers: adminProcedure
    .query(async () => {
      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return dbConn.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        lastSignedIn: users.lastSignedIn,
        createdAt: users.createdAt,
      }).from(users).orderBy(desc(users.lastSignedIn));
    }),
});
