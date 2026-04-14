/**
 * settlementRouter — After Settlement Payment (Dubai Afterlanding Services)
 *
 * Tracks post-settlement payments in AED.
 * EUR = AED / 4 (fixed formula per business rule).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { settlementPayments } from "../drizzle/schema";
import { eq, desc, like, and, gte, lte, sql } from "drizzle-orm";
import { ENV } from "./_core/env";

const SUPER_ADMIN_EMAILS = [
  "mahmoud.saber@elevay.com",
  "mahmoud.saberelevay@gmail.com",
];
const READONLY_EMAILS = [
  "ziad.elshurafa@elevay.com",
  "walid.mammdouh@gmail.com",
];

function getRole(email?: string | null): "admin" | "readonly" | "limited" | "none" {
  if (!email) return "none";
  const e = email.toLowerCase();
  if (SUPER_ADMIN_EMAILS.some(a => a.toLowerCase() === e)) return "admin";
  if (READONLY_EMAILS.some(a => a.toLowerCase() === e)) return "readonly";
  // Mohamed and others with financial access
  return "limited";
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

export const settlementRouter = router({
  // ── List all settlement payments ─────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      from: z.string().optional(), // ISO date string
      to: z.string().optional(),   // ISO date string
      limit: z.number().default(100),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions: ReturnType<typeof eq>[] = [];
      if (input?.search) {
        conditions.push(like(settlementPayments.clientName, `%${input.search}%`));
      }
      if (input?.from) {
        conditions.push(sql`${settlementPayments.serviceDate} >= ${input.from}`);
      }
      if (input?.to) {
        conditions.push(sql`${settlementPayments.serviceDate} <= ${input.to}`);
      }
      const rows = await db
        .select()
        .from(settlementPayments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(settlementPayments.serviceDate))
        .limit(input?.limit ?? 100)
        .offset(input?.offset ?? 0);

      // Totals
      const [totals] = await db
        .select({
          totalAed: sql<string>`SUM(amountAed)`,
          totalEur: sql<string>`SUM(amountEur)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(settlementPayments)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return {
        rows,
        totalAed: Number(totals?.totalAed ?? 0),
        totalEur: Number(totals?.totalEur ?? 0),
        count: Number(totals?.count ?? 0),
      };
    }),

  // ── Create a single settlement payment ───────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      clientName: z.string().optional(),
      finClientId: z.number().optional(),
      amountAed: z.number().positive(),
      serviceDate: z.string(), // ISO date string YYYY-MM-DD
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = getRole(ctx.user?.email);
      if (role === "none" || role === "readonly") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to add settlement payments" });
      }
      const db = await requireDb();
      const amountEur = Math.round((input.amountAed / 4) * 100) / 100;
      await db.insert(settlementPayments).values({
        clientName: input.clientName ?? null,
        finClientId: input.finClientId ?? null,
        amountAed: String(input.amountAed),
        amountEur: String(amountEur),
        serviceDate: new Date(input.serviceDate),
        notes: input.notes ?? null,
      });
      return { success: true };
    }),

  // ── Update a settlement payment ──────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      clientName: z.string().optional(),
      finClientId: z.number().optional().nullable(),
      amountAed: z.number().positive().optional(),
      serviceDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = getRole(ctx.user?.email);
      if (role === "none" || role === "readonly") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Read-only access" });
      }
      const db = await requireDb();
      const { id, amountAed, ...rest } = input;
      const updates: Record<string, unknown> = { ...rest };
      if (amountAed !== undefined) {
        updates.amountAed = String(amountAed);
        updates.amountEur = String(Math.round((amountAed / 4) * 100) / 100);
      }
      await db.update(settlementPayments).set(updates).where(eq(settlementPayments.id, id));
      return { success: true };
    }),

  // ── Delete a settlement payment ──────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = getRole(ctx.user?.email);
      if (role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required to delete" });
      }
      const db = await requireDb();
      await db.delete(settlementPayments).where(eq(settlementPayments.id, input.id));
      return { success: true };
    }),

  // ── Bulk import (used for Notion seed data) ──────────────────────────────
  bulkImport: protectedProcedure
    .input(z.array(z.object({
      clientName: z.string().optional(),
      finClientId: z.number().optional(),
      amountAed: z.number().positive(),
      serviceDate: z.string(),
      notes: z.string().optional(),
    })))
    .mutation(async ({ ctx, input }) => {
      const role = getRole(ctx.user?.email);
      if (role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required for bulk import" });
      }
      const db = await requireDb();
      const rows = input.map(r => ({
        clientName: r.clientName ?? null,
        finClientId: r.finClientId ?? null,
        amountAed: String(r.amountAed),
        amountEur: String(Math.round((r.amountAed / 4) * 100) / 100),
        serviceDate: new Date(r.serviceDate),
        notes: r.notes ?? null,
      }));
      await db.insert(settlementPayments).values(rows);
      return { success: true, imported: rows.length };
    }),
});
