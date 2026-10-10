import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { marketingSummaries, marketingPlans, marketingWeekMedia, marketingReadySummaries } from "../drizzle/schema";
import { eq, and, desc, asc, isNull } from "drizzle-orm";
import { storageGet, storagePut } from "./storage";
import { nanoid } from "nanoid";
import { invokeLLM } from "./_core/llm";
import { generatePlanRuleBased, generateWeekMediaPrompts } from "./marketingTemplates";
import {
  ELEVAY_ARABIC_VOICE_DEFAULTS,
  ElevenLabsVoiceUnavailableError,
  generateElevayVideoVoiceOver,
} from "./elevenLabsTts";
import { generateProgramProposal } from "./marketingProposalService";
import { proposalInputSchema } from "./marketingProposalCalculator";
import { comparePrograms as generateProgramComparison } from "./programComparisonService";
import {
  decodeReadySummaryPdf,
  READY_SUMMARY_CATEGORIES,
  READY_SUMMARY_MAX_BASE64_LENGTH,
  READY_SUMMARY_MAX_BYTES,
  readySummaryStorageKey,
} from "./marketingReadySummaryFiles";
import { auditCtxFromTrpc, writeAuditLog } from "./auditLog";
import { buildReadySummaryWhatsappUrl } from "../shared/readySummaryWhatsappShare";

function requireReadySummaryManager(user: { role?: string | null }) {
  if (user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can add or delete ready summaries" });
  }
}

