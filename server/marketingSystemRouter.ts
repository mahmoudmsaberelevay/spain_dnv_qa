import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  marketingBrandBooks,
  marketingBrandDiscoveryAnswers,
  marketingBrandDiscoverySessions,
  marketingContentApprovalBatches,
  marketingContentPackets,
  marketingContentReviewEvents,
  marketingMetaAdsStrategyAnswers,
  marketingMetaAdsStrategySessions,
  marketingKnowledgeClaims,
  marketingKnowledgeSources,
  marketingProviderProfiles,
  marketingSystemRoleAssignments,
  marketingWorkOrderArtifacts,
  marketingWorkOrderCostLedger,
  marketingWorkOrderEvents,
  marketingWorkOrders,
  users,
} from "../drizzle/schema";
import { auditCtxFromTrpc, writeAuditLog } from "./auditLog";
import { isOwner } from "./permissionsRouter";
import { storagePut } from "./storage";
import {
  getMarketingSystemCapabilities,
  hasMarketingSystemCapability,
  isMarketingSystemRole,
  MARKETING_SYSTEM_ROLE_LABELS,
  type EffectiveMarketingSystemRole,
  type MarketingSystemCapability,
} from "./marketingSystemAccess";
import {
  BRAND_DISCOVERY_QUESTIONS,
  BRAND_DISCOVERY_SECTIONS,
  BRAND_DISCOVERY_TOTAL_QUESTIONS,
  buildBrandBookProposal,
  calculateNextBrandDiscoveryQuestion,
  getBrandDiscoveryQuestion,
  isBrandDiscoveryComplete,
} from "../shared/marketingBrandDiscovery";
import {
  MARKETING_KNOWLEDGE_CLAIM_TYPES,
  MARKETING_KNOWLEDGE_RISK_LEVELS,
  MARKETING_KNOWLEDGE_SOURCE_TYPES,
  OFFICIAL_KNOWLEDGE_SOURCE_SEEDS,
  normalizeOfficialKnowledgeUrl,
  stableKnowledgeHash,
} from "../shared/marketingKnowledge";
import {
  capabilityForWorkOrder,
  findDisallowedWorkOrderData,
  MARKETING_WORK_ORDER_DEFAULT_SCHEMAS,
  MARKETING_WORK_ORDER_STATUSES,
  MARKETING_WORK_ORDER_TYPES,
  normalizeWorkOrderText,
  workOrderCanTransition,
  workOrderRequiresApprovedClaims,
  workOrderRequiresBrandBook,
  type MarketingWorkOrderStatus,
} from "../shared/marketingWorkOrders";
import {
  MARKETING_CONTENT_QA_CHECKS,
  MARKETING_CONTENT_STATUSES,
  MARKETING_CONTENT_TYPES,
  contentCanTransition,
  contentPacketHasArabicText,
  contentPacketOutputSchema,
  findDisallowedContentPacketData,
  normalizeContentStudioText,
  validatePreviewFingerprint,
  type ContentQaResult,
  type MarketingContentStatus,
} from "../shared/marketingContentStudio";
import {
  calculateNextMetaAdsStrategyQuestion,
  getMetaAdsStrategyQuestion,
  isMetaAdsStrategyComplete,
  META_ADS_STRATEGY_QUESTIONS,
  META_ADS_STRATEGY_SECTIONS,
  META_ADS_STRATEGY_TOTAL_QUESTIONS,
} from "../shared/marketingMetaAdsStrategy";

const providerSeeds = [
  { alias: "routine-copy", provider: "Manus Built-in LLM", modelId: "gpt-5-mini", purpose: "Structured extraction, classification and copy variants", status: "available_internal", notes: "Configured alias only. Disabled until a Brand Book is approved and a work order is approved." },
  { alias: "strategy-synthesis", provider: "Manus Built-in LLM", modelId: "gpt-5", purpose: "Brand synthesis, strategic interpretation and difficult attribution analysis", status: "available_internal", notes: "Configured alias only. Disabled until an approved work order exists." },
  { alias: "editorial-challenge", provider: "Anthropic", modelId: "claude-sonnet-4-6", purpose: "Independent claim and editorial challenge", status: "requires_configuration", notes: "No external provider credential is stored here. Configure a server-side connector before enabling." },
  { alias: "source-research", provider: "Manus API", modelId: null, purpose: "Source-heavy asynchronous research and maintenance tasks", status: "requires_configuration", notes: "Requires explicit API configuration and verified webhook setup before use." },
  { alias: "template-render", provider: "Creatomate", modelId: null, purpose: "Branded image and reel template rendering", status: "requires_configuration", notes: "Requires a server-side vendor credential and approved templates before use." },
  { alias: "specialty-motion", provider: "Runway", modelId: null, purpose: "Approved specialty motion footage", status: "requires_configuration", notes: "Requires a server-side vendor credential, per-clip cap and explicit approval before use." },
  { alias: "elevay-arabic-voice", provider: "Existing ELEVAY Voice Adapter", modelId: "eleven_v3", purpose: "Approved Arabic voice-over from a finalized script", status: "available_internal", notes: "Existing server-side voice adapter. Disabled until a script is approved; failed synthesis must hold for review without substitution." },
] as const;

const answerInput = z.object({
  sessionId: z.number().int().positive(),
  questionNumber: z.number().int().min(1).max(BRAND_DISCOVERY_TOTAL_QUESTIONS),
  answerText: z.string().trim().min(1).max(20_000),
  decisionStatus: z.enum(["answered", "unknown", "needs_confirmation"]).default("answered"),
  interpretedFields: z.record(z.string(), z.unknown()).optional(),
  attachments: z.array(z.object({ label: z.string().trim().min(1).max(200), url: z.string().url().max(2_000) })).max(8).default([]),
});

const bulkAnswerInput = z.object({
  sessionId: z.number().int().positive(),
  answers: z.array(answerInput.omit({ sessionId: true })).min(1).max(BRAND_DISCOVERY_TOTAL_QUESTIONS),
}).superRefine((value, ctx) => {
  const seen = new Set<number>();
  for (let index = 0; index < value.answers.length; index += 1) {
    const answer = value.answers[index]!;
    if (seen.has(answer.questionNumber)) {
      ctx.addIssue({ code: "custom", path: ["answers", index, "questionNumber"], message: "Each Brand Discovery question can appear only once in a save request." });
    }
    seen.add(answer.questionNumber);
  }
});

const metaStrategyAnswerInput = z.object({
  sessionId: z.number().int().positive(),
  questionNumber: z.number().int().min(1).max(META_ADS_STRATEGY_TOTAL_QUESTIONS),
  answerText: z.string().trim().min(1).max(20_000),
  decisionStatus: z.enum(["answered", "unknown"]).default("answered"),
  normalizedFields: z.record(z.string(), z.unknown()).optional(),
  attachments: z.array(z.object({ label: z.string().trim().min(1).max(200), url: z.string().url().max(2_000) })).max(8).default([]),
  gapDueAt: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  if (value.decisionStatus === "unknown" && !value.gapDueAt) {
    ctx.addIssue({ code: "custom", path: ["gapDueAt"], message: "An unknown answer must have an owner follow-up deadline." });
  }
});

const knowledgeSourceInput = z.object({
  programKey: z.string().trim().min(2).max(96).regex(/^[a-z0-9_]+$/, "Use a lowercase programme key with letters, numbers, and underscores only."),
  programLabel: z.string().trim().min(2).max(160),
  title: z.string().trim().min(4).max(500),
  authorityName: z.string().trim().min(2).max(255),
  sourceType: z.enum(MARKETING_KNOWLEDGE_SOURCE_TYPES),
  sourceUrl: z.string().url().max(2_000),
  snapshotText: z.string().trim().min(30).max(30_000),
  sourcePublishedAt: z.number().int().positive().optional(),
  sourceEffectiveAt: z.number().int().positive().optional(),
});

const knowledgeClaimInput = z.object({
  programKey: z.string().trim().min(2).max(96).regex(/^[a-z0-9_]+$/),
  claimType: z.enum(MARKETING_KNOWLEDGE_CLAIM_TYPES),
  claimText: z.string().trim().min(12).max(10_000),
  sourceId: z.number().int().positive(),
  riskLevel: z.enum(MARKETING_KNOWLEDGE_RISK_LEVELS),
});

const workOrderInput = z.object({
  workType: z.enum(MARKETING_WORK_ORDER_TYPES),
  title: z.string().trim().min(6).max(300),
  programKey: z.string().trim().min(2).max(96).regex(/^[a-z0-9_]+$/).optional(),
  objective: z.string().trim().min(12).max(500),
  brief: z.string().trim().min(30).max(20_000),
  requestedProviderAlias: z.string().trim().min(3).max(96),
  knowledgeClaimIds: z.array(z.number().int().positive()).max(32).default([]),
  inputArtifactIds: z.array(z.number().int().positive()).max(32).default([]),
  costCeilingUsd: z.number().finite().min(0).max(10_000),
  estimatedCostUsd: z.number().finite().min(0).max(10_000),
  maxIterations: z.number().int().min(1).max(5).default(1),
});

const workOrderTransitionInput = z.object({
  workOrderId: z.number().int().positive(),
  nextStatus: z.enum(MARKETING_WORK_ORDER_STATUSES),
  note: z.string().trim().min(4).max(4_000),
});

const contentPacketInput = z.object({
  workOrderId: z.number().int().positive(),
  contentType: z.enum(MARKETING_CONTENT_TYPES),
  title: z.string().trim().min(6).max(300),
  programKey: z.string().trim().min(2).max(96).regex(/^[a-z0-9_]+$/, "Use a lowercase programme key with letters, numbers, and underscores only."),
  platforms: z.array(z.enum(["instagram", "facebook", "tiktok", "linkedin", "youtube", "whatsapp", "web"])).min(1).max(7),
  funnelStage: z.string().trim().min(2).max(64),
  audience: z.string().trim().min(4).max(500),
  objective: z.string().trim().min(12).max(500),
  arabicCopy: z.string().trim().min(12).max(20_000),
  englishCopy: z.string().trim().max(20_000).optional(),
  caption: z.string().trim().max(20_000).optional(),
  cta: z.string().trim().min(2).max(500),
  landingDestination: z.string().url().max(2_000).optional(),
  scheduledFor: z.number().int().positive().optional(),
  claimIds: z.array(z.number().int().positive()).min(1).max(32),
  visualBrief: z.string().trim().max(20_000).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  previewUrl: z.string().url().max(2_000).optional(),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/i, "Preview fingerprint must be a SHA-256 hash.").optional(),
  exceptionalClaim: z.boolean().default(false),
  changeSummary: z.string().trim().min(4).max(4_000).optional(),
});

const contentQaInput = z.object({
  packetId: z.number().int().positive(),
  results: z.array(z.object({
    check: z.enum(MARKETING_CONTENT_QA_CHECKS),
    passed: z.boolean(),
    note: z.string().trim().min(4).max(2_000),
  })).length(MARKETING_CONTENT_QA_CHECKS.length),
  feedback: z.string().trim().min(4).max(8_000).optional(),
});

const contentDecisionInput = z.object({
  packetId: z.number().int().positive(),
  note: z.string().trim().min(4).max(8_000),
  annotations: z.array(z.string().trim().min(2).max(1_000)).max(32).default([]),
});

function money(value: number) {
  return value.toFixed(2);
}

function workOrderKey() {
  return `mwo-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 10)}`;
}

function contentPacketKey() {
  return `mcp-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 10)}`;
}

async function appendWorkOrderEvent(input: {
  workOrderId: number;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown>;
  actorUserId: number;
  createdAt?: number;
}) {
  const db = await requireDb();
  const now = input.createdAt ?? Date.now();
  await db.insert(marketingWorkOrderEvents).values({
    workOrderId: input.workOrderId,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    reason: input.reason ?? null,
    payloadJson: JSON.stringify(input.payload ?? {}),
    actorUserId: input.actorUserId,
    createdAt: now,
  });
}

async function appendContentReviewEvent(input: {
  packetId: number;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  feedback?: string | null;
  annotations?: string[];
  payload?: Record<string, unknown>;
  actorUserId: number;
  createdAt?: number;
}) {
  const db = await requireDb();
  await db.insert(marketingContentReviewEvents).values({
    packetId: input.packetId,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    feedback: input.feedback ?? null,
    annotationsJson: JSON.stringify(input.annotations ?? []),
    payloadJson: JSON.stringify(input.payload ?? {}),
    actorUserId: input.actorUserId,
    createdAt: input.createdAt ?? Date.now(),
  });
}

async function getApprovedContentClaims(claimIds: number[], programKey: string) {
  const db = await requireDb();
  const ids = Array.from(new Set(claimIds));
  if (ids.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "A content packet requires approved claim references." });
  const claims = await db.select({
    id: marketingKnowledgeClaims.id,
    programKey: marketingKnowledgeClaims.programKey,
    status: marketingKnowledgeClaims.status,
    sourceSnapshotHash: marketingKnowledgeClaims.sourceSnapshotHash,
    sourceStatus: marketingKnowledgeSources.status,
    sourceChangeState: marketingKnowledgeSources.changeState,
  }).from(marketingKnowledgeClaims)
    .innerJoin(marketingKnowledgeSources, eq(marketingKnowledgeClaims.sourceId, marketingKnowledgeSources.id))
    .where(inArray(marketingKnowledgeClaims.id, ids));
  if (claims.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more claim references do not exist." });
  if (claims.some(claim => claim.programKey !== programKey)) throw new TRPCError({ code: "BAD_REQUEST", message: "Every content claim must match the packet programme." });
  if (claims.some(claim => claim.status !== "approved" || claim.sourceStatus !== "approved" || claim.sourceChangeState !== "tracked")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Every content claim must be owner-approved and backed by a tracked official source." });
  }
  return claims;
}

