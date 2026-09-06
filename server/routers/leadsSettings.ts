import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { leadIntegrations, leads, metaCrmEventLog, metaIntegrationMappings, metaWebhookInbox } from "../../drizzle/schema";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  getMetaIntegrationHealth,
  retryMetaCrmEvent,
  runMetaReconciliation,
} from "../metaLeadsService";
import {
  applyMetaAssignmentBackfill,
  collectMetaMonitoringSnapshot,
  getMetaAssignmentBackfillDryRun,
  getPrivacySafeMetaMonitoring,
  resolveMetaDefaultConsultant,
} from "../metaAssignmentMonitoring";
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

const META_SECRET_CONFIG_KEYS = new Set([
  "access_token",
  "page_access_token",
  "app_secret",
  "client_secret",
  "capi_token",
  "conversions_api_token",
  "verify_token",
  "webhook_verify_token",
]);

function scrubMetaConfig(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config).filter(([key]) => !META_SECRET_CONFIG_KEYS.has(key.toLowerCase())));
}

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
    const integrations = await listLeadIntegrations();
    return integrations.map(integration => {
      let config: Record<string, unknown> = {};
      try { config = integration.config ? JSON.parse(integration.config) : {}; } catch { config = {}; }
      const hasMetaPageAccessToken = integration.type === "meta" && Boolean(
        process.env.META_PAGE_ACCESS_TOKEN || config.page_access_token || config.access_token,
      );
      const hasMetaWebhookVerifyToken = integration.type === "meta" && Boolean(
        process.env.META_WEBHOOK_VERIFY_TOKEN || config.verify_token || integration.webhookToken,
      );
      const publicConfig = integration.type === "meta" ? scrubMetaConfig(config) : config;
      return {
        ...integration,
        webhookToken: integration.type === "meta" ? "" : integration.webhookToken,
        config: JSON.stringify(publicConfig),
        hasMetaPageAccessToken,
        hasMetaWebhookVerifyToken,
      };
    });
  }),

  createIntegration: protectedProcedure
    .input(z.object({
      type: z.enum(["meta", "website"]),
      name: z.string().min(1),
      config: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.type === "meta" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can configure Meta integrations" });
      }
      const config = input.type === "meta"
        ? scrubMetaConfig({ ...(input.config || {}) })
        : { ...(input.config || {}) };
      return createLeadIntegration({ ...input, config });
    }),

  updateIntegration: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [existing] = await db.select({
        type: leadIntegrations.type,
        config: leadIntegrations.config,
      }).from(leadIntegrations).where(eq(leadIntegrations.id, input.id)).limit(1);
      if (existing?.type === "meta" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can configure Meta integrations" });
      }
      const { id, ...data } = input;
      if (data.config && existing?.type === "meta") {
        let existingConfig: Record<string, unknown> = {};
        try { existingConfig = existing.config ? JSON.parse(existing.config) : {}; } catch { existingConfig = {}; }
        data.config = { ...existingConfig, ...scrubMetaConfig(data.config) };
      }
      await updateLeadIntegration(id, data);
      return { success: true };
    }),

  deleteIntegration: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [existing] = await db.select({ type: leadIntegrations.type }).from(leadIntegrations).where(eq(leadIntegrations.id, input.id)).limit(1);
      if (existing?.type === "meta" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can configure Meta integrations" });
      }
      await deleteLeadIntegration(input.id);
      return { success: true };
    }),

  regenerateToken: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [existing] = await db.select({ type: leadIntegrations.type })
        .from(leadIntegrations)
        .where(eq(leadIntegrations.id, input.id))
        .limit(1);
      if (existing?.type === "meta") {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        throw new TRPCError({ code: "FORBIDDEN", message: "Meta webhook verification credentials are managed server-side" });
      }
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
  listMetaForms: adminProcedure
    .input(z.object({ integrationId: z.number() }))
    .query(async ({ input }) => {
      const db = await (await import("../db")).getDb();
      if (!db) throw new Error("DB not available");
      const { leadIntegrations } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [integration] = await db.select().from(leadIntegrations).where(eq(leadIntegrations.id, input.integrationId)).limit(1);
      if (!integration) throw new Error("Integration not found");
      const config = integration.config ? JSON.parse(integration.config) : {};
      const accessToken = process.env.META_PAGE_ACCESS_TOKEN || config.page_access_token || config.access_token;
      const pageId = process.env.META_PAGE_ID || config.page_id;
      const excludedFormsRaw = config.excluded_forms;
      if (!accessToken || !pageId) throw new Error("Integration not configured with token and page ID");
      const excludedForms: string[] = Array.isArray(excludedFormsRaw) ? excludedFormsRaw : [];
      const params = new URLSearchParams({ access_token: accessToken, fields: "id,name,status,leads_count", limit: "100" });
      const graphVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
      const res = await fetch(`https://graph.facebook.com/${graphVersion}/${pageId}/leadgen_forms?${params.toString()}`);
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

  toggleMetaForm: adminProcedure
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
  setFormLeadSource: adminProcedure
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
  syncMeta: adminProcedure   .input(z.object({ integrationId: z.number().optional() }))
    .mutation(async ({ input }) => {
      const { syncAllMetaIntegrations, syncOneIntegrationById } = await import("../metaLeadSync");
      if (input.integrationId) {
        const result = await syncOneIntegrationById(input.integrationId);
        return { results: [result] };
      }
      const results = await syncAllMetaIntegrations();
      return { results };
    }),

  metaAdmin: router({
    health: adminProcedure.query(async () => getMetaIntegrationHealth()),

    monitoring: adminProcedure.query(async () => collectMetaMonitoringSnapshot()),

    assignmentPolicy: adminProcedure.query(async () => {
      const policy = await resolveMetaDefaultConsultant();
      return policy.status === "resolved"
        ? { status: policy.status, consultant: { id: policy.id, name: policy.name }, backfillBaselineAt: policy.backfillBaselineAt }
        : { status: policy.status, safeCode: policy.safeCode, candidates: policy.candidates };
    }),

    assignmentBackfillDryRun: adminProcedure.query(async () => getMetaAssignmentBackfillDryRun()),

    runAssignmentBackfill: adminProcedure.mutation(async () => applyMetaAssignmentBackfill()),

    privacySafeMonitoring: adminProcedure
      .input(z.object({
        dateFrom: z.number().optional(),
        dateTo: z.number().optional(),
        program: z.string().optional(),
        campaignId: z.string().optional(),
        adSetId: z.string().optional(),
        adId: z.string().optional(),
        formId: z.string().optional(),
        consultant: z.string().optional(),
        leadStatus: z.string().optional(),
        metaSyncStatus: z.enum(["pending", "sent", "failed", "retrying", "manual_review", "approval_gated"]).optional(),
        metaEventStatus: z.string().optional(),
        testLeadStatus: z.enum(["real", "test", "all"]).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }).optional())
      .query(async ({ input }) => getPrivacySafeMetaMonitoring(input || {})),

    listMappings: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      return db.select().from(metaIntegrationMappings)
        .orderBy(metaIntegrationMappings.mappingType, metaIntegrationMappings.priority, metaIntegrationMappings.matchName);
    }),

    createMapping: adminProcedure
      .input(z.object({
        mappingKey: z.string().min(1).max(255),
        mappingType: z.enum(["form", "campaign", "adset", "ad", "page", "crm_stage"]),
        matchValue: z.string().min(1).max(255),
        matchName: z.string().max(255).optional(),
        program: z.string().max(150).optional(),
        outputValue: z.string().max(255).optional(),
        priority: z.number().int().min(0).max(10000).default(100),
        isActive: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const timestamp = Date.now();
        await db.insert(metaIntegrationMappings).values({
          ...input,
          matchName: input.matchName || null,
          program: input.program || null,
          outputValue: input.outputValue || null,
          createdBy: ctx.user.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        return { success: true };
      }),

    updateMapping: adminProcedure
      .input(z.object({
        id: z.number(),
        matchName: z.string().max(255).nullable().optional(),
        program: z.string().max(150).nullable().optional(),
        outputValue: z.string().max(255).nullable().optional(),
        priority: z.number().int().min(0).max(10000).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const { id, ...updates } = input;
        await db.update(metaIntegrationMappings).set({ ...updates, updatedAt: Date.now() }).where(eq(metaIntegrationMappings.id, id));
        return { success: true };
      }),

    deleteMapping: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await db.delete(metaIntegrationMappings).where(eq(metaIntegrationMappings.id, input.id));
        return { success: true };
      }),

    diagnostics: adminProcedure
      .input(z.object({
        dateFrom: z.number().optional(),
        dateTo: z.number().optional(),
        program: z.string().optional(),
        campaign: z.string().optional(),
        adset: z.string().optional(),
        ad: z.string().optional(),
        formId: z.string().optional(),
        consultant: z.string().optional(),
        leadStatus: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        const eventConditions = [eq(metaCrmEventLog.isTestLead, false)];
        const leadConditions = [eq(leads.isMetaTestLead, false)];
        if (input?.dateFrom) {
          eventConditions.push(gte(metaCrmEventLog.eventTime, Math.floor(input.dateFrom / 1000)));
          leadConditions.push(gte(leads.createdAt, input.dateFrom));
        }
        if (input?.dateTo) {
          eventConditions.push(lte(metaCrmEventLog.eventTime, Math.floor(input.dateTo / 1000)));
          leadConditions.push(lte(leads.createdAt, input.dateTo));
        }
        if (input?.program) leadConditions.push(eq(leads.interestedProgram, input.program));
        if (input?.campaign) leadConditions.push(eq(leads.metaCampaign, input.campaign));
        if (input?.adset) leadConditions.push(eq(leads.metaAdset, input.adset));
        if (input?.ad) leadConditions.push(eq(leads.metaAd, input.ad));
        if (input?.formId) leadConditions.push(eq(leads.metaFormId, input.formId));
        if (input?.consultant) leadConditions.push(eq(leads.assignedTo, input.consultant));
        if (input?.leadStatus) leadConditions.push(sql`${leads.stage} = ${input.leadStatus}`);
        const eventWhere = eventConditions.length ? and(...eventConditions) : undefined;
        const leadWhere = leadConditions.length ? and(...leadConditions) : undefined;
        const eventWithLeadWhere = and(eventWhere, leadWhere);
        const failedWhere = and(eventWithLeadWhere, sql`${metaCrmEventLog.status} IN ('failed','dead_letter','manual_review','approval_gated')`);
        const [eventByStatus, eventByName, inboxByStatus, recentFailures, leadTotals, eventTotals, pendingEventStats] = await Promise.all([
          db.select({ status: metaCrmEventLog.status, total: count() }).from(metaCrmEventLog).innerJoin(leads, eq(leads.id, metaCrmEventLog.leadId)).where(eventWithLeadWhere).groupBy(metaCrmEventLog.status),
          db.select({ eventName: metaCrmEventLog.eventName, total: count() }).from(metaCrmEventLog).innerJoin(leads, eq(leads.id, metaCrmEventLog.leadId)).where(eventWithLeadWhere).groupBy(metaCrmEventLog.eventName),
          db.select({ status: metaWebhookInbox.status, total: count() }).from(metaWebhookInbox).where(eq(metaWebhookInbox.isTestLead, false)).groupBy(metaWebhookInbox.status),
          db.select({
            id: metaCrmEventLog.id,
            leadId: metaCrmEventLog.leadId,
            eventName: metaCrmEventLog.eventName,
            eventTime: metaCrmEventLog.eventTime,
            eventId: metaCrmEventLog.eventId,
            status: metaCrmEventLog.status,
            attempts: metaCrmEventLog.attempts,
            errorCode: metaCrmEventLog.errorCode,
            lastError: metaCrmEventLog.lastError,
            deliveryMode: metaCrmEventLog.deliveryMode,
            testEventCodeUsed: metaCrmEventLog.testEventCodeUsed,
            productionGateEnabledAtAttempt: metaCrmEventLog.productionGateEnabledAtAttempt,
            requestDispatchedAt: metaCrmEventLog.requestDispatchedAt,
            metaResponseReceiptId: metaCrmEventLog.metaResponseReceiptId,
            deliveryEvidenceCode: metaCrmEventLog.deliveryEvidenceCode,
            updatedAt: metaCrmEventLog.updatedAt,
          }).from(metaCrmEventLog).innerJoin(leads, eq(leads.id, metaCrmEventLog.leadId))
            .where(failedWhere)
            .orderBy(desc(metaCrmEventLog.updatedAt)).limit(25),
          db.select({
            total: count(),
            metaLeads: sql<number>`SUM(CASE WHEN ${leads.metaLeadId} IS NOT NULL OR EXISTS (SELECT 1 FROM lead_meta_attributions a WHERE a.leadId = ${leads.id} AND a.isTestLead = 0) THEN 1 ELSE 0 END)`,
            averageWebhookDelaySeconds: sql<number>`AVG(CASE WHEN ${leads.metaLeadCreatedAt} IS NOT NULL AND ${leads.firstReceivedAt} IS NOT NULL THEN (${leads.firstReceivedAt} - ${leads.metaLeadCreatedAt}) / 1000 END)`,
          }).from(leads).where(and(leadWhere, sql`(${leads.metaLeadId} IS NOT NULL OR EXISTS (SELECT 1 FROM lead_meta_attributions a WHERE a.leadId = ${leads.id} AND a.isTestLead = 0))`)),
          db.select({
            total: count(),
            sent: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.status} = 'sent' THEN 1 ELSE 0 END)`,
            productionSent: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.status} = 'sent' AND ${metaCrmEventLog.deliveryMode} = 'production' THEN 1 ELSE 0 END)`,
            testSent: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.status} = 'sent' AND ${metaCrmEventLog.deliveryMode} = 'test' THEN 1 ELSE 0 END)`,
            legacyUnknownSent: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.status} = 'sent' AND (${metaCrmEventLog.deliveryMode} IS NULL OR ${metaCrmEventLog.deliveryMode} = 'legacy_unknown') THEN 1 ELSE 0 END)`,
            approvalGated: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.status} = 'approval_gated' THEN 1 ELSE 0 END)`,
            covered: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.hasLeadId} OR ${metaCrmEventLog.hasEmailHash} OR ${metaCrmEventLog.hasPhoneHash} THEN 1 ELSE 0 END)`,
            leadIdCovered: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.hasLeadId} THEN 1 ELSE 0 END)`,
            emailCovered: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.hasEmailHash} THEN 1 ELSE 0 END)`,
            phoneCovered: sql<number>`SUM(CASE WHEN ${metaCrmEventLog.hasPhoneHash} THEN 1 ELSE 0 END)`,
            averageDelaySeconds: sql<number>`AVG(CASE WHEN ${metaCrmEventLog.sentAt} IS NOT NULL THEN (${metaCrmEventLog.sentAt} / 1000) - ${metaCrmEventLog.eventTime} END)`,
          }).from(metaCrmEventLog).innerJoin(leads, eq(leads.id, metaCrmEventLog.leadId)).where(eventWithLeadWhere),
          db.select({
            total: count(),
            oldestEventTime: sql<number>`MIN(${metaCrmEventLog.eventTime})`,
            nextRetryAt: sql<number>`MIN(${metaCrmEventLog.nextAttemptAt})`,
          }).from(metaCrmEventLog).innerJoin(leads, eq(leads.id, metaCrmEventLog.leadId)).where(and(
            eventWithLeadWhere,
            inArray(metaCrmEventLog.status, ["pending", "retrying"]),
          )),
        ]);
        const leadSummary = leadTotals[0];
        const eventSummary = eventTotals[0];
        const byName = Object.fromEntries(eventByName.map(row => [row.eventName, Number(row.total || 0)]));
        const metaLeads = Number(leadSummary?.metaLeads || 0);
        const qualified = Number(byName["Marketing Qualified Lead"] || 0);
        const converted = Number(byName.Converted || 0);
        const eventTotal = Number(eventSummary?.total || 0);
        const pendingTotal = Number(pendingEventStats[0]?.total || 0);
        const oldestPendingEventTime = pendingEventStats[0]?.oldestEventTime ? Number(pendingEventStats[0].oldestEventTime) : null;
        return {
          eventByStatus,
          eventByName,
          inboxByStatus,
          recentFailures,
          summary: {
            totalLeads: Number(leadSummary?.total || 0),
            metaLeads,
            qualified,
            converted,
            qualificationRate: metaLeads ? qualified / metaLeads : 0,
            meetingToSigningRate: qualified ? converted / qualified : 0,
            conversionRate: metaLeads ? converted / metaLeads : 0,
            sendSuccessRate: eventTotal ? Number(eventSummary?.sent || 0) / eventTotal : 0,
            productionSent: Number(eventSummary?.productionSent || 0),
            testSent: Number(eventSummary?.testSent || 0),
            legacyUnknownSent: Number(eventSummary?.legacyUnknownSent || 0),
            approvalGated: Number(eventSummary?.approvalGated || 0),
            pendingEvents: pendingTotal,
            oldestPendingEventTime,
            oldestPendingAgeSeconds: oldestPendingEventTime ? Math.max(0, Math.floor(Date.now() / 1000) - oldestPendingEventTime) : null,
            pendingNextRetryAt: pendingEventStats[0]?.nextRetryAt ? Number(pendingEventStats[0].nextRetryAt) : null,
            pendingNextAction: pendingTotal === 0 ? "No pending CRM events" : "Awaiting scheduled delivery or retry evaluation",
            matchCoverage: eventTotal ? Number(eventSummary?.covered || 0) / eventTotal : 0,
            leadIdCoverage: eventTotal ? Number(eventSummary?.leadIdCovered || 0) / eventTotal : 0,
            emailHashCoverage: eventTotal ? Number(eventSummary?.emailCovered || 0) / eventTotal : 0,
            phoneHashCoverage: eventTotal ? Number(eventSummary?.phoneCovered || 0) / eventTotal : 0,
            averageWebhookDelaySeconds: Number(leadSummary?.averageWebhookDelaySeconds || 0),
            averageDelaySeconds: Number(eventSummary?.averageDelaySeconds || 0),
          },
        };
      }),

    runReconciliation: adminProcedure
      .input(z.object({ limit: z.number().int().min(1).max(500).default(200) }).optional())
      .mutation(async ({ input }) => runMetaReconciliation({ limit: input?.limit || 200 })),

    retryTestEvent: adminProcedure
      .input(z.object({ eventLogId: z.number(), testEventCode: z.string().min(1).max(100) }))
      .mutation(async ({ input }) => retryMetaCrmEvent(input.eventLogId, input.testEventCode)),
  }),
});
