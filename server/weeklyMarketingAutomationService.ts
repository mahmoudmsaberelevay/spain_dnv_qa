import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { requestAnthropicJson, requestOpenAiJson, specialistOpinionJsonSchema, specialistOpinionSchema, type SpecialistOpinion } from "./aiCouncilProviders";
import {
  marketingAutopilotControls,
  marketingBrandBooks,
  marketingDesignSystemAssets,
  marketingKnowledgeClaims,
  marketingKnowledgeSources,
  marketingInternalProgrammeReferences,
  marketingProviderProfiles,
  marketingWeeklyAutomationBudgetLedger,
  marketingWeeklyAutomationControls,
  marketingWeeklyAutomationJobs,
  marketingWeeklyResultsItemEvents,
  marketingWeeklyResultsItems,
  marketingWeeklyResultsPerformanceSnapshots,
  marketingWeeklyResultsPlans,
  marketingWeeklyResultsPreferenceMemories,
  marketingWeeklyResultsSettings,
} from "../drizzle/schema";
import { findDisallowedWeeklyResultsData, isSaturdayDate, normalizeWeeklyResultsText } from "../shared/marketingWeeklyResults";
import {
  automationMonthKey,
  WEEKLY_AUTOMATION_CONTROL_KEY,
  WEEKLY_AUTOMATION_MONTHLY_CAP_USD,
  WEEKLY_AUTOMATION_PER_RUN_RESERVE_USD,
  weeklyAutomationPlanJsonSchema,
  weeklyAutomationPlanSchema,
  type WeeklyAutomationPlanOutput,
} from "../shared/marketingWeeklyAutomation";
import { isCreativeItemType, isVisualTextCreativeItemType, validateArabicOnlyMarketingText, validateEnglishOnlyOnScreenText } from "../shared/marketingCreativeLanguagePolicy";

const REQUIRED_ALIASES = ["openai-editorial", "editorial-challenge", "manus-orchestrator"] as const;
const CAIRO = "Africa/Cairo";
const MANUS_WEEKLY_CALLBACK_URL = process.env.MANUS_MARKETING_WEBHOOK_URL || "https://elevay.vip/api/webhooks/marketing/manus";

type AutomationControl = typeof marketingWeeklyAutomationControls.$inferSelect;
type AutomationJob = typeof marketingWeeklyAutomationJobs.$inferSelect;

function asJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function requireDb() {
  return getDb().then(db => {
    if (!db) throw new Error("Marketing automation database is unavailable.");
    return db;
  });
}

function weeklyPlanKey() {
  return `mwr-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 10)}`;
}
function automationJobKey() {
  return `mwa-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 10)}`;
}

export function cairoPeriodStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CAIRO, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday"));
  const base = new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day")), 12));
  base.setUTCDate(base.getUTCDate() - ((weekday + 1) % 7));
  return base.toISOString().slice(0, 10);
}

export function isConfiguredCairoAutomationHour(settings: { prepareDayOfWeek: number; prepareStartTime: string }, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CAIRO, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday"));
  const [hour, minute] = settings.prepareStartTime.split(":").map(Number);
  return weekday === settings.prepareDayOfWeek && Number(part("hour")) === hour && Number(part("minute")) === minute;
}

function activeDesignAssetsPresent(rows: Array<typeof marketingDesignSystemAssets.$inferSelect>) {
  return rows.some(row => row.assetType === "design_instruction") && rows.some(row => row.assetType === "logo");
}

function redactError(error: unknown) {
  const message = error instanceof Error ? error.message : "Provider request failed.";
  return message.replace(/(?:sk-|key-|Bearer\s+)[A-Za-z0-9._-]+/g, "[redacted]").slice(0, 500);
}

function boundedInternalReferenceAnalysis(value: string) {
  const parsed = asJson<Record<string, unknown>>(value, {});
  const bounded = (key: string, limit: number) => {
    const candidate = parsed[key];
    if (typeof candidate === "string") return candidate.slice(0, limit);
    if (Array.isArray(candidate)) return JSON.stringify(candidate.slice(0, 12)).slice(0, limit);
    if (candidate && typeof candidate === "object") return JSON.stringify(candidate).slice(0, limit);
    return null;
  };
  return {
    executiveSummary: bounded("executive_summary", 7_000),
    programmes: bounded("programmes", 12_000),
    criticalReviewFlags: bounded("critical_review_flags", 4_000),
    recommendedOfficialVerificationTopics: bounded("recommended_official_verification_topics", 4_000),
  };
}

function selectedProgrammeKeys(settings: typeof marketingWeeklyResultsSettings.$inferSelect | null) {
  if (!settings) return [];
  return asJson<Array<{ key?: unknown }>>(settings.programPrioritiesJson, [])
    .map(priority => typeof priority?.key === "string" ? priority.key.trim() : "")
    .filter(Boolean);
}

