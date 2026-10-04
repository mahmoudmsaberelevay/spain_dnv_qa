import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requestAnthropicJson,
  requestOpenAiJson,
  specialistOpinionSchema,
  type SpecialistOpinion,
} from "./aiCouncilProviders";
import { getDb } from "./db";
import {
  marketingBrandBooks,
  marketingDesignSystemAssets,
  marketingInternalProgrammeReferences,
  marketingOwnerConfirmedInternalClaims,
  marketingWeeklyResultsSettings,
} from "../drizzle/schema";
import {
  weeklyAutomationPlanJsonSchema,
  weeklyAutomationPlanSchema,
  type WeeklyAutomationPlanOutput,
} from "../shared/marketingWeeklyAutomation";
import {
  nextCairoPublishingSunday,
  findDisallowedWeeklyResultsData,
  isSundayDate,
} from "../shared/marketingWeeklyResults";
import {
  validateArabicOnlyMarketingText,
  validateElevayArabicVoiceOverScript,
  validateEnglishOnlyOnScreenText,
} from "../shared/marketingCreativeLanguagePolicy";

/**
 * Read-only, review-only weekly planner.
 *
 * This module deliberately has no Manus import, task creation, media-generation,
 * publishing, scheduling, campaign, or database-write path. Provider calls are
 * dependency-injected and only happen after the saved-context/privacy preflight.
 */

const MAX_PROGRAMMES = 12;
const MAX_REFERENCES = 12;
const MAX_CLAIMS = 160;
const MAX_DESIGN_ASSETS = 20;
const CAIRO_TIMEZONE = "Africa/Cairo" as const;

export type PlannerSavedSettings = {
  weeklyGoal: string | null;
  programPriorities: string[];
  creativeDirection: string | null;
  updatedSourcesNote: string | null;
};

export type PlannerSavedBrandBook = {
  version: string;
  title: string;
  rules: unknown;
};

export type PlannerSavedDesignAsset = {
  id: number;
  assetType: string;
  title: string;
  instructions: unknown;
};

export type PlannerSavedInternalReference = {
  id: number;
  referenceKey: string;
  programKeys: string[];
  title: string;
  sourceClassification: string;
  analysis: unknown;
};

export type PlannerSavedInternalClaim = {
  id: number;
  internalReferenceId: number;
  programKey: string;
  claimType: string;
  claimText: string;
  sourceSection: string;
  riskLevel: string;
};

/** The only persisted inputs the planner is permitted to read. */
export type OneClickWeeklyPlannerSavedContext = {
  settings: PlannerSavedSettings | null;
  brandBook: PlannerSavedBrandBook | null;
  designAssets: PlannerSavedDesignAsset[];
  internalReferences: PlannerSavedInternalReference[];
  ownerConfirmedInternalClaims: PlannerSavedInternalClaim[];
};

export type OneClickWeeklyPlanningSnapshot = {
  periodStart: string;
  timeZone: typeof CAIRO_TIMEZONE;
  executionBoundary: string;
  sourcePolicy: {
    permittedSources: string;
    externalCitationPolicy: string;
    publicationPolicy: string;
  };
  settings: {
    weeklyGoal: string | null;
    programPriorities: string[];
    creativeDirection: string | null;
    updatedSourcesNote: string | null;
  } | null;
  brandBook: {
    version: string;
    title: string;
    rules: unknown;
  } | null;
  designSystem: Array<{
    id: number;
    type: string;
    title: string;
    instructions: unknown;
  }>;
  ownerProvidedInternalReferences: Array<{
    id: number;
    referenceKey: string;
    programKeys: string[];
    title: string;
    sourceClassification: string;
    analysis: unknown;
  }>;
  ownerConfirmedInternalClaims: Array<{
    id: number;
    internalReferenceId: number;
    programKey: string;
    claimType: string;
    claimText: string;
    sourceSection: string;
    riskLevel: string;
  }>;
  readiness: {
    blockers: string[];
    privacyProblems: Array<{ path: string; reason: string }>;
  };
};

