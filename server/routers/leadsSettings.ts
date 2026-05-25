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
      config: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      return createLeadIntegration(input);
    }),

  updateIntegration: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
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

  // ─── Meta Forms Management ─────────────────────────────────────────────────────
  listMetaForms: protectedProcedure
    .input(z.object({ integrationId: z.number() }))
    .query(async ({ input }) => {
      const db = await (await import("../db")).getDb();
      if (!db) throw new Error("DB not available");
      const { leadIntegrations } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [integration] = await db.select().from(leadIntegrations).where(eq(leadIntegrations.id, input.integrationId)).limit(1);
      if (!integration) throw new Error("Integration not found");
      const config = integration.config ? JSON.parse(integration.config) : {};
      const { page_access_token: accessToken, page_id: pageId, excluded_forms: excludedFormsRaw } = config;
      if (!accessToken || !pageId) throw new Error("Integration not configured with token and page ID");
      const excludedForms: string[] = Array.isArray(excludedFormsRaw) ? excludedFormsRaw : [];
      const params = new URLSearchParams({ access_token: accessToken, fields: "id,name,status,leads_count", limit: "100" });
      const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/leadgen_forms?${params.toString()}`);
      const json = await res.json() as { data?: Array<{ id: string; name: string; status: string; leads_count?: number }>; error?: { message: string } };
      if (json.error) throw new Error(json.error.message);
      const forms = (json.data ?? []).map(f => ({
        id: f.id,
        name: f.name,
        status: f.status,
        leadsCount: f.leads_count ?? 0,
        connected: !excludedForms.includes(f.id),
      }));
      return { forms, lastSyncAt: integration.lastSyncAt, lastSyncCount: integration.lastSyncCount };
    }),

  toggleMetaForm: protectedProcedure
    .input(z.object({ integrationId: z.number(), formId: z.string(), connected: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await (await import("../db")).getDb();
      if (!db) throw new Error("DB not available");
      const { leadIntegrations } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [integration] = await db.select().from(leadIntegrations).where(eq(leadIntegrations.id, input.integrationId)).limit(1);
      if (!integration) throw new Error("Integration not found");
      const config = integration.config ? JSON.parse(integration.config) : {};
      let excludedForms: string[] = Array.isArray(config.excluded_forms) ? config.excluded_forms : [];
      if (input.connected) {
        excludedForms = excludedForms.filter((id: string) => id !== input.formId);
      } else {
        if (!excludedForms.includes(input.formId)) excludedForms.push(input.formId);
      }
      const updatedConfig = { ...config, excluded_forms: excludedForms };
      await db.update(leadIntegrations).set({ config: JSON.stringify(updatedConfig), updatedAt: Date.now() }).where(eq(leadIntegrations.id, input.integrationId));
      return { success: true };
    }),

  // ─── Per-Form Lead Source Override ──────────────────────────────────────────
  setFormLeadSource: protectedProcedure
    .input(z.object({ integrationId: z.number(), formId: z.string(), leadSource: z.string() }))
    .mutation(async ({ input }) => {
      const db = await (await import("../db")).getDb();
      if (!db) throw new Error("DB not available");
      const { leadIntegrations } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [integration] = await db.select().from(leadIntegrations).where(eq(leadIntegrations.id, input.integrationId)).limit(1);
      if (!integration) throw new Error("Integration not found");
      const config = integration.config ? JSON.parse(integration.config) : {};
      const formSources: Record<string, string> = config.form_sources ?? {};
      if (input.leadSource.trim()) {
        formSources[input.formId] = input.leadSource.trim();
      } else {
        delete formSources[input.formId];
      }
      const updatedConfig = { ...config, form_sources: formSources };
      await db.update(leadIntegrations).set({ config: JSON.stringify(updatedConfig), updatedAt: Date.now() }).where(eq(leadIntegrations.id, input.integrationId));
      return { success: true };
    }),

  // ─── Meta Sync ───────────────────────────────────────────────────────────────
  syncMeta: protectedProcedure   .input(z.object({ integrationId: z.number().optional() }))
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