async function readAutomationContext() {
  const db = await requireDb();
  const [settingsRows, controls, brandBooks, designAssets, profiles, claims, internalReferences, preferences, performance] = await Promise.all([
    db.select().from(marketingWeeklyResultsSettings).where(eq(marketingWeeklyResultsSettings.settingsKey, "primary-weekly-results")).limit(1),
    db.select().from(marketingWeeklyAutomationControls).where(eq(marketingWeeklyAutomationControls.controlKey, WEEKLY_AUTOMATION_CONTROL_KEY)).limit(1),
    db.select().from(marketingBrandBooks).where(eq(marketingBrandBooks.status, "active")).orderBy(desc(marketingBrandBooks.version)).limit(1),
    db.select().from(marketingDesignSystemAssets).where(eq(marketingDesignSystemAssets.isActive, true)).orderBy(desc(marketingDesignSystemAssets.updatedAt)).limit(20),
    db.select().from(marketingProviderProfiles).where(inArray(marketingProviderProfiles.alias, [...REQUIRED_ALIASES])),
    db.select({ id: marketingKnowledgeClaims.id, programKey: marketingKnowledgeClaims.programKey, claimText: marketingKnowledgeClaims.claimText, claimType: marketingKnowledgeClaims.claimType, sourceSnapshotHash: marketingKnowledgeClaims.sourceSnapshotHash })
      .from(marketingKnowledgeClaims).innerJoin(marketingKnowledgeSources, eq(marketingKnowledgeClaims.sourceId, marketingKnowledgeSources.id))
      .where(and(eq(marketingKnowledgeClaims.status, "approved"), eq(marketingKnowledgeSources.status, "approved"), eq(marketingKnowledgeSources.changeState, "tracked")))
      .orderBy(marketingKnowledgeClaims.programKey, desc(marketingKnowledgeClaims.updatedAt)).limit(120),
    db.select({ id: marketingInternalProgrammeReferences.id, referenceKey: marketingInternalProgrammeReferences.referenceKey, programKeysJson: marketingInternalProgrammeReferences.programKeysJson, title: marketingInternalProgrammeReferences.title, sourceClassification: marketingInternalProgrammeReferences.sourceClassification, status: marketingInternalProgrammeReferences.status, documentHash: marketingInternalProgrammeReferences.documentHash, analysisJson: marketingInternalProgrammeReferences.analysisJson })
      .from(marketingInternalProgrammeReferences)
      .where(eq(marketingInternalProgrammeReferences.status, "internal_reference_only"))
      .orderBy(desc(marketingInternalProgrammeReferences.updatedAt)).limit(12),
    db.select().from(marketingWeeklyResultsPreferenceMemories).where(eq(marketingWeeklyResultsPreferenceMemories.status, "active")).orderBy(desc(marketingWeeklyResultsPreferenceMemories.updatedAt)).limit(80),
    db.select().from(marketingWeeklyResultsPerformanceSnapshots).orderBy(desc(marketingWeeklyResultsPerformanceSnapshots.periodStart), desc(marketingWeeklyResultsPerformanceSnapshots.recordedAt)).limit(8),
  ]);
  const settings = settingsRows[0] ?? null;
  const control = controls[0] ?? null;
  const brandBook = brandBooks[0] ?? null;
  const selectedProgrammes = selectedProgrammeKeys(settings);
  const normalizedInternalReferences = internalReferences.map(reference => ({
    ...reference,
    programKeys: asJson<string[]>(reference.programKeysJson, []),
    analysis: boundedInternalReferenceAnalysis(reference.analysisJson),
  }));
  const missingInternalReferenceProgrammes = selectedProgrammes.filter(programmeKey => !normalizedInternalReferences.some(reference => reference.programKeys.includes(programmeKey)));
  const profileByAlias = new Map(profiles.map(profile => [profile.alias, profile]));
  const providerReady = REQUIRED_ALIASES.every(alias => {
    const profile = profileByAlias.get(alias);
    return profile?.isEnabled && !profile.killSwitchEnabled;
  });
  const blockers = [
    !settings ? "Weekly Settings have not been saved." : null,
    settings && !settings.preparationScheduleEnabled ? "The weekly preparation schedule is disabled in Settings." : null,
    settings && !/^([01]\d|2[0-3]):00$/.test(settings.prepareStartTime) ? "Choose a whole-hour Cairo preparation time (for example 08:00)." : null,
    !brandBook ? "Complete and activate the owner-approved Brand Book first." : null,
    !activeDesignAssetsPresent(designAssets) ? "An active Design System document and official logo are both required." : null,
    normalizedInternalReferences.length === 0 ? "Add an owner-provided internal programme reference before automated review material can be prepared." : null,
    missingInternalReferenceProgrammes.length > 0 ? `No owner-provided internal reference covers: ${missingInternalReferenceProgrammes.join(", ")}.` : null,
    !ENV.openAiApiKey ? "OpenAI server credential is unavailable." : null,
    !ENV.anthropicApiKey ? "Anthropic server credential is unavailable." : null,
    !ENV.manusApiKey ? "Manus server credential is unavailable." : null,
    control && Number(control.monthlyBudgetUsd) > WEEKLY_AUTOMATION_MONTHLY_CAP_USD ? "The internal monthly cap cannot exceed USD 100." : null,
    providerReady ? null : "The three weekly planning provider profiles are not all enabled for the bounded automation engine.",
  ].filter((value): value is string => Boolean(value));
  return { db, settings, control, brandBook, designAssets, claims, internalReferences: normalizedInternalReferences, selectedProgrammes, missingInternalReferenceProgrammes, preferences, performance, profiles, providerReady, blockers };
}