export type PlannerProviderRequest = {
  system: string;
  prompt: string;
  snapshot: OneClickWeeklyPlanningSnapshot;
  candidatePlan?: WeeklyAutomationPlanOutput;
};

/**
 * OpenAI creates a candidate plan. Claude challenges it; it never dispatches
 * footage work and cannot turn a review draft into a publication instruction.
 */
export type OpenAiStrategist = (request: PlannerProviderRequest) => Promise<unknown>;
export type ClaudeChallenger = (request: PlannerProviderRequest) => Promise<unknown>;
export type SavedContextReader = () => Promise<OneClickWeeklyPlannerSavedContext>;

export type OneClickWeeklyPlannerDependencies = {
  readSavedContext?: SavedContextReader;
  openAiStrategist?: OpenAiStrategist;
  claudeChallenger?: ClaudeChallenger;
};

export type OneClickWeeklyPlannerInput = {
  /** Must be a Sunday in Cairo. Defaults to the next new Sunday–Saturday week. */
  periodStart?: string;
  /** Injectable clock for deterministic callers/tests. */
  now?: Date;
};

const itemEvidenceSchema = z.object({
  itemIndex: z.number().int().min(0).max(6),
  title: z.string().min(3).max(300),
  internalCitationIds: z.array(z.number().int().positive()).min(1).max(20),
  status: z.enum(["internal_source_ready", "blocked_needs_verified_external_citation"]),
  verifiedExternalCitation: z.null(),
  reviewNote: z.string().min(5).max(1_000),
});

export const oneClickWeeklyDraftSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.literal(CAIRO_TIMEZONE),
  reviewState: z.literal("requires_owner_review"),
  plan: weeklyAutomationPlanSchema,
  sourceEvidence: z.object({
    status: z.enum(["ready_for_owner_review", "blocked_pending_verified_citation"]),
    externalCitationPolicy: z.string().min(10),
    items: z.array(itemEvidenceSchema).length(7),
  }),
  challenger: z.object({
    executiveSummary: z.string().max(12_000),
    recommendation: z.string().max(12_000),
    keyFindings: z.array(z.string().max(2_000)).max(12),
    risks: z.array(z.string().max(2_000)).max(12),
    actions: z.array(z.string().max(2_000)).max(12),
  }),
}).superRefine((draft, ctx) => {
  const reels = draft.plan.items.filter(item => item.itemType === "reel").length;
  const statics = draft.plan.items.filter(item => item.itemType === "static_post").length;
  if (draft.plan.items.length !== 7 || reels !== 3 || statics !== 4 || reels + statics !== 7) {
    ctx.addIssue({ code: "custom", path: ["plan", "items"], message: "A one-click week must contain exactly three reels and four static posts." });
  }
});

export type OneClickWeeklyDraft = z.infer<typeof oneClickWeeklyDraftSchema>;

export type OneClickWeeklyPlanningResult =
  | { state: "blocked"; snapshot: OneClickWeeklyPlanningSnapshot; draft: null }
  | { state: "review_ready"; snapshot: OneClickWeeklyPlanningSnapshot; draft: OneClickWeeklyDraft };

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[\t ]+/g, " ").trim();
}

/** A value is rejected before truncation so an email/phone cannot be hidden past a limit. */
function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  if (findDisallowedWeeklyResultsData(value)) return null;
  const normalized = normalizeText(value);
  return normalized ? normalized.slice(0, maxLength) : null;
}

function safeStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const safe = safeText(item, maxLength);
    return safe ? [safe] : [];
  }).slice(0, maxItems);
}

/** Keep source JSON bounded and discard every unsafe leaf rather than attempting redaction. */
function boundedSafeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return null;
  if (typeof value === "string") return safeText(value, 2_000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value
    .map(item => boundedSafeValue(item, depth + 1))
    .filter((item): item is Exclude<typeof item, null> => item !== null)
    .slice(0, 16);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
      const safeKey = safeText(key, 96);
      const safeValue = boundedSafeValue(nested, depth + 1);
      return safeKey && safeValue !== null ? [[safeKey, safeValue]] : [];
    }));
  }
  return null;
}

