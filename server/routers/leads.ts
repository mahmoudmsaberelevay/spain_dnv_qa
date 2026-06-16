import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { leadsReportPresets } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import {
  createLead, getLeadById, listLeads, updateLead, deleteLead, checkDuplicate,
  addLeadActivity, getLeadActivities,
  addLeadNote, getLeadNotes, updateLeadNote, deleteLeadNote, getLeadNoteById,
  createLeadTask, getLeadTasks, completeLeadTask, deleteLeadTask, getAllTasksWithLeads,
  getLeadStageCounts, getLeadSourceCounts, getLeadProgramCounts,
  getMonthlyLeadConversions, getLeadTotalCount,
  getLeadCampaignCounts, getLeadFormCounts,
  bulkDeleteLeads, getLeadsByIds,
  bulkUpdateLeadsStage, bulkUpdateLeadsOwner,
  getNewLeadsReport, getStageChangeReport, getUserActivityReport,
} from "../leadsDb";
import { listActivityPresets, listLeadIntegrations } from "../leadsSettingsDb";
import { syncOneIntegrationById } from "../metaLeadSync";
import { writeAuditLog, auditCtxFromTrpc } from "../auditLog";
import { sendLeadAssignmentNotification, TEAM_EMAIL_MAP } from "../emailService";
import { sendCapiEvent, stageToCapiEvent } from "../metaCapi";