export async function getWeeklyAutomationReadiness() {
  const context = await readAutomationContext();
  const month = automationMonthKey();
  const spentRows = await context.db.select({ total: sql<string>`COALESCE(SUM(${marketingWeeklyAutomationBudgetLedger.amountUsd}), 0)` })
    .from(marketingWeeklyAutomationBudgetLedger).where(eq(marketingWeeklyAutomationBudgetLedger.periodKey, month));
  const jobs = await context.db.select().from(marketingWeeklyAutomationJobs).orderBy(desc(marketingWeeklyAutomationJobs.createdAt)).limit(24);
  return {
    control: context.control ? {
      isEnabled: context.control.isEnabled, state: context.control.state, monthlyBudgetUsd: Number(context.control.monthlyBudgetUsd), perRunReserveUsd: Number(context.control.perRunReserveUsd),
      scheduleTaskUid: context.control.scheduleTaskUid, manusWebhookId: context.control.manusWebhookId, lastRunAt: context.control.lastRunAt, lastRunStatus: context.control.lastRunStatus, lastError: context.control.lastError,
    } : { isEnabled: false, state: "disabled", monthlyBudgetUsd: WEEKLY_AUTOMATION_MONTHLY_CAP_USD, perRunReserveUsd: WEEKLY_AUTOMATION_PER_RUN_RESERVE_USD, scheduleTaskUid: null, manusWebhookId: null, lastRunAt: null, lastRunStatus: null, lastError: null },
    blockers: context.blockers,
    readiness: { brandBook: Boolean(context.brandBook), designSystem: activeDesignAssetsPresent(context.designAssets), providerProfiles: context.providerReady, ownerProvidedInternalReferences: context.internalReferences.length, missingInternalReferenceProgrammes: context.missingInternalReferenceProgrammes, approvedClaims: context.claims.length, budgetUsedUsd: Number(spentRows[0]?.total ?? 0), month },
    jobs: jobs.map(job => ({ id: job.id, jobKey: job.jobKey, periodStart: job.periodStart, triggerType: job.triggerType, state: job.state, planId: job.planId, manusTaskUrl: job.manusTaskUrl, errorCode: job.errorCode, errorSummary: job.errorSummary, createdAt: job.createdAt, completedAt: job.completedAt, reservedCostUsd: Number(job.reservedCostUsd), attachments: asJson<Array<{ file_name?: string; url?: string; size_bytes?: number }>>(job.attachmentsJson, []) })),
  };
}

async function ensureManusWeeklyWebhook() {
  if (!ENV.manusApiKey) throw new Error("Manus server credential is unavailable.");
  const headers = { "x-manus-api-key": ENV.manusApiKey, "Content-Type": "application/json" };
  const listed = await fetch("https://api.manus.ai/v2/webhook.list", { headers });
  if (!listed.ok) throw new Error(`Manus webhook verification failed with status ${listed.status}.`);
  const payload = await listed.json() as { data?: Array<{ webhook_id?: string; id?: string; url?: string }> };
  const existing = payload.data?.find(webhook => webhook.url === MANUS_WEEKLY_CALLBACK_URL);
  if (existing) return existing.webhook_id ?? existing.id ?? null;
  const created = await fetch("https://api.manus.ai/v2/webhook.create", { method: "POST", headers, body: JSON.stringify({ url: MANUS_WEEKLY_CALLBACK_URL }) });
  if (!created.ok) throw new Error(`Manus callback registration failed with status ${created.status}. Publish the CRM route first, then retry activation.`);
  const result = await created.json() as { webhook?: { webhook_id?: string; id?: string } };
  return result.webhook?.webhook_id ?? result.webhook?.id ?? null;
}