function boundedReferenceAnalysis(value: unknown): unknown {
  const source = typeof value === "string" ? parseJson<Record<string, unknown>>(value, {}) : value;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const record = source as Record<string, unknown>;
  return boundedSafeValue({
    executiveSummary: record.executive_summary,
    programmes: record.programmes,
    criticalReviewFlags: record.critical_review_flags,
    recommendedOfficialVerificationTopics: record.recommended_official_verification_topics,
  });
}

function selectedProgrammeKeys(value: unknown): string[] {
  const priorities = Array.isArray(value) ? value : [];
  return priorities.flatMap(priority => {
    if (typeof priority === "string") return safeText(priority, 96) ? [priority.trim()] : [];
    if (!priority || typeof priority !== "object") return [];
    const key = safeText((priority as Record<string, unknown>).key, 96);
    return key ? [key] : [];
  }).slice(0, MAX_PROGRAMMES);
}

function findSnapshotPrivacyProblems(snapshot: unknown): Array<{ path: string; reason: string }> {
  const problems: Array<{ path: string; reason: string }> = [];
  const visit = (value: unknown, path: string) => {
    if (typeof value === "string") {
      // The calendar identifier is structured scheduling metadata, not prose.
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
      const reason = findDisallowedWeeklyResultsData(value);
      if (reason) problems.push({ path, reason });
      return;
    }
    if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };
  visit(snapshot, "snapshot");
  return problems;
}

function activeDesignAssetsPresent(assets: OneClickWeeklyPlanningSnapshot["designSystem"]): boolean {
  return assets.some(asset => asset.type === "design_instruction") && assets.some(asset => asset.type === "logo");
}

/**
 * Build a bounded model-ready view using exactly the permitted saved records.
 * It performs no provider dispatch and is safe to use for readiness previews.
 */
