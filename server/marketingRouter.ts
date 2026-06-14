import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { marketingSummaries } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export const marketingRouter = router({
  // List all summaries for the current user
  listSummaries: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const rows = await db
      .select({
        id: marketingSummaries.id,
        title: marketingSummaries.title,
        country: marketingSummaries.country,
        programType: marketingSummaries.programType,
        programSubtype: marketingSummaries.programSubtype,
        status: marketingSummaries.status,
        updatedAt: marketingSummaries.updatedAt,
        createdAt: marketingSummaries.createdAt,
      })
      .from(marketingSummaries)
      .where(eq(marketingSummaries.userId, ctx.user.id))
      .orderBy(desc(marketingSummaries.updatedAt));
    return rows;
  }),

  // Get a single summary by ID
  getSummary: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db
        .select()
        .from(marketingSummaries)
        .where(and(eq(marketingSummaries.id, input.id), eq(marketingSummaries.userId, ctx.user.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Summary not found" });
      return row;
    }),

  // Create a new summary
  createSummary: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      country: z.string(),
      programType: z.string(),
      programSubtype: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      const defaultDoc = JSON.stringify({
        pages: [
          {
            pageId: `page-${now}`,
            pageNumber: 1,
            template: "cover",
            content: {
              countryName: input.country.toUpperCase(),
              programLabel: input.programType.toUpperCase(),
              programType: input.programSubtype?.toUpperCase() || "RESIDENCY",
              summary: "PROGRAM SUMMARY",
              lastUpdatedText: `last updated in ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}`,
            },
          },
        ],
        colors: {
          primary: "#5BA3B8",
          secondary: "#1A3A5C",
          accent: "#E63946",
          divider: "#CCCCCC",
          background: "#FFFFFF",
          text: "#2C2C2C",
        },
        typography: {
          headingFont: "Montserrat",
          bodyFont: "Open Sans",
        },
      });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [result] = await db.insert(marketingSummaries).values({
        userId: ctx.user.id,
        title: input.title,
        country: input.country,
        programType: input.programType,
        programSubtype: input.programSubtype || null,
        status: "draft",
        documentJson: defaultDoc,
        createdAt: now,
        updatedAt: now,
      });

      return { id: (result as { insertId: number }).insertId };
    }),

  // Save/update a summary's document JSON
  saveSummary: protectedProcedure
    .input(z.object({
      id: z.number(),
      documentJson: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db
        .select({ id: marketingSummaries.id })
        .from(marketingSummaries)
        .where(and(eq(marketingSummaries.id, input.id), eq(marketingSummaries.userId, ctx.user.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Summary not found" });

      await db
        .update(marketingSummaries)
        .set({ documentJson: input.documentJson, updatedAt: Date.now() })
        .where(eq(marketingSummaries.id, input.id));

      return { success: true };
    }),

  // Delete a summary
  deleteSummary: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db
        .delete(marketingSummaries)
        .where(and(eq(marketingSummaries.id, input.id), eq(marketingSummaries.userId, ctx.user.id)));
      return { success: true };
    }),

  // Export summary as PDF (returns a placeholder URL for now)
  exportSummaryPdf: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db
        .select()
        .from(marketingSummaries)
        .where(and(eq(marketingSummaries.id, input.id), eq(marketingSummaries.userId, ctx.user.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Summary not found" });

      // PDF generation will be implemented in a future phase
      // For now return a placeholder that triggers a toast
      return { url: "#", message: "PDF export coming soon" };
    }),
});