const STAGES = [
  "fresh", "contacted", "qualified", "prospect", "client", "dormant", "resubmit",
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
      stage: z.string().optional(),
      importedCreatedAt: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.skipDuplicateCheck) {
        const dup = await checkDuplicate(input.phone, input.email || undefined, input.whatsapp);
        if (dup) {
          throw new TRPCError({
            code: "CONFLICT",
            message: JSON.stringify({
              message: `A lead with this phone number already exists: ${dup.fullName}`,
              existingLeadId: dup.id,
              existingLeadName: dup.fullName,
            }),
          });
        }
      }
      // Validate stage if provided
      const VALID_STAGES = ["fresh","contacted","qualified","prospect","client","dormant","resubmit","not_qualified_budget","not_qualified_work","not_qualified_study","not_qualified_criminal","not_qualified_other"];
      const importedStage = (input.stage && VALID_STAGES.includes(input.stage) ? input.stage : "fresh") as "fresh" | "contacted" | "qualified" | "prospect" | "client" | "dormant" | "resubmit" | "not_qualified_budget" | "not_qualified_work" | "not_qualified_study" | "not_qualified_criminal" | "not_qualified_other";
      const id = await createLead({
        ...input,
        email: input.email || undefined,
        stage: importedStage,
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
      // Fire CAPI Lead event (non-blocking)
      sendCapiEvent({
        eventName: "Lead",
        leadId: id,
        email: input.email || undefined,
        phone: input.phone || input.whatsapp || undefined,
        country: input.nationality || undefined,
      }).catch(() => {});
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
      metaCampaign: z.string().optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(10).max(300).optional(),
    }).optional())
    .query(async ({ input }) => {
      return listLeads(input);
    }),

  // Returns only the IDs of all leads matching the current filters (for cross-page select-all)
  selectAllIds: protectedProcedure
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
      metaCampaign: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const result = await listLeads({ ...input, page: 1, pageSize: 10000 });
      return { ids: result.leads.map(l => l.id), total: result.total };
    }),

  // Pipeline: fetch all leads for a specific stage (no 200-row cap, used by Kanban board)
  listByStage: protectedProcedure
    .input(z.object({
      stage: z.string(),
    }))
    .query(async ({ input }) => {
      return listLeads({ stage: input.stage, pageSize: 10000, page: 1 });
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
      // Fire CAPI event for the new stage (non-blocking)
      const capiEventName = stageToCapiEvent(input.stage);
      if (capiEventName) {
        sendCapiEvent({
          eventName: capiEventName,
          customEventName: capiEventName === "CustomEvent" ? input.stage : undefined,
          leadId: input.id,
          email: lead.email || undefined,
          phone: lead.phone || lead.whatsapp || undefined,
          country: lead.nationality || undefined,
        }).catch(() => {});
      }
      return { success: true };
    }),

  assign: protectedProcedure
    .input(z.object({ id: z.number(), assignedTo: z.string(), origin: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await getLeadById(input.id);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      const prevOwner = lead.assignedTo;
      await updateLead(input.id, { assignedTo: input.assignedTo });
      await addLeadActivity({
        leadId: input.id,
        userId: ctx.user.id,
        activityType: "assigned",
        description: `Assigned to ${input.assignedTo} by ${ctx.user.name ?? "system"}`,
      });
      // Send email notification to the new owner if their email is known and owner changed
      if (input.assignedTo !== prevOwner) {
        const ownerEmail = TEAM_EMAIL_MAP[input.assignedTo];
        if (ownerEmail) {
          const origin = input.origin ?? "https://elevay.vip";
          sendLeadAssignmentNotification({
            ownerName: input.assignedTo,
            ownerEmail,
            leadId: input.id,
            leadName: lead.fullName,
            leadPhone: lead.phone,
            leadProgram: lead.interestedProgram,
            origin,
          }).catch(err => console.error('[leads.assign] Email notification error:', err));
        }
      }
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
      .mutation(async ({ input }) => {
        const existing = await getLeadNoteById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        // Any team member can edit any note
        await updateLeadNote(input.id, { note: input.note, isImportant: input.isImportant });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const existing = await getLeadNoteById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        // Any team member can delete any note
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
        const id = await createLeadTask({ ...input, createdBy: ctx.user.name ?? undefined });
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
    .mutation(async ({ input, ctx }) => {
      const deleted = await bulkDeleteLeads(input.ids);
      await writeAuditLog(auditCtxFromTrpc(ctx), "bulk_delete", "leads", undefined, `Deleted ${deleted} leads: [${input.ids.join(",")}]`);
      return { deleted };
    }),

  bulkUpdateStage: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
      stage: z.enum(["fresh", "contacted", "qualified", "prospect", "client", "dormant",
        "not_qualified_budget", "not_qualified_work", "not_qualified_study",
        "not_qualified_criminal", "not_qualified_other"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const updated = await bulkUpdateLeadsStage(input.ids, input.stage);
      await writeAuditLog(auditCtxFromTrpc(ctx), "bulk_update", "leads", undefined, `Stage → ${input.stage} for ${updated} leads: [${input.ids.join(",")}]`);
      // Fire CAPI events for each lead (non-blocking)
      const capiEventName = stageToCapiEvent(input.stage);
      if (capiEventName) {
        Promise.all(input.ids.map(async (leadId) => {
          const lead = await getLeadById(leadId);
          if (!lead) return;
          return sendCapiEvent({
            eventName: capiEventName,
            customEventName: capiEventName === "CustomEvent" ? input.stage : undefined,
            leadId,
            email: lead.email || undefined,
            phone: lead.phone || lead.whatsapp || undefined,
            country: lead.nationality || undefined,
          });
        })).catch(() => {});
      }
      return { updated };
    }),

  bulkUpdateOwner: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
      assignedTo: z.string().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const updated = await bulkUpdateLeadsOwner(input.ids, input.assignedTo);
      await writeAuditLog(auditCtxFromTrpc(ctx), "bulk_update", "leads", undefined, `Owner → ${input.assignedTo ?? "Unassigned"} for ${updated} leads: [${input.ids.join(",")}]`);
      return { updated };
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
    .mutation(async ({ input, ctx }) => {
      let rows;
      if (input.ids && input.ids.length > 0) {
        rows = await getLeadsByIds(input.ids);
      } else {
        // Export all — fetch without pagination (pageSize=10000)
        const result = await listLeads({ ...input.filters, page: 1, pageSize: 10000 });
        rows = result.leads;
      }
      await writeAuditLog(auditCtxFromTrpc(ctx), "export", "leads", undefined, `Exported ${rows.length} leads as CSV`);
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

  // ── Meta CRM Export ────────────────────────────────────────────────────────
  metaExport: protectedProcedure
    .input(z.object({
      dateFrom: z.number().optional(),
      dateTo: z.number().optional(),
      stages: z.array(z.string()).optional(),
    }).optional())
    .query(async ({ input }) => {
      const { createHash } = await import("crypto");
      const sha256 = (val: string | null | undefined) => {
        if (!val) return null;
        return createHash("sha256").update(val.trim().toLowerCase()).digest("hex");
      };
      // Stage → Meta event mapping
      const stageToEvent: Record<string, string> = {
        fresh: "Lead",
        contacted: "Lead",
        qualified: "QualifiedLead",
        prospect: "QualifiedLead",
        client: "Purchase",
        dormant: "Lead",
        not_qualified_budget: "Lead",
        not_qualified_work: "Lead",
        not_qualified_study: "Lead",
        not_qualified_criminal: "Lead",
        not_qualified_other: "Lead",
      };
      // Fetch all leads for export (up to 10000)
      const { leads: allLeads } = await listLeads({ page: 1, pageSize: 10000 });
      // Filter by date / stage if provided
      const filtered = allLeads.filter(lead => {
        if (input?.dateFrom && lead.createdAt < input.dateFrom) return false;
        if (input?.dateTo && lead.createdAt > input.dateTo) return false;
        if (input?.stages && input.stages.length > 0 && !input.stages.includes(lead.stage)) return false;
        return true;
      });
      const rows = filtered.map(lead => ({
        // Hashed PII for Meta CAPI
        em: sha256(lead.email),
        ph: sha256(lead.phone),
        fn: sha256(lead.fullName?.split(" ")[0]),
        ln: sha256(lead.fullName?.split(" ").slice(1).join(" ") || lead.fullName),
        // Raw identity
        full_name: lead.fullName,
        email: lead.email,
        phone: lead.phone,
        nationality: lead.nationality,
        country_of_residence: lead.countryOfResidence,
        gender: lead.gender,
        // Meta Attribution
        meta_lead_id: lead.metaLeadId,
        meta_form_id: lead.metaFormId,
        meta_form_name: lead.metaFormName,
        meta_page_id: lead.metaPageId,
        meta_campaign_id: lead.metaCampaignId,
        meta_adset_id: lead.metaAdsetId,
        meta_ad_id: lead.metaAdId,
        meta_campaign_name: lead.metaCampaign,
        meta_adset_name: lead.metaAdset,
        meta_ad_name: lead.metaAd,
        is_organic: lead.isOrganic ? "true" : "false",
        // UTM
        utm_source: lead.utmSource,
        utm_medium: lead.utmMedium,
        utm_campaign: lead.utmCampaign,
        utm_content: lead.utmContent,
        utm_term: lead.utmTerm,
        fbclid: lead.fbclid,
        fbc: lead.fbcCookie,
        fbp: lead.fbpCookie,
        // Pipeline
        lead_status: lead.stage,
        meta_event: stageToEvent[lead.stage] ?? "Lead",
        lead_score: lead.leadScore,
        program_of_interest: lead.interestedProgram,
        investment_budget: lead.investmentBudget ?? lead.budgetRange,
        number_of_applicants: lead.numberOfApplicants,
        estimated_deal_value: lead.estimatedDealValue,
        deal_currency: lead.dealCurrency,
        // Conversion
        consultation_booked_date: lead.consultationBookedDate ? new Date(lead.consultationBookedDate).toISOString() : null,
        consultation_completed_date: lead.consultationCompletedDate ? new Date(lead.consultationCompletedDate).toISOString() : null,
        contract_signed_date: lead.contractSignedDate ? new Date(lead.contractSignedDate).toISOString() : null,
        contract_value_usd: lead.contractValueUsd,
        contract_value_eur: lead.contractValueEur,
        payment_received_date: lead.paymentReceivedDate ? new Date(lead.paymentReceivedDate).toISOString() : null,
        total_payments_received: lead.totalPaymentsReceived,
        // GDPR
        gdpr_consent: lead.gdprConsent ? "true" : "false",
        data_sharing_consent: lead.dataSharingConsent ? "true" : "false",
        marketing_opt_in: lead.marketingOptIn ? "true" : "false",
        opt_out_signal: lead.optOutSignal ? "true" : "false",
        data_region: lead.dataRegion ?? "EG",
        // Timestamps
        lead_created_time: new Date(lead.createdAt).toISOString(),
        lead_source: lead.leadSource,
        assigned_to: lead.assignedTo,
      }));
      return { rows, total: rows.length };
    }),

  // ── All Tasks (Tasks page) ─────────────────────────────────────────────────
  getAllTasks: protectedProcedure
    .input(z.object({ assignedTo: z.string().optional() }).optional())
    .query(async ({ input }) => getAllTasksWithLeads({ assignedTo: input?.assignedTo })),

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

     byCampaign: protectedProcedure.query(async () => getLeadCampaignCounts()),
    byForm: protectedProcedure.query(async () => getLeadFormCounts()),
  }),

  // ── Reporting ───────────────────────────────────────────────────────────────
  reporting: router({
    newLeads: protectedProcedure
      .input(z.object({ dateFrom: z.number(), dateTo: z.number() }))
      .query(async ({ input }) => getNewLeadsReport(input.dateFrom, input.dateTo)),

    stageChanges: protectedProcedure
      .input(z.object({ dateFrom: z.number(), dateTo: z.number(), userId: z.number().optional() }))
      .query(async ({ input }) => getStageChangeReport(input.dateFrom, input.dateTo, input.userId)),

    userActivity: protectedProcedure
      .input(z.object({
        dateFrom: z.number(),
        dateTo: z.number(),
        userId: z.number().optional(),
        activityTypes: z.array(z.string()).optional(),
      }))
      .query(async ({ input }) => getUserActivityReport(input.dateFrom, input.dateTo, input.userId, input.activityTypes)),

    // ── Shared filter presets (visible to all users) ──────────────────────────────
    listPresets: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(leadsReportPresets).orderBy(desc(leadsReportPresets.createdAt));
    }),
    savePreset: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(255), filterJson: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.insert(leadsReportPresets).values({
          name: input.name,
          filterJson: input.filterJson,
          createdByEmail: ctx.user?.email ?? null,
          createdByName: ctx.user?.name ?? null,
          createdAt: Date.now(),
        });
        return { success: true };
      }),
    deletePreset: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(leadsReportPresets).where(eq(leadsReportPresets.id, input.id));
        return { success: true };
      }),
  }),
});