export function prepareOneClickWeeklyPlanningSnapshot(
  saved: OneClickWeeklyPlannerSavedContext,
  input: OneClickWeeklyPlannerInput = {},
): OneClickWeeklyPlanningSnapshot {
  const periodStart = input.periodStart ?? nextCairoPublishingSunday(input.now ?? new Date());
  if (!isSundayDate(periodStart)) throw new Error("The new publishing week must start on a Sunday in Cairo.");

  const settings = saved.settings ? {
    weeklyGoal: safeText(saved.settings.weeklyGoal, 4_000),
    programPriorities: selectedProgrammeKeys(saved.settings.programPriorities),
    creativeDirection: safeText(saved.settings.creativeDirection, 4_000),
    updatedSourcesNote: safeText(saved.settings.updatedSourcesNote, 2_000),
  } : null;

  const brandBook = saved.brandBook ? {
    version: safeText(saved.brandBook.version, 96) ?? "active",
    title: safeText(saved.brandBook.title, 300) ?? "Active ELEVAY Brand Book",
    rules: boundedSafeValue(saved.brandBook.rules),
  } : null;

  const designSystem = saved.designAssets.slice(0, MAX_DESIGN_ASSETS).flatMap(asset => {
    const assetType = safeText(asset.assetType, 32);
    const title = safeText(asset.title, 300);
    if (!assetType || !title) return [];
    return [{ id: asset.id, type: assetType, title, instructions: boundedSafeValue(asset.instructions) }];
  });

  const ownerProvidedInternalReferences = saved.internalReferences.slice(0, MAX_REFERENCES).flatMap(reference => {
    const referenceKey = safeText(reference.referenceKey, 96);
    const title = safeText(reference.title, 300);
    const sourceClassification = safeText(reference.sourceClassification, 80);
    if (!referenceKey || !title || !sourceClassification) return [];
    return [{
      id: reference.id,
      referenceKey,
      programKeys: safeStringArray(reference.programKeys, MAX_PROGRAMMES, 96),
      title,
      sourceClassification,
      analysis: boundedReferenceAnalysis(reference.analysis),
    }];
  });
  const allowedReferenceIds = new Set(ownerProvidedInternalReferences.map(reference => reference.id));

  const ownerConfirmedInternalClaims = saved.ownerConfirmedInternalClaims.slice(0, MAX_CLAIMS).flatMap(claim => {
    if (!allowedReferenceIds.has(claim.internalReferenceId)) return [];
    const programKey = safeText(claim.programKey, 96);
    const claimType = safeText(claim.claimType, 48);
    const claimText = safeText(claim.claimText, 4_000);
    const sourceSection = safeText(claim.sourceSection, 160);
    const riskLevel = safeText(claim.riskLevel, 24);
    if (!programKey || !claimType || !claimText || !sourceSection || !riskLevel) return [];
    return [{ id: claim.id, internalReferenceId: claim.internalReferenceId, programKey, claimType, claimText, sourceSection, riskLevel }];
  });

  const referenceProgrammes = new Set(ownerProvidedInternalReferences.flatMap(reference => reference.programKeys));
  const claimProgrammes = new Set(ownerConfirmedInternalClaims.map(claim => claim.programKey));
  const missingPriorityReferences = settings?.programPriorities.filter(programme => !referenceProgrammes.has(programme)) ?? [];
  const missingPriorityClaims = settings?.programPriorities.filter(programme => !claimProgrammes.has(programme)) ?? [];
  const initialBlockers = [
    !settings ? "Weekly Settings have not been saved." : null,
    settings && settings.programPriorities.length === 0 ? "Save at least one ELEVAY programme priority before preparing a week." : null,
    !brandBook ? "An active ELEVAY Brand Book is required." : null,
    !activeDesignAssetsPresent(designSystem) ? "An active Design System instruction and official logo are both required." : null,
    ownerProvidedInternalReferences.length === 0 ? "At least one owner-provided internal programme reference is required." : null,
    ownerConfirmedInternalClaims.length === 0 ? "At least one owner-confirmed internal claim is required so every item can carry an internal citation ID." : null,
    missingPriorityReferences.length ? `No owner-provided internal reference covers: ${missingPriorityReferences.join(", ")}.` : null,
    missingPriorityClaims.length ? `No owner-confirmed internal claim covers: ${missingPriorityClaims.join(", ")}.` : null,
  ].filter((value): value is string => Boolean(value));

  const snapshot: OneClickWeeklyPlanningSnapshot = {
    periodStart,
    timeZone: CAIRO_TIMEZONE,
    executionBoundary: "Prepare an internal review draft only. Never generate images, footage, clips, audio, or other media; never create a Manus task; never publish, schedule, spend, contact Leads or clients, or change CRM data.",
    sourcePolicy: {
      permittedSources: "Use saved ELEVAY settings, the active Brand Book, active Design System/logo, owner-provided internal programme references, and owner-confirmed internal claims only.",
      externalCitationPolicy: "Do not browse, retrieve, invent, or cite external sources. A news-led item is blocked until an owner provides a verified external citation during review.",
      publicationPolicy: "Internal citations support review only. They are not official evidence, legal advice, or authority to publish.",
    },
    settings,
    brandBook,
    designSystem,
    ownerProvidedInternalReferences,
    ownerConfirmedInternalClaims,
    readiness: { blockers: initialBlockers, privacyProblems: [] },
  };
  snapshot.readiness.privacyProblems = findSnapshotPrivacyProblems(snapshot);
  if (snapshot.readiness.privacyProblems.length) snapshot.readiness.blockers.push("The bounded planning snapshot still contains disallowed personal data.");
  return snapshot;
}

