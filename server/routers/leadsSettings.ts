import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  listLeadSources, createLeadSource, updateLeadSource, deleteLeadSource,
  listLeadIntegrations, createLeadIntegration, updateLeadIntegration,
  deleteLeadIntegration, regenerateWebhookToken,
  getLeadsPermissions, getAllUsersForPermissions, upsertLeadsPermission,
  exportAllLeads,
  listLeadPrograms, createLeadProgram, updateLeadProgram, deleteLeadProgram,
  listActivityPresets, createActivityPreset, updateActivityPreset, deleteActivityPreset,
} from "../leadsSettingsDb";

const ACTIVITY_TYPES = ["call", "whatsapp", "sms", "email", "meeting", "note", "stage_change", "email_sent", "other"] as const;

export const leadsSettingsRouter = router({

  // ─── Lead Sources ──────────────────────────────────────────────────────────
  listSources: protectedProcedure.query(async () => {
    return listLeadSources();
  }),

  createSource: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      color: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return createLeadSource(input);
    }),

  updateSource: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(100).optional(),
      color: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateLeadSource(id, data);
      return { success: true };
    }),

  deleteSource: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteLeadSource(input.id);
      return { success: true };
    }),

  // ─── Lead Programs ─────────────────────────────────────────────────────────
  listPrograms: protectedProcedure.query(async () => {
    return listLeadPrograms();
  }),

  createProgram: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(150) }))
    .mutation(async ({ input }) => {
      await createLeadProgram(input);
      return { success: true };
    }),

  updateProgram: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(150).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateLeadProgram(id, data);
      return { success: true };
    }),

  deleteProgram: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteLeadProgram(input.id);
      return { success: true };
    }),

  // ─── Activity Presets ──────────────────────────────────────────────────────
  listActivityPresets: protectedProcedure.query(async () => {
    return listActivityPresets();
  }),

  createActivityPreset: protectedProcedure
    .input(z.object({
      label: z.string().min(1).max(150),
      activityType: z.enum(ACTIVITY_TYPES),
      score: z.number().int().min(-100).max(100),
    }))
    .mutation(async ({ input }) => {
      await createActivityPreset(input);
      return { success: true };
    }),

  updateActivityPreset: protectedProcedure
    .input(z.object({
      id: z.number(),
      label: z.string().min(1).max(150).optional(),
      activityType: z.enum(ACTIVITY_TYPES).optional(),
      score: z.number().int().min(-100).max(100).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateActivityPreset(id, data);
      return { success: true };
    }),

  deleteActivityPreset: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteActivityPreset(input.id);
      return { success: true };
    }),

  // ─── Integrations ──────────────────────────────────────────────────────────
  listIntegrations: protectedProcedure.query(async () => {
    return listLeadIntegrations();
  }),

  createIntegration: protectedProcedure
    .input(z.object({
      type: z.enum(["meta", "website"]),
      name: z.string().min(1),
      config: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      return createLeadIntegration(input);
    }),

  updateIntegration: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      config: z.record(z.unknown()).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateLeadIntegration(id, data);
      return { success: true };
    }),

  deleteIntegration: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteLeadIntegration(input.id);
      return { success: true };
    }),

  regenerateToken: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const token = await regenerateWebhookToken(input.id);
      return { webhookToken: token };
    }),

  // ─── Permissions ───────────────────────────────────────────────────────────
  listPermissions: protectedProcedure.query(async () => {
    return getLeadsPermissions();
  }),

  listAllUsers: protectedProcedure.query(async () => {
    return getAllUsersForPermissions();
  }),

  upsertPermission: protectedProcedure
    .input(z.object({
      userId: z.number(),
      canView: z.boolean().optional(),
      canCreate: z.boolean().optional(),
      canEdit: z.boolean().optional(),
      canDelete: z.boolean().optional(),
      canExport: z.boolean().optional(),
      canImport: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { userId, ...perms } = input;
      await upsertLeadsPermission(userId, perms);
      return { success: true };
    }),

  // ─── Export ────────────────────────────────────────────────────────────────
  exportLeads: protectedProcedure.query(async () => {
    const rows = await exportAllLeads();
    return rows;
  }),

  // ─── Meta Sync ─────────────────────────────────────────────────────────────
  syncMeta: protectedProcedure
    .input(z.object({ integrationId: z.number().optional() }))
    .mutation(async ({ input }) => {
      const { syncAllMetaIntegrations, syncOneIntegrationById } = await import("../metaLeadSync");
      if (input.integrationId) {
        const result = await syncOneIntegrationById(input.integrationId);
        return { results: [result] };
      }
      const results = await syncAllMetaIntegrations();
      return { results };
    }),
});