export async function enableWeeklyAutomation(input: { actorUserId: number; monthlyBudgetUsd?: number; perRunReserveUsd?: number }) {
  const initial = await readAutomationContext();
  const cap = Math.min(WEEKLY_AUTOMATION_MONTHLY_CAP_USD, Math.max(1, input.monthlyBudgetUsd ?? WEEKLY_AUTOMATION_MONTHLY_CAP_USD));
  const reserve = Math.min(WEEKLY_AUTOMATION_PER_RUN_RESERVE_USD, Math.max(1, input.perRunReserveUsd ?? WEEKLY_AUTOMATION_PER_RUN_RESERVE_USD));
  if (initial.blockers.filter(blocker => !blocker.includes("provider profiles")).length > 0) throw new Error(initial.blockers.join(" "));
  const manusWebhookId = await ensureManusWeeklyWebhook();
  const now = Date.now();
  await initial.db.transaction(async tx => {
    await tx.insert(marketingWeeklyAutomationControls).values({ controlKey: WEEKLY_AUTOMATION_CONTROL_KEY, isEnabled: true, state: "active", monthlyBudgetUsd: cap.toFixed(2), perRunReserveUsd: reserve.toFixed(2), scheduleTaskUid: null, manusWebhookId, lastRunAt: null, lastRunStatus: "ready", lastError: null, configuredByUserId: input.actorUserId, createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { isEnabled: true, state: "active", monthlyBudgetUsd: cap.toFixed(2), perRunReserveUsd: reserve.toFixed(2), manusWebhookId, lastRunStatus: "ready", lastError: null, configuredByUserId: input.actorUserId, updatedAt: now } });
    for (const alias of REQUIRED_ALIASES) await tx.update(marketingProviderProfiles).set({ isEnabled: true, killSwitchEnabled: false, status: "bounded_weekly_automation", configuredByUserId: input.actorUserId, updatedAt: now }).where(eq(marketingProviderProfiles.alias, alias));
    await tx.update(marketingAutopilotControls).set({ masterKillSwitchEnabled: false, status: "weekly_production_review_only", lastChangedByUserId: input.actorUserId, updatedAt: now }).where(eq(marketingAutopilotControls.requestedMode, "full_autopilot"));
  });
  return getWeeklyAutomationReadiness();
}

export async function pauseWeeklyAutomation(input: { actorUserId: number; reason: string }) {
  const db = await requireDb(); const now = Date.now();
  await db.transaction(async tx => {
    await tx.update(marketingWeeklyAutomationControls).set({ isEnabled: false, state: "paused", lastRunStatus: "paused", lastError: input.reason.slice(0, 500), configuredByUserId: input.actorUserId, updatedAt: now }).where(eq(marketingWeeklyAutomationControls.controlKey, WEEKLY_AUTOMATION_CONTROL_KEY));
    for (const alias of REQUIRED_ALIASES) await tx.update(marketingProviderProfiles).set({ isEnabled: false, killSwitchEnabled: true, status: "paused", configuredByUserId: input.actorUserId, updatedAt: now }).where(eq(marketingProviderProfiles.alias, alias));
    await tx.update(marketingAutopilotControls).set({ masterKillSwitchEnabled: true, status: "weekly_automation_paused", lastChangedByUserId: input.actorUserId, updatedAt: now }).where(eq(marketingAutopilotControls.requestedMode, "full_autopilot"));
  });
  return getWeeklyAutomationReadiness();
}

async function reserveBudgetOrThrow(db: Awaited<ReturnType<typeof requireDb>>, control: AutomationControl, jobId: number, periodStart: string, now: number) {
  const periodKey = periodStart.slice(0, 7);
  const [monthly] = await db.select({ total: sql<string>`COALESCE(SUM(${marketingWeeklyAutomationBudgetLedger.amountUsd}), 0)` }).from(marketingWeeklyAutomationBudgetLedger).where(eq(marketingWeeklyAutomationBudgetLedger.periodKey, periodKey));
  const reserve = Number(control.perRunReserveUsd);
  if (Number(monthly?.total ?? 0) + reserve > Number(control.monthlyBudgetUsd)) throw new Error("The USD 100 internal monthly automation reservation cap would be exceeded. No provider task was created.");
  await db.insert(marketingWeeklyAutomationBudgetLedger).values({ entryKey: `mwa-reserve-${jobId}`, periodKey, jobId, entryType: "reservation", amountUsd: reserve.toFixed(2), note: "Internal reservation for one bounded weekly planning cycle. Provider invoices may differ and are not automatically reconciled.", createdAt: now });
}