/** Read the permitted records only. No writes and no external network calls occur here. */
export async function readSavedOneClickWeeklyPlannerContext(): Promise<OneClickWeeklyPlannerSavedContext> {
  const db = await getDb();
  if (!db) throw new Error("Marketing planner database is unavailable.");
  const [settingsRows, brandBooks, designAssets, references, claims] = await Promise.all([
    db.select().from(marketingWeeklyResultsSettings)
      .where(eq(marketingWeeklyResultsSettings.settingsKey, "primary-weekly-results")).limit(1),
    db.select().from(marketingBrandBooks)
      .where(eq(marketingBrandBooks.status, "active")).orderBy(desc(marketingBrandBooks.version)).limit(1),
    db.select().from(marketingDesignSystemAssets)
      .where(eq(marketingDesignSystemAssets.isActive, true)).orderBy(desc(marketingDesignSystemAssets.updatedAt)).limit(MAX_DESIGN_ASSETS),
    db.select().from(marketingInternalProgrammeReferences)
      .where(eq(marketingInternalProgrammeReferences.status, "internal_reference_only"))
      .orderBy(desc(marketingInternalProgrammeReferences.updatedAt)).limit(MAX_REFERENCES),
    db.select({
      id: marketingOwnerConfirmedInternalClaims.id,
      internalReferenceId: marketingOwnerConfirmedInternalClaims.internalReferenceId,
      programKey: marketingOwnerConfirmedInternalClaims.programKey,
      claimType: marketingOwnerConfirmedInternalClaims.claimType,
      claimText: marketingOwnerConfirmedInternalClaims.claimText,
      sourceSection: marketingOwnerConfirmedInternalClaims.sourceSection,
      riskLevel: marketingOwnerConfirmedInternalClaims.riskLevel,
    }).from(marketingOwnerConfirmedInternalClaims)
      .innerJoin(marketingInternalProgrammeReferences, eq(marketingOwnerConfirmedInternalClaims.internalReferenceId, marketingInternalProgrammeReferences.id))
      .where(and(
        eq(marketingOwnerConfirmedInternalClaims.status, "owner_confirmed"),
        eq(marketingInternalProgrammeReferences.status, "internal_reference_only"),
        eq(marketingOwnerConfirmedInternalClaims.sourceDocumentHash, marketingInternalProgrammeReferences.documentHash),
      ))
      .orderBy(marketingOwnerConfirmedInternalClaims.programKey, desc(marketingOwnerConfirmedInternalClaims.updatedAt)).limit(MAX_CLAIMS),
  ]);

  const settings = settingsRows[0];
  const brandBook = brandBooks[0];
  return {
    settings: settings ? {
      weeklyGoal: settings.weeklyGoal,
      programPriorities: selectedProgrammeKeys(parseJson(settings.programPrioritiesJson, [])),
      creativeDirection: settings.creativeDirection,
      updatedSourcesNote: settings.updatedSourcesNote,
    } : null,
    brandBook: brandBook ? {
      version: String(brandBook.version),
      title: brandBook.title,
      rules: parseJson(brandBook.brandPayloadJson, {}),
    } : null,
    designAssets: designAssets
      .filter(asset => asset.assetType === "design_instruction" || asset.assetType === "logo")
      .map(asset => ({ id: asset.id, assetType: asset.assetType, title: asset.title, instructions: parseJson(asset.extractionJson, {}) })),
    internalReferences: references.map(reference => ({
      id: reference.id,
      referenceKey: reference.referenceKey,
      programKeys: safeStringArray(parseJson(reference.programKeysJson, []), MAX_PROGRAMMES, 96),
      title: reference.title,
      sourceClassification: reference.sourceClassification,
      analysis: reference.analysisJson,
    })),
    ownerConfirmedInternalClaims: claims,
  };
}

