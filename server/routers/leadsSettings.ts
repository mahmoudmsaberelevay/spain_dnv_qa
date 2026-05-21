import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  listLeadSources, createLeadSource, updateLeadSource, deleteLeadSource,
  listLeadIntegrations, createLeadIntegration, updateLeadIntegration,
  deleteLeadIntegration, regenerateWebhookToken,
  getLeadsPermissions, getAllUsersForPermissions, upsertLeadsPermission,
  exportAllLeads,
} from "../leadsSettingsDb";

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
});