function publicPlanningSnapshot(context: Awaited<ReturnType<typeof readAutomationContext>>, periodStart: string) {
  if (!context.settings || !context.brandBook) throw new Error("Weekly automation prerequisites are incomplete.");
  return {
    periodStart,
    languagePolicy: "All campaign copy, captions, CTAs, scripts and voice-over must be Arabic. On-screen visual text must be English only. Country names may be English in Arabic voice-over scripts. Never include personal, client, Lead, contact, passport, phone or email data.",
    executionBoundary: "Prepare review-ready material only. Do not publish, schedule posts, create or edit campaigns, spend money, send CAPI events, contact people, or mutate CRM records.",
    settings: {
      weeklyGoal: context.settings.weeklyGoal, programPriorities: asJson(context.settings.programPrioritiesJson, []), updatedSourcesNote: context.settings.updatedSourcesNote,
      creativeDirection: context.settings.creativeDirection, contentMix: asJson(context.settings.contentMixJson, {}), allocationRules: asJson(context.settings.allocationRulesJson, {}), targets: {
        likes30d: context.settings.targetLikes30d, views30d: context.settings.targetViews30d, leads30d: context.settings.targetLeads30d, qualifiedLeads30d: context.settings.targetQualifiedLeads30d, signedClients30d: context.settings.targetSignedClients30d, cplEgp: Number(context.settings.targetCostPerLeadEgp), maxAdSpend30dEgp: Number(context.settings.targetMaxAdSpend30dEgp),
      },
    },
    brandBook: { version: context.brandBook.version, title: context.brandBook.title, rules: asJson(context.brandBook.brandPayloadJson, {}) },
    designSystem: context.designAssets.map(asset => ({ type: asset.assetType, title: asset.title, extraction: asJson(asset.extractionJson, {}) })),
    sourcePolicy: {
      primarySource: "owner_provided_internal_programme_references",
      governmentSourceRule: "Do not retrieve, browse, cite, or use government or other external sources automatically. An external source may be considered only after the owner explicitly confirms the specific content draft.",
      publicationRule: "Internal references are planning context only. They are not official evidence and cannot by themselves support external publication, campaign deployment, or a programme claim.",
    },
    ownerProvidedInternalReferences: context.internalReferences.map(reference => ({
      id: reference.id,
      referenceKey: reference.referenceKey,
      programKeys: reference.programKeys,
      title: reference.title,
      sourceClassification: reference.sourceClassification,
      status: reference.status,
      documentHash: reference.documentHash,
      analysis: reference.analysis,
    })),
    approvedOfficialClaims: context.claims,
    feedbackMemory: context.preferences.map(preference => ({ scope: preference.scope, scopeKey: preference.scopeKey, preferenceText: preference.preferenceText })),
    aggregatePerformance: context.performance.map(snapshot => ({ periodStart: snapshot.periodStart, spendEgp: Number(snapshot.spendEgp), impressions: snapshot.impressions, clicks: snapshot.clicks, leadForms: snapshot.leadForms, qualifiedLeads: snapshot.qualifiedLeads, clientStageLeads: snapshot.clientStageLeads, notes: snapshot.notes })),
  };
}

function councilPrompt(snapshot: Record<string, unknown>, role: "strategy" | "challenge") {
  const strategy = role === "strategy";
  return [
    strategy ? "You are ELEVAY's Arabic-first marketing strategist." : "You are ELEVAY's independent critical marketing reviewer.",
    strategy ? "Create a concrete weekly creative strategy that is safe for later human review." : "Challenge the weekly strategy: detect unsupported claims, brand drift, execution issues, and performance risks. Propose corrections.",
    "Use only the owner-provided internal programme references in the planning context. Do not retrieve, browse, cite, or rely on government or other external sources. Treat internal references as non-official planning context and mark any point needing external verification as an evidence gap.",
    "Return only the requested JSON. Do not include personal data. Do not claim visa outcomes or guarantees. Do not propose publishing, campaign editing, spend, messaging, or any external action.",
    "Planning context:", JSON.stringify(snapshot),
  ].join("\n\n");
}