async function requireApprovedCreativeWorkOrder(workOrderId: number, programKey: string) {
  const db = await requireDb();
  const [order] = await db.select().from(marketingWorkOrders).where(eq(marketingWorkOrders.id, workOrderId)).limit(1);
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "The source work order was not found." });
  if (order.status !== "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "Content packets require an explicitly owner-approved work order." });
  if (!["strategy_brief", "creative_package", "voiceover_draft", "media_render_brief", "qa_review"].includes(order.workType)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Content Studio requires an approved creative or strategy work order, not a research-only order." });
  }
  if (order.programKey && order.programKey !== programKey) throw new TRPCError({ code: "BAD_REQUEST", message: "The packet programme must match its approved work order." });
  const activeBook = await getActiveBrandBookForWorkOrder();
  if (!activeBook || order.brandBookId !== activeBook.id || order.brandBookVersion !== activeBook.version) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The source work order is not anchored to the current active Brand Book." });
  }
  return order;
}

function validateContentPacketText(input: z.infer<typeof contentPacketInput>) {
  const fields: Array<[string, string | undefined]> = [
    ["title", input.title], ["audience", input.audience], ["objective", input.objective], ["Arabic copy", input.arabicCopy],
    ["English copy", input.englishCopy], ["caption", input.caption], ["CTA", input.cta], ["visual brief", input.visualBrief],
    ["change summary", input.changeSummary], ["payload", JSON.stringify(input.payload)],
  ];
  for (const [label, value] of fields) {
    if (!value) continue;
    const disallowed = findDisallowedContentPacketData(value);
    if (disallowed) throw new TRPCError({ code: "BAD_REQUEST", message: `Remove ${disallowed} from the content packet ${label}. Content packets must not contain client or Lead identity data.` });
  }
  if (!contentPacketHasArabicText(input.arabicCopy)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Arabic copy must include Arabic text for ELEVAY's Arabic-first content workflow." });
  }
}

function packetContentHash(input: z.infer<typeof contentPacketInput>, rootPacketKey: string, versionNumber: number) {
  return crypto.createHash("sha256").update(JSON.stringify({
    rootPacketKey,
    versionNumber,
    workOrderId: input.workOrderId,
    contentType: input.contentType,
    title: normalizeContentStudioText(input.title),
    programKey: input.programKey,
    platforms: Array.from(new Set(input.platforms)).sort(),
    funnelStage: normalizeContentStudioText(input.funnelStage),
    audience: normalizeContentStudioText(input.audience),
    objective: normalizeContentStudioText(input.objective),
    arabicCopy: normalizeContentStudioText(input.arabicCopy),
    englishCopy: input.englishCopy ? normalizeContentStudioText(input.englishCopy) : null,
    caption: input.caption ? normalizeContentStudioText(input.caption) : null,
    cta: normalizeContentStudioText(input.cta),
    landingDestination: input.landingDestination ?? null,
    scheduledFor: input.scheduledFor ?? null,
    claimIds: Array.from(new Set(input.claimIds)).sort((a, b) => a - b),
    visualBrief: input.visualBrief ? normalizeContentStudioText(input.visualBrief) : null,
    payload: input.payload,
    previewUrl: input.previewUrl ?? null,
    previewHash: input.previewHash?.toLowerCase() ?? null,
    exceptionalClaim: input.exceptionalClaim,
  })).digest("hex");
}

async function getActiveBrandBookForWorkOrder() {
  const db = await requireDb();
  const [brandBook] = await db.select().from(marketingBrandBooks)
    .where(eq(marketingBrandBooks.status, "active"))
    .orderBy(desc(marketingBrandBooks.version)).limit(1);
  return brandBook ?? null;
}

async function validateWorkOrderReferences(input: z.infer<typeof workOrderInput>) {
  const db = await requireDb();
  const claimed = Array.from(new Set(input.knowledgeClaimIds));
  if (claimed.length > 0) {
    const claims = await db.select({
      id: marketingKnowledgeClaims.id,
      programKey: marketingKnowledgeClaims.programKey,
      status: marketingKnowledgeClaims.status,
      sourceSnapshotHash: marketingKnowledgeClaims.sourceSnapshotHash,
      sourceStatus: marketingKnowledgeSources.status,
      sourceChangeState: marketingKnowledgeSources.changeState,
    }).from(marketingKnowledgeClaims)
      .innerJoin(marketingKnowledgeSources, eq(marketingKnowledgeClaims.sourceId, marketingKnowledgeSources.id))
      .where(inArray(marketingKnowledgeClaims.id, claimed));
    if (claims.length !== claimed.length) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more requested claim references do not exist." });
    if (claims.some(claim => claim.status !== "approved" || claim.sourceStatus !== "approved" || claim.sourceChangeState !== "tracked")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Every referenced claim must be owner-approved and backed by a tracked official source." });
    }
    if (input.programKey && claims.some(claim => claim.programKey !== input.programKey)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Claim references must match the work order programme." });
    }
    return claims;
  }
  if (workOrderRequiresApprovedClaims(input.workType)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This work type requires at least one approved, tracked claim reference." });
  }
  return [];
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Marketing System database is unavailable." });
  return db;
}

async function getEffectiveRole(user: { id: number; openId: string | null; email?: string | null }): Promise<EffectiveMarketingSystemRole> {
  if (isOwner(user)) return "owner";
  const db = await requireDb();
  const [assignment] = await db
    .select({ role: marketingSystemRoleAssignments.role, isActive: marketingSystemRoleAssignments.isActive })
    .from(marketingSystemRoleAssignments)
    .where(eq(marketingSystemRoleAssignments.userId, user.id))
    .limit(1);
  return assignment?.isActive && isMarketingSystemRole(assignment.role) ? assignment.role : null;
}

async function requireCapability(
  user: { id: number; openId: string | null; email?: string | null },
  capability: MarketingSystemCapability,
): Promise<EffectiveMarketingSystemRole> {
  const role = await getEffectiveRole(user);
  if (!hasMarketingSystemCapability(role, capability)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This Marketing System action requires an assigned role." });
  }
  return role;
}