function strategistPrompt(snapshot: OneClickWeeklyPlanningSnapshot): string {
  return [
    "You are ELEVAY's cautious Arabic-first weekly marketing strategist.",
    "Create exactly seven INTERNAL REVIEW items for the Sunday–Saturday Cairo week: exactly 3 reel items and exactly 4 static_post items. Every item must include a Cairo day and HH:MM time, and at least one valid ownerConfirmedInternalClaimIds value from the supplied context. approvedClaimIds must be empty because this planner received no official-claim records.",
    "Reel scriptCopy must be natural Egyptian Arabic. English is permitted in a reel narration only for ELEVAY and approved country names present in the policy. Reel onScreenEnglishText must be exactly NONE. Each caption and CTA must be Arabic. Static scriptCopy/caption/CTA must be Arabic, while every static onScreenEnglishText must contain English only and cannot be NONE.",
    "Use saved programme priorities and owner-confirmed internal sources first. Do not state guarantees, legal advice, or visa outcomes. Do not include client, Lead, contact, passport, phone, email, or other personal data.",
    "Do not browse, invent, retrieve, or cite an external URL. Do not create news-led items: no current, latest, breaking, recently announced, or news/update claims are supportable in this context. researchResults may cite only internal:// followed by an exact supplied referenceKey.",
    "This is planning only: do not generate images, clips, footage, audio, or any media; do not create a Manus task; do not publish, schedule, spend, or take external action.",
    "Return only the strict JSON plan.",
    "Saved planning context:", JSON.stringify(snapshot),
  ].join("\n\n");
}

function challengerPrompt(snapshot: OneClickWeeklyPlanningSnapshot, candidatePlan: WeeklyAutomationPlanOutput): string {
  return [
    "You are ELEVAY's independent editorial challenger. Review the proposed internal weekly draft; do not rewrite or execute it.",
    "Look for unsupported programme claims, PII, non-Egyptian-Arabic reel narration, non-Arabic captions, visual text on reels, Arabic static visual text, missing internal citation IDs, news-led claims without verified external citations, or any instruction to generate media, use Manus, publish, schedule, spend, or contact people.",
    "Use only the supplied snapshot and proposed plan. Do not browse, create external citations, or name any external source. Return concise structured JSON.",
    "Planning context:", JSON.stringify(snapshot),
    "Candidate plan:", JSON.stringify(candidatePlan),
  ].join("\n\n");
}

async function defaultOpenAiStrategist(request: PlannerProviderRequest): Promise<WeeklyAutomationPlanOutput> {
  return requestOpenAiJson({
    system: "Return only a strict JSON weekly plan. You are a review-only strategist and cannot take external actions.",
    prompt: request.prompt,
    schemaName: "elevay_one_click_weekly_review_plan",
    schema: weeklyAutomationPlanJsonSchema,
    validator: weeklyAutomationPlanSchema,
  });
}

async function defaultClaudeChallenger(request: PlannerProviderRequest): Promise<SpecialistOpinion> {
  return requestAnthropicJson({
    system: "Return only structured JSON. You are a review-only challenger and cannot take external actions.",
    prompt: request.prompt,
    validator: specialistOpinionSchema,
  });
}

function isNewsLed(item: WeeklyAutomationPlanOutput["items"][number]): boolean {
  const text = [item.title, item.objective, item.creativeDirection, item.scriptCopy, item.caption, item.visualBrief].join(" ");
  return /\b(news|latest|breaking|today|recent|recently|announc(?:e|ed|ement)|update)\b|الأخبار|خبر(?:\s|$)|عاجل|أعلن(?:ت|وا|ت)?|آخر المستجدات|تحديثات/i.test(text);
}

function safeInternalResearchResults(plan: WeeklyAutomationPlanOutput, referenceKeys: Set<string>) {
  const removed = plan.researchResults.filter(result => {
    const key = result.sourceUrl.startsWith("internal://") ? result.sourceUrl.slice("internal://".length) : "";
    return !referenceKeys.has(key);
  }).length;
  const researchResults = plan.researchResults.filter(result => {
    const key = result.sourceUrl.startsWith("internal://") ? result.sourceUrl.slice("internal://".length) : "";
    return referenceKeys.has(key);
  });
  if (!removed) return { plan, removed };
  const risksAndEvidenceGaps = [
    ...plan.risksAndEvidenceGaps,
    "Unverified external or unknown research URLs returned by a provider were excluded; no external citation was synthesized.",
  ].slice(0, 12);
  return { plan: { ...plan, researchResults, risksAndEvidenceGaps }, removed };
}