async function createManusWeeklyTask(snapshot: Record<string, unknown>, strategy: SpecialistOpinion, challenge: SpecialistOpinion, periodStart: string) {
  const prompt = [
    "You are the ELEVAY weekly creative production orchestrator. Create an internal, review-ready weekly production pack after considering the OpenAI strategist and Claude challenger opinions below.",
    "Strict rules: all marketing copy/captions/CTAs/scripts/voice-over must be Arabic. Text visibly placed inside visual assets must be English only; use NONE when a visual has no text. Country names alone may be English in voice-over. Never use client, Lead, contact, passport, phone, email, or other personal data.",
    "Use only owner-provided internal programme references contained in the planning context. Do not browse, retrieve, cite, or use government or other external sources. Every researchResults.sourceUrl must use internal:// followed by an owner-provided referenceKey. Internal references are non-official planning context only: do not treat them as official evidence or make a programme claim unless it is supported by an approvedOfficialClaims ID. If a fact needs external verification, list it as an evidence gap.",
    "Prepare final-quality research summary, static/carousel/reel concepts and any safe attachment deliverables you can create. Do not publish, schedule, create or edit ads/campaigns, spend money, send CAPI events, contact anyone, or change a CRM record. Every output is for review only.",
    `Week starting: ${periodStart}`,
    "Planning context:", JSON.stringify(snapshot),
    "OpenAI strategist opinion:", JSON.stringify(strategy),
    "Claude independent challenge:", JSON.stringify(challenge),
  ].join("\n\n");
  const response = await fetch("https://api.manus.ai/v2/task.create", {
    method: "POST", headers: { "Content-Type": "application/json", "x-manus-api-key": ENV.manusApiKey },
    body: JSON.stringify({ message: { content: prompt }, agent_profile: "standard", structured_output_schema: weeklyAutomationPlanJsonSchema }),
  });
  if (!response.ok) throw new Error(`Manus task request failed with status ${response.status}.`);
  const body = await response.json() as Record<string, unknown>;
  const taskId = typeof body.task_id === "string" ? body.task_id : (body.task_detail as any)?.task_id;
  const taskUrl = typeof body.task_url === "string" ? body.task_url : (body.task_detail as any)?.task_url;
  if (!taskId) throw new Error("Manus did not return a task identifier.");
  return { taskId, taskUrl: typeof taskUrl === "string" ? taskUrl : null };
}

function hasOnlyInternalResearchResults(output: WeeklyAutomationPlanOutput) {
  return output.researchResults.every(result => result.sourceUrl.startsWith("internal://"));
}

export async function startWeeklyAutomationCycle(input: { triggerType: "manual_test" | "scheduled"; actorUserId?: number; forcePeriodStart?: string }) {
  const context = await readAutomationContext();
  const control = context.control;
  if (!control?.isEnabled || control.state !== "active") throw new Error("Weekly automation is paused or disabled. Activate it from Settings first.");
  if (context.blockers.length) throw new Error(context.blockers.join(" "));
  const periodStart = input.forcePeriodStart ?? cairoPeriodStart();
  if (!isSaturdayDate(periodStart)) throw new Error("Automation period must begin on a Saturday in Cairo time.");
  const idempotencyKey = `weekly-automation:${periodStart}`;
  const [existing] = await context.db.select().from(marketingWeeklyAutomationJobs).where(eq(marketingWeeklyAutomationJobs.idempotencyKey, idempotencyKey)).limit(1);
  if (existing) return { reused: true, job: existing };
  const snapshot = publicPlanningSnapshot(context, periodStart);
  const snapshotString = JSON.stringify(snapshot);
  if (findDisallowedWeeklyResultsData(snapshotString)) throw new Error("The planning snapshot contains disallowed personal data.");
  const now = Date.now();
  const createdByUserId = input.actorUserId ?? control.configuredByUserId;
  const insert = await context.db.insert(marketingWeeklyAutomationJobs).values({ jobKey: automationJobKey(), idempotencyKey, periodStart, triggerType: input.triggerType, state: "running_council", inputSnapshotJson: snapshotString, openAiOutputJson: null, anthropicOutputJson: null, manusTaskId: null, manusTaskUrl: null, manusOutputJson: null, attachmentsJson: "[]", planId: null, reservedCostUsd: control.perRunReserveUsd, errorCode: null, errorSummary: null, createdByUserId, startedAt: now, completedAt: null, createdAt: now, updatedAt: now });
  const jobId = Number((insert as { insertId?: number }).insertId);
  try {
    await reserveBudgetOrThrow(context.db, control, jobId, periodStart, now);
    const [strategyResult, challengeResult] = await Promise.all([
      requestOpenAiJson({ system: "You are a cautious marketing strategist. Return only structured JSON and do not take external actions.", prompt: councilPrompt(snapshot, "strategy"), schemaName: "elevay_weekly_strategy", schema: specialistOpinionJsonSchema, validator: specialistOpinionSchema }),
      requestAnthropicJson({ system: "You are a strict editorial challenger. Return only structured JSON and do not take external actions.", prompt: councilPrompt(snapshot, "challenge"), validator: specialistOpinionSchema }),
    ]);
    const manus = await createManusWeeklyTask(snapshot, strategyResult, challengeResult, periodStart);
    await context.db.update(marketingWeeklyAutomationJobs).set({ state: "waiting_manus", openAiOutputJson: JSON.stringify(strategyResult), anthropicOutputJson: JSON.stringify(challengeResult), manusTaskId: manus.taskId, manusTaskUrl: manus.taskUrl, updatedAt: Date.now() }).where(eq(marketingWeeklyAutomationJobs.id, jobId));
    await context.db.update(marketingWeeklyAutomationControls).set({ lastRunAt: Date.now(), lastRunStatus: "waiting_manus", lastError: null, updatedAt: Date.now() }).where(eq(marketingWeeklyAutomationControls.id, control.id));
    return { reused: false, job: { id: jobId, state: "waiting_manus", manusTaskUrl: manus.taskUrl } };
  } catch (error) {
    const safe = redactError(error);
    await context.db.update(marketingWeeklyAutomationJobs).set({ state: "failed", errorCode: "automation_start_failed", errorSummary: safe, completedAt: Date.now(), updatedAt: Date.now() }).where(eq(marketingWeeklyAutomationJobs.id, jobId));
    await context.db.update(marketingWeeklyAutomationControls).set({ lastRunAt: Date.now(), lastRunStatus: "failed", lastError: safe, updatedAt: Date.now() }).where(eq(marketingWeeklyAutomationControls.id, control.id));
    throw new Error(safe);
  }
}