async function requireOwner(user: { id: number; openId: string | null; email?: string | null }) {
  if (!isOwner(user)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only Mahmoud can change Brand Studio, provider, role, approval, or campaign governance." });
  }
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function seedProviderProfiles() {
  const db = await requireDb();
  const now = Date.now();
  for (const seed of providerSeeds) {
    await db.insert(marketingProviderProfiles).values({
      ...seed,
      isEnabled: false,
      killSwitchEnabled: true,
      createdAt: now,
      updatedAt: now,
    }).onDuplicateKeyUpdate({
      set: {
        provider: seed.provider,
        modelId: seed.modelId,
        purpose: seed.purpose,
        notes: seed.notes,
        updatedAt: now,
      },
    });
  }
}

async function seedOfficialKnowledgeSources(systemUserId: number) {
  const db = await requireDb();
  const now = Date.now();
  for (const source of OFFICIAL_KNOWLEDGE_SOURCE_SEEDS) {
    const normalized = normalizeOfficialKnowledgeUrl(source.sourceUrl);
    const snapshotText = stableKnowledgeHash(source.snapshotText);
    const snapshotHash = crypto.createHash("sha256").update(snapshotText).digest("hex");
    await db.insert(marketingKnowledgeSources).values({
      ...source,
      sourceUrl: normalized.url,
      sourceDomain: normalized.domain,
      trustTier: 1,
      status: "candidate",
      snapshotText,
      snapshotHash,
      snapshotRetrievedAt: now,
      sourcePublishedAt: source.sourcePublishedAt ?? null,
      sourceEffectiveAt: null,
      changeState: "untracked",
      changeSummary: "Candidate seeded from the Phase 2 official-source record; explicit owner review required before any claim can cite it.",
      reviewedByUserId: null,
      reviewedAt: null,
      createdByUserId: systemUserId,
      createdAt: now,
      updatedAt: now,
    }).onDuplicateKeyUpdate({
      // Candidate metadata may be refreshed, but an owner-approved source snapshot is immutable.
      set: {
        title: source.title,
        authorityName: source.authorityName,
        sourceType: source.sourceType,
        programKey: source.programKey,
        programLabel: source.programLabel,
        sourceDomain: normalized.domain,
        updatedAt: now,
      },
    });
  }
}

async function getSessionWithAnswers(sessionId: number) {
  const db = await requireDb();
  const [session] = await db.select().from(marketingBrandDiscoverySessions)
    .where(eq(marketingBrandDiscoverySessions.id, sessionId)).limit(1);
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Brand Discovery session was not found." });
  const answers = await db.select().from(marketingBrandDiscoveryAnswers)
    .where(eq(marketingBrandDiscoveryAnswers.sessionId, session.id))
    .orderBy(marketingBrandDiscoveryAnswers.questionNumber);
  return { session, answers };
}

function presentSession(record: Awaited<ReturnType<typeof getSessionWithAnswers>>) {
  const answeredNumbers = record.answers.map(answer => answer.questionNumber);
  const nextQuestionNumber = calculateNextBrandDiscoveryQuestion(answeredNumbers);
  return {
    session: record.session,
    totalQuestions: BRAND_DISCOVERY_TOTAL_QUESTIONS,
    answeredCount: answeredNumbers.length,
    nextQuestionNumber,
    isComplete: isBrandDiscoveryComplete(answeredNumbers),
    sections: BRAND_DISCOVERY_SECTIONS,
    questions: BRAND_DISCOVERY_QUESTIONS,
    answers: record.answers.map(answer => ({
      ...answer,
      interpretedFields: parseJson<Record<string, unknown>>(answer.interpretedJson, {}),
      attachments: parseJson<Array<{ label: string; url: string }>>(answer.attachmentsJson, []),
    })),
  };
}

async function getMetaStrategySessionWithAnswers(sessionId: number) {
  const db = await requireDb();
  const [session] = await db.select().from(marketingMetaAdsStrategySessions)
    .where(eq(marketingMetaAdsStrategySessions.id, sessionId)).limit(1);
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Meta Ads Strategy Intake session was not found." });
  const answers = await db.select().from(marketingMetaAdsStrategyAnswers)
    .where(and(eq(marketingMetaAdsStrategyAnswers.sessionId, sessionId), eq(marketingMetaAdsStrategyAnswers.scopeType, "company")))
    .orderBy(marketingMetaAdsStrategyAnswers.questionNumber);
  return { session, answers };
}

function presentMetaStrategySession(record: Awaited<ReturnType<typeof getMetaStrategySessionWithAnswers>>) {
  const answeredNumbers = record.answers.map(answer => answer.questionNumber);
  const nextQuestionNumber = calculateNextMetaAdsStrategyQuestion(answeredNumbers);
  return {
    session: record.session,
    totalQuestions: META_ADS_STRATEGY_TOTAL_QUESTIONS,
    answeredCount: answeredNumbers.length,
    nextQuestionNumber,
    isComplete: isMetaAdsStrategyComplete(answeredNumbers),
    sections: META_ADS_STRATEGY_SECTIONS,
    questions: META_ADS_STRATEGY_QUESTIONS,
    answers: record.answers.map(answer => ({
      ...answer,
      normalizedFields: parseJson<Record<string, unknown>>(answer.normalizedJson, {}),
      attachments: parseJson<Array<{ label: string; url: string }>>(answer.attachmentsJson, []),
    })),
  };
}

export const marketingSystemRouter = router({
  access: protectedProcedure.query(async ({ ctx }) => {
    const role = await getEffectiveRole(ctx.user);
    return {
      role,
      roleLabel: role === "owner" ? "Owner" : role ? MARKETING_SYSTEM_ROLE_LABELS[role] : null,
      capabilities: getMarketingSystemCapabilities(role),
      brandStudioAvailable: hasMarketingSystemCapability(role, "view_brand_book"),
    };
  }),

  getCurrentMetaAdsStrategy: protectedProcedure.query(async ({ ctx }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [session] = await db.select().from(marketingMetaAdsStrategySessions)
      .where(eq(marketingMetaAdsStrategySessions.status, "in_progress"))
      .orderBy(desc(marketingMetaAdsStrategySessions.version)).limit(1);
    return session ? presentMetaStrategySession(await getMetaStrategySessionWithAnswers(session.id)) : null;
  }),

  startOrResumeMetaAdsStrategy: protectedProcedure.mutation(async ({ ctx }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [existing] = await db.select().from(marketingMetaAdsStrategySessions)
      .where(eq(marketingMetaAdsStrategySessions.status, "in_progress"))
      .orderBy(desc(marketingMetaAdsStrategySessions.version)).limit(1);
    if (existing) return presentMetaStrategySession(await getMetaStrategySessionWithAnswers(existing.id));
    const [latest] = await db.select({ version: marketingMetaAdsStrategySessions.version }).from(marketingMetaAdsStrategySessions)
      .orderBy(desc(marketingMetaAdsStrategySessions.version)).limit(1);
    const now = Date.now();
    const result = await db.insert(marketingMetaAdsStrategySessions).values({
      version: (latest?.version ?? 0) + 1,
      status: "in_progress",
      currentQuestionNumber: 1,
      createdByUserId: ctx.user.id,
      createdAt: now,
      updatedAt: now,
    });
    const sessionId = Number((result as { insertId?: number }).insertId);
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_meta_ads_strategy_session", sessionId, "Started Meta Ads Strategy Intake");
    return presentMetaStrategySession(await getMetaStrategySessionWithAnswers(sessionId));
  }),

  uploadMetaAdsStrategyEvidence: protectedProcedure.input(z.object({
    sessionId: z.number().int().positive(),
    questionNumber: z.number().int().min(1).max(META_ADS_STRATEGY_TOTAL_QUESTIONS),
    fileName: z.string().trim().min(1).max(180),
    mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
    fileBase64: z.string().min(4).max(14_000_000),
  })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const { session } = await getMetaStrategySessionWithAnswers(input.sessionId);
    if (session.status !== "in_progress") throw new TRPCError({ code: "BAD_REQUEST", message: "Evidence can only be added to an in-progress Meta Ads Strategy Intake." });
    const bytes = Buffer.from(input.fileBase64, "base64");
    if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Strategy evidence must be between 1 byte and 10 MB." });
    const extension = input.fileName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    const uploaded = await storagePut(`marketing/meta-ads-strategy/${input.sessionId}/q${input.questionNumber}-${crypto.randomUUID()}.${extension}`, bytes, input.mimeType);
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_meta_ads_strategy_evidence", `${input.sessionId}:${input.questionNumber}`, JSON.stringify({ sha256: digest, mimeType: input.mimeType, bytes: bytes.length }));
    return { label: input.fileName, url: uploaded.url, sha256: digest, mimeType: input.mimeType, bytes: bytes.length };
  }),

  saveMetaAdsStrategyAnswer: protectedProcedure.input(metaStrategyAnswerInput).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    getMetaAdsStrategyQuestion(input.questionNumber);
    const db = await requireDb();
    const { session } = await getMetaStrategySessionWithAnswers(input.sessionId);
    if (session.status !== "in_progress") throw new TRPCError({ code: "BAD_REQUEST", message: "Only an in-progress Meta Ads Strategy Intake can be edited." });
    const now = Date.now();
    const [existing] = await db.select({ id: marketingMetaAdsStrategyAnswers.id }).from(marketingMetaAdsStrategyAnswers)
      .where(and(eq(marketingMetaAdsStrategyAnswers.sessionId, input.sessionId), eq(marketingMetaAdsStrategyAnswers.questionNumber, input.questionNumber), eq(marketingMetaAdsStrategyAnswers.scopeType, "company"))).limit(1);
    const values = {
      answerText: input.answerText,
      normalizedJson: JSON.stringify(input.normalizedFields ?? {}),
      attachmentsJson: JSON.stringify(input.attachments),
      decisionStatus: input.decisionStatus,
      gapOwnerUserId: input.decisionStatus === "unknown" ? ctx.user.id : null,
      gapDueAt: input.decisionStatus === "unknown" ? input.gapDueAt! : null,
      answeredByUserId: ctx.user.id,
      updatedAt: now,
    };
    if (existing) {
      await db.update(marketingMetaAdsStrategyAnswers).set(values).where(eq(marketingMetaAdsStrategyAnswers.id, existing.id));
    } else {
      await db.insert(marketingMetaAdsStrategyAnswers).values({ sessionId: input.sessionId, questionNumber: input.questionNumber, scopeType: "company", programKey: null, ...values, createdAt: now });
    }
    const record = await getMetaStrategySessionWithAnswers(input.sessionId);
    const nextQuestionNumber = calculateNextMetaAdsStrategyQuestion(record.answers.map(answer => answer.questionNumber));
    await db.update(marketingMetaAdsStrategySessions).set({ currentQuestionNumber: nextQuestionNumber ?? META_ADS_STRATEGY_TOTAL_QUESTIONS, updatedAt: now, ...(nextQuestionNumber === null ? { completedAt: now } : {}) })
      .where(eq(marketingMetaAdsStrategySessions.id, input.sessionId));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_meta_ads_strategy_answer", `${input.sessionId}:${input.questionNumber}`, JSON.stringify({ questionNumber: input.questionNumber, decisionStatus: input.decisionStatus, hasGapDeadline: Boolean(input.gapDueAt) }));
    return presentMetaStrategySession(await getMetaStrategySessionWithAnswers(input.sessionId));
  }),

  resetMetaAdsStrategy: protectedProcedure.input(z.object({
    scope: z.union([z.literal("all"), z.enum(META_ADS_STRATEGY_SECTIONS.map(section => section.key) as [string, ...string[]])]),
  })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [current] = await db.select().from(marketingMetaAdsStrategySessions)
      .where(eq(marketingMetaAdsStrategySessions.status, "in_progress"))
      .orderBy(desc(marketingMetaAdsStrategySessions.version)).limit(1);
    const [latest] = await db.select({ version: marketingMetaAdsStrategySessions.version }).from(marketingMetaAdsStrategySessions)
      .orderBy(desc(marketingMetaAdsStrategySessions.version)).limit(1);
    const now = Date.now();
    const result = await db.insert(marketingMetaAdsStrategySessions).values({ version: (latest?.version ?? 0) + 1, status: "in_progress", resetScope: input.scope, currentQuestionNumber: 1, createdByUserId: ctx.user.id, createdAt: now, updatedAt: now });
    const sessionId = Number((result as { insertId?: number }).insertId);
    if (current && input.scope !== "all") {
      const oldAnswers = (await getMetaStrategySessionWithAnswers(current.id)).answers;
      const resetNumbers = new Set(META_ADS_STRATEGY_QUESTIONS.filter(question => question.section === input.scope).map(question => question.number));
      for (const answer of oldAnswers.filter(answer => !resetNumbers.has(answer.questionNumber))) {
        await db.insert(marketingMetaAdsStrategyAnswers).values({ sessionId, questionNumber: answer.questionNumber, scopeType: answer.scopeType, programKey: answer.programKey, answerText: answer.answerText, normalizedJson: answer.normalizedJson, attachmentsJson: answer.attachmentsJson, decisionStatus: answer.decisionStatus, gapOwnerUserId: answer.gapOwnerUserId, gapDueAt: answer.gapDueAt, answeredByUserId: ctx.user.id, createdAt: now, updatedAt: now });
      }
    }
    if (current) await db.update(marketingMetaAdsStrategySessions).set({ status: "superseded", updatedAt: now }).where(eq(marketingMetaAdsStrategySessions.id, current.id));
    const record = await getMetaStrategySessionWithAnswers(sessionId);
    const nextQuestionNumber = calculateNextMetaAdsStrategyQuestion(record.answers.map(answer => answer.questionNumber)) ?? 1;
    await db.update(marketingMetaAdsStrategySessions).set({ currentQuestionNumber: nextQuestionNumber, updatedAt: now }).where(eq(marketingMetaAdsStrategySessions.id, sessionId));
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_meta_ads_strategy_reset", sessionId, JSON.stringify({ scope: input.scope, sourceSessionId: current?.id ?? null }));
    return presentMetaStrategySession(await getMetaStrategySessionWithAnswers(sessionId));
  }),

  getBrandBooks: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_brand_book");
    const db = await requireDb();
    const rows = await db.select().from(marketingBrandBooks).orderBy(desc(marketingBrandBooks.version));
    return rows.map(row => ({ ...row, payload: parseJson<Record<string, unknown>>(row.brandPayloadJson, {}) }));
  }),

  getActiveBrandBook: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_brand_book");
    const db = await requireDb();
    const [row] = await db.select().from(marketingBrandBooks)
      .where(eq(marketingBrandBooks.status, "active"))
      .orderBy(desc(marketingBrandBooks.version)).limit(1);
    return row ? { ...row, payload: parseJson<Record<string, unknown>>(row.brandPayloadJson, {}) } : null;
  }),

  getCurrentDiscovery: protectedProcedure.query(async ({ ctx }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [session] = await db.select().from(marketingBrandDiscoverySessions)
      .where(and(eq(marketingBrandDiscoverySessions.status, "in_progress")))
      .orderBy(desc(marketingBrandDiscoverySessions.version)).limit(1);
    if (!session) return null;
    return presentSession(await getSessionWithAnswers(session.id));
  }),

  startOrResumeDiscovery: protectedProcedure.mutation(async ({ ctx }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [existing] = await db.select().from(marketingBrandDiscoverySessions)
      .where(eq(marketingBrandDiscoverySessions.status, "in_progress"))
      .orderBy(desc(marketingBrandDiscoverySessions.version)).limit(1);
    if (existing) return presentSession(await getSessionWithAnswers(existing.id));

    const [latest] = await db.select({ version: marketingBrandDiscoverySessions.version })
      .from(marketingBrandDiscoverySessions).orderBy(desc(marketingBrandDiscoverySessions.version)).limit(1);
    const now = Date.now();
    const result = await db.insert(marketingBrandDiscoverySessions).values({
      version: (latest?.version ?? 0) + 1,
      status: "in_progress",
      currentQuestionNumber: 1,
      createdByUserId: ctx.user.id,
      createdAt: now,
      updatedAt: now,
    });
    const sessionId = Number((result as { insertId?: number }).insertId);
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_brand_discovery_session", sessionId, "Started Brand Discovery interview");
    return presentSession(await getSessionWithAnswers(sessionId));
  }),

  uploadDiscoveryEvidence: protectedProcedure.input(z.object({
    sessionId: z.number().int().positive(),
    questionNumber: z.number().int().min(1).max(BRAND_DISCOVERY_TOTAL_QUESTIONS),
    fileName: z.string().trim().min(1).max(180),
    mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
    fileBase64: z.string().min(4).max(14_000_000),
  })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const { session } = await getSessionWithAnswers(input.sessionId);
    if (session.status !== "in_progress") throw new TRPCError({ code: "BAD_REQUEST", message: "Evidence can only be added to an in-progress Brand Discovery interview." });
    const bytes = Buffer.from(input.fileBase64, "base64");
    if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Brand evidence must be between 1 byte and 10 MB." });
    }
    const extension = input.fileName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    const key = `marketing/brand-discovery/${input.sessionId}/q${input.questionNumber}-${crypto.randomUUID()}.${extension}`;
    const uploaded = await storagePut(key, bytes, input.mimeType);
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_brand_discovery_evidence", `${input.sessionId}:${input.questionNumber}`, JSON.stringify({ sha256: digest, mimeType: input.mimeType, bytes: bytes.length }));
    return { label: input.fileName, url: uploaded.url, sha256: digest, mimeType: input.mimeType, bytes: bytes.length };
  }),

  saveDiscoveryAnswer: protectedProcedure.input(answerInput).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    getBrandDiscoveryQuestion(input.questionNumber);
    const db = await requireDb();
    const { session } = await getSessionWithAnswers(input.sessionId);
    if (session.status !== "in_progress") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only an in-progress Brand Discovery interview can be edited." });
    }
    const now = Date.now();
    await db.insert(marketingBrandDiscoveryAnswers).values({
      sessionId: input.sessionId,
      questionNumber: input.questionNumber,
      answerText: input.answerText,
      interpretedJson: JSON.stringify(input.interpretedFields ?? {}),
      attachmentsJson: JSON.stringify(input.attachments),
      decisionStatus: input.decisionStatus,
      answeredByUserId: ctx.user.id,
      createdAt: now,
      updatedAt: now,
    }).onDuplicateKeyUpdate({
      set: {
        answerText: input.answerText,
        interpretedJson: JSON.stringify(input.interpretedFields ?? {}),
        attachmentsJson: JSON.stringify(input.attachments),
        decisionStatus: input.decisionStatus,
        answeredByUserId: ctx.user.id,
        updatedAt: now,
      },
    });
    const record = await getSessionWithAnswers(input.sessionId);
    const nextQuestionNumber = calculateNextBrandDiscoveryQuestion(record.answers.map(answer => answer.questionNumber));
    await db.update(marketingBrandDiscoverySessions).set({
      currentQuestionNumber: nextQuestionNumber ?? BRAND_DISCOVERY_TOTAL_QUESTIONS,
      updatedAt: now,
      ...(nextQuestionNumber === null ? { completedAt: now } : {}),
    }).where(eq(marketingBrandDiscoverySessions.id, input.sessionId));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_brand_discovery_answer", `${input.sessionId}:${input.questionNumber}`, JSON.stringify({ questionNumber: input.questionNumber, decisionStatus: input.decisionStatus }));
    return presentSession(await getSessionWithAnswers(input.sessionId));
  }),

  saveDiscoveryAnswers: protectedProcedure.input(bulkAnswerInput).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    for (const answer of input.answers) getBrandDiscoveryQuestion(answer.questionNumber);
    const db = await requireDb();
    const { session } = await getSessionWithAnswers(input.sessionId);
    if (session.status !== "in_progress") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only an in-progress Brand Discovery interview can be edited." });
    }
    const now = Date.now();
    await db.transaction(async tx => {
      for (const answer of input.answers) {
        await tx.insert(marketingBrandDiscoveryAnswers).values({
          sessionId: input.sessionId,
          questionNumber: answer.questionNumber,
          answerText: answer.answerText,
          interpretedJson: JSON.stringify(answer.interpretedFields ?? {}),
          attachmentsJson: JSON.stringify(answer.attachments),
          decisionStatus: answer.decisionStatus,
          answeredByUserId: ctx.user.id,
          createdAt: now,
          updatedAt: now,
        }).onDuplicateKeyUpdate({
          set: {
            answerText: answer.answerText,
            interpretedJson: JSON.stringify(answer.interpretedFields ?? {}),
            attachmentsJson: JSON.stringify(answer.attachments),
            decisionStatus: answer.decisionStatus,
            answeredByUserId: ctx.user.id,
            updatedAt: now,
          },
        });
      }
      const answers = await tx.select({ questionNumber: marketingBrandDiscoveryAnswers.questionNumber })
        .from(marketingBrandDiscoveryAnswers)
        .where(eq(marketingBrandDiscoveryAnswers.sessionId, input.sessionId));
      const nextQuestionNumber = calculateNextBrandDiscoveryQuestion(answers.map(answer => answer.questionNumber));
      await tx.update(marketingBrandDiscoverySessions).set({
        currentQuestionNumber: nextQuestionNumber ?? BRAND_DISCOVERY_TOTAL_QUESTIONS,
        updatedAt: now,
        ...(nextQuestionNumber === null ? { completedAt: now } : {}),
      }).where(eq(marketingBrandDiscoverySessions.id, input.sessionId));
    });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_brand_discovery_bulk_answers", input.sessionId, JSON.stringify({ questionCount: input.answers.length, questionNumbers: input.answers.map(answer => answer.questionNumber), savedAt: now }));
    return presentSession(await getSessionWithAnswers(input.sessionId));
  }),

  resetDiscovery: protectedProcedure.input(z.object({
    scope: z.union([z.literal("all"), z.enum(BRAND_DISCOVERY_SECTIONS.map(section => section.key) as [string, ...string[]])]),
  })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [current] = await db.select().from(marketingBrandDiscoverySessions)
      .where(eq(marketingBrandDiscoverySessions.status, "in_progress"))
      .orderBy(desc(marketingBrandDiscoverySessions.version)).limit(1);
    const [latest] = await db.select({ version: marketingBrandDiscoverySessions.version })
      .from(marketingBrandDiscoverySessions).orderBy(desc(marketingBrandDiscoverySessions.version)).limit(1);
    const now = Date.now();
    const result = await db.insert(marketingBrandDiscoverySessions).values({
      version: (latest?.version ?? 0) + 1,
      status: "in_progress",
      resetScope: input.scope,
      currentQuestionNumber: 1,
      createdByUserId: ctx.user.id,
      createdAt: now,
      updatedAt: now,
    });
    const newSessionId = Number((result as { insertId?: number }).insertId);

    if (current && input.scope !== "all") {
      const sourceAnswers = (await getSessionWithAnswers(current.id)).answers;
      const resetNumbers = new Set(BRAND_DISCOVERY_QUESTIONS.filter(question => question.section === input.scope).map(question => question.number));
      for (const answer of sourceAnswers.filter(item => !resetNumbers.has(item.questionNumber))) {
        await db.insert(marketingBrandDiscoveryAnswers).values({
          sessionId: newSessionId,
          questionNumber: answer.questionNumber,
          answerText: answer.answerText,
          interpretedJson: answer.interpretedJson,
          attachmentsJson: answer.attachmentsJson,
          decisionStatus: answer.decisionStatus,
          answeredByUserId: ctx.user.id,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    if (current) {
      await db.update(marketingBrandDiscoverySessions).set({ status: "superseded", updatedAt: now })
        .where(eq(marketingBrandDiscoverySessions.id, current.id));
    }
    const record = await getSessionWithAnswers(newSessionId);
    const nextQuestion = calculateNextBrandDiscoveryQuestion(record.answers.map(answer => answer.questionNumber)) ?? 1;
    await db.update(marketingBrandDiscoverySessions).set({ currentQuestionNumber: nextQuestion, updatedAt: now })
      .where(eq(marketingBrandDiscoverySessions.id, newSessionId));
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_brand_discovery_reset", newSessionId, JSON.stringify({ scope: input.scope, sourceSessionId: current?.id ?? null }));
    return presentSession(await getSessionWithAnswers(newSessionId));
  }),

  proposeBrandBook: protectedProcedure.input(z.object({ sessionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const record = await getSessionWithAnswers(input.sessionId);
    if (record.session.status !== "in_progress") throw new TRPCError({ code: "BAD_REQUEST", message: "This Brand Discovery session cannot be proposed." });
    const answered = record.answers.map(answer => answer.questionNumber);
    if (!isBrandDiscoveryComplete(answered)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Complete all ${BRAND_DISCOVERY_TOTAL_QUESTIONS} questions before proposing the Brand Book.` });
    }
    if (record.answers.some(answer => answer.decisionStatus === "needs_confirmation")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Confirm every recommended response before proposing the Brand Book." });
    }
    const proposal = buildBrandBookProposal({
      sessionId: record.session.id,
      sessionVersion: record.session.version,
      answers: record.answers.map(answer => ({ questionNumber: answer.questionNumber, answerText: answer.answerText, decisionStatus: answer.decisionStatus })),
    });
    const payload = JSON.stringify(proposal);
    const contentHash = crypto.createHash("sha256").update(payload).digest("hex");
    const [latestBook] = await db.select({ version: marketingBrandBooks.version }).from(marketingBrandBooks)
      .orderBy(desc(marketingBrandBooks.version)).limit(1);
    const now = Date.now();
    const result = await db.insert(marketingBrandBooks).values({
      version: (latestBook?.version ?? 0) + 1,
      sessionId: record.session.id,
      status: "proposed",
      title: `ELEVAY Brand Book v${(latestBook?.version ?? 0) + 1}`,
      brandPayloadJson: payload,
      contentHash,
      createdByUserId: ctx.user.id,
      createdAt: now,
    });
    const brandBookId = Number((result as { insertId?: number }).insertId);
    await db.update(marketingBrandDiscoverySessions).set({ status: "proposed", proposedAt: now, updatedAt: now })
      .where(eq(marketingBrandDiscoverySessions.id, record.session.id));
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_brand_book_proposal", brandBookId, JSON.stringify({ sessionId: record.session.id, contentHash }));
    return { id: brandBookId, version: (latestBook?.version ?? 0) + 1, contentHash, payload: proposal };
  }),

  approveBrandBook: protectedProcedure.input(z.object({ brandBookId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [brandBook] = await db.select().from(marketingBrandBooks).where(eq(marketingBrandBooks.id, input.brandBookId)).limit(1);
    if (!brandBook) throw new TRPCError({ code: "NOT_FOUND", message: "Brand Book proposal was not found." });
    if (brandBook.status !== "proposed") throw new TRPCError({ code: "BAD_REQUEST", message: "Only a proposed Brand Book can be approved." });
    const now = Date.now();
    await db.update(marketingBrandBooks).set({ status: "superseded", supersededAt: now })
      .where(eq(marketingBrandBooks.status, "active"));
    await db.update(marketingBrandBooks).set({ status: "active", approvedByUserId: ctx.user.id, approvedAt: now, activatedAt: now })
      .where(eq(marketingBrandBooks.id, brandBook.id));
    await db.update(marketingBrandDiscoverySessions).set({ status: "approved", approvedAt: now, approvedByUserId: ctx.user.id, updatedAt: now })
      .where(eq(marketingBrandDiscoverySessions.id, brandBook.sessionId));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_brand_book_approval", brandBook.id, JSON.stringify({ version: brandBook.version, contentHash: brandBook.contentHash }));
    return { success: true, version: brandBook.version, status: "active" };
  }),

  providerReadiness: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_provider_readiness");
    await seedProviderProfiles();
    const db = await requireDb();
    const profiles = await db.select().from(marketingProviderProfiles).orderBy(marketingProviderProfiles.alias);
    return {
      profiles,
      productionGuard: "Provider profiles are disabled by default. No research, media generation, publishing, campaign, or spend action is available in Phase 1.",
    };
  }),

  listRoleAssignments: protectedProcedure.query(async ({ ctx }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    return db.select({
      assignmentId: marketingSystemRoleAssignments.id,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      role: marketingSystemRoleAssignments.role,
      isActive: marketingSystemRoleAssignments.isActive,
      assignedByUserId: marketingSystemRoleAssignments.assignedByUserId,
      updatedAt: marketingSystemRoleAssignments.updatedAt,
    }).from(marketingSystemRoleAssignments)
      .innerJoin(users, eq(marketingSystemRoleAssignments.userId, users.id))
      .orderBy(users.name);
  }),

  assignRole: protectedProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["marketing_manager", "researcher", "creative_producer", "analyst"]) })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User was not found." });
    const now = Date.now();
    await db.insert(marketingSystemRoleAssignments).values({
      userId: input.userId,
      role: input.role,
      isActive: true,
      assignedByUserId: ctx.user.id,
      createdAt: now,
      updatedAt: now,
    }).onDuplicateKeyUpdate({ set: { role: input.role, isActive: true, assignedByUserId: ctx.user.id, updatedAt: now } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_system_role_assignment", input.userId, JSON.stringify({ role: input.role }));
    return { success: true };
  }),

  revokeRole: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    await db.update(marketingSystemRoleAssignments).set({ isActive: false, updatedAt: Date.now(), assignedByUserId: ctx.user.id })
      .where(eq(marketingSystemRoleAssignments.userId, input.userId));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_system_role_revocation", input.userId, "Role revoked");
    return { success: true };
  }),

  getKnowledgeLibrary: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_knowledge");
    await seedOfficialKnowledgeSources(ctx.user.id);
    const db = await requireDb();
    const sources = await db.select().from(marketingKnowledgeSources)
      .orderBy(marketingKnowledgeSources.programLabel, desc(marketingKnowledgeSources.updatedAt));
    const claims = await db.select({
      id: marketingKnowledgeClaims.id,
      programKey: marketingKnowledgeClaims.programKey,
      claimType: marketingKnowledgeClaims.claimType,
      claimText: marketingKnowledgeClaims.claimText,
      sourceId: marketingKnowledgeClaims.sourceId,
      sourceSnapshotHash: marketingKnowledgeClaims.sourceSnapshotHash,
      riskLevel: marketingKnowledgeClaims.riskLevel,
      status: marketingKnowledgeClaims.status,
      reviewerNote: marketingKnowledgeClaims.reviewerNote,
      contentHash: marketingKnowledgeClaims.contentHash,
      proposedByUserId: marketingKnowledgeClaims.proposedByUserId,
      proposedAt: marketingKnowledgeClaims.proposedAt,
      reviewedByUserId: marketingKnowledgeClaims.reviewedByUserId,
      reviewedAt: marketingKnowledgeClaims.reviewedAt,
      retiredAt: marketingKnowledgeClaims.retiredAt,
      updatedAt: marketingKnowledgeClaims.updatedAt,
      sourceTitle: marketingKnowledgeSources.title,
      sourceUrl: marketingKnowledgeSources.sourceUrl,
      sourceStatus: marketingKnowledgeSources.status,
      sourceChangeState: marketingKnowledgeSources.changeState,
    }).from(marketingKnowledgeClaims)
      .innerJoin(marketingKnowledgeSources, eq(marketingKnowledgeClaims.sourceId, marketingKnowledgeSources.id))
      .orderBy(desc(marketingKnowledgeClaims.updatedAt));
    return {
      sources,
      claims,
      policy: "Only an owner-approved, tracked official source may support a claim. Claims stay proposed until Mahmoud explicitly approves them. The library has no publishing or client-advice action.",
    };
  }),

  addKnowledgeSource: protectedProcedure.input(knowledgeSourceInput).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "manage_knowledge_sources");
    const db = await requireDb();
    let normalized: { url: string; domain: string };
    try {
      normalized = normalizeOfficialKnowledgeUrl(input.sourceUrl);
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "The official source URL is invalid." });
    }
    const [existing] = await db.select({ id: marketingKnowledgeSources.id })
      .from(marketingKnowledgeSources).where(eq(marketingKnowledgeSources.sourceUrl, normalized.url)).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "This official source is already in the knowledge library." });
    const now = Date.now();
    const snapshotText = stableKnowledgeHash(input.snapshotText);
    const snapshotHash = crypto.createHash("sha256").update(snapshotText).digest("hex");
    const result = await db.insert(marketingKnowledgeSources).values({
      ...input,
      sourceUrl: normalized.url,
      sourceDomain: normalized.domain,
      trustTier: 1,
      status: "candidate",
      snapshotText,
      snapshotHash,
      snapshotRetrievedAt: now,
      sourcePublishedAt: input.sourcePublishedAt ?? null,
      sourceEffectiveAt: input.sourceEffectiveAt ?? null,
      changeState: "untracked",
      changeSummary: "Submitted for owner review; no claim may cite this source until approval.",
      reviewedByUserId: null,
      reviewedAt: null,
      createdByUserId: ctx.user.id,
      createdAt: now,
      updatedAt: now,
    });
    const sourceId = Number((result as { insertId?: number }).insertId);
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_knowledge_source", sourceId, JSON.stringify({ programKey: input.programKey, sourceDomain: normalized.domain, snapshotHash }));
    return { id: sourceId, status: "candidate", snapshotHash };
  }),

  approveKnowledgeSource: protectedProcedure.input(z.object({ sourceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [source] = await db.select().from(marketingKnowledgeSources).where(eq(marketingKnowledgeSources.id, input.sourceId)).limit(1);
    if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Knowledge source was not found." });
    if (!source.snapshotHash || !source.snapshotText) throw new TRPCError({ code: "BAD_REQUEST", message: "A source snapshot is required before approval." });
    if (source.status === "approved" && source.changeState === "tracked") return { success: true, status: "approved", duplicate: true };
    const now = Date.now();
    await db.update(marketingKnowledgeSources).set({
      status: "approved",
      changeState: "tracked",
      reviewedByUserId: ctx.user.id,
      reviewedAt: now,
      updatedAt: now,
    }).where(eq(marketingKnowledgeSources.id, source.id));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_knowledge_source_approval", source.id, JSON.stringify({ snapshotHash: source.snapshotHash }));
    return { success: true, status: "approved", duplicate: false };
  }),

  reportMaterialSourceChange: protectedProcedure.input(z.object({ sourceId: z.number().int().positive(), changeSummary: z.string().trim().min(10).max(4_000) })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [source] = await db.select({ id: marketingKnowledgeSources.id }).from(marketingKnowledgeSources)
      .where(eq(marketingKnowledgeSources.id, input.sourceId)).limit(1);
    if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Knowledge source was not found." });
    const now = Date.now();
    await db.update(marketingKnowledgeSources).set({ status: "needs_review", changeState: "material_change", changeSummary: input.changeSummary, reviewedByUserId: ctx.user.id, reviewedAt: now, updatedAt: now })
      .where(eq(marketingKnowledgeSources.id, source.id));
    await db.update(marketingKnowledgeClaims).set({ status: "needs_review", reviewerNote: "Source was marked as materially changed; the claim must be reviewed before reuse.", updatedAt: now })
      .where(and(eq(marketingKnowledgeClaims.sourceId, source.id), eq(marketingKnowledgeClaims.status, "approved")));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_knowledge_source_material_change", source.id, JSON.stringify({ changeSummary: input.changeSummary }));
    return { success: true, status: "needs_review" };
  }),

  proposeKnowledgeClaim: protectedProcedure.input(knowledgeClaimInput).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "create_knowledge_claims");
    const db = await requireDb();
    const [source] = await db.select().from(marketingKnowledgeSources).where(eq(marketingKnowledgeSources.id, input.sourceId)).limit(1);
    if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Select an official source from the knowledge library." });
    if (source.programKey !== input.programKey) throw new TRPCError({ code: "BAD_REQUEST", message: "A claim must use an official source from the same programme." });
    if (source.status !== "approved" || source.changeState !== "tracked" || !source.snapshotHash) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only an owner-approved, tracked source snapshot may support a proposed claim." });
    }
    const claimText = stableKnowledgeHash(input.claimText);
    const contentHash = crypto.createHash("sha256").update(`${input.programKey}\n${input.claimType}\n${claimText}\n${source.snapshotHash}`).digest("hex");
    const [existing] = await db.select({ id: marketingKnowledgeClaims.id, status: marketingKnowledgeClaims.status })
      .from(marketingKnowledgeClaims).where(eq(marketingKnowledgeClaims.contentHash, contentHash)).limit(1);
    if (existing) return { id: existing.id, status: existing.status, duplicate: true };
    const now = Date.now();
    const result = await db.insert(marketingKnowledgeClaims).values({
      programKey: input.programKey,
      claimType: input.claimType,
      claimText,
      sourceId: source.id,
      sourceSnapshotHash: source.snapshotHash,
      riskLevel: input.riskLevel,
      status: "proposed",
      reviewerNote: null,
      contentHash,
      proposedByUserId: ctx.user.id,
      proposedAt: now,
      reviewedByUserId: null,
      reviewedAt: null,
      retiredAt: null,
      updatedAt: now,
    });
    const claimId = Number((result as { insertId?: number }).insertId);
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_knowledge_claim", claimId, JSON.stringify({ programKey: input.programKey, sourceId: source.id, contentHash, riskLevel: input.riskLevel }));
    return { id: claimId, status: "proposed", duplicate: false };
  }),

  reviewKnowledgeClaim: protectedProcedure.input(z.object({
    claimId: z.number().int().positive(),
    decision: z.enum(["approved", "rejected", "needs_review"]),
    reviewerNote: z.string().trim().min(4).max(4_000),
  })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [claim] = await db.select().from(marketingKnowledgeClaims).where(eq(marketingKnowledgeClaims.id, input.claimId)).limit(1);
    if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Knowledge claim was not found." });
    if (claim.status === "retired") throw new TRPCError({ code: "BAD_REQUEST", message: "A retired claim cannot be reviewed. Create a new claim instead." });
    const [source] = await db.select().from(marketingKnowledgeSources).where(eq(marketingKnowledgeSources.id, claim.sourceId)).limit(1);
    if (!source) throw new TRPCError({ code: "BAD_REQUEST", message: "The supporting source no longer exists." });
    if (input.decision === "approved" && (source.status !== "approved" || source.changeState !== "tracked" || source.snapshotHash !== claim.sourceSnapshotHash)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The source changed or is not approved. Refresh the evidence and create a new claim before approval." });
    }
    const now = Date.now();
    await db.update(marketingKnowledgeClaims).set({ status: input.decision, reviewerNote: input.reviewerNote, reviewedByUserId: ctx.user.id, reviewedAt: now, updatedAt: now })
      .where(eq(marketingKnowledgeClaims.id, claim.id));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_knowledge_claim_review", claim.id, JSON.stringify({ decision: input.decision, sourceId: claim.sourceId, contentHash: claim.contentHash }));
    return { success: true, status: input.decision };
  }),

  getWorkOrders: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_work_orders");
    const db = await requireDb();
    const orders = await db.select().from(marketingWorkOrders)
      .orderBy(desc(marketingWorkOrders.updatedAt)).limit(120);
    const orderIds = orders.map(order => order.id);
    if (orderIds.length === 0) {
      return {
        orders: [],
        policy: "Phase 3 creates internal, typed work orders and dry-run lineage only. It cannot call a provider, publish content, contact clients, change Meta/CAPI, activate campaigns, or spend money.",
      };
    }
    const [artifacts, events, costEntries, profiles] = await Promise.all([
      db.select().from(marketingWorkOrderArtifacts).where(inArray(marketingWorkOrderArtifacts.workOrderId, orderIds)).orderBy(desc(marketingWorkOrderArtifacts.createdAt)),
      db.select().from(marketingWorkOrderEvents).where(inArray(marketingWorkOrderEvents.workOrderId, orderIds)).orderBy(desc(marketingWorkOrderEvents.createdAt)),
      db.select().from(marketingWorkOrderCostLedger).where(inArray(marketingWorkOrderCostLedger.workOrderId, orderIds)).orderBy(desc(marketingWorkOrderCostLedger.createdAt)),
      db.select({ alias: marketingProviderProfiles.alias, isEnabled: marketingProviderProfiles.isEnabled, killSwitchEnabled: marketingProviderProfiles.killSwitchEnabled, status: marketingProviderProfiles.status })
        .from(marketingProviderProfiles),
    ]);
    const profileByAlias = new Map(profiles.map(profile => [profile.alias, profile]));
    return {
      orders: orders.map(order => ({
        ...order,
        knowledgeClaimIds: parseJson<number[]>(order.knowledgeClaimIdsJson, []),
        inputArtifactIds: parseJson<number[]>(order.inputArtifactIdsJson, []),
        outputSchema: parseJson<Record<string, unknown>>(order.outputSchemaJson, {}),
        allowedNextStates: parseJson<string[]>(order.allowedNextStatesJson, []),
        provider: profileByAlias.get(order.requestedProviderAlias) ?? null,
        artifacts: artifacts.filter(artifact => artifact.workOrderId === order.id).map(artifact => ({
          ...artifact,
          payload: parseJson<Record<string, unknown>>(artifact.artifactPayloadJson, {}),
          claimIds: parseJson<number[]>(artifact.sourceClaimIdsJson, []),
          sourceSnapshotHashes: parseJson<string[]>(artifact.sourceSnapshotHashesJson, []),
        })),
        events: events.filter(event => event.workOrderId === order.id).map(event => ({ ...event, payload: parseJson<Record<string, unknown>>(event.payloadJson, {}) })),
        costs: costEntries.filter(entry => entry.workOrderId === order.id),
      })),
      policy: "Phase 3 creates internal, typed work orders and dry-run lineage only. It cannot call a provider, publish content, contact clients, change Meta/CAPI, activate campaigns, or spend money.",
    };
  }),

  getWorkOrderConfiguration: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "submit_work_orders");
    await seedProviderProfiles();
    const db = await requireDb();
    const [brandBook, profiles, claims] = await Promise.all([
      getActiveBrandBookForWorkOrder(),
      db.select({
        alias: marketingProviderProfiles.alias,
        provider: marketingProviderProfiles.provider,
        modelId: marketingProviderProfiles.modelId,
        purpose: marketingProviderProfiles.purpose,
        status: marketingProviderProfiles.status,
        isEnabled: marketingProviderProfiles.isEnabled,
        killSwitchEnabled: marketingProviderProfiles.killSwitchEnabled,
      }).from(marketingProviderProfiles).orderBy(marketingProviderProfiles.alias),
      db.select({
        id: marketingKnowledgeClaims.id,
        programKey: marketingKnowledgeClaims.programKey,
        claimType: marketingKnowledgeClaims.claimType,
        claimText: marketingKnowledgeClaims.claimText,
        sourceSnapshotHash: marketingKnowledgeClaims.sourceSnapshotHash,
      }).from(marketingKnowledgeClaims)
        .innerJoin(marketingKnowledgeSources, eq(marketingKnowledgeClaims.sourceId, marketingKnowledgeSources.id))
        .where(and(
          eq(marketingKnowledgeClaims.status, "approved"),
          eq(marketingKnowledgeSources.status, "approved"),
          eq(marketingKnowledgeSources.changeState, "tracked"),
        ))
        .orderBy(marketingKnowledgeClaims.programKey, desc(marketingKnowledgeClaims.updatedAt)),
    ]);
    return {
      brandBook: brandBook ? { id: brandBook.id, version: brandBook.version } : null,
      providers: profiles,
      claims,
      policy: "Provider aliases are informational in Phase 3. All provider profiles are expected to remain disabled with their kill switch engaged until a later approved execution phase.",
    };
  }),

  createWorkOrder: protectedProcedure.input(workOrderInput).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, capabilityForWorkOrder(input.workType));
    if (input.estimatedCostUsd > input.costCeilingUsd) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The estimated cost cannot exceed the work-order cost ceiling." });
    }
    for (const [label, value] of [["title", input.title], ["objective", input.objective], ["brief", input.brief]] as const) {
      const disallowed = findDisallowedWorkOrderData(value);
      if (disallowed) throw new TRPCError({ code: "BAD_REQUEST", message: `Remove ${disallowed} from the work-order ${label}. Work orders must not contain client or Lead identity data.` });
    }
    const db = await requireDb();
    await seedProviderProfiles();
    const [provider] = await db.select().from(marketingProviderProfiles)
      .where(eq(marketingProviderProfiles.alias, input.requestedProviderAlias)).limit(1);
    if (!provider) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a registered Marketing System provider alias." });
    const [brandBook, claims] = await Promise.all([
      getActiveBrandBookForWorkOrder(),
      validateWorkOrderReferences(input),
    ]);
    if (workOrderRequiresBrandBook(input.workType) && !brandBook) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This work type requires an active owner-approved Brand Book. Complete and approve Brand Discovery first." });
    }
    const now = Date.now();
    const key = workOrderKey();
    const result = await db.insert(marketingWorkOrders).values({
      workOrderKey: key,
      idempotencyKey: crypto.randomUUID(),
      workType: input.workType,
      title: normalizeWorkOrderText(input.title),
      programKey: input.programKey ?? null,
      objective: normalizeWorkOrderText(input.objective),
      brief: normalizeWorkOrderText(input.brief),
      status: "draft",
      requestedProviderAlias: provider.alias,
      providerModelId: provider.modelId,
      brandBookId: brandBook?.id ?? null,
      brandBookVersion: brandBook?.version ?? null,
      knowledgeClaimIdsJson: JSON.stringify(Array.from(new Set(input.knowledgeClaimIds))),
      inputArtifactIdsJson: JSON.stringify(Array.from(new Set(input.inputArtifactIds))),
      outputSchemaJson: JSON.stringify(MARKETING_WORK_ORDER_DEFAULT_SCHEMAS[input.workType]),
      allowedNextStatesJson: JSON.stringify(["submitted", "cancelled"]),
      costCeilingUsd: money(input.costCeilingUsd),
      estimatedCostUsd: money(input.estimatedCostUsd),
      actualCostUsd: "0.00",
      currency: "USD",
      maxIterations: input.maxIterations,
      iterationCount: 0,
      createdByUserId: ctx.user.id,
      submittedAt: null,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNote: null,
      lastDryRunAt: null,
      cancelledByUserId: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const workOrderId = Number((result as { insertId?: number }).insertId);
    await db.insert(marketingWorkOrderCostLedger).values([
      { workOrderId, entryKey: `${key}:ceiling`, entryType: "ceiling", amountUsd: money(input.costCeilingUsd), currency: "USD", providerAlias: provider.alias, note: "Owner approval is still required; this is a ceiling, not spend.", createdByUserId: ctx.user.id, createdAt: now },
      { workOrderId, entryKey: `${key}:estimate`, entryType: "estimate", amountUsd: money(input.estimatedCostUsd), currency: "USD", providerAlias: provider.alias, note: "Declared estimate only; no provider request or charge has occurred.", createdByUserId: ctx.user.id, createdAt: now },
    ]);
    await appendWorkOrderEvent({ workOrderId, action: "created", toStatus: "draft", actorUserId: ctx.user.id, createdAt: now, payload: { workOrderKey: key, workType: input.workType, providerAlias: provider.alias, brandBookVersion: brandBook?.version ?? null, approvedClaimCount: claims.length, costCeilingUsd: money(input.costCeilingUsd) } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_work_order", workOrderId, JSON.stringify({ workOrderKey: key, workType: input.workType, programKey: input.programKey ?? null, providerAlias: provider.alias, approvedClaimCount: claims.length, costCeilingUsd: money(input.costCeilingUsd) }));
    return { id: workOrderId, workOrderKey: key, status: "draft" as const };
  }),

  submitWorkOrder: protectedProcedure.input(z.object({ workOrderId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "submit_work_orders");
    const db = await requireDb();
    const [order] = await db.select().from(marketingWorkOrders).where(eq(marketingWorkOrders.id, input.workOrderId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Work order was not found." });
    if (order.createdByUserId !== ctx.user.id && !isOwner(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the work-order creator or Mahmoud can submit it." });
    if (!workOrderCanTransition(order.status as MarketingWorkOrderStatus, "submitted")) throw new TRPCError({ code: "BAD_REQUEST", message: "Only a draft work order can be submitted for owner review." });
    const now = Date.now();
    await db.update(marketingWorkOrders).set({ status: "submitted", submittedAt: now, updatedAt: now, allowedNextStatesJson: JSON.stringify(["approved", "hold", "rejected", "cancelled"]) }).where(eq(marketingWorkOrders.id, order.id));
    await appendWorkOrderEvent({ workOrderId: order.id, action: "submitted", fromStatus: order.status, toStatus: "submitted", actorUserId: ctx.user.id, createdAt: now, payload: { noProviderRequest: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_work_order_submission", order.id, JSON.stringify({ workOrderKey: order.workOrderKey }));
    return { success: true, status: "submitted" as const };
  }),

  reviewWorkOrder: protectedProcedure.input(workOrderTransitionInput).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    if (!["approved", "hold", "rejected"].includes(input.nextStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "An owner review can approve, hold, or reject a submitted work order." });
    const db = await requireDb();
    const [order] = await db.select().from(marketingWorkOrders).where(eq(marketingWorkOrders.id, input.workOrderId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Work order was not found." });
    if (!workOrderCanTransition(order.status as MarketingWorkOrderStatus, input.nextStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "This work-order status cannot be reviewed from its current state." });
    const claims = parseJson<number[]>(order.knowledgeClaimIdsJson, []);
    const workType = order.workType as (typeof MARKETING_WORK_ORDER_TYPES)[number];
    if (input.nextStatus === "approved") {
      if (workOrderRequiresBrandBook(workType) && !(await getActiveBrandBookForWorkOrder())) throw new TRPCError({ code: "BAD_REQUEST", message: "An active Brand Book is still required before approval." });
      if (workOrderRequiresApprovedClaims(workType)) {
        const approvedClaims = await db.select({ id: marketingKnowledgeClaims.id, status: marketingKnowledgeClaims.status, sourceStatus: marketingKnowledgeSources.status, sourceChangeState: marketingKnowledgeSources.changeState })
          .from(marketingKnowledgeClaims).innerJoin(marketingKnowledgeSources, eq(marketingKnowledgeClaims.sourceId, marketingKnowledgeSources.id))
          .where(inArray(marketingKnowledgeClaims.id, claims));
        if (claims.length === 0 || approvedClaims.length !== claims.length || approvedClaims.some(claim => claim.status !== "approved" || claim.sourceStatus !== "approved" || claim.sourceChangeState !== "tracked")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot approve: one or more claim references are missing, unapproved, or no longer tracked." });
        }
      }
    }
    const now = Date.now();
    const allowed = input.nextStatus === "approved" ? ["hold", "cancelled"] : input.nextStatus === "hold" ? ["submitted", "approved", "rejected", "cancelled"] : [];
    await db.update(marketingWorkOrders).set({ status: input.nextStatus, reviewedByUserId: ctx.user.id, reviewedAt: now, reviewNote: input.note, updatedAt: now, allowedNextStatesJson: JSON.stringify(allowed) }).where(eq(marketingWorkOrders.id, order.id));
    await appendWorkOrderEvent({ workOrderId: order.id, action: "owner_review", fromStatus: order.status, toStatus: input.nextStatus, reason: input.note, actorUserId: ctx.user.id, createdAt: now, payload: { explicitHumanDecision: true, noProviderRequest: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_work_order_review", order.id, JSON.stringify({ workOrderKey: order.workOrderKey, decision: input.nextStatus }));
    return { success: true, status: input.nextStatus };
  }),

  dryRunWorkOrder: protectedProcedure.input(z.object({ workOrderId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "run_work_order_dry_runs");
    const db = await requireDb();
    const [order] = await db.select().from(marketingWorkOrders).where(eq(marketingWorkOrders.id, input.workOrderId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Work order was not found." });
    if (order.status !== "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "Only an owner-approved work order can run a dry-run validation." });
    const [provider, brandBook] = await Promise.all([
      db.select().from(marketingProviderProfiles).where(eq(marketingProviderProfiles.alias, order.requestedProviderAlias)).limit(1).then(rows => rows[0] ?? null),
      getActiveBrandBookForWorkOrder(),
    ]);
    const claimIds = parseJson<number[]>(order.knowledgeClaimIdsJson, []);
    const claims = claimIds.length === 0 ? [] : await db.select({ id: marketingKnowledgeClaims.id, status: marketingKnowledgeClaims.status, sourceSnapshotHash: marketingKnowledgeClaims.sourceSnapshotHash, sourceStatus: marketingKnowledgeSources.status, sourceChangeState: marketingKnowledgeSources.changeState })
      .from(marketingKnowledgeClaims).innerJoin(marketingKnowledgeSources, eq(marketingKnowledgeClaims.sourceId, marketingKnowledgeSources.id))
      .where(inArray(marketingKnowledgeClaims.id, claimIds));
    const workType = order.workType as (typeof MARKETING_WORK_ORDER_TYPES)[number];
    const blockingReasons = [
      !provider ? "Requested provider alias is missing." : null,
      !provider?.isEnabled ? "Provider profile remains disabled." : null,
      provider?.killSwitchEnabled ? "Provider kill switch remains engaged." : null,
      workOrderRequiresBrandBook(workType) && !brandBook ? "Active Brand Book is not available." : null,
      workOrderRequiresApprovedClaims(workType) && (claims.length !== claimIds.length || claims.some(claim => claim.status !== "approved" || claim.sourceStatus !== "approved" || claim.sourceChangeState !== "tracked")) ? "Approved tracked claim references are incomplete." : null,
      "Phase 3 has no provider-execution path by design.",
    ].filter((reason): reason is string => Boolean(reason));
    const now = Date.now();
    const payload = {
      mode: "dry_run",
      workOrderKey: order.workOrderKey,
      executionAllowed: false,
      providerAlias: order.requestedProviderAlias,
      providerEnabled: provider?.isEnabled ?? false,
      killSwitchEnabled: provider?.killSwitchEnabled ?? true,
      brandBookVersion: brandBook?.version ?? null,
      approvedClaimCount: claims.filter(claim => claim.status === "approved" && claim.sourceStatus === "approved" && claim.sourceChangeState === "tracked").length,
      referencedClaimCount: claimIds.length,
      blockingReasons,
      nextRequiredAction: "Keep all provider, publishing, campaign, CAPI, and spend controls locked. Later execution requires a dedicated approved phase.",
      performedAt: now,
    };
    const contentHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const result = await db.insert(marketingWorkOrderArtifacts).values({
      workOrderId: order.id,
      artifactType: "DryRunValidation",
      state: "dry_run",
      label: `Dry-run validation · ${order.workOrderKey}`,
      artifactPayloadJson: JSON.stringify(payload),
      contentHash,
      providerAlias: provider?.alias ?? order.requestedProviderAlias,
      providerModelId: provider?.modelId ?? order.providerModelId,
      promptTemplateVersion: "phase3-control-plane-v1",
      sourceClaimIdsJson: JSON.stringify(claimIds),
      sourceSnapshotHashesJson: JSON.stringify(claims.map(claim => claim.sourceSnapshotHash)),
      confidence: null,
      estimatedCostUsd: "0.00",
      actualCostUsd: "0.00",
      errorSummary: blockingReasons.join(" "),
      createdByUserId: ctx.user.id,
      createdAt: now,
    });
    const artifactId = Number((result as { insertId?: number }).insertId);
    await db.insert(marketingWorkOrderCostLedger).values({ workOrderId: order.id, entryKey: `${order.workOrderKey}:dry-run:${artifactId}`, entryType: "dry_run", amountUsd: "0.00", currency: "USD", providerAlias: order.requestedProviderAlias, note: "Dry-run validation only. No provider request, media generation, publication, campaign change, or charge occurred.", createdByUserId: ctx.user.id, createdAt: now });
    await db.update(marketingWorkOrders).set({ lastDryRunAt: now, updatedAt: now }).where(eq(marketingWorkOrders.id, order.id));
    await appendWorkOrderEvent({ workOrderId: order.id, action: "dry_run", fromStatus: "approved", toStatus: "approved", actorUserId: ctx.user.id, createdAt: now, payload: { artifactId, executionAllowed: false, blockingReasons } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_work_order_dry_run", artifactId, JSON.stringify({ workOrderId: order.id, workOrderKey: order.workOrderKey, executionAllowed: false, blockingReasonCount: blockingReasons.length }));
    return { artifactId, executionAllowed: false, blockingReasons, contentHash };
  }),

  cancelWorkOrder: protectedProcedure.input(z.object({ workOrderId: z.number().int().positive(), note: z.string().trim().min(4).max(4_000) })).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "cancel_work_orders");
    const db = await requireDb();
    const [order] = await db.select().from(marketingWorkOrders).where(eq(marketingWorkOrders.id, input.workOrderId)).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Work order was not found." });
    if (order.createdByUserId !== ctx.user.id && !isOwner(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the creator or Mahmoud can cancel this work order." });
    if (!workOrderCanTransition(order.status as MarketingWorkOrderStatus, "cancelled")) throw new TRPCError({ code: "BAD_REQUEST", message: "This work order is already terminal and cannot be cancelled." });
    const now = Date.now();
    await db.update(marketingWorkOrders).set({ status: "cancelled", cancelledByUserId: ctx.user.id, cancelledAt: now, updatedAt: now, allowedNextStatesJson: JSON.stringify([]) }).where(eq(marketingWorkOrders.id, order.id));
    await appendWorkOrderEvent({ workOrderId: order.id, action: "cancelled", fromStatus: order.status, toStatus: "cancelled", reason: input.note, actorUserId: ctx.user.id, createdAt: now, payload: { executionCancelled: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_work_order_cancel", order.id, JSON.stringify({ workOrderKey: order.workOrderKey }));
    return { success: true, status: "cancelled" as const };
  }),

  getContentStudioConfiguration: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_content_studio");
    const db = await requireDb();
    const [brandBook, workOrders, claims] = await Promise.all([
      getActiveBrandBookForWorkOrder(),
      db.select({
        id: marketingWorkOrders.id,
        workOrderKey: marketingWorkOrders.workOrderKey,
        workType: marketingWorkOrders.workType,
        title: marketingWorkOrders.title,
        programKey: marketingWorkOrders.programKey,
        brandBookId: marketingWorkOrders.brandBookId,
        brandBookVersion: marketingWorkOrders.brandBookVersion,
        knowledgeClaimIdsJson: marketingWorkOrders.knowledgeClaimIdsJson,
      }).from(marketingWorkOrders)
        .where(eq(marketingWorkOrders.status, "approved"))
        .orderBy(desc(marketingWorkOrders.reviewedAt)).limit(100),
      db.select({
        id: marketingKnowledgeClaims.id,
        programKey: marketingKnowledgeClaims.programKey,
        claimText: marketingKnowledgeClaims.claimText,
        claimType: marketingKnowledgeClaims.claimType,
        sourceSnapshotHash: marketingKnowledgeClaims.sourceSnapshotHash,
      }).from(marketingKnowledgeClaims)
        .innerJoin(marketingKnowledgeSources, eq(marketingKnowledgeClaims.sourceId, marketingKnowledgeSources.id))
        .where(and(
          eq(marketingKnowledgeClaims.status, "approved"),
          eq(marketingKnowledgeSources.status, "approved"),
          eq(marketingKnowledgeSources.changeState, "tracked"),
        )).orderBy(marketingKnowledgeClaims.programKey, desc(marketingKnowledgeClaims.updatedAt)),
    ]);
    const eligibleOrders = workOrders.filter(order =>
      ["strategy_brief", "creative_package", "voiceover_draft", "media_render_brief", "qa_review"].includes(order.workType)
      && Boolean(brandBook && order.brandBookId === brandBook.id && order.brandBookVersion === brandBook.version),
    ).map(order => ({ ...order, claimIds: parseJson<number[]>(order.knowledgeClaimIdsJson, []) }));
    return {
      brandBook: brandBook ? { id: brandBook.id, version: brandBook.version, title: brandBook.title } : null,
      workOrders: eligibleOrders,
      claims,
      policy: "Content Studio stores versioned human-reviewed proposal packets only. It cannot invoke a model, render media, publish, schedule, create an ad, change Meta/CAPI, contact a person, or spend money.",
      blockers: [
        !brandBook ? "No active owner-approved Brand Book exists." : null,
        eligibleOrders.length === 0 ? "No approved creative work order is currently anchored to the active Brand Book." : null,
        claims.length === 0 ? "No owner-approved tracked knowledge claim is available yet." : null,
      ].filter((value): value is string => Boolean(value)),
    };
  }),

  getContentPackets: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_content_studio");
    const db = await requireDb();
    const packets = await db.select().from(marketingContentPackets)
      .orderBy(desc(marketingContentPackets.updatedAt)).limit(160);
    const packetIds = packets.map(packet => packet.id);
    const [events, batches] = await Promise.all([
      packetIds.length === 0 ? Promise.resolve([]) : db.select().from(marketingContentReviewEvents)
        .where(inArray(marketingContentReviewEvents.packetId, packetIds)).orderBy(desc(marketingContentReviewEvents.createdAt)),
      db.select().from(marketingContentApprovalBatches).orderBy(desc(marketingContentApprovalBatches.approvedAt)).limit(60),
    ]);
    return {
      packets: packets.map(packet => ({
        ...packet,
        platforms: parseJson<string[]>(packet.platformJson, []),
        claimIds: parseJson<number[]>(packet.claimIdsJson, []),
        sourceSnapshotHashes: parseJson<string[]>(packet.sourceSnapshotHashesJson, []),
        payload: parseJson<Record<string, unknown>>(packet.payloadJson, {}),
        outputSchema: parseJson<Record<string, unknown>>(packet.outputSchemaJson, {}),
        qaResults: parseJson<ContentQaResult[]>(packet.qaResultsJson, []),
        events: events.filter(event => event.packetId === packet.id).map(event => ({
          ...event,
          annotations: parseJson<string[]>(event.annotationsJson, []),
          payload: parseJson<Record<string, unknown>>(event.payloadJson, {}),
        })),
      })),
      batches: batches.map(batch => ({
        ...batch,
        packetIds: parseJson<number[]>(batch.packetIdsJson, []),
        packetContentHashes: parseJson<string[]>(batch.packetContentHashesJson, []),
      })),
      policy: "Approval is an internal recorded content decision only. It is not a publish command, paid-media authorization, provider request, schedule, campaign activation, or message to any person.",
    };
  }),

  createContentPacket: protectedProcedure.input(contentPacketInput).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "create_content_packets");
    validateContentPacketText(input);
    const db = await requireDb();
    const [order, claims] = await Promise.all([
      requireApprovedCreativeWorkOrder(input.workOrderId, input.programKey),
      getApprovedContentClaims(input.claimIds, input.programKey),
    ]);
    const orderClaims = new Set(parseJson<number[]>(order.knowledgeClaimIdsJson, []));
    if (claims.some(claim => !orderClaims.has(claim.id))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Every packet claim must be included in the approved source work order." });
    }
    const rootPacketKey = contentPacketKey();
    const now = Date.now();
    const contentHash = packetContentHash(input, rootPacketKey, 1);
    const result = await db.insert(marketingContentPackets).values({
      rootPacketKey,
      versionNumber: 1,
      previousPacketId: null,
      workOrderId: order.id,
      workOrderKey: order.workOrderKey,
      contentType: input.contentType,
      title: normalizeContentStudioText(input.title),
      programKey: input.programKey,
      platformJson: JSON.stringify(Array.from(new Set(input.platforms))),
      funnelStage: normalizeContentStudioText(input.funnelStage),
      audience: normalizeContentStudioText(input.audience),
      objective: normalizeContentStudioText(input.objective),
      arabicCopy: normalizeContentStudioText(input.arabicCopy),
      englishCopy: input.englishCopy ? normalizeContentStudioText(input.englishCopy) : null,
      caption: input.caption ? normalizeContentStudioText(input.caption) : null,
      cta: normalizeContentStudioText(input.cta),
      landingDestination: input.landingDestination ?? null,
      scheduledFor: input.scheduledFor ?? null,
      claimIdsJson: JSON.stringify(Array.from(new Set(input.claimIds)).sort((a, b) => a - b)),
      sourceSnapshotHashesJson: JSON.stringify(claims.map(claim => claim.sourceSnapshotHash)),
      visualBrief: input.visualBrief ? normalizeContentStudioText(input.visualBrief) : null,
      payloadJson: JSON.stringify(input.payload),
      outputSchemaJson: JSON.stringify(contentPacketOutputSchema(input.contentType)),
      previewUrl: input.previewUrl ?? null,
      previewHash: input.previewHash?.toLowerCase() ?? null,
      qaResultsJson: JSON.stringify([]),
      exceptionalClaim: input.exceptionalClaim,
      status: "draft",
      contentHash,
      changeSummary: input.changeSummary ? normalizeContentStudioText(input.changeSummary) : "Initial Content Studio packet.",
      blockedReason: null,
      createdByUserId: ctx.user.id,
      lastEditedByUserId: ctx.user.id,
      approvedByUserId: null,
      approvedAt: null,
      stoppedByUserId: null,
      stoppedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const packetId = Number((result as { insertId?: number }).insertId);
    await appendContentReviewEvent({ packetId, action: "created", toStatus: "draft", actorUserId: ctx.user.id, createdAt: now, payload: { rootPacketKey, versionNumber: 1, workOrderKey: order.workOrderKey, claimCount: claims.length, noProviderCall: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_content_packet", packetId, JSON.stringify({ rootPacketKey, workOrderId: order.id, contentType: input.contentType, programKey: input.programKey, contentHash, claimCount: claims.length }));
    return { id: packetId, rootPacketKey, versionNumber: 1, status: "draft" as const, contentHash };
  }),

  reviseContentPacket: protectedProcedure.input(contentPacketInput.extend({ previousPacketId: z.number().int().positive(), changeSummary: z.string().trim().min(4).max(4_000) })).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "create_content_packets");
    validateContentPacketText(input);
    const db = await requireDb();
    const [previous, order, claims] = await Promise.all([
      db.select().from(marketingContentPackets).where(eq(marketingContentPackets.id, input.previousPacketId)).limit(1).then(rows => rows[0] ?? null),
      requireApprovedCreativeWorkOrder(input.workOrderId, input.programKey),
      getApprovedContentClaims(input.claimIds, input.programKey),
    ]);
    if (!previous) throw new TRPCError({ code: "NOT_FOUND", message: "The content packet to revise was not found." });
    if (previous.createdByUserId !== ctx.user.id && !isOwner(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the packet creator or Mahmoud can create a revision." });
    if (["stopped", "superseded"].includes(previous.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "A stopped or superseded packet cannot be revised." });
    const orderClaims = new Set(parseJson<number[]>(order.knowledgeClaimIdsJson, []));
    if (claims.some(claim => !orderClaims.has(claim.id))) throw new TRPCError({ code: "BAD_REQUEST", message: "Every packet claim must be included in the approved source work order." });
    const latest = await db.select({ versionNumber: marketingContentPackets.versionNumber }).from(marketingContentPackets)
      .where(eq(marketingContentPackets.rootPacketKey, previous.rootPacketKey)).orderBy(desc(marketingContentPackets.versionNumber)).limit(1);
    const versionNumber = (latest[0]?.versionNumber ?? previous.versionNumber) + 1;
    const now = Date.now();
    const contentHash = packetContentHash(input, previous.rootPacketKey, versionNumber);
    const result = await db.insert(marketingContentPackets).values({
      rootPacketKey: previous.rootPacketKey,
      versionNumber,
      previousPacketId: previous.id,
      workOrderId: order.id,
      workOrderKey: order.workOrderKey,
      contentType: input.contentType,
      title: normalizeContentStudioText(input.title),
      programKey: input.programKey,
      platformJson: JSON.stringify(Array.from(new Set(input.platforms))),
      funnelStage: normalizeContentStudioText(input.funnelStage),
      audience: normalizeContentStudioText(input.audience),
      objective: normalizeContentStudioText(input.objective),
      arabicCopy: normalizeContentStudioText(input.arabicCopy),
      englishCopy: input.englishCopy ? normalizeContentStudioText(input.englishCopy) : null,
      caption: input.caption ? normalizeContentStudioText(input.caption) : null,
      cta: normalizeContentStudioText(input.cta),
      landingDestination: input.landingDestination ?? null,
      scheduledFor: input.scheduledFor ?? null,
      claimIdsJson: JSON.stringify(Array.from(new Set(input.claimIds)).sort((a, b) => a - b)),
      sourceSnapshotHashesJson: JSON.stringify(claims.map(claim => claim.sourceSnapshotHash)),
      visualBrief: input.visualBrief ? normalizeContentStudioText(input.visualBrief) : null,
      payloadJson: JSON.stringify(input.payload),
      outputSchemaJson: JSON.stringify(contentPacketOutputSchema(input.contentType)),
      previewUrl: input.previewUrl ?? null,
      previewHash: input.previewHash?.toLowerCase() ?? null,
      qaResultsJson: JSON.stringify([]),
      exceptionalClaim: input.exceptionalClaim,
      status: "draft",
      contentHash,
      changeSummary: normalizeContentStudioText(input.changeSummary),
      blockedReason: null,
      createdByUserId: previous.createdByUserId,
      lastEditedByUserId: ctx.user.id,
      approvedByUserId: null,
      approvedAt: null,
      stoppedByUserId: null,
      stoppedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const packetId = Number((result as { insertId?: number }).insertId);
    await db.update(marketingContentPackets).set({ status: "superseded", updatedAt: now, blockedReason: `Superseded by revision ${versionNumber}.` }).where(eq(marketingContentPackets.id, previous.id));
    await appendContentReviewEvent({ packetId: previous.id, action: "superseded", fromStatus: previous.status, toStatus: "superseded", feedback: input.changeSummary, actorUserId: ctx.user.id, createdAt: now, payload: { successorPacketId: packetId, successorVersion: versionNumber } });
    await appendContentReviewEvent({ packetId, action: "revision_created", toStatus: "draft", feedback: input.changeSummary, actorUserId: ctx.user.id, createdAt: now, payload: { previousPacketId: previous.id, rootPacketKey: previous.rootPacketKey, versionNumber, noProviderCall: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_content_packet_revision", packetId, JSON.stringify({ rootPacketKey: previous.rootPacketKey, versionNumber, previousPacketId: previous.id, contentHash }));
    return { id: packetId, rootPacketKey: previous.rootPacketKey, versionNumber, status: "draft" as const, contentHash };
  }),

  submitContentPacketForReview: protectedProcedure.input(z.object({ packetId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "create_content_packets");
    const db = await requireDb();
    const [packet] = await db.select().from(marketingContentPackets).where(eq(marketingContentPackets.id, input.packetId)).limit(1);
    if (!packet) throw new TRPCError({ code: "NOT_FOUND", message: "Content packet was not found." });
    if (packet.createdByUserId !== ctx.user.id && !isOwner(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the packet creator or Mahmoud can submit it for review." });
    if (!contentCanTransition(packet.status as MarketingContentStatus, "in_review")) throw new TRPCError({ code: "BAD_REQUEST", message: "Only a draft packet can be submitted for review." });
    const now = Date.now();
    await db.update(marketingContentPackets).set({ status: "in_review", blockedReason: null, lastEditedByUserId: ctx.user.id, updatedAt: now }).where(eq(marketingContentPackets.id, packet.id));
    await appendContentReviewEvent({ packetId: packet.id, action: "submitted_for_review", fromStatus: packet.status, toStatus: "in_review", actorUserId: ctx.user.id, createdAt: now, payload: { noProviderCall: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_content_packet_submission", packet.id, JSON.stringify({ rootPacketKey: packet.rootPacketKey, versionNumber: packet.versionNumber }));
    return { success: true, status: "in_review" as const };
  }),

  recordContentQa: protectedProcedure.input(contentQaInput).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "run_content_qa");
    const db = await requireDb();
    const [packet] = await db.select().from(marketingContentPackets).where(eq(marketingContentPackets.id, input.packetId)).limit(1);
    if (!packet) throw new TRPCError({ code: "NOT_FOUND", message: "Content packet was not found." });
    if (packet.status !== "in_review") throw new TRPCError({ code: "BAD_REQUEST", message: "QA can only be recorded for a packet in review." });
    const uniqueChecks = new Set(input.results.map(result => result.check));
    if (uniqueChecks.size !== MARKETING_CONTENT_QA_CHECKS.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Record exactly one QA result for every required check." });
    const previewProblem = validatePreviewFingerprint(packet.previewUrl, packet.previewHash);
    if (previewProblem) throw new TRPCError({ code: "BAD_REQUEST", message: `${previewProblem} Create a new revision with its final preview before QA.` });
    const allPassed = input.results.every(result => result.passed);
    const nextStatus: MarketingContentStatus = allPassed ? "qa_passed" : "changes_requested";
    const now = Date.now();
    await db.update(marketingContentPackets).set({
      status: nextStatus,
      qaResultsJson: JSON.stringify(input.results),
      blockedReason: allPassed ? null : (input.feedback ?? "QA identified required changes."),
      lastEditedByUserId: ctx.user.id,
      updatedAt: now,
    }).where(eq(marketingContentPackets.id, packet.id));
    await appendContentReviewEvent({ packetId: packet.id, action: "qa_recorded", fromStatus: packet.status, toStatus: nextStatus, feedback: input.feedback ?? null, actorUserId: ctx.user.id, createdAt: now, payload: { allPassed, failedChecks: input.results.filter(result => !result.passed).map(result => result.check), previewHash: packet.previewHash } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_content_packet_qa", packet.id, JSON.stringify({ rootPacketKey: packet.rootPacketKey, versionNumber: packet.versionNumber, allPassed, failedCheckCount: input.results.filter(result => !result.passed).length }));
    return { success: true, status: nextStatus };
  }),

  makeContentApprovalReady: protectedProcedure.input(z.object({ packetId: z.number().int().positive(), note: z.string().trim().min(4).max(4_000) })).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "review_content_packets");
    const db = await requireDb();
    const [packet] = await db.select().from(marketingContentPackets).where(eq(marketingContentPackets.id, input.packetId)).limit(1);
    if (!packet) throw new TRPCError({ code: "NOT_FOUND", message: "Content packet was not found." });
    if (!contentCanTransition(packet.status as MarketingContentStatus, "approval_ready")) throw new TRPCError({ code: "BAD_REQUEST", message: "Only a QA-passed packet can be made approval ready." });
    const qaResults = parseJson<ContentQaResult[]>(packet.qaResultsJson, []);
    if (qaResults.length !== MARKETING_CONTENT_QA_CHECKS.length || qaResults.some(result => !result.passed)) throw new TRPCError({ code: "BAD_REQUEST", message: "Every mandatory QA check must pass before an approval packet is created." });
    const previewProblem = validatePreviewFingerprint(packet.previewUrl, packet.previewHash);
    if (previewProblem) throw new TRPCError({ code: "BAD_REQUEST", message: previewProblem });
    await getApprovedContentClaims(parseJson<number[]>(packet.claimIdsJson, []), packet.programKey);
    const now = Date.now();
    await db.update(marketingContentPackets).set({ status: "approval_ready", blockedReason: null, lastEditedByUserId: ctx.user.id, updatedAt: now }).where(eq(marketingContentPackets.id, packet.id));
    await appendContentReviewEvent({ packetId: packet.id, action: "approval_packet_ready", fromStatus: packet.status, toStatus: "approval_ready", feedback: input.note, actorUserId: ctx.user.id, createdAt: now, payload: { previewUrl: packet.previewUrl, previewHash: packet.previewHash, qaCheckCount: qaResults.length, exceptionalClaim: packet.exceptionalClaim } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_content_packet_approval_ready", packet.id, JSON.stringify({ rootPacketKey: packet.rootPacketKey, versionNumber: packet.versionNumber, exceptionalClaim: packet.exceptionalClaim }));
    return { success: true, status: "approval_ready" as const };
  }),

  requestContentChanges: protectedProcedure.input(contentDecisionInput).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "review_content_packets");
    const db = await requireDb();
    const [packet] = await db.select().from(marketingContentPackets).where(eq(marketingContentPackets.id, input.packetId)).limit(1);
    if (!packet) throw new TRPCError({ code: "NOT_FOUND", message: "Content packet was not found." });
    if (!["in_review", "qa_passed", "approval_ready"].includes(packet.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Changes can only be requested from a packet under review or awaiting approval." });
    const now = Date.now();
    await db.update(marketingContentPackets).set({ status: "changes_requested", blockedReason: input.note, lastEditedByUserId: ctx.user.id, updatedAt: now }).where(eq(marketingContentPackets.id, packet.id));
    await appendContentReviewEvent({ packetId: packet.id, action: "changes_requested", fromStatus: packet.status, toStatus: "changes_requested", feedback: input.note, annotations: input.annotations, actorUserId: ctx.user.id, createdAt: now, payload: { structuredFeedback: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_content_packet_changes_requested", packet.id, JSON.stringify({ rootPacketKey: packet.rootPacketKey, annotationCount: input.annotations.length }));
    return { success: true, status: "changes_requested" as const };
  }),

  approveContentPacket: protectedProcedure.input(contentDecisionInput).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [packet] = await db.select().from(marketingContentPackets).where(eq(marketingContentPackets.id, input.packetId)).limit(1);
    if (!packet) throw new TRPCError({ code: "NOT_FOUND", message: "Content packet was not found." });
    if (!contentCanTransition(packet.status as MarketingContentStatus, "approved")) throw new TRPCError({ code: "BAD_REQUEST", message: "Only an Approval Ready packet can receive Mahmoud's explicit decision." });
    const previewProblem = validatePreviewFingerprint(packet.previewUrl, packet.previewHash);
    if (previewProblem) throw new TRPCError({ code: "BAD_REQUEST", message: previewProblem });
    await getApprovedContentClaims(parseJson<number[]>(packet.claimIdsJson, []), packet.programKey);
    const now = Date.now();
    await db.update(marketingContentPackets).set({ status: "approved", approvedByUserId: ctx.user.id, approvedAt: now, blockedReason: null, updatedAt: now }).where(eq(marketingContentPackets.id, packet.id));
    await appendContentReviewEvent({ packetId: packet.id, action: "owner_approved", fromStatus: packet.status, toStatus: "approved", feedback: input.note, annotations: input.annotations, actorUserId: ctx.user.id, createdAt: now, payload: { explicitOwnerDecision: true, previewHash: packet.previewHash, exceptionalClaim: packet.exceptionalClaim, noPublishCommand: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_content_packet_approval", packet.id, JSON.stringify({ rootPacketKey: packet.rootPacketKey, versionNumber: packet.versionNumber, contentHash: packet.contentHash, exceptionalClaim: packet.exceptionalClaim }));
    return { success: true, status: "approved" as const, publicationStatus: "not_published" as const };
  }),

  approveContentBatch: protectedProcedure.input(z.object({
    packetIds: z.array(z.number().int().positive()).min(2).max(20),
    note: z.string().trim().min(4).max(8_000),
    confirmedFullyReviewed: z.literal(true),
  })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const ids = Array.from(new Set(input.packetIds));
    const packets = await db.select().from(marketingContentPackets).where(inArray(marketingContentPackets.id, ids));
    if (packets.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more approval packet IDs were not found." });
    if (packets.some(packet => packet.status !== "approval_ready")) throw new TRPCError({ code: "BAD_REQUEST", message: "Every batch item must be fully QA-passed and Approval Ready." });
    if (packets.some(packet => packet.exceptionalClaim)) throw new TRPCError({ code: "BAD_REQUEST", message: "Packets marked with exceptional claims require an individual owner decision and cannot use batch approval." });
    for (const packet of packets) {
      const previewProblem = validatePreviewFingerprint(packet.previewUrl, packet.previewHash);
      if (previewProblem) throw new TRPCError({ code: "BAD_REQUEST", message: `Packet ${packet.id}: ${previewProblem}` });
      await getApprovedContentClaims(parseJson<number[]>(packet.claimIdsJson, []), packet.programKey);
    }
    const now = Date.now();
    const batchKey = `mab-${now.toString(36)}-${crypto.randomUUID().slice(0, 10)}`;
    const contentHashes = packets.map(packet => packet.contentHash);
    const result = await db.insert(marketingContentApprovalBatches).values({ batchKey, packetIdsJson: JSON.stringify(ids), packetContentHashesJson: JSON.stringify(contentHashes), status: "approved", ownerNote: input.note, approvedByUserId: ctx.user.id, approvedAt: now, createdAt: now });
    const batchId = Number((result as { insertId?: number }).insertId);
    for (const packet of packets) {
      await db.update(marketingContentPackets).set({ status: "approved", approvedByUserId: ctx.user.id, approvedAt: now, blockedReason: null, updatedAt: now }).where(eq(marketingContentPackets.id, packet.id));
      await appendContentReviewEvent({ packetId: packet.id, action: "owner_batch_approved", fromStatus: "approval_ready", toStatus: "approved", feedback: input.note, actorUserId: ctx.user.id, createdAt: now, payload: { batchId, batchKey, explicitOwnerDecision: true, confirmedFullyReviewed: input.confirmedFullyReviewed, noPublishCommand: true } });
    }
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_content_packet_batch_approval", batchId, JSON.stringify({ batchKey, packetCount: packets.length, packetContentHashes: contentHashes }));
    return { success: true, batchId, batchKey, approvedPacketIds: ids, publicationStatus: "not_published" as const };
  }),

  rejectContentPacket: protectedProcedure.input(contentDecisionInput).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx.user);
    const db = await requireDb();
    const [packet] = await db.select().from(marketingContentPackets).where(eq(marketingContentPackets.id, input.packetId)).limit(1);
    if (!packet) throw new TRPCError({ code: "NOT_FOUND", message: "Content packet was not found." });
    if (!contentCanTransition(packet.status as MarketingContentStatus, "rejected")) throw new TRPCError({ code: "BAD_REQUEST", message: "Only an Approval Ready packet can be rejected." });
    const now = Date.now();
    await db.update(marketingContentPackets).set({ status: "rejected", blockedReason: input.note, lastEditedByUserId: ctx.user.id, updatedAt: now }).where(eq(marketingContentPackets.id, packet.id));
    await appendContentReviewEvent({ packetId: packet.id, action: "owner_rejected", fromStatus: packet.status, toStatus: "rejected", feedback: input.note, annotations: input.annotations, actorUserId: ctx.user.id, createdAt: now, payload: { explicitOwnerDecision: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_content_packet_rejection", packet.id, JSON.stringify({ rootPacketKey: packet.rootPacketKey, versionNumber: packet.versionNumber }));
    return { success: true, status: "rejected" as const };
  }),

  stopContentPacket: protectedProcedure.input(contentDecisionInput).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "stop_content_packets");
    const db = await requireDb();
    const [packet] = await db.select().from(marketingContentPackets).where(eq(marketingContentPackets.id, input.packetId)).limit(1);
    if (!packet) throw new TRPCError({ code: "NOT_FOUND", message: "Content packet was not found." });
    if (packet.createdByUserId !== ctx.user.id && !isOwner(ctx.user) && (await getEffectiveRole(ctx.user)) !== "marketing_manager") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the packet creator, a Marketing Manager, or Mahmoud can stop this packet." });
    }
    if (!contentCanTransition(packet.status as MarketingContentStatus, "stopped")) throw new TRPCError({ code: "BAD_REQUEST", message: "This packet is already terminal and cannot be stopped." });
    const now = Date.now();
    await db.update(marketingContentPackets).set({ status: "stopped", stoppedByUserId: ctx.user.id, stoppedAt: now, blockedReason: input.note, updatedAt: now }).where(eq(marketingContentPackets.id, packet.id));
    await appendContentReviewEvent({ packetId: packet.id, action: "stopped", fromStatus: packet.status, toStatus: "stopped", feedback: input.note, annotations: input.annotations, actorUserId: ctx.user.id, createdAt: now, payload: { immediateStop: true, noPublishCommand: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_content_packet_stop", packet.id, JSON.stringify({ rootPacketKey: packet.rootPacketKey, versionNumber: packet.versionNumber }));
    return { success: true, status: "stopped" as const };
  }),

  dashboardBaseline: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_analytics");
    const db = await requireDb();
    const rows = await db.execute(sql`
      SELECT
        COUNT(*) AS leads90d,
        SUM(stage = 'qualified') AS qualified90d,
        SUM(stage = 'client') AS clientStage90d,
        SUM(stage = 'dormant') AS dormant90d,
        SUM(CASE WHEN metaCampaign IS NULL OR TRIM(metaCampaign) = '' THEN 1 ELSE 0 END) AS unattributedCampaign90d
      FROM leads
      WHERE createdAt >= UNIX_TIMESTAMP(CURRENT_TIMESTAMP - INTERVAL 90 DAY) * 1000
        AND COALESCE(isMetaTestLead, 0) = 0
    `);
    const data = Array.isArray(rows) ? rows[0] : rows;
    return {
      data,
      measuredAt: Date.now(),
      definition: "Read-only CRM baseline. Client stage is not a paid-client outcome; signed-and-paid attribution is introduced only after its explicit Phase 5 data contract.",
    };
  }),
});
