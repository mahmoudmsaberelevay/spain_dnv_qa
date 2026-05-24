import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createLead, getLeadById, listLeads, updateLead, deleteLead, checkDuplicate,
  addLeadActivity, getLeadActivities,
  addLeadNote, getLeadNotes, updateLeadNote, deleteLeadNote, getLeadNoteById,
  createLeadTask, getLeadTasks, completeLeadTask, deleteLeadTask,
  getLeadStageCounts, getLeadSourceCounts, getLeadProgramCounts,
  getMonthlyLeadConversions, getLeadTotalCount,
  bulkDeleteLeads, getLeadsByIds,
} from "../leadsDb";
import { listActivityPresets, listLeadIntegrations } from "../leadsSettingsDb";
import { syncOneIntegrationById } from "../metaLeadSync";

const STAGES = [
  "fresh", "contacted", "qualified", "prospect", "client", "dormant",
  "not_qualified_budget", "not_qualified_work", "not_qualified_study",
  "not_qualified_criminal", "not_qualified_other",
] as const;

const TASK_TYPES = ["call", "whatsapp", "email", "meeting", "document_request", "other"] as const;

export const leadsRouter = router({
  // ── CRUD ────────────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      fullName: z.string().min(1),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      nationality: z.string().optional(),
      countryOfResidence: z.string().optional(),
      gender: z.enum(["male", "female", "other"]).optional(),
      maritalStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
      familyMembers: z.number().int().min(1).optional(),
      passportStatus: z.enum(["valid", "expired", "none"]).optional(),
      preferredLanguage: z.string().optional(),
      interestedProgram: z.string().optional(),
      interestedCountry: z.string().optional(),
      budgetRange: z.string().optional(),
      occupation: z.string().optional(),
      leadSource: z.string().optional(),
      metaCampaign: z.string().optional(),
      metaAdset: z.string().optional(),
      metaAd: z.string().optional(),
      assignedTo: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      notes: z.string().optional(),
      skipDuplicateCheck: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.skipDuplicateCheck) {
        const dup = await checkDuplicate(input.phone, input.email || undefined, input.whatsapp);
        if (dup) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Duplicate lead detected: ${dup.fullName} (ID: ${dup.id}). Use skipDuplicateCheck to proceed anyway.`,
          });
        }
      }
      const id = await createLead({
        ...input,
        email: input.email || undefined,
        stage: "fresh",
        leadScore: 0,
      });
      await addLeadActivity({
        leadId: id,
        userId: ctx.user.id,
        activityType: "created",
        description: `Lead created by ${ctx.user.name ?? "system"}`,
      });
      if (input.assignedTo) {
        await addLeadActivity({
          leadId: id,
          userId: ctx.user.id,
          activityType: "assigned",
          description: `Assigned to ${input.assignedTo}`,
        });
      }
      return { id };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const lead = await getLeadById(input.id);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      return lead;
    }),

  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      stage: z.string().optional(),
      leadSource: z.string().optional(),
      interestedProgram: z.string().optional(),
      assignedTo: z.string().optional(),
      priority: z.string().optional(),
      dateFrom: z.number().optional(),
      dateTo: z.number().optional(),
      lastActivityFrom: z.number().optional(),
      lastActivityTo: z.number().optional(),
      metaFormId: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return listLeads(input);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      fullName: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      nationality: z.string().optional(),
      countryOfResidence: z.string().optional(),
      gender: z.enum(["male", "female", "other"]).optional(),
      maritalStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
      familyMembers: z.number().int().optional(),
      passportStatus: z.enum(["valid", "expired", "none"]).optional(),
      preferredLanguage: z.string().optional(),
      interestedProgram: z.string().optional(),
      interestedCountry: z.string().optional(),
      budgetRange: z.string().optional(),
      netWorth: z.string().optional(),
      occupation: z.string().optional(),
      monthlyIncome: z.string().optional(),
      educationLevel: z.string().optional(),
      travelHistory: z.string().optional(),
      visaRefusals: z.boolean().optional(),
      criminalRecord: z.boolean().optional(),
      sourceOfFunds: z.string().optional(),
      leadSource: z.string().optional(),
      assignedTo: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      leadScore: z.number().int().min(0).max(100).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const lead = await getLeadById(id);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      await updateLead(id, data);
      await addLeadActivity({
        leadId: id,
        userId: ctx.user.id,
        activityType: "status_updated",
        description: `Lead details updated by ${ctx.user.name ?? "system"}`,
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const lead = await getLeadById(input.id);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      await deleteLead(input.id);
      return { success: true };
    }),

  changeStage: protectedProcedure
    .input(z.object({
      id: z.number(),
      stage: z.enum(STAGES),
    }))
    .mutation(async ({ ctx, input }) => {
      const lead = await getLeadById(input.id);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      const prevStage = lead.stage;
      await updateLead(input.id, { stage: input.stage, lastContactAt: Date.now() });
      await addLeadActivity({
        leadId: input.id,
        userId: ctx.user.id,
        activityType: "stage_changed",
        description: `Stage changed from "${prevStage}" to "${input.stage}" by ${ctx.user.name ?? "system"}`,
      });
      return { success: true };
    }),

  assign: protectedProcedure
    .input(z.object({ id: z.number(), assignedTo: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await getLeadById(input.id);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      await updateLead(input.id, { assignedTo: input.assignedTo });
      await addLeadActivity({
        leadId: input.id,
        userId: ctx.user.id,
        activityType: "assigned",
        description: `Assigned to ${input.assignedTo} by ${ctx.user.name ?? "system"}`,
      });
      return { success: true };
    }),

  checkDuplicate: protectedProcedure
    .input(z.object({ phone: z.string().optional(), email: z.string().optional(), whatsapp: z.string().optional() }))
    .query(async ({ input }) => {
      return checkDuplicate(input.phone, input.email, input.whatsapp);
    }),

  // ── Preset Activity Log ─────────────────────────────────────────────────────
  logPresetActivity: protectedProcedure
    .input(z.object({
      leadId: z.number(),
      presetId: z.number(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const presets = await listActivityPresets();
      const preset = presets.find(p => p.id === input.presetId);
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "Activity preset not found" });

      const lead = await getLeadById(input.leadId);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });

      // Log activity with preset label and optional note
      const description = input.note
        ? `${preset.label}: ${input.note}`
        : preset.label;

      await addLeadActivity({
        leadId: input.leadId,
        userId: ctx.user.id,
        activityType: preset.activityType as any,
        description,
        score: preset.score,
      });

      // Update lead score and lastContactAt
      const newScore = Math.min(100, Math.max(0, (lead.leadScore ?? 0) + preset.score));
      await updateLead(input.leadId, { leadScore: newScore, lastContactAt: Date.now() });

      return { success: true, newScore };
    }),

  // ── Send Email ──────────────────────────────────────────────────────────────
  sendEmail: protectedProcedure
    .input(z.object({
      leadId: z.number(),
      subject: z.string().min(1),
      body: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const lead = await getLeadById(input.leadId);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      if (!lead.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Lead has no email address" });

      const nodemailer = await import("nodemailer");
      const user = process.env.GMAIL_USER;
      const pass = process.env.GMAIL_APP_PASSWORD;
      if (!user || !pass) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Email not configured" });

      const transporter = nodemailer.default.createTransport({
        service: "gmail",
        auth: { user, pass },
      });

      await transporter.sendMail({
        from: `ELEVAY <${user}>`,
        to: lead.email,
        subject: input.subject,
        html: input.body.replace(/\n/g, "<br>"),
      });

      // Log as activity
      await addLeadActivity({
        leadId: input.leadId,
        userId: ctx.user.id,
        activityType: "email_sent",
        description: `Email sent: "${input.subject}"`,
        score: 1,
      });
      const newScore = Math.min(100, (lead.leadScore ?? 0) + 1);
      await updateLead(input.leadId, { leadScore: newScore, lastContactAt: Date.now() });

      return { success: true };
    }),

  // ── Activities ──────────────────────────────────────────────────────────────
  activities: router({
    list: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => getLeadActivities(input.leadId)),

    add: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        activityType: z.enum(["call_made", "whatsapp_sent", "email_sent", "meeting_scheduled", "followup_scheduled", "document_uploaded"]),
        description: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await addLeadActivity({ ...input, userId: ctx.user.id });
        await updateLead(input.leadId, { lastContactAt: Date.now() });
        return { success: true };
      }),
  }),

  // ── Notes ───────────────────────────────────────────────────────────────────
  notes: router({
    list: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => getLeadNotes(input.leadId)),

    add: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        note: z.string().min(1),
        isImportant: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await addLeadNote({
          leadId: input.leadId,
          userId: ctx.user.id,
          userName: ctx.user.name ?? undefined,
          note: input.note,
          isImportant: input.isImportant ?? false,
          isPinned: false,
        });
        await addLeadActivity({
          leadId: input.leadId,
          userId: ctx.user.id,
          activityType: "note_added",
          description: `Note added by ${ctx.user.name ?? "system"}`,
        });
        return { id };
      }),

    edit: protectedProcedure
      .input(z.object({ id: z.number(), note: z.string().min(1), isImportant: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const existing = await getLeadNoteById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        if (existing.userId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own notes." });
        }
        await updateLeadNote(input.id, { note: input.note, isImportant: input.isImportant });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const existing = await getLeadNoteById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        if (existing.userId !== ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own notes." });
        }
        await deleteLeadNote(input.id);
        return { success: true };
      }),

    pin: protectedProcedure
      .input(z.object({ id: z.number(), isPinned: z.boolean() }))
      .mutation(async ({ input }) => {
        await updateLeadNote(input.id, { isPinned: input.isPinned });
        return { success: true };
      }),
  }),

  // ── Tasks ───────────────────────────────────────────────────────────────────
  tasks: router({
    list: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => getLeadTasks(input.leadId)),

    create: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        taskType: z.enum(TASK_TYPES),
        dueDate: z.number(),
        assignedTo: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await createLeadTask(input);
        await addLeadActivity({
          leadId: input.leadId,
          userId: ctx.user.id,
          activityType: "task_created",
          description: `Task (${input.taskType}) created by ${ctx.user.name ?? "system"}, due ${new Date(input.dueDate).toLocaleDateString()}`,
        });
        return { id };
      }),

    complete: protectedProcedure
      .input(z.object({ id: z.number(), leadId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await completeLeadTask(input.id);
        await addLeadActivity({
          leadId: input.leadId,
          userId: ctx.user.id,
          activityType: "task_completed",
          description: `Task completed by ${ctx.user.name ?? "system"}`,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteLeadTask(input.id);
        return { success: true };
      }),
  }),

  // ── Bulk Actions ─────────────────────────────────────────────────────────────
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      const deleted = await bulkDeleteLeads(input.ids);
      return { deleted };
    }),

  bulkExport: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).optional(), // if omitted, export all
      filters: z.object({
        search: z.string().optional(),
        stage: z.string().optional(),
        leadSource: z.string().optional(),
        interestedProgram: z.string().optional(),
        assignedTo: z.string().optional(),
        priority: z.string().optional(),
        dateFrom: z.number().optional(),
        dateTo: z.number().optional(),
        lastActivityFrom: z.number().optional(),
        lastActivityTo: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      let rows;
      if (input.ids && input.ids.length > 0) {
        rows = await getLeadsByIds(input.ids);
      } else {
        rows = await listLeads(input.filters);
      }
      // Build CSV
      const headers = [
        "ID", "Full Name", "Phone", "WhatsApp", "Email", "Nationality",
        "Country of Residence", "Gender", "Marital Status", "Family Members",
        "Interested Program", "Budget Range", "Lead Source", "Stage",
        "Priority", "Assigned To", "Lead Score", "Notes", "Created At",
      ];
      const escape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      const csvLines = [headers.join(",")];
      for (const r of rows) {
        csvLines.push([
          r.id, r.fullName, r.phone, r.whatsapp, r.email, r.nationality,
          r.countryOfResidence, r.gender, r.maritalStatus, r.familyMembers,
          r.interestedProgram, r.budgetRange, r.leadSource, r.stage,
          r.priority, r.assignedTo, r.leadScore, r.notes,
          r.createdAt ? new Date(r.createdAt).toISOString() : "",
        ].map(escape).join(","));
      }
      return { csv: csvLines.join("\n"), count: rows.length };
    }),

  // ── Historical Sync ────────────────────────────────────────────────────────
  historicalSync: protectedProcedure
    .input(z.object({
      integrationId: z.number().optional(), // if omitted, syncs all active Meta integrations
    }).optional())
    .mutation(async ({ input }) => {
      // April 1, 2026 00:00:00 UTC as the historical since timestamp
      const APRIL_1_2026_MS = new Date('2026-04-01T00:00:00Z').getTime();
      const db = await (await import('../db')).getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

      const { leadIntegrations } = await import('../../drizzle/schema');
      const { eq, and } = await import('drizzle-orm');

      let integrationIds: number[];
      if (input?.integrationId) {
        integrationIds = [input.integrationId];
      } else {
        const rows = await db
          .select({ id: leadIntegrations.id })
          .from(leadIntegrations)
          .where(and(eq(leadIntegrations.type, 'meta'), eq(leadIntegrations.isActive, true)));
        integrationIds = rows.map(r => r.id);
      }

      if (integrationIds.length === 0) {
        return { results: [], totalNew: 0, totalSkipped: 0 };
      }

      const results = [];
      let totalNew = 0;
      let totalSkipped = 0;
      for (const id of integrationIds) {
        const result = await syncOneIntegrationById(id, APRIL_1_2026_MS);
        results.push(result);
        totalNew += result.newLeads;
        totalSkipped += result.skippedDuplicates;
      }

      return { results, totalNew, totalSkipped };
    }),

  // ── Analytics ───────────────────────────────────────────────────────────────
  analytics: router({
    overview: protectedProcedure.query(async () => {
      const [stageCounts, sourceCounts, programCounts, total] = await Promise.all([
        getLeadStageCounts(),
        getLeadSourceCounts(),
        getLeadProgramCounts(),
        getLeadTotalCount(),
      ]);
      return { stageCounts, sourceCounts, programCounts, total };
    }),

    monthlyConversions: protectedProcedure
      .input(z.object({ year: z.number().int() }))
      .query(async ({ input }) => getMonthlyLeadConversions(input.year)),
  }),
});