function validateCandidatePlan(snapshot: OneClickWeeklyPlanningSnapshot, value: unknown): WeeklyAutomationPlanOutput {
  const parsed = weeklyAutomationPlanSchema.parse(value);
  const referenceKeys = new Set(snapshot.ownerProvidedInternalReferences.map(reference => reference.referenceKey));
  const { plan } = safeInternalResearchResults(parsed, referenceKeys);
  const allowedClaimIds = new Set(snapshot.ownerConfirmedInternalClaims.map(claim => claim.id));
  const claimsById = new Map(snapshot.ownerConfirmedInternalClaims.map(claim => [claim.id, claim]));
  const selectedProgrammes = new Set(snapshot.settings?.programPriorities ?? []);
  const problems: string[] = [];
  const reels = plan.items.filter(item => item.itemType === "reel");
  const statics = plan.items.filter(item => item.itemType === "static_post");
  if (plan.items.length !== 7 || reels.length !== 3 || statics.length !== 4 || reels.length + statics.length !== 7) {
    problems.push("The strategist did not return exactly three reels and four static posts.");
  }

  plan.items.forEach((item, index) => {
    if (item.itemType !== "reel" && item.itemType !== "static_post") problems.push(`Item ${index + 1} is not a reel or static post.`);
    if (!item.plannedDay || !item.plannedTime) problems.push(`Item ${index + 1} is missing a Cairo review slot.`);
    if (!item.programKey || !selectedProgrammes.has(item.programKey)) problems.push(`Item ${index + 1} does not use a saved programme priority.`);
    if (item.approvedClaimIds.length) problems.push(`Item ${index + 1} used official claim IDs that were not supplied to this planner.`);
    if (!item.ownerConfirmedInternalClaimIds.length) problems.push(`Item ${index + 1} is missing an internal citation ID.`);
    if (item.ownerConfirmedInternalClaimIds.some(id => !allowedClaimIds.has(id))) problems.push(`Item ${index + 1} contains an unknown internal citation ID.`);
    if (item.programKey && item.ownerConfirmedInternalClaimIds.some(id => claimsById.get(id)?.programKey !== item.programKey)) {
      problems.push(`Item ${index + 1} uses an internal citation from a different programme.`);
    }
    if (!item.creativeDirection.trim() || !item.scriptCopy.trim() || !item.caption.trim() || !item.cta.trim() || !item.visualBrief.trim() || !item.adRecommendation.trim()) {
      problems.push(`Item ${index + 1} is missing complete review content.`);
    }
    if (item.itemType === "reel") {
      const narrationProblem = validateElevayArabicVoiceOverScript(item.scriptCopy);
      if (narrationProblem) problems.push(`Item ${index + 1}: ${narrationProblem}`);
      if (item.onScreenEnglishText.trim().toUpperCase() !== "NONE") problems.push(`Item ${index + 1} must have no reel text.`);
    } else {
      const visualTextProblem = validateEnglishOnlyOnScreenText(item.onScreenEnglishText);
      if (visualTextProblem || item.onScreenEnglishText.trim().toUpperCase() === "NONE") problems.push(`Item ${index + 1}: static visual text must be English only and present.`);
      const copyProblem = validateArabicOnlyMarketingText(item.scriptCopy, "Static post copy");
      if (copyProblem) problems.push(`Item ${index + 1}: ${copyProblem}`);
    }
    const captionProblem = validateArabicOnlyMarketingText(item.caption, "Caption");
    const ctaProblem = validateArabicOnlyMarketingText(item.cta, "CTA");
    if (captionProblem) problems.push(`Item ${index + 1}: ${captionProblem}`);
    if (ctaProblem) problems.push(`Item ${index + 1}: ${ctaProblem}`);
  });

  const privacyProblems = findSnapshotPrivacyProblems(plan);
  if (privacyProblems.length) problems.push("The strategist output contains disallowed personal data.");
  if (problems.length) throw new Error(`One-click weekly draft failed safety validation: ${problems.join(" ")}`);
  return plan;
}