export const marketingRouter = router({
  listReadySummaries: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    return db
      .select({
        id: marketingReadySummaries.id,
        title: marketingReadySummaries.title,
        category: marketingReadySummaries.category,
        originalFileName: marketingReadySummaries.originalFileName,
        fileSizeBytes: marketingReadySummaries.fileSizeBytes,
        pageCount: marketingReadySummaries.pageCount,
        uploadedByEmail: marketingReadySummaries.uploadedByEmail,
        createdAt: marketingReadySummaries.createdAt,
      })
      .from(marketingReadySummaries)
      .where(isNull(marketingReadySummaries.deletedAt))
      .orderBy(asc(marketingReadySummaries.category), asc(marketingReadySummaries.title));
  }),

  getReadySummaryDownload: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [summary] = await db
        .select({
          id: marketingReadySummaries.id,
          title: marketingReadySummaries.title,
          originalFileName: marketingReadySummaries.originalFileName,
          storageKey: marketingReadySummaries.storageKey,
        })
        .from(marketingReadySummaries)
        .where(and(eq(marketingReadySummaries.id, input.id), isNull(marketingReadySummaries.deletedAt)))
        .limit(1);
      if (!summary) throw new TRPCError({ code: "NOT_FOUND", message: "Ready summary not found" });
      const stored = await storageGet(summary.storageKey);
      await writeAuditLog(auditCtxFromTrpc(ctx), "download", "marketing_ready_summary", summary.id, summary.title);
      return { url: stored.url, fileName: summary.originalFileName, title: summary.title };
    }),

  prepareReadySummaryWhatsappShare: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [summary] = await db
        .select({
          id: marketingReadySummaries.id,
          title: marketingReadySummaries.title,
          originalFileName: marketingReadySummaries.originalFileName,
          storageKey: marketingReadySummaries.storageKey,
        })
        .from(marketingReadySummaries)
        .where(and(eq(marketingReadySummaries.id, input.id), isNull(marketingReadySummaries.deletedAt)))
        .limit(1);
      if (!summary) throw new TRPCError({ code: "NOT_FOUND", message: "Ready summary not found" });

      const stored = await storageGet(summary.storageKey);
      const whatsappUrl = buildReadySummaryWhatsappUrl(summary.title, stored.url);
      await writeAuditLog(auditCtxFromTrpc(ctx), "share_prepare", "marketing_ready_summary", summary.id, summary.title);
      return {
        whatsappUrl,
        title: summary.title,
        fileName: summary.originalFileName,
        sentAutomatically: false as const,
      };
    }),

  uploadReadySummary: protectedProcedure
    .input(z.object({
      title: z.string().trim().min(2).max(255),
      category: z.enum(READY_SUMMARY_CATEGORIES),
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.literal("application/pdf"),
      fileSize: z.number().int().positive().max(READY_SUMMARY_MAX_BYTES),
      fileBase64: z.string().min(1).max(READY_SUMMARY_MAX_BASE64_LENGTH),
    }))
    .mutation(async ({ ctx, input }) => {
      requireReadySummaryManager(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      let decoded: ReturnType<typeof decodeReadySummaryPdf>;
      try {
        decoded = decodeReadySummaryPdf(input);
      } catch (error) {
        const message = error instanceof Error ? error.message : "ready_summary_upload_invalid";
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }

      const [existing] = await db
        .select({ id: marketingReadySummaries.id, deletedAt: marketingReadySummaries.deletedAt })
        .from(marketingReadySummaries)
        .where(eq(marketingReadySummaries.sha256Digest, decoded.sha256Digest))
        .limit(1);
      if (existing && existing.deletedAt == null) {
        throw new TRPCError({ code: "CONFLICT", message: "This PDF already exists in Ready Summaries" });
      }

      const now = Date.now();
      if (existing) {
        await db.update(marketingReadySummaries).set({
          title: input.title,
          category: input.category,
          originalFileName: decoded.fileName,
          fileSizeBytes: decoded.buffer.byteLength,
          uploadedByUserId: ctx.user.id,
          uploadedByEmail: ctx.user.email ?? null,
          createdAt: now,
          deletedAt: null,
          deletedByUserId: null,
        }).where(eq(marketingReadySummaries.id, existing.id));
        await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_ready_summary", existing.id, `Restored ${input.title}`);
        return { id: existing.id, restored: true };
      }

      const stored = await storagePut(readySummaryStorageKey(), decoded.buffer, "application/pdf");
      const [result] = await db.insert(marketingReadySummaries).values({
        title: input.title,
        category: input.category,
        originalFileName: decoded.fileName,
        storageKey: stored.key,
        fileSizeBytes: decoded.buffer.byteLength,
        pageCount: null,
        sha256Digest: decoded.sha256Digest,
        uploadedByUserId: ctx.user.id,
        uploadedByEmail: ctx.user.email ?? null,
        createdAt: now,
      });
      const id = (result as { insertId: number }).insertId;
      await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_ready_summary", id, input.title);
      return { id, restored: false };
    }),

  deleteReadySummary: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireReadySummaryManager(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [summary] = await db
        .select({ id: marketingReadySummaries.id, title: marketingReadySummaries.title })
        .from(marketingReadySummaries)
        .where(and(eq(marketingReadySummaries.id, input.id), isNull(marketingReadySummaries.deletedAt)))
        .limit(1);
      if (!summary) throw new TRPCError({ code: "NOT_FOUND", message: "Ready summary not found" });
      await db.update(marketingReadySummaries).set({
        deletedAt: Date.now(),
        deletedByUserId: ctx.user.id,
      }).where(eq(marketingReadySummaries.id, summary.id));
      await writeAuditLog(auditCtxFromTrpc(ctx), "delete", "marketing_ready_summary", summary.id, summary.title);
      return { success: true };
    }),

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
            id: "cover-" + now,
            template: "cover",
            photoUrl: null,
            content: {
              countryName: input.country.toUpperCase(),
              programLabel: input.programType,
              programSubtype: (input.programSubtype || "RESIDENCY").toUpperCase(),
              summaryLabel: "PROGRAM SUMMARY",
            },
            style: {},
          },
          {
            id: "about-" + now,
            template: "about",
            photoUrl: null,
            content: {
              heading: "About " + input.country,
              paragraphs: [],
              infoRows: [],
              rankingsHeading: "Global Rankings",
              rankings: [],
              membershipsHeading: "International Memberships",
              memberships: [],
              headlines: [],
            },
            style: {},
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
      const fileKey = "marketing/summaries/" + input.summaryId + "/" + input.pageId + "-" + nanoid(8) + "." + ext;
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

  // Export summary as PDF
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

  // Arabic voice-over generation using the shared ELEVAY ElevenLabs configuration
  generateArabicVoiceOver: protectedProcedure
    .input(z.object({
      text: z.string().trim().min(1, "Enter an Arabic script before generating audio.").max(ELEVAY_ARABIC_VOICE_DEFAULTS.maxScriptCharacters, "Split long narration into takes of at most 1,900 characters."),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await generateElevayVideoVoiceOver(input.text);
        return {
          ...result,
          settings: {
            model: "Eleven v4",
            language: "Arabic — Egyptian",
            voiceId: ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId,
            stability: ELEVAY_ARABIC_VOICE_DEFAULTS.stability,
            output: "MP3 44.1 kHz / 128 kbps",
          },
        };
      } catch (error) {
        if (error instanceof Error && error.message === "ELEVENLABS_NOT_CONFIGURED") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "The ElevenLabs credential has not been configured for this application. Please contact an administrator.",
          });
        }
        if (error instanceof ElevenLabsVoiceUnavailableError || (error instanceof Error && error.name === "ElevenLabsVoiceConfigurationError")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        if (error instanceof Error && error.name === "ElevenLabsError") {
          throw new TRPCError({ code: "BAD_GATEWAY", message: error.message });
        }
        if (error instanceof Error && error.name === "ElevenLabsLanguagePolicyError") {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        console.error("[Marketing] Arabic voice-over generation failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The voice-over could not be generated. Please try again.",
        });
      }
    }),

  // AI-powered program comparison
  comparePrograms: protectedProcedure
    .input(z.object({
      programKeys: z.array(z.string()).min(2).max(6),
    }))
    .mutation(async ({ input }) => {
      try {
        return await generateProgramComparison({ programKeys: input.programKeys, locale: "en" });
      } catch (caught) {
        if (caught instanceof z.ZodError || (caught instanceof Error && caught.message === "duplicate_programs")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Select 2 to 6 unique supported programs" });
        }
        console.error("[Marketing] Program comparison failed", caught);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The comparison could not be generated. Please try again." });
      }
    }),

  // AI-powered program proposal with cost calculation
  generateProposal: protectedProcedure
    .input(proposalInputSchema)
    .mutation(({ input }) => generateProgramProposal(input)),

  generateMarketingPlan: protectedProcedure
    .input(z.object({
      contentRatio: z.string().optional(),
      pillarFocus: z.string().optional(),
      featuredPrograms: z.array(z.string()).optional(),
      startDate: z.union([z.string(), z.date()]).optional(),
    }))
    .mutation(async ({ input }) => {
      // Robustly parse startDate regardless of format (string, Date object, or undefined)
      let start: Date;
      if (!input.startDate) {
        start = new Date();
      } else if (input.startDate instanceof Date) {
        start = input.startDate;
      } else {
        // Try YYYY-MM-DD first, then fallback to direct parse, then today
        const s = String(input.startDate);
        const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
          start = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
        } else {
          const parsed = new Date(s);
          start = isNaN(parsed.getTime()) ? new Date() : parsed;
        }
      }
      const programs = input.featuredPrograms || ["Spain DNV", "Dominica", "Grenada", "Saint Kitts & Nevis", "Greece Golden Visa"];
      const contentRatio = input.contentRatio || "40% EU Residency, 40% Caribbean, 20% Brand";
      const pillarFocus = input.pillarFocus || "ROI, Lifestyle, Family, Mobility";
      // Rule-based plan generation — zero LLM calls, no quota usage
      const plan = generatePlanRuleBased({ startDate: start, programs, contentRatio, pillarFocus });
      return plan;
    }),

  generateWeekMedia: protectedProcedure
    .input(z.object({
      weekLabel: z.string(),
      weekFocus: z.string(),
      planId: z.number().optional(),
      posts: z.array(z.object({
        day: z.string(),
        type: z.string(),
        topic: z.string(),
        caption: z.string(),
        // Accept both array and string (AI sometimes returns comma-separated string)
        hashtags: z.union([z.array(z.string()), z.string()]).transform(v =>
          Array.isArray(v) ? v : v.split(/[,\s]+/).map(h => h.replace(/^#/, "").trim()).filter(Boolean)
        ),
      })),
    }))
    .mutation(async ({ input }) => {
      const { generateImage } = await import("./_core/imageGeneration");
      const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } = await import("docx");
      const { storagePut: s3put } = await import("./storage");

      // Get only the unique days and their topics for prompts (keep it small)
      const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
      // Rule-based media prompts — zero LLM calls, no quota usage
      const { staticPrompts: staticPromptsArr, reelKeyframes: reelKeyframesArr } = generateWeekMediaPrompts(
        input.posts.map(p => ({ day: p.day, type: p.type, topic: p.topic }))
      );
      const staticPromptsData = { staticPrompts: staticPromptsArr };
      const reelPromptsData = { reelKeyframes: reelKeyframesArr.map(r => ({ ...r, mergeInstructions: `Merge all 5 keyframes sequentially. Each scene: ${r.scenes[0]?.duration || "3s"}. Add smooth transitions. 9:16 vertical format. Background music: ${r.backgroundMusicSuggestion}` })) };
      // Generate static images sequentially (one per day) to avoid timeout
      const staticImageUrls: Array<{ day: string; topic: string; url: string }> = [];
      for (const sp of (staticPromptsData.staticPrompts || [])) {
        try {
          const rawProgramKey = sp.topic.split(":")[0].trim();
          // Map short keys to full correct spelling
          const PROGRAM_NAME_MAP: Record<string, string> = {
            "Spain DNV": "Spain Digital Nomad Visa",
            "Greece Golden Visa": "Greece Golden Visa",
            "Malta PR": "Malta Permanent Residency",
            "Portugal D7": "Portugal D7 Residency",
            "Portugal D8": "Portugal Digital Nomad Visa",
            "Portugal D2": "Portugal D2 Entrepreneur Visa",
            "Dominica": "Dominica Citizenship",
            "Grenada": "Grenada Citizenship",
            "Saint Kitts & Nevis": "Saint Kitts & Nevis Citizenship",
            "Saint Lucia": "Saint Lucia Citizenship",
            "Antigua & Barbuda": "Antigua & Barbuda Citizenship",
            "Vanuatu": "Vanuatu Citizenship",
            "Nauru": "Nauru Residency",
            "Sao Tome": "Sao Tome Residency",
            "Turkey": "Turkey Citizenship",
            "Egypt": "Egypt Golden Visa",
            "Canada Skilled Migration": "Canada Skilled Migration",
            "UK Expansion Worker": "UK Expansion Worker Visa",
            "ELEVAY": "Since 1998",
          };
          const programName = PROGRAM_NAME_MAP[rawProgramKey] || rawProgramKey;
          // v2 Editorial Luxury: Use the full detailed prompt from templates directly
          // The imagePrompt already contains the complete 400+ word editorial luxury prompt
          const staticPrompt = sp.imagePrompt;
          const result = await generateImage({
            prompt: staticPrompt,
          });
          if (result.url) staticImageUrls.push({ day: sp.day, topic: sp.topic, url: result.url });
        } catch (e) { console.error("Static image failed for " + sp.day, e); }
      }

      // Generate reel keyframes sequentially (one reel at a time, scenes in parallel)
      const reelData: Array<{ day: string; topic: string; mergeInstructions: string; voiceOverScript: string; backgroundMusicSuggestion: string; scenes: Array<{ sceneNumber: number; duration: string; videoPrompt: string; keyframeUrl: string }> }> = [];
      for (const reel of (reelPromptsData.reelKeyframes || [])) {
        const sceneResults: Array<{ sceneNumber: number; duration: string; videoPrompt: string; keyframeUrl: string }> = [];
        // Generate all 5 scenes for this reel in parallel (only 5 at a time)
        await Promise.all((reel.scenes || []).map(async (scene) => {
          try {
            // v2 Editorial Luxury: Use the full detailed keyframe prompt from templates directly
            const reelPrompt = scene.keyframePrompt;
            const result = await generateImage({ prompt: reelPrompt });
            sceneResults.push({ sceneNumber: scene.sceneNumber, duration: scene.duration, videoPrompt: scene.videoPrompt, keyframeUrl: result.url || "" });
          } catch (e) {
            sceneResults.push({ sceneNumber: scene.sceneNumber, duration: scene.duration, videoPrompt: scene.videoPrompt, keyframeUrl: "" });
          }
        }));
        sceneResults.sort((a, b) => a.sceneNumber - b.sceneNumber);
        reelData.push({ day: reel.day, topic: reel.topic, mergeInstructions: reel.mergeInstructions, voiceOverScript: reel.voiceOverScript, backgroundMusicSuggestion: reel.backgroundMusicSuggestion, scenes: sceneResults });
      }
      const docChildren: InstanceType<typeof Paragraph>[] = [];
      docChildren.push(new Paragraph({ text: "ELEVAY Weekly Content Package", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
      docChildren.push(new Paragraph({ text: input.weekLabel + " — " + input.weekFocus, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }));
      docChildren.push(new Paragraph({ text: "" }));
      docChildren.push(new Paragraph({ text: "SECTION 1: POST CAPTIONS", heading: HeadingLevel.HEADING_1 }));
      input.posts.forEach((post, idx) => {
        docChildren.push(new Paragraph({ text: "Post " + (idx + 1) + ": " + post.day + " — " + post.type, heading: HeadingLevel.HEADING_2 }));
        docChildren.push(new Paragraph({ children: [new TextRun({ text: "Topic: ", bold: true }), new TextRun(post.topic)] }));
        docChildren.push(new Paragraph({ children: [new TextRun({ text: "Caption (Arabic):", bold: true })] }));
        docChildren.push(new Paragraph({ text: post.caption, alignment: AlignmentType.RIGHT }));
        if (post.hashtags.length > 0) docChildren.push(new Paragraph({ children: [new TextRun({ text: "Hashtags: ", bold: true }), new TextRun(post.hashtags.join(" "))] }));
        docChildren.push(new Paragraph({ text: "" }));
      });
      docChildren.push(new Paragraph({ text: "SECTION 2: REEL PRODUCTION PACKAGES", heading: HeadingLevel.HEADING_1 }));
      reelData.forEach((reel, reelIdx) => {
        docChildren.push(new Paragraph({ text: "Reel " + (reelIdx + 1) + ": " + reel.day + " — " + reel.topic, heading: HeadingLevel.HEADING_2 }));
        docChildren.push(new Paragraph({ children: [new TextRun({ text: "VIDEO PROMPTS:", bold: true, underline: {} })] }));
        reel.scenes.forEach((scene) => {
          docChildren.push(new Paragraph({ children: [new TextRun({ text: "Scene " + scene.sceneNumber + " (" + scene.duration + "): ", bold: true }), new TextRun(scene.videoPrompt)] }));
        });
        docChildren.push(new Paragraph({ text: "" }));
        docChildren.push(new Paragraph({ children: [new TextRun({ text: "MERGE & MUSIC INSTRUCTIONS:", bold: true, underline: {} })] }));
        docChildren.push(new Paragraph({ text: reel.mergeInstructions }));
        docChildren.push(new Paragraph({ children: [new TextRun({ text: "Background Music: ", bold: true }), new TextRun(reel.backgroundMusicSuggestion)] }));
        docChildren.push(new Paragraph({ text: "" }));
        docChildren.push(new Paragraph({ children: [new TextRun({ text: "ARABIC VOICE-OVER SCRIPT:", bold: true, underline: {} })] }));
        docChildren.push(new Paragraph({ text: reel.voiceOverScript, alignment: AlignmentType.RIGHT }));
        docChildren.push(new Paragraph({ text: "" }));
      });
      const doc = new Document({ sections: [{ children: docChildren }] });
      const docBuffer = await Packer.toBuffer(doc);
      const docKey = "marketing/week-packages/" + nanoid() + "-content-package.docx";
      const { url: docUrl } = await s3put(docKey, docBuffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      const result = {
        weekLabel: input.weekLabel,
        weekFocus: input.weekFocus,
        generatedAt: new Date().toISOString(),
        staticImages: staticImageUrls,
        reels: reelData,
        wordDocUrl: docUrl,
      };
      // Save to DB so it persists
      if (input.planId) {
        const db = await getDb();
        if (db) {
          await db.insert(marketingWeekMedia).values({
            planId: input.planId,
            weekLabel: input.weekLabel.slice(0, 100),
            weekFocus: (input.weekFocus || "").slice(0, 255),
            resultJson: JSON.stringify(result),
            createdAt: Date.now(),
          });
        }
      }
      return result;
    }),

  // ── Plan persistence ──────────────────────────────────────────────────────
  savePlan: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      title: z.string(),
      startDate: z.union([z.string(), z.date()]).transform(v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 20)),
      contentRatio: z.string().optional(),
      pillarFocus: z.string().optional(),
      featuredPrograms: z.string().optional(),
      planJson: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const now = Date.now();
      const uid = Number(ctx.user.id);
      if (input.id) {
        await db.update(marketingPlans)
          .set({
            title: input.title,
            startDate: input.startDate,
            contentRatio: input.contentRatio,
            pillarFocus: input.pillarFocus,
            featuredPrograms: input.featuredPrograms,
            planJson: input.planJson,
            updatedAt: now,
          })
          .where(and(eq(marketingPlans.id, input.id), eq(marketingPlans.userId, uid)));
        return { id: input.id };
      } else {
        const [result] = await db.insert(marketingPlans).values({
          userId: uid,
          title: input.title,
          startDate: input.startDate,
          contentRatio: input.contentRatio,
          pillarFocus: input.pillarFocus,
          featuredPrograms: input.featuredPrograms,
          planJson: input.planJson,
          createdAt: now,
          updatedAt: now,
        });
        return { id: (result as any).insertId as number };
      }
    }),

  listPlans: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const uid = Number(ctx.user.id);
    const rows = await db
      .select({ id: marketingPlans.id, title: marketingPlans.title, startDate: marketingPlans.startDate, createdAt: marketingPlans.createdAt, planJson: marketingPlans.planJson })
      .from(marketingPlans)
      .where(eq(marketingPlans.userId, uid))
      .orderBy(desc(marketingPlans.createdAt));
    return rows;
  }),

  getPlan: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const uid = Number(ctx.user.id);
      const [row] = await db
        .select()
        .from(marketingPlans)
        .where(and(eq(marketingPlans.id, input.id), eq(marketingPlans.userId, uid)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  deletePlan: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const uid = Number(ctx.user.id);
      await db.delete(marketingPlans)
        .where(and(eq(marketingPlans.id, input.id), eq(marketingPlans.userId, uid)));
      return { success: true };
    }),

  // Fetch all week media packages for a given plan
  getWeekMedia: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const uid = Number(ctx.user.id);
      // Verify the plan belongs to this user
      const [plan] = await db
        .select({ id: marketingPlans.id })
        .from(marketingPlans)
        .where(and(eq(marketingPlans.id, input.planId), eq(marketingPlans.userId, uid)));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      const rows = await db
        .select()
        .from(marketingWeekMedia)
        .where(eq(marketingWeekMedia.planId, input.planId))
        .orderBy(marketingWeekMedia.createdAt);
      return rows.map(r => ({
        id: r.id,
        weekLabel: r.weekLabel,
        weekFocus: r.weekFocus,
        createdAt: r.createdAt,
        result: r.resultJson ? JSON.parse(r.resultJson) : null,
      }));
    }),

  // ── Strategy Plan Generator ────────────────────────────────────────────────
  generateStrategyPlan: protectedProcedure
    .input(z.object({ startDate: z.string() }))
    .output(z.object({ planJson: z.string() }))
    .mutation(async ({ input }) => {
      // Normalize date: handle YYYY-MM-DD, DD/MM/YYYY, and other formats
      function normalizeInputDate(val: string): string {
        if (!val) return new Date().toISOString().slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
        const dm = val.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (dm) return `${dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`;
        try { const d = new Date(val); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); } catch {}
        return new Date().toISOString().slice(0, 10);
      }
      const normalizedDate = normalizeInputDate(input.startDate);
      const start = new Date(normalizedDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 83);

      const WEEK_PROGRAMS: Record<number, string> = {
        1: "Spain Digital Nomad Visa", 2: "Malta Permanent Residency", 3: "Greece Golden Visa",
        4: "Spain Digital Nomad Visa & Sao Tome Citizenship", 5: "Portugal D7/D8/Golden Visa",
        6: "Malta Permanent Residency", 7: "Spain Digital Nomad Visa", 8: "Greece Golden Visa",
        9: "Portugal D7/D8/Golden Visa", 10: "Spain Digital Nomad Visa & Sao Tome Citizenship",
        11: "Malta Permanent Residency", 12: "Greece Golden Visa",
      };

      const allWeeks: Array<{ weekNumber: number; startDate: string; endDate: string; program: string }> = [];
      for (let w = 0; w < 12; w++) {
        const ws = new Date(start); ws.setDate(ws.getDate() + w * 7);
        const we = new Date(ws); we.setDate(we.getDate() + 6);
        allWeeks.push({ weekNumber: w + 1, startDate: ws.toISOString().slice(0, 10), endDate: we.toISOString().slice(0, 10), program: WEEK_PROGRAMS[w + 1] });
      }

      // Generate one week at a time to stay within LLM token limits
      async function generateOneWeek(wk: { weekNumber: number; startDate: string; endDate: string; program: string }): Promise<unknown> {
        const prompt = `You are an expert prompt engineer and brand strategist for ELEVAY, a premium Global Mobility Advisory Firm (residency & citizenship by investment, digital nomad visas, business immigration). You produce ready-to-use generation prompts for an AI image and video pipeline.

Generate the marketing content plan for ONE week. All captions MUST be in Modern Standard Arabic. On-design text MUST be in English.

Week ${wk.weekNumber} of 12 | Dates: ${wk.startDate} to ${wk.endDate} | Program: ${wk.program}

=== BRAND IDENTITY (apply to every prompt without exception) ===
Position: Strategic Global Mobility Advisory Firm — never an immigration broker, travel agency, or "visa shop" tone.
Personality: professional, premium, trustworthy, educational, family-oriented, solution-focused. Never salesy, arrogant, or flashy.
Messaging pillars to rotate across the week: Family Security, Global Mobility, Long-term Planning, Premium Service, Ethical Advisory.
Never guarantee approvals, timelines, or outcomes. NEVER use the word "Visa" — always "Residency." Never use "Broker," "Guaranteed," "Easy," "Instant," "Shortcut."
Add a compliance line when relevant: "Subject to government approval" / "Based on individual circumstances" / "Consult with legal advisors."

=== VISUAL SYSTEM — COLOR USAGE (non-negotiable) ===
Off-White #FFEBDA and Cream #FFE7D1 are the DOMINANT background/surface colors — majority of the design area.
Baby Blue #5BA3B8 is the PRIMARY ACCENT — used freely for accents, icons, highlights, secondary text, logo.
Light Teal #B3CFD4 for borders, dividers, subtle accents.
Dark Navy #3D4750 capped at ≤5% of the design — ONLY for small text elements (headline/key label), NEVER large fills, bands, or backgrounds.
Bright Gold #FFBF5D capped at ≤5% of the design — STRICTLY for the single CTA element (button/tag), never backgrounds or large shapes.
Pure White #FFFFFF for text on any dark element.
NO colors outside this palette.

=== TYPOGRAPHY & SHAPE ===
Apex Sans — Medium for headings, Book for body. Sentence case only, never all-caps or title case. Generous whitespace and line-height.
Corner radii: 8-12px on cards/buttons, up to 16px on large panels, full pill on badges. Never sharp corners, never a colored left-border accent.
Editorial, asymmetric layouts rather than boxed photo frames.
Shadows: soft, warm-tinted (rgba 61,71,80), never harsh black. CTA gets subtle amber glow.
Logo: ELEVAY origami-bird mark, Baby Blue + Dark Navy, always present and untouched.

=== PHOTOGRAPHY DIRECTION ===
Warm, natural-light, editorial — premium settings (elegant homes, offices, European/Mediterranean architecture, international skylines). Subjects appear Arab/Middle Eastern, in modern elegant clothing. Never stock-photo clichés, staged handshakes, passport imagery, or flag imagery.

=== MOTION (reels only) ===
Subtle cinematic pans/zooms, warm color grading, restrained pacing — no bounce, no flashy transitions, NO on-screen text overlays. Background music only. Every reel ends on the ELEVAY logo centered on pure white, static, 3 seconds, no animation.

Return ONLY this JSON (no extra text):
{
  "weekNumber": ${wk.weekNumber},
  "startDate": "${wk.startDate}",
  "endDate": "${wk.endDate}",
  "program": "${wk.program}",
  "theme": "<catchy weekly theme>",
  "weeklyStrategy": "<2-3 sentence strategy>",
  "contentPillars": [
    {"pillar": "Family Security", "description": "<protecting family future through global mobility>"},
    {"pillar": "Global Mobility", "description": "<freedom of movement, access to markets>"},
    {"pillar": "Long-term Planning", "description": "<strategic wealth and lifestyle planning>"},
    {"pillar": "Premium Service", "description": "<white-glove advisory, personalized>"},
    {"pillar": "Ethical Advisory", "description": "<transparent, compliant, trustworthy>"}
  ],
  "posts": [
    {"postNumber": 1, "day": "Sunday", "messagingPillar": "<one of: Family Security / Global Mobility / Long-term Planning / Premium Service / Ethical Advisory>", "format": "1080x1350", "topic": "<topic>", "angle": "<angle>", "headlineEn": "<English, sentence case, benefit-focused, 8-12 words — this goes ON the design>", "supportingCopyEn": "<English, 1 short sentence max — on the design>", "captionAr": "<Modern Standard Arabic, hook → body (2-3 sentences) → CTA, 100-150 words. No phone numbers/URLs/QR codes>", "complianceLine": "<if topic implies outcomes: 'Subject to government approval' or similar, else empty string>", "hashtags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8"], "manusImagePrompt": "<DETAILED 400+ word prompt. Structure: 1) FORMAT: 1080x1350 (4:5) or 1080x1080 (1:1) as specified. ELEVAY premium Global Mobility Advisory. 2) VISUAL COMPOSITION: editorial/asymmetric layout. Choose from: split layout with hero photograph + text panel on Off-White #FFEBDA, full-bleed photograph with semi-transparent Cream #FFE7D1 overlay panel, centered composition with large hero image and minimal text below. Describe exact subject/scene. 3) HERO PHOTOGRAPH: ONE stunning real-world photograph of the destination — describe exactly: specific location, camera angle, warm natural lighting, time of day (golden hour preferred), key architectural/landscape elements. Must instantly communicate the country/program. Arab/Middle Eastern subjects in modern elegant clothing if people are included. 4) TEXT & TYPOGRAPHY: Apex Sans Medium headline in Dark Navy #3D4750 (sentence case, benefit-focused), Apex Sans Book supporting line. English only on-design. Clear hierarchy. 5) COLOR BREAKDOWN: Off-White #FFEBDA dominant background (70%+), Baby Blue #5BA3B8 accents/icons/highlights (15-20%), Dark Navy #3D4750 headline text ONLY (≤5%), Bright Gold #FFBF5D single CTA button/tag ONLY (≤5%), Light Teal #B3CFD4 borders/dividers. 6) BRANDING: ELEVAY origami-bird logo in Baby Blue, bottom-right, 10px clear space. 7) ANTI-PATTERNS: NO Canva templates, NO passports, NO flags, NO infographics, NO collages, NO sculptures, NO portals, NO museum installations, NO abstract art, NO dark navy backgrounds, NO large gold areas, NO all-caps text, NO sharp corners. Style: Apple product pages, Monocle Magazine editorials, luxury real estate marketing.>"},
    {"postNumber": 2, "day": "Monday", "messagingPillar": "<different pillar>", "format": "1080x1080", "topic": "<topic>", "angle": "<angle>", "headlineEn": "<English headline>", "supportingCopyEn": "<English>", "captionAr": "<Arabic 100-150 words>", "complianceLine": "<if needed>", "hashtags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8"], "manusImagePrompt": "<DETAILED 400+ word prompt following same 7-section structure, different layout choice>"},
    {"postNumber": 3, "day": "Tuesday", "messagingPillar": "<different pillar>", "format": "1080x1350", "topic": "<topic>", "angle": "<angle>", "headlineEn": "<English headline>", "supportingCopyEn": "<English>", "captionAr": "<Arabic 100-150 words>", "complianceLine": "<if needed>", "hashtags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8"], "manusImagePrompt": "<DETAILED 400+ word prompt following same 7-section structure, different layout choice>"},
    {"postNumber": 4, "day": "Wednesday", "messagingPillar": "<different pillar>", "format": "1080x1080", "topic": "<topic>", "angle": "<angle>", "headlineEn": "<English headline>", "supportingCopyEn": "<English>", "captionAr": "<Arabic 100-150 words>", "complianceLine": "<if needed>", "hashtags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8"], "manusImagePrompt": "<DETAILED 400+ word prompt following same 7-section structure, different layout choice>"},
    {"postNumber": 5, "day": "Thursday", "messagingPillar": "<different pillar>", "format": "1080x1350", "topic": "<topic>", "angle": "<angle>", "headlineEn": "<English headline>", "supportingCopyEn": "<English>", "captionAr": "<Arabic 100-150 words>", "complianceLine": "<if needed>", "hashtags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8"], "manusImagePrompt": "<DETAILED 400+ word prompt following same 7-section structure, different layout choice>"}
  ],
  "reels": [
    {"reelNumber": 1, "day": "Sunday", "messagingPillar": "<pillar>", "targetProgram": "<e.g. Spain Digital Nomad Residency>", "topic": "<UNIQUE topic — e.g. Requirements & Process>", "concept": "<cinematic narrative concept — the visual STORY arc across all 5 clips>", "backgroundMusicStyle": "<specific music genre/mood — e.g. 'Ambient piano with soft strings, warm and aspirational, 90 BPM'>",
      "captionAr": "<Modern Standard Arabic, hook → body (2-3 sentences) → CTA, 100-150 words>",
      "complianceLine": "<if needed>",
      "scenes": [
        {"sceneNumber": 1, "clipDuration": "5s", "visualDescription": "<OPENING HOOK — 150+ words. 9:16 vertical, 1080x1920. Describe: exact camera movement, specific real location, warm natural lighting, time of day, atmosphere. NO on-screen text overlays. Must grab attention in first 2 seconds. Warm color grading matching ELEVAY palette.>", "manusPrompt": "<Complete 150+ word prompt for AI video generation: the exact 5-second clip, camera movement, aspect ratio 9:16, warm color grading, cinematic quality, no text overlays.>"},
        {"sceneNumber": 2, "clipDuration": "5s", "visualDescription": "<SCENE CONTINUATION/BENEFIT VISUAL — 150+ words. Continue the visual narrative. Show a specific benefit or lifestyle element. Subtle cinematic pan/zoom. Warm, natural light. Premium setting.>", "manusPrompt": "<150+ word prompt: continuation scene, specific visual, warm color grade, subtle camera movement, 9:16, 5 seconds.>"},
        {"sceneNumber": 3, "clipDuration": "5s", "visualDescription": "<SCENE CONTINUATION/BENEFIT VISUAL — 150+ words. Different angle or location showing another benefit. Architectural beauty or lifestyle aspiration. Warm editorial feel.>", "manusPrompt": "<150+ word prompt: benefit scene, architectural/lifestyle beauty, warm lighting, subtle movement, 9:16, 5 seconds.>"},
        {"sceneNumber": 4, "clipDuration": "5s", "visualDescription": "<EMOTIONAL PAYOFF — 150+ words. The most visually stunning shot. Family security, lifestyle opportunity, or breathtaking destination moment. Dramatic but restrained camera movement. This is the 'save' moment.>", "manusPrompt": "<150+ word prompt: hero shot, emotional payoff, cinematic scale, perfect warm lighting, dramatic yet restrained, 9:16, 5 seconds.>"},
        {"sceneNumber": 5, "clipDuration": "5s", "visualDescription": "<BRAND CLOSE — Closing scene transitioning into mandatory logo outro: ELEVAY origami-bird logo centered on PURE WHITE background, static, no animation, no music change. The bird is in Baby Blue #5BA3B8 + Dark Navy #3D4750. 3 seconds of static logo, then 2 seconds fade.>", "manusPrompt": "<Prompt: ELEVAY origami bird logo in Baby Blue #5BA3B8 and Dark Navy #3D4750, centered on pure white background, completely static, no animation, no effects, clean and minimal, 9:16 vertical, 5 seconds (3s static + 2s fade to black).>"}
      ],
      "manusWeekPrompt": "<Complete Manus task prompt to produce all 5 clips and merge into one 25-second reel. Include: transition style (cross-dissolve), final aspect ratio 9:16, background music description, export settings.>"
    },
    {"reelNumber": 2, "day": "Monday", "messagingPillar": "<different pillar>", "targetProgram": "<different program>", "topic": "<UNIQUE topic>", "concept": "<different visual narrative>", "backgroundMusicStyle": "<different mood>", "captionAr": "<Arabic 100-150 words>", "complianceLine": "<if needed>", "scenes": [{"sceneNumber":1,"clipDuration":"5s","visualDescription":"<150+ word OPENING HOOK — different location>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":2,"clipDuration":"5s","visualDescription":"<150+ word benefit visual>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":3,"clipDuration":"5s","visualDescription":"<150+ word benefit visual>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":4,"clipDuration":"5s","visualDescription":"<150+ word emotional payoff>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":5,"clipDuration":"5s","visualDescription":"<ELEVAY logo on pure white, static, 3s>","manusPrompt":"<prompt>"}], "manusWeekPrompt": "<merge prompt>"},
    {"reelNumber": 3, "day": "Tuesday", "messagingPillar": "<different pillar>", "targetProgram": "<different program>", "topic": "<UNIQUE topic>", "concept": "<different visual narrative>", "backgroundMusicStyle": "<different mood>", "captionAr": "<Arabic 100-150 words>", "complianceLine": "<if needed>", "scenes": [{"sceneNumber":1,"clipDuration":"5s","visualDescription":"<150+ word OPENING HOOK>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":2,"clipDuration":"5s","visualDescription":"<150+ word benefit visual>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":3,"clipDuration":"5s","visualDescription":"<150+ word benefit visual>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":4,"clipDuration":"5s","visualDescription":"<150+ word emotional payoff>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":5,"clipDuration":"5s","visualDescription":"<ELEVAY logo on pure white, static, 3s>","manusPrompt":"<prompt>"}], "manusWeekPrompt": "<merge prompt>"},
    {"reelNumber": 4, "day": "Wednesday", "messagingPillar": "<different pillar>", "targetProgram": "<different program>", "topic": "<UNIQUE topic>", "concept": "<different visual narrative>", "backgroundMusicStyle": "<different mood>", "captionAr": "<Arabic 100-150 words>", "complianceLine": "<if needed>", "scenes": [{"sceneNumber":1,"clipDuration":"5s","visualDescription":"<150+ word OPENING HOOK>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":2,"clipDuration":"5s","visualDescription":"<150+ word benefit visual>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":3,"clipDuration":"5s","visualDescription":"<150+ word benefit visual>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":4,"clipDuration":"5s","visualDescription":"<150+ word emotional payoff>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":5,"clipDuration":"5s","visualDescription":"<ELEVAY logo on pure white, static, 3s>","manusPrompt":"<prompt>"}], "manusWeekPrompt": "<merge prompt>"},
    {"reelNumber": 5, "day": "Thursday", "messagingPillar": "<different pillar>", "targetProgram": "<different program>", "topic": "<UNIQUE topic>", "concept": "<different visual narrative>", "backgroundMusicStyle": "<different mood>", "captionAr": "<Arabic 100-150 words>", "complianceLine": "<if needed>", "scenes": [{"sceneNumber":1,"clipDuration":"5s","visualDescription":"<150+ word OPENING HOOK>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":2,"clipDuration":"5s","visualDescription":"<150+ word benefit visual>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":3,"clipDuration":"5s","visualDescription":"<150+ word benefit visual>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":4,"clipDuration":"5s","visualDescription":"<150+ word emotional payoff>","manusPrompt":"<150+ word prompt>"},{"sceneNumber":5,"clipDuration":"5s","visualDescription":"<ELEVAY logo on pure white, static, 3s>","manusPrompt":"<prompt>"}], "manusWeekPrompt": "<merge prompt>"}
  ],
  "wordDocPrompt": "<Manus task prompt to generate a Word doc with all captions for this week>"
}`;

        // Robustly extract JSON from LLM response (handles markdown fences, extra text)
        function extractJson(raw: string): unknown {
          if (!raw || !raw.trim()) throw new Error("Empty LLM response");
          let cleaned = raw.trim();
          // Strip markdown code fences if present
          const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) cleaned = fenceMatch[1].trim();
          // Find the outermost JSON object
          const start = cleaned.indexOf("{");
          const end = cleaned.lastIndexOf("}");
          if (start !== -1 && end !== -1 && end > start) {
            cleaned = cleaned.slice(start, end + 1);
          }
          return JSON.parse(cleaned);
        }

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await invokeLLM({
              messages: [
                { role: "system", content: "You are a senior social media strategist for ELEVAY (Egyptian citizenship & residency consultancy). Generate marketing content plans in valid JSON format only. All captions and voice-overs must be in Arabic. Follow the exact JSON schema provided. Return ONLY valid JSON, no markdown, no code fences, no extra text." },
                { role: "user", content: prompt }
              ]
            });
            console.log(`[MarketingPlan] Week ${wk.weekNumber} LLM response:`, { choicesLen: response.choices?.length, firstMsg: response.choices?.[0]?.message });
            const content = response.choices?.[0]?.message?.content;
            if (!content) throw new Error(`Empty AI response for week ${wk.weekNumber}`);
            return extractJson(content as string);
          } catch (err) {
            console.error(`[MarketingPlan] Week ${wk.weekNumber} attempt ${attempt + 1} failed:`, String(err));
            if (attempt === 2) {
              // Return a minimal fallback so the whole plan doesn't fail on one bad week
              return {
                weekNumber: wk.weekNumber,
                startDate: wk.startDate,
                endDate: wk.endDate,
                program: wk.program,
                pillars: [],
                posts: [],
                reels: [],
                wordDocPrompt: "",
                generationError: `Week ${wk.weekNumber} could not be generated. Please try regenerating.`,
              };
            }
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }

      // Generate all 12 weeks in PARALLEL to avoid proxy/request timeout.
      // Sequential generation took 6-12 minutes (12 × 30-60s per LLM call),
      // which exceeded the proxy timeout and caused a network abort error.
      // Parallel generation completes in ~60s (one LLM call duration).
      const generatedWeeks = await Promise.all(allWeeks.map(wk => generateOneWeek(wk)));

      // Build the plan object — avoid putting ISO date strings directly in the
      // top-level return value because superjson will try to coerce them to Dates.
      // We JSON.stringify the whole thing and return it as a plain string.
      const planObject = {
        planTitle: "ELEVAY 12-Week Marketing Strategy Plan",
        weekCount: 12,
        strategyOverview: "A comprehensive 12-week social media content strategy for ELEVAY covering Spain Digital Nomad Visa (30%), Malta Permanent Residency (20%), Greece Golden Visa (20%), Portugal D7/D8/Golden Visa (15%), and Sao Tome Citizenship (15%). Each week includes 5 static posts and 5 reels with Arabic captions and voice-overs, plus ready-to-use Manus prompts.",
        programAllocation: [
          { program: "Spain Digital Nomad Visa", percentage: 30, weeks: [1, 4, 7, 10] },
          { program: "Malta Permanent Residency", percentage: 20, weeks: [2, 6, 11] },
          { program: "Greece Golden Visa", percentage: 20, weeks: [3, 8, 12] },
          { program: "Portugal (D7, D8, Golden Visa)", percentage: 15, weeks: [5, 9] },
          { program: "Sao Tome Citizenship", percentage: 15, weeks: [4, 10] },
        ],
        weeks: generatedWeeks,
      };
      // Return as a plain JSON string — this prevents superjson from scanning
      // the object and misidentifying ISO date strings inside LLM content as Date objects.
      const planJson = JSON.stringify(planObject);
      console.log(`[MarketingPlan] Generated plan JSON length: ${planJson.length} bytes`);
      return { planJson };
    }),
});