function generatedItemLanguageProblem(item: WeeklyAutomationPlanOutput["items"][number]) {
  if (!isCreativeItemType(item.itemType)) return null;
  return validateArabicOnlyMarketingText(item.scriptCopy, "Generated script")
    || validateArabicOnlyMarketingText(item.caption, "Generated caption")
    || validateArabicOnlyMarketingText(item.cta, "Generated CTA")
    || validateArabicOnlyMarketingText(item.hashtags.join(" "), "Generated hashtags")
    || (isVisualTextCreativeItemType(item.itemType) ? validateEnglishOnlyOnScreenText(item.onScreenEnglishText) : null);
}

async function persistReviewPlan(job: AutomationJob, output: WeeklyAutomationPlanOutput, attachments: Array<{ file_name?: string; url?: string; size_bytes?: number }>) {
  const db = await requireDb();
  const snapshot = asJson<Record<string, any>>(job.inputSnapshotJson, {});
  const validClaimIds = new Set<number>((snapshot.approvedClaims ?? []).map((claim: { id?: number }) => Number(claim.id)).filter(Number.isInteger));
  const next = await db.select({ version: marketingWeeklyResultsPlans.version }).from(marketingWeeklyResultsPlans).where(eq(marketingWeeklyResultsPlans.periodStart, job.periodStart)).orderBy(desc(marketingWeeklyResultsPlans.version)).limit(1);
  const now = Date.now();
  const planKey = weeklyPlanKey();
  const planHash = crypto.createHash("sha256").update(JSON.stringify({ jobKey: job.jobKey, output, attachments })).digest("hex");
  const result = await db.insert(marketingWeeklyResultsPlans).values({ planKey, periodStart: job.periodStart, version: (next[0]?.version ?? 0) + 1, status: "draft_prepared", source: "automated_multi_model", title: normalizeWeeklyResultsText(output.weeklyTitle), weeklyGoal: typeof snapshot.settings?.weeklyGoal === "string" ? snapshot.settings.weeklyGoal : null, creativeDirection: typeof snapshot.settings?.creativeDirection === "string" ? snapshot.settings.creativeDirection : null, setupSnapshotJson: JSON.stringify(snapshot.settings ?? {}), previousWeekPerformanceJson: JSON.stringify(snapshot.aggregatePerformance ?? []), preferenceMemoryJson: JSON.stringify(snapshot.feedbackMemory ?? []), planHash, preparedByUserId: job.createdByUserId, preparedAt: now, deliveryDeadlineAt: null, createdAt: now, updatedAt: now });
  const planId = Number((result as { insertId?: number }).insertId);
  for (let index = 0; index < output.items.length; index += 1) {
    const item = output.items[index]!;
    const unsafe = findDisallowedWeeklyResultsData(JSON.stringify(item));
    const languageProblem = generatedItemLanguageProblem(item);
    const invalidClaim = item.approvedClaimIds.find(id => !validClaimIds.has(id));
    const blockedReason = unsafe ? `Generated item contains ${unsafe}.` : languageProblem ?? (invalidClaim ? `Generated item references a claim that is not approved in this snapshot (${invalidClaim}).` : null);
    const state = blockedReason ? "on_hold" : "draft";
    const inserted = await db.insert(marketingWeeklyResultsItems).values({ planId, position: index + 1, itemType: item.itemType, title: normalizeWeeklyResultsText(item.title), programKey: item.programKey, objective: normalizeWeeklyResultsText(item.objective), creativeDirection: item.creativeDirection ? normalizeWeeklyResultsText(item.creativeDirection) : null, scriptCopy: item.scriptCopy ? normalizeWeeklyResultsText(item.scriptCopy) : null, caption: item.caption ? normalizeWeeklyResultsText(item.caption) : null, cta: item.cta ? normalizeWeeklyResultsText(item.cta) : null, hashtagsJson: JSON.stringify(item.hashtags.map(normalizeWeeklyResultsText)), visualBrief: item.visualBrief ? normalizeWeeklyResultsText(item.visualBrief) : null, plannedDay: item.plannedDay, plannedTime: item.plannedTime, previewUrl: null, previewHash: null, sourceClaimIdsJson: JSON.stringify(item.approvedClaimIds.filter(id => validClaimIds.has(id))), metadataJson: JSON.stringify({ onScreenEnglishText: item.onScreenEnglishText, generatedAssetFileNames: item.assetFileNames, generatedAdRecommendation: item.adRecommendation, automationJobKey: job.jobKey, manuscriptAttachmentCount: attachments.length }), isSelected: !blockedReason, requiresIndividualApproval: true, status: state, blockedReason, contentPacketId: null, approvedByUserId: null, approvedAt: null, stoppedByUserId: null, stoppedAt: null, createdByUserId: job.createdByUserId, lastEditedByUserId: job.createdByUserId, createdAt: now, updatedAt: now });
    const itemId = Number((inserted as { insertId?: number }).insertId);
    await db.insert(marketingWeeklyResultsItemEvents).values({ itemId, action: "automation_generated", fromStatus: null, toStatus: state, feedback: null, changedFieldsJson: JSON.stringify(["ai_council", "manus_orchestration", "review_required"]), payloadJson: JSON.stringify({ jobKey: job.jobKey, hasOpenAiStrategy: true, hasAnthropicChallenge: true, manuscriptAttachmentCount: attachments.length, blockedReason }), actorUserId: job.createdByUserId, createdAt: now });
  }
  return planId;
}