function compactChallenge(value: unknown): OneClickWeeklyDraft["challenger"] {
  const parsed = specialistOpinionSchema.parse(value);
  // Do not return provider source URLs: the planner cannot verify them and must
  // never make an external citation look verified.
  const compact = {
    executiveSummary: safeText(parsed.executiveSummary, 12_000) ?? "Challenger summary was withheld by the privacy guard.",
    recommendation: safeText(parsed.recommendation, 12_000) ?? "Owner review is required.",
    keyFindings: parsed.keyFindings.flatMap(item => safeText(item, 2_000) ? [safeText(item, 2_000)!] : []).slice(0, 12),
    risks: parsed.risks.flatMap(item => safeText(item, 2_000) ? [safeText(item, 2_000)!] : []).slice(0, 12),
    actions: parsed.actions.flatMap(item => safeText(item, 2_000) ? [safeText(item, 2_000)!] : []).slice(0, 12),
  };
  return compact;
}

function sourceEvidenceFor(plan: WeeklyAutomationPlanOutput): OneClickWeeklyDraft["sourceEvidence"] {
  const items = plan.items.map((item, itemIndex) => {
    const newsLed = isNewsLed(item);
    return {
      itemIndex,
      title: item.title,
      internalCitationIds: item.ownerConfirmedInternalClaimIds,
      status: newsLed ? "blocked_needs_verified_external_citation" as const : "internal_source_ready" as const,
      verifiedExternalCitation: null,
      reviewNote: newsLed
        ? "Blocked: this is news-led and no verified external citation was supplied or synthesized. Owner review must attach a verified citation before any further use."
        : "Owner-confirmed internal citation IDs are included for review only; this is not publication authority.",
    };
  });
  return {
    status: items.some(item => item.status === "blocked_needs_verified_external_citation")
      ? "blocked_pending_verified_citation" as const
      : "ready_for_owner_review" as const,
    externalCitationPolicy: "No external source was browsed, synthesized, or treated as verified. News-led items remain blocked until an owner supplies a verified citation.",
    items,
  };
}

/**
 * Prepare the next Sunday–Saturday review draft. The only default provider work
 * is OpenAI strategy and Claude challenge; callers can inject mocks or approved
 * internal adapters. Manus is intentionally never called.
 */
export async function planOneClickSundayToSaturdayWeek(
  input: OneClickWeeklyPlannerInput = {},
  dependencies: OneClickWeeklyPlannerDependencies = {},
): Promise<OneClickWeeklyPlanningResult> {
  const readSavedContext = dependencies.readSavedContext ?? readSavedOneClickWeeklyPlannerContext;
  const snapshot = prepareOneClickWeeklyPlanningSnapshot(await readSavedContext(), input);
  if (snapshot.readiness.blockers.length) return { state: "blocked", snapshot, draft: null };

  const openAiStrategist = dependencies.openAiStrategist ?? defaultOpenAiStrategist;
  const claudeChallenger = dependencies.claudeChallenger ?? defaultClaudeChallenger;
  const candidate = validateCandidatePlan(snapshot, await openAiStrategist({
    system: "You create a review-only internal ELEVAY weekly plan.",
    prompt: strategistPrompt(snapshot),
    snapshot,
  }));
  const challenger = compactChallenge(await claudeChallenger({
    system: "You challenge an internal ELEVAY weekly plan without external actions.",
    prompt: challengerPrompt(snapshot, candidate),
    snapshot,
    candidatePlan: candidate,
  }));

  const draft = oneClickWeeklyDraftSchema.parse({
    periodStart: snapshot.periodStart,
    timeZone: CAIRO_TIMEZONE,
    reviewState: "requires_owner_review",
    plan: candidate,
    sourceEvidence: sourceEvidenceFor(candidate),
    challenger,
  });
  const outputPrivacyProblems = findSnapshotPrivacyProblems(draft);
  if (outputPrivacyProblems.length) throw new Error("One-click weekly draft contains disallowed personal data.");
  return { state: "review_ready", snapshot, draft };
}
