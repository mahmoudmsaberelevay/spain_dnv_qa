import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { marketingSummaries } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

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
        country: input.country,
        programType: input.programType,
        programSubtype: input.programSubtype || "RESIDENCY",
        createdAt: now,
        pages: [
          {
            id: `cover-${now}`,
            template: "cover",
            photoUrl: null,
            content: {
              countryName: input.country.toUpperCase(),
              programLabel: input.programType,
              programSubtype: (input.programSubtype || "RESIDENCY").toUpperCase(),
              summaryLabel: "PROGRAM SUMMARY",
            },
          },
          {
            id: `overview-${now}`,
            template: "overview",
            photoUrl: null,
            content: {
              sectionLabel: "PROGRAMME OVERVIEW",
              heading: `${input.country} ${input.programType}`,
              intro: "",
              infoRows: [],
            },
          },
          {
            id: `eligibility-${now}`,
            template: "eligibility",
            photoUrl: null,
            content: {
              requirements: [],
              idealCandidateHeading: "Ideal Candidate",
              idealCandidateIntro: "",
              idealCandidateBullets: [],
            },
          },
          {
            id: `process-${now}`,
            template: "process",
            photoUrl: null,
            content: {
              stages: [],
              feesHeading: "Programme Fees",
              feeRows: [],
            },
          },
          {
            id: `about-${now}`,
            template: "about",
            photoUrl: null,
            content: {
              heading: `About ${input.country}`,
              paragraphs: [],
              infoRows: [],
              rankingsHeading: "Global Rankings",
              rankings: [],
              membershipsHeading: "International Memberships",
              memberships: [],
            },
          },
        ],
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

  // Upload a photo for a summary page
  uploadPagePhoto: protectedProcedure
    .input(z.object({
      summaryId: z.number(),
      pageId: z.string(),
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db
        .select({ id: marketingSummaries.id })
        .from(marketingSummaries)
        .where(and(eq(marketingSummaries.id, input.summaryId), eq(marketingSummaries.userId, ctx.user.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Summary not found" });

      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop() || "jpg";
      const fileKey = `marketing/summaries/${input.summaryId}/${input.pageId}-${nanoid(8)}.${ext}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      return { url };
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

  // Export summary as PDF — client-side print dialog
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
      return { url: "#", message: "Use the Export PDF button in the editor" };
    }),
});