export async function applyWeeklyAutomationManusWebhook(payload: any) {
  if (payload?.event_type !== "task_stopped") return { ignored: true };
  const task = payload.task_detail;
  if (!task?.task_id) return { ignored: true };
  const db = await requireDb();
  const [job] = await db.select().from(marketingWeeklyAutomationJobs).where(eq(marketingWeeklyAutomationJobs.manusTaskId, task.task_id)).limit(1);
  if (!job || ["completed_pending_review", "failed", "stopped"].includes(job.state)) return { ignored: true };
  const now = Date.now();
  if (task.stop_reason === "ask") {
    await db.update(marketingWeeklyAutomationJobs).set({ state: "stopped", errorCode: "manus_requires_input", errorSummary: "Manus requires input; the weekly run was stopped rather than continuing autonomously.", completedAt: now, updatedAt: now }).where(eq(marketingWeeklyAutomationJobs.id, job.id));
    return { stopped: true };
  }
  try {
    const structured = task.structured_output;
    if (!structured?.success) throw new Error(typeof structured?.error === "string" ? structured.error : "Manus did not return a valid structured weekly plan.");
    const output = weeklyAutomationPlanSchema.parse(structured.value);
    if (!hasOnlyInternalResearchResults(output)) throw new Error("The weekly plan included a non-internal research source and was blocked pending owner confirmation.");
    const attachments = Array.isArray(task.attachments) ? task.attachments.map((item: any) => ({ file_name: typeof item?.file_name === "string" ? item.file_name.slice(0, 500) : undefined, url: typeof item?.url === "string" ? item.url.slice(0, 2000) : undefined, size_bytes: Number.isFinite(Number(item?.size_bytes)) ? Number(item.size_bytes) : undefined })) : [];
    const planId = await persistReviewPlan(job, output, attachments);
    await db.update(marketingWeeklyAutomationJobs).set({ state: "completed_pending_review", manusOutputJson: JSON.stringify(output), attachmentsJson: JSON.stringify(attachments), planId, errorCode: null, errorSummary: null, completedAt: now, updatedAt: now }).where(eq(marketingWeeklyAutomationJobs.id, job.id));
    await db.update(marketingWeeklyAutomationControls).set({ lastRunAt: now, lastRunStatus: "completed_pending_review", lastError: null, updatedAt: now }).where(eq(marketingWeeklyAutomationControls.controlKey, WEEKLY_AUTOMATION_CONTROL_KEY));
    return { completed: true, planId };
  } catch (error) {
    const safe = redactError(error);
    await db.update(marketingWeeklyAutomationJobs).set({ state: "failed", errorCode: "manus_output_invalid", errorSummary: safe, completedAt: now, updatedAt: now }).where(eq(marketingWeeklyAutomationJobs.id, job.id));
    await db.update(marketingWeeklyAutomationControls).set({ lastRunAt: now, lastRunStatus: "failed", lastError: safe, updatedAt: now }).where(eq(marketingWeeklyAutomationControls.controlKey, WEEKLY_AUTOMATION_CONTROL_KEY));
    return { failed: true };
  }
}

export async function markAutomationScheduleTask(taskUid: string) {
  const db = await requireDb();
  await db.update(marketingWeeklyAutomationControls).set({ scheduleTaskUid: taskUid, updatedAt: Date.now() }).where(eq(marketingWeeklyAutomationControls.controlKey, WEEKLY_AUTOMATION_CONTROL_KEY));
}
