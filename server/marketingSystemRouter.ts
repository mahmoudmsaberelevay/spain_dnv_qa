import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  contracts,
  leads,
  marketingBrandBooks,
  marketingBrandDiscoveryAnswers,
  marketingBrandDiscoverySessions,
  marketingContentApprovalBatches,
  marketingContentPackets,
  marketingContentReviewEvents,
  marketingMetaCampaignPilotProposals,
  marketingMetaAdsStrategyApprovalPackets,
  marketingMetaAdsStrategyAnswers,
  marketingMetaAdsStrategySessions,
  marketingWeeklyExecutiveBriefEvents,
  marketingWeeklyExecutiveBriefs,
  marketingWeeklyResultsItemEvents,
  marketingWeeklyResultsItems,
  marketingWeeklyResultsPerformanceSnapshots,
  marketingWeeklyResultsPlans,
  marketingWeeklyResultsPreferenceMemories,
  marketingWeeklyResultsSettings,
  marketingWeeklyAutomationControls,
  marketingWeeklyAutomationJobs,
  marketingWeeklyAutomationBudgetLedger,
  marketingReelCompositionInputApprovals,
  marketingReelCompositions,
  marketingGeneratedMediaAssets,
  marketingDesignSystemAssets,
  marketingKnowledgeClaims,
  marketingKnowledgeSources,
  marketingInternalProgrammeReferences,
  marketingOwnerConfirmedInternalClaims,
  marketingAutopilotControls,
  marketingProviderProfiles,
  marketingProviderWebhookEvents,
  marketingSystemRoleAssignments,
  marketingWorkOrderArtifacts,
  marketingWorkOrderCostLedger,
  marketingWorkOrderEvents,
  marketingWorkOrders,
  metaCrmEventLog,
  metaMonitoringSnapshots,
  metaReconciliationState,
  users,
} from "../drizzle/schema";
import { auditCtxFromTrpc, writeAuditLog } from "./auditLog";
import { isOwner } from "./permissionsRouter";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";
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
  isCreativeItemType,
  isVisualTextCreativeItemType,
  validateArabicOnlyMarketingText,
  validateBilingualElevayCaption,
  validateEnglishOnlyOnScreenText,
} from "../shared/marketingCreativeLanguagePolicy";
import {
  calculateNextMetaAdsStrategyQuestion,
  getMetaAdsStrategyQuestion,
  isMetaAdsStrategyComplete,
  META_ADS_STRATEGY_QUESTIONS,
  META_ADS_STRATEGY_PROGRAM_CONFIRMATION_QUESTION_NUMBERS,
  META_ADS_STRATEGY_REQUIRED_PROGRAMS,
  META_ADS_STRATEGY_SECTIONS,
  META_ADS_STRATEGY_TOTAL_QUESTIONS,
} from "../shared/marketingMetaAdsStrategy";
import {
  CAMPAIGN_PILOT_MAX_MONTHLY_MEDIA_CAP_EGP,
  CAMPAIGN_PILOT_MONITORING_CADENCES,
  CAMPAIGN_PILOT_PROGRAMS,
  CAMPAIGN_PILOT_PROPOSAL_STATUSES,
  campaignPilotCanTransition,
  findDisallowedCampaignPilotData,
  hasOnlyAllowedCampaignPilotPermissions,
  normalizeCampaignPilotText,
  validateCampaignPilotBudgetPlan,
} from "../shared/marketingCampaignPilot";
import {
  buildPilotReadiness,
  EXECUTIVE_MEASUREMENT_DEFINITIONS,
  EXECUTIVE_MEASUREMENT_WINDOW_DAYS,
} from "../shared/marketingExecutiveMeasurement";
import {
  findDisallowedWeeklyExecutiveBriefData,
  isMondayPeriodStart,
  normalizeWeeklyExecutiveBriefText,
  statusForWeeklyExecutiveBriefDecision,
  weeklyExecutiveBriefCanTransition,
  weeklyExecutiveBriefKey,
  type WeeklyExecutiveBriefStatus,
} from "../shared/marketingExecutiveBriefs";
import {
  DEFAULT_WEEKLY_CONTENT_MIX,
  findDisallowedWeeklyResultsData,
  isSaturdayDate,
  isValidCairoClockTime,
  normalizeWeeklyResultsText,
  WEEKLY_RESULTS_EXECUTION_BOUNDARY,
  WEEKLY_RESULTS_FEEDBACK_CATEGORIES,
  WEEKLY_RESULTS_ITEM_TYPES,
  weeklyResultsItemCanTransition,
  type WeeklyResultsItemStatus,
} from "../shared/marketingWeeklyResults";
import { evaluateSocialReleaseGovernance } from "../shared/marketingSocialReleaseGovernance";
import {
  MARKETING_AUTOPILOT_MODE,
  MARKETING_PROVIDER_CONNECTIONS,
  providerSecretPresence,
  summarizeMarketingAutopilotLock,
} from "../shared/marketingProviderConnections";
import {
  enableWeeklyAutomation,
  getWeeklyAutomationReadiness,
  markAutomationScheduleTask,
  pauseWeeklyAutomation,
  startWeeklyAutomationCycle,
} from "./weeklyMarketingAutomationService";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { composeApprovedReelForReview, fingerprintMarketingAsset, fingerprintMarketingPreview } from "./reelCompositorService";

const providerSeeds = [
  { alias: "routine-copy", provider: "Manus Built-in LLM", modelId: "gpt-5-mini", purpose: "Structured extraction, classification and copy variants", status: "available_internal", notes: "Configured alias only. Disabled until a Brand Book is approved and a work order is approved." },
  { alias: "strategy-synthesis", provider: "Manus Built-in LLM", modelId: "gpt-5", purpose: "Brand synthesis, strategic interpretation and difficult attribution analysis", status: "available_internal", notes: "Configured alias only. Disabled until an approved work order exists." },
  { alias: "openai-editorial", provider: "OpenAI API", modelId: null, purpose: "Optional editorial drafting and structured creative assistance", status: "requires_configuration", notes: "Requires a server-side API key. Disabled until the future execution release and an approved work order." },
  { alias: "editorial-challenge", provider: "Anthropic", modelId: "claude-sonnet-4-6", purpose: "Independent claim and editorial challenge", status: "requires_configuration", notes: "No external provider credential is stored here. Configure a server-side connector before enabling." },
  { alias: "manus-orchestrator", provider: "Manus API v2", modelId: null, purpose: "Bounded research plus approved static, carousel, storyboard and short-form reel production", status: "requires_configuration", notes: "Requires explicit API configuration, verified callback setup, an approved work order/content packet, final-preview QA, and a separate execution release before use." },
  { alias: "template-render", provider: "Creatomate", modelId: null, purpose: "Branded image and reel template rendering", status: "requires_configuration", notes: "Requires a server-side vendor credential and approved templates before use." },
  { alias: "specialty-motion", provider: "Runway", modelId: null, purpose: "Approved specialty motion footage", status: "requires_configuration", notes: "Requires a server-side vendor credential, per-clip cap and explicit approval before use." },
  { alias: "elevay-arabic-voice", provider: "Existing ELEVAY Voice Adapter", modelId: "eleven_v3", purpose: "Approved Arabic voice-over from a finalized script", status: "available_internal", notes: "Existing server-side voice adapter. Disabled until a script is approved; failed synthesis must hold for review without substitution." },
  { alias: "meta-marketing", provider: "Meta Marketing API", modelId: null, purpose: "Future campaign, asset, and measurement controls", status: "requires_configuration", notes: "Existing lead webhooks remain separate. No campaign, spend, publication, CAPI, or audience action is enabled by this profile." },
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

const metaStrategyProgramAnswerInput = metaStrategyAnswerInput.safeExtend({
  programKey: z.enum(META_ADS_STRATEGY_REQUIRED_PROGRAMS.map(program => program.key) as [string, ...string[]]),
});

const metaStrategyPacketDecisionInput = z.object({
  packetId: z.number().int().positive(),
  ownerNote: z.string().trim().min(8).max(8_000),
});

const campaignPilotProposalInput = z.object({
  strategyPacketId: z.number().int().positive(),
  title: z.string().trim().min(8).max(300),
  programKeys: z.array(z.enum(CAMPAIGN_PILOT_PROGRAMS.map(program => program.key) as [string, ...string[]])).min(1).max(CAMPAIGN_PILOT_PROGRAMS.length),
  requestedPermissions: z.array(z.string().trim().min(3).max(120).regex(/^[a-z0-9_.-]+$/, "Use the exact lower-case permission identifier."))
    .min(1).max(16),
  budgetPlan: z.object({
    monthlyMediaCapEgp: z.number().finite().positive().max(CAMPAIGN_PILOT_MAX_MONTHLY_MEDIA_CAP_EGP),
    dailyMediaCapEgp: z.number().finite().positive().max(CAMPAIGN_PILOT_MAX_MONTHLY_MEDIA_CAP_EGP),
    campaignCapEgp: z.number().finite().positive().max(CAMPAIGN_PILOT_MAX_MONTHLY_MEDIA_CAP_EGP),
  }),
  measurementPlan: z.object({
    primaryMetric: z.string().trim().min(4).max(300),
    attributionWindow: z.string().trim().min(4).max(300),
    requiredEvidence: z.string().trim().min(12).max(4_000),
    successCriteria: z.string().trim().min(12).max(4_000),
    missingDataLockout: z.string().trim().min(12).max(4_000),
  }),
  monitoringPlan: z.object({
    cadence: z.enum(CAMPAIGN_PILOT_MONITORING_CADENCES),
    owner: z.string().trim().min(2).max(160),
    alerts: z.string().trim().min(12).max(4_000),
  }),
  rollbackPlan: z.object({
    stopConditions: z.string().trim().min(12).max(4_000),
    rollbackOwner: z.string().trim().min(2).max(160),
    rollbackSteps: z.string().trim().min(12).max(4_000),
  }),
});

const campaignPilotDecisionInput = z.object({
  proposalId: z.number().int().positive(),
  nextStatus: z.enum(["internally_approved", "changes_requested", "rejected", "stopped"]),
  ownerNote: z.string().trim().min(8).max(8_000),
});

const weeklyExecutiveBriefCaptureInput = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a Saturday in YYYY-MM-DD form."),
  contextNote: z.string().trim().max(4_000).optional(),
});

const weeklyExecutiveBriefDecisionInput = z.object({
  briefId: z.number().int().positive(),
  decision: z.enum(["acknowledge_blocked", "request_evidence", "hold_planning", "stop"]),
  note: z.string().trim().min(8).max(8_000),
});
const weeklyResultsContentMixInput = z.object({
  research_update: z.number().int().min(0).max(12), static_post: z.number().int().min(0).max(12), carousel: z.number().int().min(0).max(12), reel: z.number().int().min(0).max(12), image: z.number().int().min(0).max(12), graphic: z.number().int().min(0).max(12), ad_setup: z.number().int().min(0).max(12),
}).refine(value => Object.values(value).some(count => count > 0), "Choose at least one content-item type.");
const weeklyResultsSettingsInput = z.object({
  prepareDayOfWeek: z.number().int().min(0).max(6), prepareStartTime: z.string().refine(isValidCairoClockTime, "Use HH:MM Cairo time."), deliveryDeadlineTime: z.string().refine(isValidCairoClockTime, "Use HH:MM Cairo time."), preparationScheduleEnabled: z.boolean(),
  weeklyGoal: z.string().trim().max(4_000).optional(),
  programPriorities: z.array(z.object({ key: z.string().trim().min(2).max(96).regex(/^[a-z0-9_]+$/), priority: z.number().int().min(1).max(10), note: z.string().trim().max(1_000).optional() })).max(24),
  updatedSourcesNote: z.string().trim().max(8_000).optional(), creativeDirection: z.string().trim().max(8_000).optional(), contentMix: weeklyResultsContentMixInput,
  allocationRules: z.object({ rotationNote: z.string().trim().max(4_000).optional(), platformNote: z.string().trim().max(4_000).optional() }).default({}), learningEnabled: z.boolean(),
  targetLikes30d: z.number().int().min(0).max(10_000_000_000).default(0), targetViews30d: z.number().int().min(0).max(10_000_000_000).default(0), targetLeads30d: z.number().int().min(0).max(10_000_000_000).default(0), targetQualifiedLeads30d: z.number().int().min(0).max(10_000_000_000).default(0), targetSignedClients30d: z.number().int().min(0).max(10_000_000_000).default(0), targetCostPerLeadEgp: z.number().finite().min(0).max(100_000_000).default(0), targetMaxAdSpend30dEgp: z.number().finite().min(0).max(1_000_000_000).default(0), requestedAutopublishThreshold: z.number().int().min(90).max(100).default(90),
});
const designSystemAssetInput = z.object({
  assetType: z.enum(["design_instruction", "logo"]), title: z.string().trim().min(3).max(300), fileName: z.string().trim().min(1).max(500),
  mimeType: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown", "text/plain", "image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
  fileBase64: z.string().min(4).max(14_000_000),
});
const weeklyResultsItemInput = z.object({
  itemType: z.enum(WEEKLY_RESULTS_ITEM_TYPES), title: z.string().trim().min(4).max(300), programKey: z.string().trim().min(2).max(96).regex(/^[a-z0-9_]+$/).optional(), objective: z.string().trim().min(8).max(500),
  creativeDirection: z.string().trim().max(12_000).optional(), scriptCopy: z.string().trim().max(30_000).optional(), caption: z.string().trim().max(20_000).optional(), cta: z.string().trim().max(500).optional(),
  hashtags: z.array(z.string().trim().min(1).max(120)).max(40).default([]), visualBrief: z.string().trim().max(12_000).optional(), plannedDay: z.enum(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]).optional(), plannedTime: z.string().refine(isValidCairoClockTime, "Use HH:MM Cairo time.").optional(),
  sourceClaimIds: z.array(z.number().int().positive()).max(32).default([]), metadata: z.record(z.string(), z.unknown()).default({}), isSelected: z.boolean().default(true),
});
const createWeeklyResultsPlanInput = z.object({ periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), title: z.string().trim().min(4).max(300), items: z.array(weeklyResultsItemInput).min(1).max(48) });
const updateWeeklyResultsItemInput = weeklyResultsItemInput.extend({ itemId: z.number().int().positive() });
const weeklyResultsItemDecisionInput = z.object({ itemId: z.number().int().positive(), decision: z.enum(["send_back", "approve", "reject", "stop"]), note: z.string().trim().min(4).max(8_000), feedbackCategory: z.enum(WEEKLY_RESULTS_FEEDBACK_CATEGORIES).optional() });
const approvedReelInputAsset = z.object({
  url: z.string().url().max(2_000),
  // Both are server-populated after the asset is downloaded and verified.
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional().transform(value => value?.toLowerCase() ?? ""),
  mimeType: z.string().trim().min(3).max(128).optional().transform(value => value ?? ""),
});
const composeApprovedReelInput = z.object({
  itemId: z.number().int().positive(),
  sourceVideo: approvedReelInputAsset,
  narration: approvedReelInputAsset,
});
const weeklyResultsPerformanceInput = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), spendEgp: z.number().finite().min(0).max(100_000_000).default(0), impressions: z.number().int().min(0).max(10_000_000_000).default(0), clicks: z.number().int().min(0).max(10_000_000_000).default(0),
  leadForms: z.number().int().min(0).max(10_000_000_000).default(0), qualifiedLeads: z.number().int().min(0).max(10_000_000_000).default(0), clientStageLeads: z.number().int().min(0).max(10_000_000_000).default(0), notes: z.string().trim().max(4_000).optional(),
});
const weeklyAutomationControlInput = z.object({
  monthlyBudgetUsd: z.number().finite().min(1).max(100).default(100),
  perRunReserveUsd: z.number().finite().min(1).max(20).default(20),
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
  onScreenEnglishText: z.string().trim().max(20_000).optional(),
  caption: z.string().trim().max(20_000).optional(),
  cta: z.string().trim().min(2).max(500),
  landingDestination: z.string().url().max(2_000).optional(),
  scheduledFor: z.number().int().positive().optional(),
  claimIds: z.array(z.number().int().positive()).min(1).max(32),
  visualBrief: z.string().trim().max(20_000).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
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
function weeklyResultsPlanKey() {
  return `mwr-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 10)}`;
}
function metaStrategyPacketKey() {
  return `masp-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 10)}`;
}

function campaignPilotProposalKey() {
  return `mcpp-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 10)}`;
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
async function appendWeeklyResultsItemEvent(input: {
  itemId: number;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  feedback?: string | null;
  changedFields?: string[];
  payload?: Record<string, unknown>;
  actorUserId: number;
  createdAt?: number;
}) {
  const db = await requireDb();
  await db.insert(marketingWeeklyResultsItemEvents).values({
    itemId: input.itemId,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    feedback: input.feedback ?? null,
    changedFieldsJson: JSON.stringify(input.changedFields ?? []),
    payloadJson: JSON.stringify(input.payload ?? {}),
    actorUserId: input.actorUserId,
    createdAt: input.createdAt ?? Date.now(),
  });
}
function defaultWeeklyResultsSettings() {
  return {
    settingsKey: "primary-weekly-results",
    timezone: "Africa/Cairo",
    prepareDayOfWeek: 6,
    prepareStartTime: "08:00",
    deliveryDeadlineTime: "10:00",
    preparationScheduleEnabled: true,
    scheduleState: "waiting_execution_release",
    weeklyGoal: null as string | null,
    programPriorities: [] as Array<{ key: string; priority: number; note?: string }>,
    updatedSourcesNote: null as string | null,
    creativeDirection: null as string | null,
    contentMix: DEFAULT_WEEKLY_CONTENT_MIX,
    allocationRules: {} as Record<string, string>,
    learningEnabled: true,
    targetLikes30d: 0,
    targetViews30d: 0,
    targetLeads30d: 0,
    targetQualifiedLeads30d: 0,
    targetSignedClients30d: 0,
    targetCostPerLeadEgp: 0,
    targetMaxAdSpend30dEgp: 0,
    requestedAutopublishThreshold: 90,
    lastScheduleAttemptAt: null as number | null,
    lastScheduleStatus: "not_scheduled" as string,
    isPersisted: false,
  };
}
function parseWeeklyResultsSettings(row: typeof marketingWeeklyResultsSettings.$inferSelect | undefined) {
  if (!row) return defaultWeeklyResultsSettings();
  return {
    settingsKey: row.settingsKey,
    timezone: row.timezone,
    prepareDayOfWeek: row.prepareDayOfWeek,
    prepareStartTime: row.prepareStartTime,
    deliveryDeadlineTime: row.deliveryDeadlineTime,
    preparationScheduleEnabled: row.preparationScheduleEnabled,
    scheduleState: row.scheduleState,
    weeklyGoal: row.weeklyGoal,
    programPriorities: parseJson<Array<{ key: string; priority: number; note?: string }>>(row.programPrioritiesJson, []),
    updatedSourcesNote: row.updatedSourcesNote,
    creativeDirection: row.creativeDirection,
    contentMix: parseJson<typeof DEFAULT_WEEKLY_CONTENT_MIX>(row.contentMixJson, DEFAULT_WEEKLY_CONTENT_MIX),
    allocationRules: parseJson<Record<string, string>>(row.allocationRulesJson, {}),
    learningEnabled: row.learningEnabled,
    targetLikes30d: row.targetLikes30d,
    targetViews30d: row.targetViews30d,
    targetLeads30d: row.targetLeads30d,
    targetQualifiedLeads30d: row.targetQualifiedLeads30d,
    targetSignedClients30d: row.targetSignedClients30d,
    targetCostPerLeadEgp: Number(row.targetCostPerLeadEgp),
    targetMaxAdSpend30dEgp: Number(row.targetMaxAdSpend30dEgp),
    requestedAutopublishThreshold: row.requestedAutopublishThreshold,
    lastScheduleAttemptAt: row.lastScheduleAttemptAt,
    lastScheduleStatus: row.lastScheduleStatus ?? "not_scheduled",
    isPersisted: true,
  };
}

function trimDesignSystemText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\s+\n/g, "\n").trim().slice(0, 80_000);
}

async function extractDesignSystemText(bytes: Buffer, mimeType: string, fileName: string): Promise<string | null> {
  const lowerName = fileName.toLowerCase();
  if (mimeType === "text/markdown" || mimeType === "text/plain" || lowerName.endsWith(".md") || lowerName.endsWith(".txt")) return trimDesignSystemText(bytes.toString("utf8"));
  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const pdfParseModule: any = await import("pdf-parse");
    const pdfParse = pdfParseModule.default || pdfParseModule;
    return trimDesignSystemText((await pdfParse(bytes)).text ?? "") || null;
  }
  if (mimeType.includes("wordprocessingml") || lowerName.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    return trimDesignSystemText((await mammoth.extractRawText({ buffer: bytes })).value ?? "") || null;
  }
  return null;
}

async function summarizeDesignSystemInstructions(extractedText: string): Promise<{ summary: string; mandatoryRules: string[]; prohibitedRules: string[]; visualDirection: string[] }> {
  const response = await invokeLLM({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: "You extract an internal design-system document into precise, traceable creative constraints. Do not invent instructions, claims, facts, people, brands, or legal advice. Preserve uncertainty. Return strictly the requested JSON." },
      { role: "user", content: `Extract the design instructions from this ELEVAY internal document. This output is for human review and future creative briefs, not for publishing.\n\nDOCUMENT:\n${extractedText.slice(0, 50_000)}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "design_system_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            mandatoryRules: { type: "array", items: { type: "string" } },
            prohibitedRules: { type: "array", items: { type: "string" } },
            visualDirection: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "mandatoryRules", "prohibitedRules", "visualDirection"],
          additionalProperties: false,
        },
      },
    },
  });
  const text = typeof response.choices[0]?.message.content === "string" ? response.choices[0].message.content : "";
  const parsed = JSON.parse(text) as { summary: string; mandatoryRules: string[]; prohibitedRules: string[]; visualDirection: string[] };
  return {
    summary: normalizeContentStudioText(parsed.summary).slice(0, 8_000),
    mandatoryRules: parsed.mandatoryRules.map(normalizeContentStudioText).filter(Boolean).slice(0, 40),
    prohibitedRules: parsed.prohibitedRules.map(normalizeContentStudioText).filter(Boolean).slice(0, 40),
    visualDirection: parsed.visualDirection.map(normalizeContentStudioText).filter(Boolean).slice(0, 40),
  };
}
function weeklyResultsItemUnsafeField(input: z.infer<typeof weeklyResultsItemInput>): string | null {
  const fields = [input.title, input.programKey, input.objective, input.creativeDirection, input.scriptCopy, input.caption, input.cta, input.visualBrief, ...input.hashtags, JSON.stringify(input.metadata)];
  for (const field of fields) {
    if (!field) continue;
    const unsafe = findDisallowedWeeklyResultsData(field);
    if (unsafe) return unsafe;
  }
  return null;
}
function normalizeWeeklyResultsItem(input: z.infer<typeof weeklyResultsItemInput>) {
  const unsafe = weeklyResultsItemUnsafeField(input);
  if (unsafe) throw new TRPCError({ code: "BAD_REQUEST", message: `Weekly Results cannot contain ${unsafe}. Use aggregate, programme-level planning only.` });
  return {
    itemType: input.itemType,
    title: normalizeWeeklyResultsText(input.title),
    programKey: input.programKey ?? null,
    objective: normalizeWeeklyResultsText(input.objective),
    creativeDirection: input.creativeDirection ? normalizeWeeklyResultsText(input.creativeDirection) : null,
    scriptCopy: input.scriptCopy ? normalizeWeeklyResultsText(input.scriptCopy) : null,
    caption: input.caption ? normalizeWeeklyResultsText(input.caption) : null,
    cta: input.cta ? normalizeWeeklyResultsText(input.cta) : null,
    hashtagsJson: JSON.stringify(Array.from(new Set(input.hashtags.map(normalizeWeeklyResultsText))).sort()),
    visualBrief: input.visualBrief ? normalizeWeeklyResultsText(input.visualBrief) : null,
    plannedDay: input.plannedDay ?? null,
    plannedTime: input.plannedTime ?? null,
    // Generated media is attached only by the system-owned production pipeline.
    // A Marketing-user plan draft can never carry an external preview reference.
    previewUrl: null,
    previewHash: null,
    sourceClaimIdsJson: JSON.stringify(Array.from(new Set(input.sourceClaimIds)).sort((a, b) => a - b)),
    metadataJson: JSON.stringify(input.metadata),
    isSelected: input.isSelected,
  };
}

function validateWeeklyResultsItemLanguage(item: Pick<typeof marketingWeeklyResultsItems.$inferSelect, "itemType" | "scriptCopy" | "caption" | "cta" | "metadataJson">) {
  if (!isCreativeItemType(item.itemType)) return;
  const metadata = parseJson<Record<string, unknown>>(item.metadataJson, {});
  const onScreenEnglishText = typeof metadata.onScreenEnglishText === "string" ? metadata.onScreenEnglishText : "";
  const languageProblems = [
    item.scriptCopy ? validateArabicOnlyMarketingText(item.scriptCopy, "Script / marketing copy") : (item.itemType === "reel" ? "A reel requires Arabic voice-over / marketing copy before review." : null),
    item.caption ? validateBilingualElevayCaption(item.caption, "Caption") : "An Arabic caption is required before individual review.",
    item.cta ? validateArabicOnlyMarketingText(item.cta, "CTA") : null,
    isVisualTextCreativeItemType(item.itemType) ? validateEnglishOnlyOnScreenText(onScreenEnglishText) : null,
  ].filter((problem): problem is string => Boolean(problem));
  if (languageProblems.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: languageProblems[0] });
}
async function requireSystemGeneratedWeeklyMedia(item: Pick<typeof marketingWeeklyResultsItems.$inferSelect, "id" | "itemType" | "previewUrl" | "previewHash">) {
  if (!isCreativeItemType(item.itemType)) return null;
  if (!item.previewUrl || !item.previewHash) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "System-generated media is required before this creative item can receive final approval." });
  }
  const db = await requireDb();
  const [asset] = await db.select().from(marketingGeneratedMediaAssets).where(and(
    eq(marketingGeneratedMediaAssets.weeklyItemId, item.id),
    eq(marketingGeneratedMediaAssets.origin, "system_generated"),
    eq(marketingGeneratedMediaAssets.status, "review_ready"),
    eq(marketingGeneratedMediaAssets.assetUrl, item.previewUrl),
    eq(marketingGeneratedMediaAssets.assetSha256, item.previewHash.toLowerCase()),
    isNull(marketingGeneratedMediaAssets.supersededAt),
  )).orderBy(desc(marketingGeneratedMediaAssets.generatedAt)).limit(1);
  if (!asset) throw new TRPCError({ code: "BAD_REQUEST", message: "The final preview is not a current system-generated asset linked to this exact creative item." });
  return asset;
}

async function requireSystemGeneratedContentMedia(packet: Pick<typeof marketingContentPackets.$inferSelect, "id" | "contentType" | "previewUrl" | "previewHash">) {
  if (!isCreativeItemType(packet.contentType)) return null;
  if (!packet.previewUrl || !packet.previewHash) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "System-generated media is required before this creative packet can proceed to final QA or approval." });
  }
  const db = await requireDb();
  const [asset] = await db.select().from(marketingGeneratedMediaAssets).where(and(
    eq(marketingGeneratedMediaAssets.contentPacketId, packet.id),
    eq(marketingGeneratedMediaAssets.origin, "system_generated"),
    eq(marketingGeneratedMediaAssets.status, "review_ready"),
    eq(marketingGeneratedMediaAssets.assetUrl, packet.previewUrl),
    eq(marketingGeneratedMediaAssets.assetSha256, packet.previewHash.toLowerCase()),
    isNull(marketingGeneratedMediaAssets.supersededAt),
  )).orderBy(desc(marketingGeneratedMediaAssets.generatedAt)).limit(1);
  if (!asset) throw new TRPCError({ code: "BAD_REQUEST", message: "The final preview is not a current system-generated asset linked to this exact content packet." });
  return asset;
}

function weeklyResultsPlanHash(input: { periodStart: string; title: string; setup: unknown; performance: unknown; preferences: unknown; items: unknown }) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
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

async function requireActiveDesignSystemForCreative() {
  const db = await requireDb();
  const assets = await db.select().from(marketingDesignSystemAssets)
    .where(and(eq(marketingDesignSystemAssets.isActive, true), isNull(marketingDesignSystemAssets.archivedAt)))
    .orderBy(desc(marketingDesignSystemAssets.updatedAt));
  const instructions = assets.find(asset => asset.assetType === "design_instruction");
  const logo = assets.find(asset => asset.assetType === "logo");
  if (!instructions || !logo) throw new TRPCError({ code: "BAD_REQUEST", message: "Creative packets require one active Design System instruction document and one active official logo in Settings." });
  return { instructions, logo };
}

function validateContentPacketText(input: z.infer<typeof contentPacketInput>) {
  const fields: Array<[string, string | undefined]> = [
    ["title", input.title], ["audience", input.audience], ["objective", input.objective], ["Arabic copy", input.arabicCopy],
    ["On-screen English text", input.onScreenEnglishText], ["caption", input.caption], ["CTA", input.cta], ["visual brief", input.visualBrief],
    ["change summary", input.changeSummary], ["payload", JSON.stringify(input.payload)],
  ];
  for (const [label, value] of fields) {
    if (!value) continue;
    const disallowed = findDisallowedContentPacketData(value);
    if (disallowed) throw new TRPCError({ code: "BAD_REQUEST", message: `Remove ${disallowed} from the content packet ${label}. Content packets must not contain client or Lead identity data.` });
  }
  const languageProblems = [
    validateArabicOnlyMarketingText(input.arabicCopy, "Arabic primary copy"),
    input.caption ? validateBilingualElevayCaption(input.caption, "Caption") : null,
    validateArabicOnlyMarketingText(input.cta, "CTA"),
    isVisualTextCreativeItemType(input.contentType) ? validateEnglishOnlyOnScreenText(input.onScreenEnglishText ?? "") : null,
  ].filter((problem): problem is string => Boolean(problem));
  if (languageProblems.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: languageProblems[0] });
}

function validateStoredContentPacketLanguage(packet: Pick<typeof marketingContentPackets.$inferSelect, "contentType" | "arabicCopy" | "englishCopy" | "caption" | "cta">) {
  const languageProblems = [
    validateArabicOnlyMarketingText(packet.arabicCopy, "Arabic primary copy"),
    packet.caption ? validateBilingualElevayCaption(packet.caption, "Caption") : null,
    validateArabicOnlyMarketingText(packet.cta, "CTA"),
    isVisualTextCreativeItemType(packet.contentType) ? validateEnglishOnlyOnScreenText(packet.englishCopy ?? "") : null,
  ].filter((problem): problem is string => Boolean(problem));
  if (languageProblems.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: languageProblems[0] });
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
    onScreenEnglishText: input.onScreenEnglishText ? normalizeContentStudioText(input.onScreenEnglishText) : null,
    caption: input.caption ? normalizeContentStudioText(input.caption) : null,
    cta: normalizeContentStudioText(input.cta),
    landingDestination: input.landingDestination ?? null,
    scheduledFor: input.scheduledFor ?? null,
    claimIds: Array.from(new Set(input.claimIds)).sort((a, b) => a - b),
    visualBrief: input.visualBrief ? normalizeContentStudioText(input.visualBrief) : null,
    payload: input.payload,
    preview: "system_generated_only",
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

async function getPilotReadinessExecutiveData() {
  const db = await requireDb();
  const rows = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM ${leads}
        WHERE ${leads.createdAt} >= UNIX_TIMESTAMP(CURRENT_TIMESTAMP - INTERVAL 90 DAY) * 1000
          AND COALESCE(${leads.isMetaTestLead}, 0) = 0) AS rawLeads,
      (SELECT COUNT(*) FROM ${leads}
        WHERE ${leads.createdAt} >= UNIX_TIMESTAMP(CURRENT_TIMESTAMP - INTERVAL 90 DAY) * 1000
          AND COALESCE(${leads.isMetaTestLead}, 0) = 0
          AND ${leads.stage} = 'qualified') AS qualifiedLeads,
      (SELECT COUNT(*) FROM ${leads}
        WHERE ${leads.createdAt} >= UNIX_TIMESTAMP(CURRENT_TIMESTAMP - INTERVAL 90 DAY) * 1000
          AND COALESCE(${leads.isMetaTestLead}, 0) = 0
          AND ${leads.stage} = 'client') AS clientStageLeads,
      (SELECT COUNT(*) FROM ${leads}
        WHERE ${leads.createdAt} >= UNIX_TIMESTAMP(CURRENT_TIMESTAMP - INTERVAL 90 DAY) * 1000
          AND COALESCE(${leads.isMetaTestLead}, 0) = 0
          AND (COALESCE(${leads.metaCampaignId}, '') <> '' OR COALESCE(${leads.metaCampaign}, '') <> '' OR COALESCE(${leads.utmCampaign}, '') <> '')) AS attributedLeads,
      (SELECT COUNT(*) FROM ${contracts} WHERE ${contracts.clientOrigin} = 'marketing') AS marketingOriginContracts,
      (SELECT COUNT(*) FROM ${contracts} WHERE ${contracts.clientOrigin} = 'marketing' AND ${contracts.status} = 'signed') AS signedMarketingOriginContracts,
      (SELECT COUNT(*) FROM ${metaCrmEventLog} WHERE COALESCE(${metaCrmEventLog.isTestLead}, 0) = 0) AS metaEventCount,
      (SELECT COUNT(*) FROM ${metaCrmEventLog}
        WHERE COALESCE(${metaCrmEventLog.isTestLead}, 0) = 0
          AND ${metaCrmEventLog.status} IN ('failed', 'retrying', 'dead_letter', 'manual_review', 'approval_gated')) AS metaEventAttentionCount,
      (SELECT ${metaMonitoringSnapshots.capturedAt} FROM ${metaMonitoringSnapshots} ORDER BY ${metaMonitoringSnapshots.capturedAt} DESC LIMIT 1) AS monitoringCapturedAt,
      (SELECT ${metaMonitoringSnapshots.attributionCoverageBps} FROM ${metaMonitoringSnapshots} ORDER BY ${metaMonitoringSnapshots.capturedAt} DESC LIMIT 1) AS crmAttributionCoverageBps,
      (SELECT ${metaMonitoringSnapshots.failedInboxCount} FROM ${metaMonitoringSnapshots} ORDER BY ${metaMonitoringSnapshots.capturedAt} DESC LIMIT 1) AS failedInboxCount,
      (SELECT ${metaMonitoringSnapshots.retryInboxCount} FROM ${metaMonitoringSnapshots} ORDER BY ${metaMonitoringSnapshots.capturedAt} DESC LIMIT 1) AS retryInboxCount,
      (SELECT ${metaMonitoringSnapshots.testLeadLeakageCount} FROM ${metaMonitoringSnapshots} ORDER BY ${metaMonitoringSnapshots.capturedAt} DESC LIMIT 1) AS testLeadLeakageCount,
      (SELECT ${metaMonitoringSnapshots.productionSendingEnabled} FROM ${metaMonitoringSnapshots} ORDER BY ${metaMonitoringSnapshots.capturedAt} DESC LIMIT 1) AS productionSendingEnabled,
      (SELECT ${metaReconciliationState.status} FROM ${metaReconciliationState} ORDER BY ${metaReconciliationState.updatedAt} DESC LIMIT 1) AS reconciliationStatus,
      (SELECT ${metaReconciliationState.lastSuccessAt} FROM ${metaReconciliationState} ORDER BY ${metaReconciliationState.updatedAt} DESC LIMIT 1) AS reconciliationLastSuccessAt,
      (SELECT COUNT(*) FROM ${marketingBrandBooks} WHERE ${marketingBrandBooks.status} = 'active') AS activeBrandBookCount,
      (SELECT COUNT(*) FROM ${marketingMetaAdsStrategyApprovalPackets} WHERE ${marketingMetaAdsStrategyApprovalPackets.status} = 'approved') AS approvedStrategyPacketCount,
      (SELECT COUNT(*) FROM ${marketingMetaCampaignPilotProposals} WHERE ${marketingMetaCampaignPilotProposals.status} = 'internally_approved') AS internallyApprovedPilotProposalCount
  `);
  const first = Array.isArray(rows) ? rows[0] : rows;
  const aggregate = (Array.isArray(first) ? first[0] : first ?? {}) as Record<string, unknown>;
  const numeric = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const nullableNumber = (value: unknown) => value === null || value === undefined ? null : numeric(value);
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
  const bool = (value: unknown) => value === true || value === 1 || value === "1";
  const metrics = {
    rawLeads: numeric(aggregate.rawLeads), qualifiedLeads: numeric(aggregate.qualifiedLeads),
    clientStageLeads: numeric(aggregate.clientStageLeads), attributedLeads: numeric(aggregate.attributedLeads),
    marketingOriginContracts: numeric(aggregate.marketingOriginContracts), signedMarketingOriginContracts: numeric(aggregate.signedMarketingOriginContracts),
    metaEventCount: numeric(aggregate.metaEventCount), crmAttributionCoverageBps: numeric(aggregate.crmAttributionCoverageBps),
  };
  const controls = {
    monitoringCapturedAt: nullableNumber(aggregate.monitoringCapturedAt), reconciliationStatus: text(aggregate.reconciliationStatus),
    reconciliationLastSuccessAt: nullableNumber(aggregate.reconciliationLastSuccessAt), failedInboxCount: numeric(aggregate.failedInboxCount),
    retryInboxCount: numeric(aggregate.retryInboxCount), testLeadLeakageCount: numeric(aggregate.testLeadLeakageCount),
    productionSendingEnabled: bool(aggregate.productionSendingEnabled), metaEventAttentionCount: numeric(aggregate.metaEventAttentionCount),
    activeBrandBookCount: numeric(aggregate.activeBrandBookCount), approvedStrategyPacketCount: numeric(aggregate.approvedStrategyPacketCount),
    internallyApprovedPilotProposalCount: numeric(aggregate.internallyApprovedPilotProposalCount),
  };
  const measuredAt = Date.now();
  const readiness = buildPilotReadiness({
    now: measuredAt, activeBrandBookCount: controls.activeBrandBookCount, approvedStrategyPacketCount: controls.approvedStrategyPacketCount,
    internallyApprovedPilotProposalCount: controls.internallyApprovedPilotProposalCount, monitoringCapturedAt: controls.monitoringCapturedAt,
    reconciliationStatus: controls.reconciliationStatus, reconciliationLastSuccessAt: controls.reconciliationLastSuccessAt,
    latestAttributionCoverageBps: metrics.crmAttributionCoverageBps, latestFailedInboxCount: controls.failedInboxCount,
    latestRetryInboxCount: controls.retryInboxCount, latestTestLeadLeakageCount: controls.testLeadLeakageCount,
    metaEventAttentionCount: controls.metaEventAttentionCount, pilotActualEvidenceAvailable: false, spendReconciliationAvailable: false,
  });
  return {
    measuredAt, windowDays: EXECUTIVE_MEASUREMENT_WINDOW_DAYS, metrics, controls, readiness,
    definitions: EXECUTIVE_MEASUREMENT_DEFINITIONS,
    privacy: "Aggregate-only measurement. No client, Lead, contact, identity, financial row, campaign mutation, provider request, or external operation is returned or performed.",
    externalOperationsEnabled: false,
  };
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

async function requireMarketingSystemAdministrator(user: { id: number; openId: string | null; email?: string | null }) {
  const role = await getEffectiveRole(user);
  if (role !== "owner" && role !== "marketing_system_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "This action requires the scoped Agentic Marketing System administrator role." });
  }
}

async function isMarketingSystemAdministrator(user: { id: number; openId: string | null; email?: string | null }) {
  const role = await getEffectiveRole(user);
  return role === "owner" || role === "marketing_system_admin";
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

async function getMetaStrategyPacketReadiness(sessionId: number) {
  const db = await requireDb();
  const companyRecord = await getMetaStrategySessionWithAnswers(sessionId);
  const allAnswers = await db.select().from(marketingMetaAdsStrategyAnswers)
    .where(eq(marketingMetaAdsStrategyAnswers.sessionId, sessionId))
    .orderBy(marketingMetaAdsStrategyAnswers.questionNumber);
  const companyAnswers = companyRecord.answers;
  const missingCompanyQuestions = META_ADS_STRATEGY_QUESTIONS
    .filter(question => !companyAnswers.some(answer => answer.questionNumber === question.number))
    .map(question => question.number);
  const unknownCompanyQuestions = companyAnswers.filter(answer => answer.decisionStatus === "unknown").map(answer => answer.questionNumber);
  const programReadiness = META_ADS_STRATEGY_REQUIRED_PROGRAMS.map(program => {
    const answers = allAnswers.filter(answer => answer.scopeType === "program" && answer.programKey === program.key);
    const missingQuestions = META_ADS_STRATEGY_PROGRAM_CONFIRMATION_QUESTION_NUMBERS
      .filter(questionNumber => !answers.some(answer => answer.questionNumber === questionNumber));
    const unknownQuestions = answers.filter(answer => answer.decisionStatus === "unknown").map(answer => answer.questionNumber);
    return { ...program, answeredCount: answers.length, requiredCount: META_ADS_STRATEGY_PROGRAM_CONFIRMATION_QUESTION_NUMBERS.length, missingQuestions, unknownQuestions, isReady: missingQuestions.length === 0 && unknownQuestions.length === 0 };
  });
  const activeBrandBook = await getActiveBrandBookForWorkOrder();
  return {
    session: companyRecord.session,
    companyAnswers,
    allAnswers,
    activeBrandBook,
    companyComplete: missingCompanyQuestions.length === 0 && unknownCompanyQuestions.length === 0,
    missingCompanyQuestions,
    unknownCompanyQuestions,
    programReadiness,
    isReady: Boolean(activeBrandBook) && missingCompanyQuestions.length === 0 && unknownCompanyQuestions.length === 0 && programReadiness.every(program => program.isReady),
  };
}

function strategyAnswerSnapshot(answer: typeof marketingMetaAdsStrategyAnswers.$inferSelect) {
  return {
    questionNumber: answer.questionNumber,
    scopeType: answer.scopeType,
    programKey: answer.programKey,
    answerText: answer.answerText,
    normalizedFields: parseJson<Record<string, unknown>>(answer.normalizedJson, {}),
    attachments: parseJson<Array<{ label: string; url: string }>>(answer.attachmentsJson, []),
    decisionStatus: answer.decisionStatus,
    gapDueAt: answer.gapDueAt,
    answeredByUserId: answer.answeredByUserId,
    updatedAt: answer.updatedAt,
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
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const [session] = await db.select().from(marketingMetaAdsStrategySessions)
      .where(eq(marketingMetaAdsStrategySessions.status, "in_progress"))
      .orderBy(desc(marketingMetaAdsStrategySessions.version)).limit(1);
    return session ? presentMetaStrategySession(await getMetaStrategySessionWithAnswers(session.id)) : null;
  }),

  startOrResumeMetaAdsStrategy: protectedProcedure.mutation(async ({ ctx }) => {
    await requireMarketingSystemAdministrator(ctx.user);
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
    await requireMarketingSystemAdministrator(ctx.user);
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
    await requireMarketingSystemAdministrator(ctx.user);
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
    await requireMarketingSystemAdministrator(ctx.user);
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

  getMetaAdsStrategyPacketWorkspace: protectedProcedure.query(async ({ ctx }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const [current] = await db.select().from(marketingMetaAdsStrategySessions)
      .where(inArray(marketingMetaAdsStrategySessions.status, ["in_progress", "proposed", "approved"]))
      .orderBy(desc(marketingMetaAdsStrategySessions.version)).limit(1);
    if (!current) return { readiness: null, packets: [] };
    const readiness = await getMetaStrategyPacketReadiness(current.id);
    const packets = await db.select().from(marketingMetaAdsStrategyApprovalPackets)
      .where(eq(marketingMetaAdsStrategyApprovalPackets.strategySessionId, current.id))
      .orderBy(desc(marketingMetaAdsStrategyApprovalPackets.version));
    return { readiness: { ...readiness, companyAnswers: readiness.companyAnswers.map(strategyAnswerSnapshot), allAnswers: readiness.allAnswers.map(strategyAnswerSnapshot) }, packets: packets.map(packet => ({ ...packet, payload: parseJson<Record<string, unknown>>(packet.packetPayloadJson, {}) })) };
  }),

  saveMetaAdsStrategyProgramConfirmation: protectedProcedure.input(metaStrategyProgramAnswerInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    if (!(META_ADS_STRATEGY_PROGRAM_CONFIRMATION_QUESTION_NUMBERS as readonly number[]).includes(input.questionNumber)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This question does not require a program-specific confirmation." });
    }
    const db = await requireDb();
    const { session, answers } = await getMetaStrategySessionWithAnswers(input.sessionId);
    if (!isMetaAdsStrategyComplete(answers.map(answer => answer.questionNumber))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Complete the company-wide 66-question interview before confirming programme-specific answers." });
    }
    const companyAnswer = answers.find(answer => answer.questionNumber === input.questionNumber);
    if (!companyAnswer || companyAnswer.decisionStatus === "unknown") throw new TRPCError({ code: "BAD_REQUEST", message: "Resolve the company answer before confirming this programme variation." });
    if (session.status === "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "A revised strategy packet is required before changing an approved strategy confirmation." });
    const now = Date.now();
    await db.insert(marketingMetaAdsStrategyAnswers).values({
      sessionId: input.sessionId,
      questionNumber: input.questionNumber,
      scopeType: "program",
      programKey: input.programKey,
      answerText: input.answerText,
      normalizedJson: JSON.stringify(input.normalizedFields ?? {}),
      attachmentsJson: JSON.stringify(input.attachments),
      decisionStatus: input.decisionStatus,
      gapOwnerUserId: input.decisionStatus === "unknown" ? ctx.user.id : null,
      gapDueAt: input.decisionStatus === "unknown" ? input.gapDueAt! : null,
      answeredByUserId: ctx.user.id,
      createdAt: now,
      updatedAt: now,
    }).onDuplicateKeyUpdate({ set: {
      answerText: input.answerText,
      normalizedJson: JSON.stringify(input.normalizedFields ?? {}),
      attachmentsJson: JSON.stringify(input.attachments),
      decisionStatus: input.decisionStatus,
      gapOwnerUserId: input.decisionStatus === "unknown" ? ctx.user.id : null,
      gapDueAt: input.decisionStatus === "unknown" ? input.gapDueAt! : null,
      answeredByUserId: ctx.user.id,
      updatedAt: now,
    }});
    await db.update(marketingMetaAdsStrategySessions).set({ updatedAt: now }).where(eq(marketingMetaAdsStrategySessions.id, input.sessionId));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_meta_ads_strategy_program_confirmation", `${input.sessionId}:${input.programKey}:${input.questionNumber}`, JSON.stringify({ programKey: input.programKey, questionNumber: input.questionNumber, decisionStatus: input.decisionStatus }));
    return getMetaStrategyPacketReadiness(input.sessionId);
  }),

  proposeMetaAdsStrategyPacket: protectedProcedure.input(z.object({ sessionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const readiness = await getMetaStrategyPacketReadiness(input.sessionId);
    if (!readiness.isReady || !readiness.activeBrandBook) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The Strategy Approval Packet requires a current active Brand Book, complete company answers with no Unknown gaps, and confirmed Spain DNV and Malta MPRP programme variations." });
    }
    if (readiness.session.status === "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "This strategy version is already approved. Reset the relevant scope before proposing a revised version." });
    const sourceAnswers = readiness.allAnswers.map(strategyAnswerSnapshot);
    const sourceAnswerHash = crypto.createHash("sha256").update(JSON.stringify(sourceAnswers)).digest("hex");
    const payload = {
      title: `ELEVAY Meta Ads Strategy Approval Packet v${readiness.session.version}`,
      strategySessionId: readiness.session.id,
      strategySessionVersion: readiness.session.version,
      brandBook: { id: readiness.activeBrandBook.id, version: readiness.activeBrandBook.version, hash: readiness.activeBrandBook.contentHash },
      requiredProgramConfirmations: readiness.programReadiness.map(program => ({ programKey: program.key, programLabel: program.label, confirmedQuestions: program.requiredCount })),
      sourceAnswerHash,
      assumptions: sourceAnswers,
      risks: ["No campaign, budget, spend, permission, provider, CAPI, publication or measurement-pilot action is authorized by this packet."],
      unresolvedAnswers: [],
      approvalScope: "Planning strategy only. A separate Phase 5b proposal and explicit spend cap are required before campaign operations can be considered.",
    };
    const packetPayloadJson = JSON.stringify(payload);
    const packetHash = crypto.createHash("sha256").update(packetPayloadJson).digest("hex");
    const [latest] = await db.select({ version: marketingMetaAdsStrategyApprovalPackets.version }).from(marketingMetaAdsStrategyApprovalPackets).orderBy(desc(marketingMetaAdsStrategyApprovalPackets.version)).limit(1);
    const now = Date.now();
    const result = await db.insert(marketingMetaAdsStrategyApprovalPackets).values({
      packetKey: metaStrategyPacketKey(),
      version: (latest?.version ?? 0) + 1,
      strategySessionId: readiness.session.id,
      brandBookId: readiness.activeBrandBook.id,
      status: "proposed",
      packetPayloadJson,
      packetHash,
      sourceAnswerHash,
      ownerNote: null,
      createdByUserId: ctx.user.id,
      proposedAt: now,
      decidedByUserId: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const packetId = Number((result as { insertId?: number }).insertId);
    await db.update(marketingMetaAdsStrategySessions).set({ status: "proposed", proposedAt: now, updatedAt: now }).where(eq(marketingMetaAdsStrategySessions.id, readiness.session.id));
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_meta_ads_strategy_approval_packet", packetId, JSON.stringify({ strategySessionId: readiness.session.id, packetHash, sourceAnswerHash, brandBookVersion: readiness.activeBrandBook.version }));
    return { packetId, packetHash, status: "proposed" as const };
  }),

  approveMetaAdsStrategyPacket: protectedProcedure.input(metaStrategyPacketDecisionInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const [packet] = await db.select().from(marketingMetaAdsStrategyApprovalPackets).where(eq(marketingMetaAdsStrategyApprovalPackets.id, input.packetId)).limit(1);
    if (!packet) throw new TRPCError({ code: "NOT_FOUND", message: "Strategy Approval Packet not found." });
    if (packet.status !== "proposed") throw new TRPCError({ code: "BAD_REQUEST", message: "Only a proposed Strategy Approval Packet can be approved." });
    const readiness = await getMetaStrategyPacketReadiness(packet.strategySessionId);
    const currentSourceHash = crypto.createHash("sha256").update(JSON.stringify(readiness.allAnswers.map(strategyAnswerSnapshot))).digest("hex");
    if (!readiness.isReady || currentSourceHash !== packet.sourceAnswerHash || !readiness.activeBrandBook || readiness.activeBrandBook.id !== packet.brandBookId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The intake answers, programme confirmations, or active Brand Book changed. Create a fresh Strategy Approval Packet for review." });
    }
    const now = Date.now();
    await db.update(marketingMetaAdsStrategyApprovalPackets).set({ status: "approved", ownerNote: input.ownerNote, decidedByUserId: ctx.user.id, decidedAt: now, updatedAt: now }).where(eq(marketingMetaAdsStrategyApprovalPackets.id, packet.id));
    await db.update(marketingMetaAdsStrategySessions).set({ status: "approved", approvedAt: now, approvedByUserId: ctx.user.id, updatedAt: now }).where(eq(marketingMetaAdsStrategySessions.id, packet.strategySessionId));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_meta_ads_strategy_approval_packet", packet.id, JSON.stringify({ decision: "approved", packetHash: packet.packetHash, ownerNoteLength: input.ownerNote.length, noCampaignActivation: true }));
    return { id: packet.id, status: "approved" as const, approvedAt: now };
  }),

  getCampaignPilotProposalWorkspace: protectedProcedure.query(async ({ ctx }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const approvedPackets = await db.select().from(marketingMetaAdsStrategyApprovalPackets)
      .where(eq(marketingMetaAdsStrategyApprovalPackets.status, "approved"))
      .orderBy(desc(marketingMetaAdsStrategyApprovalPackets.version));
    const proposals = await db.select().from(marketingMetaCampaignPilotProposals)
      .orderBy(desc(marketingMetaCampaignPilotProposals.version));
    return {
      approvedPackets: approvedPackets.map(packet => ({
        id: packet.id,
        version: packet.version,
        packetHash: packet.packetHash,
        sourceAnswerHash: packet.sourceAnswerHash,
        approvedAt: packet.decidedAt,
        payload: parseJson<Record<string, unknown>>(packet.packetPayloadJson, {}),
      })),
      proposals: proposals.map(proposal => ({
        ...proposal,
        programKeys: parseJson<string[]>(proposal.programKeysJson, []),
        requestedPermissions: parseJson<string[]>(proposal.requestedPermissionsJson, []),
        budgetPlan: parseJson<Record<string, unknown>>(proposal.budgetPlanJson, {}),
        measurementPlan: parseJson<Record<string, unknown>>(proposal.measurementPlanJson, {}),
        monitoringPlan: parseJson<Record<string, unknown>>(proposal.monitoringPlanJson, {}),
        rollbackPlan: parseJson<Record<string, unknown>>(proposal.rollbackPlanJson, {}),
        payload: parseJson<Record<string, unknown>>(proposal.proposalPayloadJson, {}),
      })),
      policy: {
        maximumMonthlyMediaCapEgp: CAMPAIGN_PILOT_MAX_MONTHLY_MEDIA_CAP_EGP,
        permittedPrograms: CAMPAIGN_PILOT_PROGRAMS,
      },
    };
  }),

  proposeCampaignPilot: protectedProcedure.input(campaignPilotProposalInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const [strategyPacket] = await db.select().from(marketingMetaAdsStrategyApprovalPackets)
      .where(eq(marketingMetaAdsStrategyApprovalPackets.id, input.strategyPacketId)).limit(1);
    if (!strategyPacket || strategyPacket.status !== "approved") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A Campaign Pilot Proposal requires an explicitly owner-approved Strategy Approval Packet." });
    }
    const [latestApprovedPacket] = await db.select({ id: marketingMetaAdsStrategyApprovalPackets.id })
      .from(marketingMetaAdsStrategyApprovalPackets)
      .where(eq(marketingMetaAdsStrategyApprovalPackets.status, "approved"))
      .orderBy(desc(marketingMetaAdsStrategyApprovalPackets.version)).limit(1);
    if (!latestApprovedPacket || latestApprovedPacket.id !== strategyPacket.id) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Use the latest approved Strategy Approval Packet before proposing a measurement pilot." });
    }
    const activeBrandBook = await getActiveBrandBookForWorkOrder();
    if (!activeBrandBook || activeBrandBook.id !== strategyPacket.brandBookId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The active Brand Book differs from the approved strategy packet. Prepare and approve a new Strategy Approval Packet first." });
    }
    const budgetError = validateCampaignPilotBudgetPlan(input.budgetPlan);
    if (budgetError) throw new TRPCError({ code: "BAD_REQUEST", message: budgetError });
    if (!hasOnlyAllowedCampaignPilotPermissions(input.requestedPermissions)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The proposal includes an unsupported Meta permission identifier. Use only the reviewed permission inventory and revalidate any scope before a future external integration." });
    }
    const fieldsToCheck = [
      input.title,
      ...input.requestedPermissions,
      input.measurementPlan.primaryMetric,
      input.measurementPlan.attributionWindow,
      input.measurementPlan.requiredEvidence,
      input.measurementPlan.successCriteria,
      input.measurementPlan.missingDataLockout,
      input.monitoringPlan.owner,
      input.monitoringPlan.alerts,
      input.rollbackPlan.rollbackOwner,
      input.rollbackPlan.stopConditions,
      input.rollbackPlan.rollbackSteps,
    ];
    for (const value of fieldsToCheck) {
      const disallowed = findDisallowedCampaignPilotData(value);
      if (disallowed) throw new TRPCError({ code: "BAD_REQUEST", message: `Remove ${disallowed} from the Campaign Pilot Proposal. It may not include client or Lead identity data.` });
    }
    const programKeys = Array.from(new Set(input.programKeys)).sort();
    const requestedPermissions = Array.from(new Set(input.requestedPermissions)).sort();
    const now = Date.now();
    const [latest] = await db.select({ version: marketingMetaCampaignPilotProposals.version })
      .from(marketingMetaCampaignPilotProposals).orderBy(desc(marketingMetaCampaignPilotProposals.version)).limit(1);
    const payload = {
      title: normalizeCampaignPilotText(input.title),
      strategyPacket: { id: strategyPacket.id, version: strategyPacket.version, packetHash: strategyPacket.packetHash, sourceAnswerHash: strategyPacket.sourceAnswerHash },
      brandBook: { id: activeBrandBook.id, version: activeBrandBook.version, hash: activeBrandBook.contentHash },
      programs: programKeys,
      requestedPermissions,
      budgetPlan: input.budgetPlan,
      measurementPlan: {
        primaryMetric: normalizeCampaignPilotText(input.measurementPlan.primaryMetric),
        attributionWindow: normalizeCampaignPilotText(input.measurementPlan.attributionWindow),
        requiredEvidence: normalizeCampaignPilotText(input.measurementPlan.requiredEvidence),
        successCriteria: normalizeCampaignPilotText(input.measurementPlan.successCriteria),
        missingDataLockout: normalizeCampaignPilotText(input.measurementPlan.missingDataLockout),
      },
      monitoringPlan: {
        cadence: input.monitoringPlan.cadence,
        owner: normalizeCampaignPilotText(input.monitoringPlan.owner),
        alerts: normalizeCampaignPilotText(input.monitoringPlan.alerts),
      },
      rollbackPlan: {
        stopConditions: normalizeCampaignPilotText(input.rollbackPlan.stopConditions),
        rollbackOwner: normalizeCampaignPilotText(input.rollbackPlan.rollbackOwner),
        rollbackSteps: normalizeCampaignPilotText(input.rollbackPlan.rollbackSteps),
      },
      scope: "Internal proposal only. No Meta login, permission grant, campaign, ad set, ad, budget reservation, spend, payment, CAPI, publishing, message or provider operation is authorized.",
    };
    const proposalPayloadJson = JSON.stringify(payload);
    const proposalHash = crypto.createHash("sha256").update(proposalPayloadJson).digest("hex");
    const result = await db.insert(marketingMetaCampaignPilotProposals).values({
      proposalKey: campaignPilotProposalKey(),
      version: (latest?.version ?? 0) + 1,
      strategyPacketId: strategyPacket.id,
      status: "proposed",
      title: payload.title,
      programKeysJson: JSON.stringify(programKeys),
      requestedPermissionsJson: JSON.stringify(requestedPermissions),
      budgetPlanJson: JSON.stringify(payload.budgetPlan),
      measurementPlanJson: JSON.stringify(payload.measurementPlan),
      monitoringPlanJson: JSON.stringify(payload.monitoringPlan),
      rollbackPlanJson: JSON.stringify(payload.rollbackPlan),
      proposalPayloadJson,
      proposalHash,
      strategyPacketHash: strategyPacket.packetHash,
      ownerNote: null,
      createdByUserId: ctx.user.id,
      proposedAt: now,
      decidedByUserId: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const proposalId = Number((result as { insertId?: number }).insertId);
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_meta_campaign_pilot_proposal", proposalId, JSON.stringify({ strategyPacketId: strategyPacket.id, strategyPacketHash: strategyPacket.packetHash, proposalHash, programKeys, requestedPermissionCount: requestedPermissions.length, proposedCaps: input.budgetPlan, noExecution: true }));
    return { proposalId, proposalHash, status: "proposed" as const };
  }),

  decideCampaignPilot: protectedProcedure.input(campaignPilotDecisionInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const [proposal] = await db.select().from(marketingMetaCampaignPilotProposals)
      .where(eq(marketingMetaCampaignPilotProposals.id, input.proposalId)).limit(1);
    if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign Pilot Proposal not found." });
    if (!(CAMPAIGN_PILOT_PROPOSAL_STATUSES as readonly string[]).includes(proposal.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Campaign Pilot Proposal status is invalid." });
    }
    if (!campaignPilotCanTransition(proposal.status as typeof CAMPAIGN_PILOT_PROPOSAL_STATUSES[number], input.nextStatus)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This Campaign Pilot Proposal cannot make the requested state transition." });
    }
    const [strategyPacket] = await db.select().from(marketingMetaAdsStrategyApprovalPackets)
      .where(eq(marketingMetaAdsStrategyApprovalPackets.id, proposal.strategyPacketId)).limit(1);
    if (!strategyPacket || strategyPacket.status !== "approved" || strategyPacket.packetHash !== proposal.strategyPacketHash) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The linked Strategy Approval Packet is no longer valid for this proposal. Create a fresh proposal from the current approved packet." });
    }
    if (input.nextStatus === "internally_approved") {
      const [latestApprovedPacket] = await db.select({ id: marketingMetaAdsStrategyApprovalPackets.id })
        .from(marketingMetaAdsStrategyApprovalPackets)
        .where(eq(marketingMetaAdsStrategyApprovalPackets.status, "approved"))
        .orderBy(desc(marketingMetaAdsStrategyApprovalPackets.version)).limit(1);
      const activeBrandBook = await getActiveBrandBookForWorkOrder();
      if (!latestApprovedPacket || latestApprovedPacket.id !== strategyPacket.id || !activeBrandBook || activeBrandBook.id !== strategyPacket.brandBookId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The strategy packet or active Brand Book has changed. Create a fresh Campaign Pilot Proposal from the current approved strategy before recording internal approval." });
      }
    }
    const now = Date.now();
    await db.update(marketingMetaCampaignPilotProposals).set({
      status: input.nextStatus,
      ownerNote: input.ownerNote,
      decidedByUserId: ctx.user.id,
      decidedAt: now,
      updatedAt: now,
    }).where(eq(marketingMetaCampaignPilotProposals.id, proposal.id));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_meta_campaign_pilot_proposal", proposal.id, JSON.stringify({ fromStatus: proposal.status, toStatus: input.nextStatus, ownerNoteLength: input.ownerNote.length, noExecution: true, externalAuthorityGranted: false }));
    return { id: proposal.id, status: input.nextStatus, decidedAt: now, noExecution: true };
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
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const [session] = await db.select().from(marketingBrandDiscoverySessions)
      .where(and(eq(marketingBrandDiscoverySessions.status, "in_progress")))
      .orderBy(desc(marketingBrandDiscoverySessions.version)).limit(1);
    if (!session) return null;
    return presentSession(await getSessionWithAnswers(session.id));
  }),

  startOrResumeDiscovery: protectedProcedure.mutation(async ({ ctx }) => {
    await requireMarketingSystemAdministrator(ctx.user);
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
    await requireMarketingSystemAdministrator(ctx.user);
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
    await requireMarketingSystemAdministrator(ctx.user);
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
    await requireMarketingSystemAdministrator(ctx.user);
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
    await requireMarketingSystemAdministrator(ctx.user);
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
    await requireMarketingSystemAdministrator(ctx.user);
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
    await requireMarketingSystemAdministrator(ctx.user);
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

  getProviderConnectionCenter: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_provider_readiness");
    await seedProviderProfiles();
    const db = await requireDb();
    const [profiles, controls, activeBrandBooks, approvedPackets, approvedPilotProposals] = await Promise.all([
      db.select().from(marketingProviderProfiles).orderBy(marketingProviderProfiles.alias),
      db.select().from(marketingAutopilotControls)
        .where(eq(marketingAutopilotControls.requestedMode, MARKETING_AUTOPILOT_MODE)).limit(1),
      db.select({ id: marketingBrandBooks.id }).from(marketingBrandBooks).where(eq(marketingBrandBooks.status, "active")),
      db.select({ id: marketingMetaAdsStrategyApprovalPackets.id }).from(marketingMetaAdsStrategyApprovalPackets)
        .where(eq(marketingMetaAdsStrategyApprovalPackets.status, "approved")),
      db.select({ id: marketingMetaCampaignPilotProposals.id }).from(marketingMetaCampaignPilotProposals)
        .where(eq(marketingMetaCampaignPilotProposals.status, "internally_approved")),
    ]);
    const profileByAlias = new Map(profiles.map(profile => [profile.alias, profile]));
    const connections = MARKETING_PROVIDER_CONNECTIONS.map(connection => {
      const secretState = providerSecretPresence(connection);
      const profile = profileByAlias.get(connection.alias);
      return {
        alias: connection.alias,
        provider: connection.provider,
        connectionKind: connection.connectionKind,
        purpose: connection.purpose,
        creativeCapabilities: "creativeCapabilities" in connection ? connection.creativeCapabilities : [],
        webhookPath: connection.webhookPath,
        configurationState: connection.secretKeys.length === 0 ? "managed_internal" : secretState.allPresent ? "server_secret_present" : "server_secret_missing",
        profileEnabled: profile?.isEnabled ?? false,
        profileKillSwitchEnabled: profile?.killSwitchEnabled ?? true,
        executionBoundary: connection.executionBoundary,
      };
    });
    const control = controls[0] ?? null;
    const autopilot = summarizeMarketingAutopilotLock({
      activeBrandBookCount: activeBrandBooks.length,
      approvedStrategyPacketCount: approvedPackets.length,
      internallyApprovedPilotProposalCount: approvedPilotProposals.length,
      allProviderSecretsPresent: connections.filter(connection => connection.configurationState !== "managed_internal").every(connection => connection.configurationState === "server_secret_present"),
      masterKillSwitchEnabled: control?.masterKillSwitchEnabled ?? true,
    });
    return {
      requestedMode: MARKETING_AUTOPILOT_MODE,
      control: control ? { status: control.status, masterKillSwitchEnabled: control.masterKillSwitchEnabled, updatedAt: control.updatedAt } : null,
      connections,
      autopilot,
      externalOperationsEnabled: false,
      safetyNotice: "This page checks configuration state only. It does not reveal, accept, store, or transmit provider secrets, and it cannot call a provider, create a campaign, publish content, spend money, send CAPI events, or change CRM data.",
    };
  }),

  initializeFullAutopilotLock: protectedProcedure.mutation(async ({ ctx }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const now = Date.now();
    await db.insert(marketingAutopilotControls).values({
      requestedMode: MARKETING_AUTOPILOT_MODE,
      masterKillSwitchEnabled: true,
      status: "configuration_required",
      lastChangedByUserId: ctx.user.id,
      createdAt: now,
      updatedAt: now,
    }).onDuplicateKeyUpdate({ set: {
      masterKillSwitchEnabled: true,
      status: "configuration_required",
      lastChangedByUserId: ctx.user.id,
      updatedAt: now,
    }});
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_full_autopilot_lock", MARKETING_AUTOPILOT_MODE, JSON.stringify({ masterKillSwitchEnabled: true, executionAllowed: false }));
    return { executionAllowed: false, masterKillSwitchEnabled: true };
  }),

  listRoleAssignments: protectedProcedure.query(async ({ ctx }) => {
    await requireMarketingSystemAdministrator(ctx.user);
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

  assignRole: protectedProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["marketing_system_admin", "marketing_manager", "researcher", "creative_producer", "analyst"]) })).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
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
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    await db.update(marketingSystemRoleAssignments).set({ isActive: false, updatedAt: Date.now(), assignedByUserId: ctx.user.id })
      .where(eq(marketingSystemRoleAssignments.userId, input.userId));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_system_role_revocation", input.userId, "Role revoked");
    return { success: true };
  }),

  getKnowledgeLibrary: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_knowledge");
    const db = await requireDb();
    const [sources, internalReferences, ownerConfirmedInternalClaims] = await Promise.all([
      db.select().from(marketingKnowledgeSources)
        .orderBy(marketingKnowledgeSources.programLabel, desc(marketingKnowledgeSources.updatedAt)),
      db.select().from(marketingInternalProgrammeReferences)
        .orderBy(desc(marketingInternalProgrammeReferences.updatedAt)),
      db.select({
        id: marketingOwnerConfirmedInternalClaims.id,
        internalReferenceId: marketingOwnerConfirmedInternalClaims.internalReferenceId,
        programKey: marketingOwnerConfirmedInternalClaims.programKey,
        claimType: marketingOwnerConfirmedInternalClaims.claimType,
        claimText: marketingOwnerConfirmedInternalClaims.claimText,
        sourceDocumentHash: marketingOwnerConfirmedInternalClaims.sourceDocumentHash,
        sourceSection: marketingOwnerConfirmedInternalClaims.sourceSection,
        riskLevel: marketingOwnerConfirmedInternalClaims.riskLevel,
        status: marketingOwnerConfirmedInternalClaims.status,
        ownerConfirmationNote: marketingOwnerConfirmedInternalClaims.ownerConfirmationNote,
        confirmedAt: marketingOwnerConfirmedInternalClaims.confirmedAt,
        updatedAt: marketingOwnerConfirmedInternalClaims.updatedAt,
        sourceTitle: marketingInternalProgrammeReferences.title,
        sourceFileName: marketingInternalProgrammeReferences.sourceFileName,
      }).from(marketingOwnerConfirmedInternalClaims)
        .innerJoin(marketingInternalProgrammeReferences, eq(marketingOwnerConfirmedInternalClaims.internalReferenceId, marketingInternalProgrammeReferences.id))
        .where(and(
          eq(marketingOwnerConfirmedInternalClaims.status, "owner_confirmed"),
          eq(marketingInternalProgrammeReferences.status, "internal_reference_only"),
          eq(marketingOwnerConfirmedInternalClaims.sourceDocumentHash, marketingInternalProgrammeReferences.documentHash),
        ))
        .orderBy(marketingOwnerConfirmedInternalClaims.programKey, desc(marketingOwnerConfirmedInternalClaims.updatedAt)),
    ]);
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
      internalReferences: internalReferences.map(reference => ({
        id: reference.id,
        referenceKey: reference.referenceKey,
        programKeys: parseJson<string[]>(reference.programKeysJson, []),
        title: reference.title,
        sourceFileName: reference.sourceFileName,
        documentUpdatedLabel: reference.documentUpdatedLabel,
        sourceClassification: reference.sourceClassification,
        status: reference.status,
        documentHash: reference.documentHash,
        analysis: parseJson<Record<string, unknown>>(reference.analysisJson, {}),
        createdAt: reference.createdAt,
        updatedAt: reference.updatedAt,
      })),
      ownerConfirmedInternalClaims,
      claims,
      policy: "Official claims require an owner-approved official source with a tracked snapshot. An owner-confirmed internal claim remains separately labelled as internal and may be used only in review-ready planning or content drafts; it is not official evidence, legal advice, automatic publication authority, or a substitute for a later official review. Candidate sources, changed sources, unapproved claims, and all unpublished content remain blocked from publication. The library has no publishing or client-advice action.",
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
    await requireMarketingSystemAdministrator(ctx.user);
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
    await requireMarketingSystemAdministrator(ctx.user);
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
    await requireMarketingSystemAdministrator(ctx.user);
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
    if (order.createdByUserId !== ctx.user.id && !(await isMarketingSystemAdministrator(ctx.user))) throw new TRPCError({ code: "FORBIDDEN", message: "Only the work-order creator or a scoped Agentic Marketing administrator can submit it." });
    if (!workOrderCanTransition(order.status as MarketingWorkOrderStatus, "submitted")) throw new TRPCError({ code: "BAD_REQUEST", message: "Only a draft work order can be submitted for owner review." });
    const now = Date.now();
    await db.update(marketingWorkOrders).set({ status: "submitted", submittedAt: now, updatedAt: now, allowedNextStatesJson: JSON.stringify(["approved", "hold", "rejected", "cancelled"]) }).where(eq(marketingWorkOrders.id, order.id));
    await appendWorkOrderEvent({ workOrderId: order.id, action: "submitted", fromStatus: order.status, toStatus: "submitted", actorUserId: ctx.user.id, createdAt: now, payload: { noProviderRequest: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_work_order_submission", order.id, JSON.stringify({ workOrderKey: order.workOrderKey }));
    return { success: true, status: "submitted" as const };
  }),

  reviewWorkOrder: protectedProcedure.input(workOrderTransitionInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
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
    if (order.createdByUserId !== ctx.user.id && !(await isMarketingSystemAdministrator(ctx.user))) throw new TRPCError({ code: "FORBIDDEN", message: "Only the creator or a scoped Agentic Marketing administrator can cancel this work order." });
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
    const [order, claims, designSystem] = await Promise.all([
      requireApprovedCreativeWorkOrder(input.workOrderId, input.programKey),
      getApprovedContentClaims(input.claimIds, input.programKey),
      requireActiveDesignSystemForCreative(),
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
      englishCopy: input.onScreenEnglishText ? normalizeContentStudioText(input.onScreenEnglishText) : null,
     caption: input.caption ? normalizeContentStudioText(input.caption) : null,
      cta: normalizeContentStudioText(input.cta),
      landingDestination: input.landingDestination ?? null,
      scheduledFor: input.scheduledFor ?? null,
      claimIdsJson: JSON.stringify(Array.from(new Set(input.claimIds)).sort((a, b) => a - b)),
      sourceSnapshotHashesJson: JSON.stringify(claims.map(claim => claim.sourceSnapshotHash)),
      visualBrief: input.visualBrief ? normalizeContentStudioText(input.visualBrief) : null,
      payloadJson: JSON.stringify(input.payload),
      outputSchemaJson: JSON.stringify(contentPacketOutputSchema(input.contentType)),
      previewUrl: null,
      previewHash: null,
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
    await appendContentReviewEvent({ packetId, action: "created", toStatus: "draft", actorUserId: ctx.user.id, createdAt: now, payload: { rootPacketKey, versionNumber: 1, workOrderKey: order.workOrderKey, claimCount: claims.length, designSystemAssetKeys: [designSystem.instructions.assetKey, designSystem.logo.assetKey], noProviderCall: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_content_packet", packetId, JSON.stringify({ rootPacketKey, workOrderId: order.id, contentType: input.contentType, programKey: input.programKey, contentHash, claimCount: claims.length }));
    return { id: packetId, rootPacketKey, versionNumber: 1, status: "draft" as const, contentHash };
  }),

  reviseContentPacket: protectedProcedure.input(contentPacketInput.extend({ previousPacketId: z.number().int().positive(), changeSummary: z.string().trim().min(4).max(4_000) })).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "create_content_packets");
    validateContentPacketText(input);
    const db = await requireDb();
    const [previous, order, claims, designSystem] = await Promise.all([
      db.select().from(marketingContentPackets).where(eq(marketingContentPackets.id, input.previousPacketId)).limit(1).then(rows => rows[0] ?? null),
      requireApprovedCreativeWorkOrder(input.workOrderId, input.programKey),
      getApprovedContentClaims(input.claimIds, input.programKey),
      requireActiveDesignSystemForCreative(),
    ]);
    if (!previous) throw new TRPCError({ code: "NOT_FOUND", message: "The content packet to revise was not found." });
    if (previous.createdByUserId !== ctx.user.id && !(await isMarketingSystemAdministrator(ctx.user))) throw new TRPCError({ code: "FORBIDDEN", message: "Only the packet creator or a scoped Agentic Marketing administrator can create a revision." });
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
      englishCopy: input.onScreenEnglishText ? normalizeContentStudioText(input.onScreenEnglishText) : null,
     caption: input.caption ? normalizeContentStudioText(input.caption) : null,
      cta: normalizeContentStudioText(input.cta),
      landingDestination: input.landingDestination ?? null,
      scheduledFor: input.scheduledFor ?? null,
      claimIdsJson: JSON.stringify(Array.from(new Set(input.claimIds)).sort((a, b) => a - b)),
      sourceSnapshotHashesJson: JSON.stringify(claims.map(claim => claim.sourceSnapshotHash)),
      visualBrief: input.visualBrief ? normalizeContentStudioText(input.visualBrief) : null,
      payloadJson: JSON.stringify(input.payload),
      outputSchemaJson: JSON.stringify(contentPacketOutputSchema(input.contentType)),
      previewUrl: null,
      previewHash: null,
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
    await appendContentReviewEvent({ packetId, action: "revision_created", toStatus: "draft", feedback: input.changeSummary, actorUserId: ctx.user.id, createdAt: now, payload: { previousPacketId: previous.id, rootPacketKey: previous.rootPacketKey, versionNumber, designSystemAssetKeys: [designSystem.instructions.assetKey, designSystem.logo.assetKey], noProviderCall: true } });
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_content_packet_revision", packetId, JSON.stringify({ rootPacketKey: previous.rootPacketKey, versionNumber, previousPacketId: previous.id, contentHash }));
    return { id: packetId, rootPacketKey: previous.rootPacketKey, versionNumber, status: "draft" as const, contentHash };
  }),

  submitContentPacketForReview: protectedProcedure.input(z.object({ packetId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "create_content_packets");
    const db = await requireDb();
    const [packet] = await db.select().from(marketingContentPackets).where(eq(marketingContentPackets.id, input.packetId)).limit(1);
    if (!packet) throw new TRPCError({ code: "NOT_FOUND", message: "Content packet was not found." });
    if (packet.createdByUserId !== ctx.user.id && !(await isMarketingSystemAdministrator(ctx.user))) throw new TRPCError({ code: "FORBIDDEN", message: "Only the packet creator or a scoped Agentic Marketing administrator can submit it for review." });
    if (!contentCanTransition(packet.status as MarketingContentStatus, "in_review")) throw new TRPCError({ code: "BAD_REQUEST", message: "Only a draft packet can be submitted for review." });
    validateStoredContentPacketLanguage(packet);
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
    await requireSystemGeneratedContentMedia(packet);
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
    await requireSystemGeneratedContentMedia(packet);
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
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const [packet] = await db.select().from(marketingContentPackets).where(eq(marketingContentPackets.id, input.packetId)).limit(1);
    if (!packet) throw new TRPCError({ code: "NOT_FOUND", message: "Content packet was not found." });
    if (!contentCanTransition(packet.status as MarketingContentStatus, "approved")) throw new TRPCError({ code: "BAD_REQUEST", message: "Only an Approval Ready packet can receive Mahmoud's explicit decision." });
    const previewProblem = validatePreviewFingerprint(packet.previewUrl, packet.previewHash);
    if (previewProblem) throw new TRPCError({ code: "BAD_REQUEST", message: previewProblem });
    await requireSystemGeneratedContentMedia(packet);
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
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const ids = Array.from(new Set(input.packetIds));
    const packets = await db.select().from(marketingContentPackets).where(inArray(marketingContentPackets.id, ids));
    if (packets.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more approval packet IDs were not found." });
    if (packets.some(packet => packet.status !== "approval_ready")) throw new TRPCError({ code: "BAD_REQUEST", message: "Every batch item must be fully QA-passed and Approval Ready." });
    if (packets.some(packet => packet.exceptionalClaim)) throw new TRPCError({ code: "BAD_REQUEST", message: "Packets marked with exceptional claims require an individual owner decision and cannot use batch approval." });
    for (const packet of packets) {
      const previewProblem = validatePreviewFingerprint(packet.previewUrl, packet.previewHash);
      if (previewProblem) throw new TRPCError({ code: "BAD_REQUEST", message: `Packet ${packet.id}: ${previewProblem}` });
      await requireSystemGeneratedContentMedia(packet);
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
    await requireMarketingSystemAdministrator(ctx.user);
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
    if (packet.createdByUserId !== ctx.user.id && !(await isMarketingSystemAdministrator(ctx.user)) && (await getEffectiveRole(ctx.user)) !== "marketing_manager") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the packet creator, a Marketing Manager, or a scoped Agentic Marketing administrator can stop this packet." });
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

  getPilotReadinessExecutiveDashboard: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_analytics");
    return getPilotReadinessExecutiveData();
  }),

  getWeeklyResultsWorkspace: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_weekly_results");
    const db = await requireDb();
    const [settingsRows, plans, preferences, performance, designAssets, automation] = await Promise.all([
      db.select().from(marketingWeeklyResultsSettings).where(eq(marketingWeeklyResultsSettings.settingsKey, "primary-weekly-results")).limit(1),
      db.select().from(marketingWeeklyResultsPlans).orderBy(desc(marketingWeeklyResultsPlans.periodStart), desc(marketingWeeklyResultsPlans.version)).limit(60),
      db.select().from(marketingWeeklyResultsPreferenceMemories).where(eq(marketingWeeklyResultsPreferenceMemories.status, "active")).orderBy(desc(marketingWeeklyResultsPreferenceMemories.updatedAt)).limit(80),
      db.select().from(marketingWeeklyResultsPerformanceSnapshots).orderBy(desc(marketingWeeklyResultsPerformanceSnapshots.periodStart), desc(marketingWeeklyResultsPerformanceSnapshots.recordedAt)).limit(80),
      db.select().from(marketingDesignSystemAssets).where(eq(marketingDesignSystemAssets.isActive, true)).orderBy(desc(marketingDesignSystemAssets.updatedAt)).limit(20),
      getWeeklyAutomationReadiness(),
    ]);
    const planIds = plans.map(plan => plan.id);
    const items = planIds.length === 0 ? [] : await db.select().from(marketingWeeklyResultsItems)
      .where(inArray(marketingWeeklyResultsItems.planId, planIds)).orderBy(marketingWeeklyResultsItems.planId, marketingWeeklyResultsItems.position);
    const itemIds = items.map(item => item.id);
    const events = itemIds.length === 0 ? [] : await db.select().from(marketingWeeklyResultsItemEvents)
      .where(inArray(marketingWeeklyResultsItemEvents.itemId, itemIds)).orderBy(desc(marketingWeeklyResultsItemEvents.createdAt));
    const releaseGovernance = evaluateSocialReleaseGovernance(items.map(item => ({
      id: item.id,
      isSelected: item.isSelected,
      status: item.status,
      previewHash: item.previewHash,
      approvedAt: item.approvedAt,
      events: events.filter(event => event.itemId === item.id).map(event => ({
        action: event.action,
        createdAt: event.createdAt,
        payload: parseJson<Record<string, unknown>>(event.payloadJson, {}),
      })),
    })));
    return {
      settings: parseWeeklyResultsSettings(settingsRows[0]),
      plans: plans.map(plan => ({
        ...plan,
        setupSnapshot: parseJson<Record<string, unknown>>(plan.setupSnapshotJson, {}),
        previousWeekPerformance: parseJson<Record<string, unknown>>(plan.previousWeekPerformanceJson, {}),
        preferenceMemory: parseJson<Array<Record<string, unknown>>>(plan.preferenceMemoryJson, []),
        items: items.filter(item => item.planId === plan.id).map(item => ({
          ...item,
          hashtags: parseJson<string[]>(item.hashtagsJson, []),
          sourceClaimIds: parseJson<number[]>(item.sourceClaimIdsJson, []),
          metadata: parseJson<Record<string, unknown>>(item.metadataJson, {}),
          events: events.filter(event => event.itemId === item.id).map(event => ({ ...event, changedFields: parseJson<string[]>(event.changedFieldsJson, []), payload: parseJson<Record<string, unknown>>(event.payloadJson, {}) })),
        })),
      })),
      preferences, performance: performance.map(snapshot => ({ ...snapshot, spendEgp: Number(snapshot.spendEgp) })),
      designSystem: designAssets.map(asset => ({
        id: asset.id, assetKey: asset.assetKey, assetType: asset.assetType, title: asset.title, originalFileName: asset.originalFileName,
        mimeType: asset.mimeType, fileUrl: asset.fileUrl, sha256Digest: asset.sha256Digest, extractionStatus: asset.extractionStatus,
        extraction: parseJson<Record<string, unknown>>(asset.extractionJson, {}), createdAt: asset.createdAt, updatedAt: asset.updatedAt,
      })),
      policy: WEEKLY_RESULTS_EXECUTION_BOUNDARY,
      socialReleaseGovernance: {
        ...releaseGovernance,
        publicationEnabled: false,
        explanation: "The 90% indicator is a trailing 30-day governance eligibility signal only. It never bypasses individual final-preview approval, resolved feedback, an explicit per-channel owner release, or separately validated Meta publishing credentials and permissions.",
      },
      automation,
      boundedProviderAutomationEnabled: Boolean(automation.control.isEnabled),
      externalOperationsEnabled: false,
      scheduler: { kind: "crm_background_schedule", configuredFor: "Administrator-selected weekday and time, Africa/Cairo", state: automation.control.state, explanation: "When enabled, the bounded engine requests an internal OpenAI strategy, an Anthropic challenge, and one Manus structured production task. It creates review-ready plans only; publishing, campaign changes, spend, CAPI and client/Lead actions remain disabled." },
    };
  }),

  enableWeeklyAutomation: protectedProcedure.input(weeklyAutomationControlInput).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "manage_weekly_automation");
    const sessionToken = ctx.req.cookies?.[COOKIE_NAME] ?? "";
    if (!sessionToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in again before enabling the weekly automation schedule." });
    let result = await enableWeeklyAutomation({ actorUserId: ctx.user.id, ...input });
    try {
      if (result.control.scheduleTaskUid) {
        await updateHeartbeatJob(result.control.scheduleTaskUid, { enable: true }, sessionToken);
      } else {
        // The authenticated scheduler invokes the CRM hourly; Cairo weekday/time is
        // evaluated inside the handler so Settings changes and daylight saving changes
        // never require a brittle cron migration.
        const job = await createHeartbeatJob({ name: "elevay-weekly-multi-model-marketing", cron: "0 0 * * * *", path: "/api/scheduled/weeklyMarketingAutomation", description: "ELEVAY weekly AI planning trigger. The CRM runs provider work only at the owner-configured Cairo weekday/time, then creates review-ready material only." }, sessionToken);
        await markAutomationScheduleTask(job.taskUid);
      }
      result = await getWeeklyAutomationReadiness();
    } catch (error) {
      await pauseWeeklyAutomation({ actorUserId: ctx.user.id, reason: "Scheduler provisioning did not complete; weekly automation remains paused." });
      throw error;
    }
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_weekly_automation", "primary-weekly-multi-model", JSON.stringify({ action: "enabled", monthlyBudgetUsd: input.monthlyBudgetUsd, perRunReserveUsd: input.perRunReserveUsd, publicationEnabled: false, campaignOperationsEnabled: false, spendingEnabled: false }));
    return result;
  }),

  pauseWeeklyAutomation: protectedProcedure.input(z.object({ reason: z.string().trim().min(4).max(500) })).mutation(async ({ ctx, input }) => {
    await requireCapability(ctx.user, "manage_weekly_automation");
    const before = await getWeeklyAutomationReadiness();
    const sessionToken = ctx.req.cookies?.[COOKIE_NAME] ?? "";
    if (before.control.scheduleTaskUid && sessionToken) await updateHeartbeatJob(before.control.scheduleTaskUid, { enable: false }, sessionToken).catch(() => undefined);
    const result = await pauseWeeklyAutomation({ actorUserId: ctx.user.id, reason: input.reason });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_weekly_automation", "primary-weekly-multi-model", JSON.stringify({ action: "paused", reason: input.reason, publicationEnabled: false, campaignOperationsEnabled: false, spendingEnabled: false }));
    return result;
  }),

  runWeeklyAutomationTest: protectedProcedure.mutation(async ({ ctx }) => {
    await requireCapability(ctx.user, "run_weekly_automation_test");
    const result = await startWeeklyAutomationCycle({ triggerType: "manual_test", actorUserId: ctx.user.id });
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_weekly_automation_job", "manual_test", JSON.stringify({ result: result.reused ? "reused_existing_period_job" : "started", publicationEnabled: false, campaignOperationsEnabled: false, spendingEnabled: false }));
    return result;
  }),

  uploadDesignSystemAsset: protectedProcedure.input(designSystemAssetInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const bytes = Buffer.from(input.fileBase64, "base64");
    if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Design System files must be between 1 byte and 10 MB." });
    const isLogo = input.assetType === "logo";
    if (isLogo && !["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "The official logo must be PNG, JPEG, WebP, or SVG." });
    if (!isLogo && !["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown", "text/plain"].includes(input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "Design instructions must be PDF, DOCX, Markdown, or plain text." });
    const extension = input.fileName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin";
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    const assetKey = `design-${input.assetType}-${crypto.randomUUID()}`;
    const storageKey = `marketing/design-system/${input.assetType}/${assetKey}.${extension}`;
    const uploaded = await storagePut(storageKey, bytes, input.mimeType);
    let extractionStatus = isLogo ? "not_applicable" : "review_required";
    let extractedText: string | null = null;
    let extraction: Record<string, unknown> = { model: null, summary: null, mandatoryRules: [], prohibitedRules: [], visualDirection: [] };
    if (!isLogo) {
      try {
        extractedText = await extractDesignSystemText(bytes, input.mimeType, input.fileName);
        const unsafe = extractedText ? findDisallowedWeeklyResultsData(extractedText) : null;
        if (unsafe) {
          extraction = { ...extraction, status: "blocked_for_privacy_review", reason: unsafe };
          extractionStatus = "review_required";
        } else if (extractedText) {
          const summary = await summarizeDesignSystemInstructions(extractedText);
          extraction = { model: "gpt-5-mini", ...summary, sourceTextSha256: crypto.createHash("sha256").update(extractedText).digest("hex") };
          extractionStatus = "extracted_review_required";
        }
      } catch {
        extraction = { ...extraction, status: "extraction_failed_review_required" };
      }
    }
    const db = await requireDb();
    const now = Date.now();
    await db.transaction(async tx => {
      await tx.update(marketingDesignSystemAssets).set({ isActive: false, updatedAt: now }).where(and(eq(marketingDesignSystemAssets.assetType, input.assetType), eq(marketingDesignSystemAssets.isActive, true)));
      await tx.insert(marketingDesignSystemAssets).values({ assetKey, assetType: input.assetType, title: normalizeWeeklyResultsText(input.title), originalFileName: input.fileName, mimeType: input.mimeType, storageKey, fileUrl: uploaded.url, sha256Digest: digest, extractionStatus, extractedText, extractionJson: JSON.stringify(extraction), isActive: true, uploadedByUserId: ctx.user.id, createdAt: now, updatedAt: now, archivedAt: null });
    });
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_design_system_asset", assetKey, JSON.stringify({ assetType: input.assetType, sha256: digest, bytes: bytes.length, extractionStatus, model: isLogo ? null : "gpt-5-mini", externalOperationsEnabled: false }));
    return { assetKey, assetType: input.assetType, extractionStatus, extraction, externalOperationsEnabled: false };
  }),

  archiveDesignSystemAsset: protectedProcedure.input(z.object({ assetId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const now = Date.now();
    const [asset] = await db.select().from(marketingDesignSystemAssets).where(eq(marketingDesignSystemAssets.id, input.assetId)).limit(1);
    if (!asset || asset.archivedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Active Design System asset not found." });
    await db.update(marketingDesignSystemAssets).set({ isActive: false, archivedAt: now, updatedAt: now }).where(eq(marketingDesignSystemAssets.id, asset.id));
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_design_system_asset", asset.assetKey, JSON.stringify({ action: "archived", assetType: asset.assetType, externalOperationsEnabled: false }));
    return { success: true, externalOperationsEnabled: false };
  }),

  saveWeeklyResultsSetup: protectedProcedure.input(weeklyResultsSettingsInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const textFields = [input.weeklyGoal, input.updatedSourcesNote, input.creativeDirection, input.allocationRules.rotationNote, input.allocationRules.platformNote, ...input.programPriorities.flatMap(priority => [priority.key, priority.note])];
    for (const value of textFields) {
      if (!value) continue;
      const unsafe = findDisallowedWeeklyResultsData(value);
      if (unsafe) throw new TRPCError({ code: "BAD_REQUEST", message: `Setup cannot include ${unsafe}. Use programme-level instructions only.` });
    }
    const db = await requireDb();
    const now = Date.now();
    const values = {
      prepareDayOfWeek: input.prepareDayOfWeek, prepareStartTime: input.prepareStartTime, deliveryDeadlineTime: input.deliveryDeadlineTime, preparationScheduleEnabled: input.preparationScheduleEnabled, scheduleState: "waiting_execution_release",
      weeklyGoal: input.weeklyGoal ? normalizeWeeklyResultsText(input.weeklyGoal) : null, programPrioritiesJson: JSON.stringify(input.programPriorities), updatedSourcesNote: input.updatedSourcesNote ? normalizeWeeklyResultsText(input.updatedSourcesNote) : null,
      creativeDirection: input.creativeDirection ? normalizeWeeklyResultsText(input.creativeDirection) : null, contentMixJson: JSON.stringify(input.contentMix), allocationRulesJson: JSON.stringify(input.allocationRules), learningEnabled: input.learningEnabled,
      targetLikes30d: input.targetLikes30d, targetViews30d: input.targetViews30d, targetLeads30d: input.targetLeads30d, targetQualifiedLeads30d: input.targetQualifiedLeads30d, targetSignedClients30d: input.targetSignedClients30d,
      targetCostPerLeadEgp: input.targetCostPerLeadEgp.toFixed(2), targetMaxAdSpend30dEgp: input.targetMaxAdSpend30dEgp.toFixed(2), requestedAutopublishThreshold: input.requestedAutopublishThreshold,
      lastScheduleStatus: "waiting_execution_release", lastChangedByUserId: ctx.user.id, updatedAt: now,
    };
    await db.insert(marketingWeeklyResultsSettings).values({ settingsKey: "primary-weekly-results", timezone: "Africa/Cairo", ...values, lastScheduleAttemptAt: null, createdAt: now }).onDuplicateKeyUpdate({ set: values });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_weekly_results_setup", "primary-weekly-results", JSON.stringify({ timezone: "Africa/Cairo", prepareDayOfWeek: input.prepareDayOfWeek, prepareStartTime: input.prepareStartTime, deliveryDeadlineTime: input.deliveryDeadlineTime, requestedAutopublishThreshold: input.requestedAutopublishThreshold, executionAllowed: false }));
    return { success: true, scheduleState: "waiting_execution_release" as const, externalOperationsEnabled: false };
  }),

  createWeeklyResultsPlan: protectedProcedure.input(createWeeklyResultsPlanInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    if (!isSaturdayDate(input.periodStart)) throw new TRPCError({ code: "BAD_REQUEST", message: "The planned week must start on a Saturday in YYYY-MM-DD form." });
    const unsafeTitle = findDisallowedWeeklyResultsData(input.title);
    if (unsafeTitle) throw new TRPCError({ code: "BAD_REQUEST", message: `Plan title cannot include ${unsafeTitle}.` });
    const normalizedItems = await Promise.all(input.items.map(async sourceItem => {
      const item = normalizeWeeklyResultsItem(sourceItem);
      if (!item.previewUrl) return item;
      try { return { ...item, previewHash: (await fingerprintMarketingPreview(item.previewUrl)).sha256 }; }
      catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Each supplied preview must be a reachable public HTTPS image or video. The CRM verifies its fingerprint automatically." }); }
    }));
    const db = await requireDb();
    const [settingsRows, latest, preferences, performance, designAssets] = await Promise.all([
      db.select().from(marketingWeeklyResultsSettings).where(eq(marketingWeeklyResultsSettings.settingsKey, "primary-weekly-results")).limit(1),
      db.select({ version: marketingWeeklyResultsPlans.version }).from(marketingWeeklyResultsPlans).where(eq(marketingWeeklyResultsPlans.periodStart, input.periodStart)).orderBy(desc(marketingWeeklyResultsPlans.version)).limit(1),
      db.select().from(marketingWeeklyResultsPreferenceMemories).where(eq(marketingWeeklyResultsPreferenceMemories.status, "active")).orderBy(desc(marketingWeeklyResultsPreferenceMemories.updatedAt)).limit(80),
      db.select().from(marketingWeeklyResultsPerformanceSnapshots).orderBy(desc(marketingWeeklyResultsPerformanceSnapshots.periodStart), desc(marketingWeeklyResultsPerformanceSnapshots.recordedAt)).limit(8),
      db.select().from(marketingDesignSystemAssets).where(eq(marketingDesignSystemAssets.isActive, true)).orderBy(desc(marketingDesignSystemAssets.updatedAt)).limit(20),
    ]);
    const setup = { ...parseWeeklyResultsSettings(settingsRows[0]), designSystem: designAssets.map(asset => ({ assetKey: asset.assetKey, assetType: asset.assetType, sha256Digest: asset.sha256Digest, extractionStatus: asset.extractionStatus })) };
    const version = (latest[0]?.version ?? 0) + 1;
    const now = Date.now();
    const preferencesSnapshot = preferences.map(preference => ({ scope: preference.scope, scopeKey: preference.scopeKey, preferenceText: preference.preferenceText, updatedAt: preference.updatedAt }));
    const performanceSnapshot = performance.map(snapshot => ({ periodStart: snapshot.periodStart, spendEgp: Number(snapshot.spendEgp), impressions: snapshot.impressions, clicks: snapshot.clicks, leadForms: snapshot.leadForms, qualifiedLeads: snapshot.qualifiedLeads, clientStageLeads: snapshot.clientStageLeads, notes: snapshot.notes }));
    const planKey = weeklyResultsPlanKey();
    const planHash = weeklyResultsPlanHash({ periodStart: input.periodStart, title: normalizeWeeklyResultsText(input.title), setup, performance: performanceSnapshot, preferences: preferencesSnapshot, items: normalizedItems });
    const result = await db.insert(marketingWeeklyResultsPlans).values({
      planKey, periodStart: input.periodStart, version, status: "draft_prepared", source: "manual_internal", title: normalizeWeeklyResultsText(input.title), weeklyGoal: setup.weeklyGoal, creativeDirection: setup.creativeDirection,
      setupSnapshotJson: JSON.stringify(setup), previousWeekPerformanceJson: JSON.stringify(performanceSnapshot), preferenceMemoryJson: JSON.stringify(preferencesSnapshot), planHash,
      preparedByUserId: ctx.user.id, preparedAt: now, deliveryDeadlineAt: null, createdAt: now, updatedAt: now,
    });
    const planId = Number((result as { insertId?: number }).insertId);
    for (let index = 0; index < normalizedItems.length; index += 1) {
      const item = normalizedItems[index]!;
      const itemResult = await db.insert(marketingWeeklyResultsItems).values({
        planId, position: index + 1, ...item, requiresIndividualApproval: true, status: "draft", blockedReason: null, contentPacketId: null,
        approvedByUserId: null, approvedAt: null, stoppedByUserId: null, stoppedAt: null, createdByUserId: ctx.user.id, lastEditedByUserId: ctx.user.id, createdAt: now, updatedAt: now,
      });
      const itemId = Number((itemResult as { insertId?: number }).insertId);
      await appendWeeklyResultsItemEvent({ itemId, action: "created", toStatus: "draft", changedFields: ["initial_plan_item"], payload: { planKey, position: index + 1, noProviderCall: true, requiresIndividualApproval: true }, actorUserId: ctx.user.id, createdAt: now });
    }
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_weekly_results_plan", planId, JSON.stringify({ planKey, periodStart: input.periodStart, version, itemCount: normalizedItems.length, planHash, externalOperationsEnabled: false }));
    return { success: true, planId, planKey, version, status: "draft_prepared" as const, externalOperationsEnabled: false };
  }),

  updateWeeklyResultsItem: protectedProcedure.input(updateWeeklyResultsItemInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const [existing] = await db.select().from(marketingWeeklyResultsItems).where(eq(marketingWeeklyResultsItems.id, input.itemId)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Weekly Results item not found." });
    if (["approved", "stopped", "superseded"].includes(existing.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Approved, stopped, or superseded items cannot be edited. Create a new plan item instead." });
    const normalized = normalizeWeeklyResultsItem(input);
    // Editing other copy fields must not discard the server-verified preview.
    let previewHash = normalized.previewUrl === existing.previewUrl ? existing.previewHash : null;
    if (normalized.previewUrl && normalized.previewUrl !== existing.previewUrl) {
      try { previewHash = (await fingerprintMarketingPreview(normalized.previewUrl)).sha256; }
      catch { throw new TRPCError({ code: "BAD_REQUEST", message: "The new preview must be a reachable public HTTPS image or video. The CRM verifies its fingerprint automatically." }); }
    }
    const item = { ...normalized, previewHash };
    const now = Date.now();
    const nextStatus: WeeklyResultsItemStatus = "draft";
    await db.update(marketingWeeklyResultsItems).set({ ...item, status: nextStatus, blockedReason: null, lastEditedByUserId: ctx.user.id, updatedAt: now }).where(eq(marketingWeeklyResultsItems.id, existing.id));
    await appendWeeklyResultsItemEvent({ itemId: existing.id, action: "edited", fromStatus: existing.status, toStatus: nextStatus, changedFields: ["content", "preview", "claims", "selection"], payload: { noProviderCall: true, requiresResubmission: true }, actorUserId: ctx.user.id, createdAt: now });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_weekly_results_item", existing.id, JSON.stringify({ planId: existing.planId, fromStatus: existing.status, toStatus: nextStatus, externalOperationsEnabled: false }));
    return { success: true, status: nextStatus, externalOperationsEnabled: false };
  }),

  submitWeeklyResultsItemForIndividualReview: protectedProcedure.input(z.object({ itemId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const db = await requireDb();
    const [item] = await db.select().from(marketingWeeklyResultsItems).where(eq(marketingWeeklyResultsItems.id, input.itemId)).limit(1);
    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Weekly Results item not found." });
    if (!item.isSelected) throw new TRPCError({ code: "BAD_REQUEST", message: "Select this item before sending it for individual review." });
    if (!weeklyResultsItemCanTransition(item.status as WeeklyResultsItemStatus, "pending_individual_review")) throw new TRPCError({ code: "BAD_REQUEST", message: "Only a draft item can enter individual review." });
    if (!item.programKey) throw new TRPCError({ code: "BAD_REQUEST", message: "A programme key is required before an item can be reviewed." });
    validateWeeklyResultsItemLanguage(item);
    await getApprovedContentClaims(parseJson<number[]>(item.sourceClaimIdsJson, []), item.programKey);
    const now = Date.now();
    await db.update(marketingWeeklyResultsItems).set({ status: "pending_individual_review", blockedReason: null, lastEditedByUserId: ctx.user.id, updatedAt: now }).where(eq(marketingWeeklyResultsItems.id, item.id));
    await appendWeeklyResultsItemEvent({ itemId: item.id, action: "submitted_for_individual_review", fromStatus: item.status, toStatus: "pending_individual_review", payload: { initialCopyAndPlanReview: true, previewReady: Boolean(item.previewUrl && item.previewHash), sourceClaimCount: parseJson<number[]>(item.sourceClaimIdsJson, []).length, batchApprovalAvailable: false, noPublishCommand: true }, actorUserId: ctx.user.id, createdAt: now });
    return { success: true, status: "pending_individual_review" as const, externalOperationsEnabled: false };
  }),

  decideWeeklyResultsItem: protectedProcedure.input(weeklyResultsItemDecisionInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const unsafe = findDisallowedWeeklyResultsData(input.note);
    if (unsafe) throw new TRPCError({ code: "BAD_REQUEST", message: `Decision notes cannot include ${unsafe}.` });
    const db = await requireDb();
    const [item] = await db.select().from(marketingWeeklyResultsItems).where(eq(marketingWeeklyResultsItems.id, input.itemId)).limit(1);
    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Weekly Results item not found." });
    if (item.status !== "pending_individual_review") throw new TRPCError({ code: "BAD_REQUEST", message: "Each decision requires this single item to be pending individual review." });
    const nextByDecision = { send_back: "changes_requested", approve: "approved", reject: "rejected", stop: "stopped" } as const;
    const nextStatus = nextByDecision[input.decision];
    if (!weeklyResultsItemCanTransition(item.status as WeeklyResultsItemStatus, nextStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "This individual decision is not valid for the current item state." });
    if (input.decision === "approve") {
      const previewProblem = validatePreviewFingerprint(item.previewUrl, item.previewHash);
      if (previewProblem) throw new TRPCError({ code: "BAD_REQUEST", message: previewProblem });
      await requireSystemGeneratedWeeklyMedia(item);
      if (!item.programKey) throw new TRPCError({ code: "BAD_REQUEST", message: "An approved item must have a programme key." });
      await getApprovedContentClaims(parseJson<number[]>(item.sourceClaimIdsJson, []), item.programKey);
    }
    const now = Date.now();
    await db.update(marketingWeeklyResultsItems).set({
      status: nextStatus, blockedReason: input.decision === "approve" ? null : normalizeWeeklyResultsText(input.note), lastEditedByUserId: ctx.user.id,
      approvedByUserId: input.decision === "approve" ? ctx.user.id : null, approvedAt: input.decision === "approve" ? now : null,
      stoppedByUserId: input.decision === "stop" ? ctx.user.id : null, stoppedAt: input.decision === "stop" ? now : null, updatedAt: now,
    }).where(eq(marketingWeeklyResultsItems.id, item.id));
    await appendWeeklyResultsItemEvent({ itemId: item.id, action: `individual_${input.decision}`, fromStatus: item.status, toStatus: nextStatus, feedback: normalizeWeeklyResultsText(input.note), payload: { explicitIndividualDecision: true, feedbackCategory: input.feedbackCategory ?? null, finalPreviewApproved: input.decision === "approve", feedbackResolved: input.decision === "approve", previewHash: input.decision === "approve" ? item.previewHash : null, noBatchRule: true, noPublishCommand: true, externalOperationsEnabled: false }, actorUserId: ctx.user.id, createdAt: now });
    if (["send_back", "reject"].includes(input.decision)) {
      await db.insert(marketingWeeklyResultsPreferenceMemories).values({ scope: "weekly_results", scopeKey: item.programKey, preferenceText: normalizeWeeklyResultsText(input.note), sourceItemId: item.id, sourceEventId: null, status: "active", createdByUserId: ctx.user.id, createdAt: now, updatedAt: now });
    }
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_weekly_results_item_decision", item.id, JSON.stringify({ planId: item.planId, decision: input.decision, fromStatus: item.status, toStatus: nextStatus, individualOnly: true, externalOperationsEnabled: false }));
    return { success: true, status: nextStatus, externalOperationsEnabled: false };
  }),

  composeApprovedReelNarrationForReview: protectedProcedure.input(composeApprovedReelInput).mutation(async ({ ctx, input }) => {
    if (!isOwner(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the CRM owner can approve source assets for review-only reel narration composition." });
    const db = await requireDb();
    const [item] = await db.select().from(marketingWeeklyResultsItems).where(eq(marketingWeeklyResultsItems.id, input.itemId)).limit(1);
    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Weekly Results item not found." });
    if (item.itemType !== "reel" || !item.isSelected || item.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only a selected draft reel can be composed for its next final-preview review." });
    validateWeeklyResultsItemLanguage(item);
    if (item.previewUrl !== input.sourceVideo.url) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected source video must exactly match the reel's current verified preview." });
    let verifiedSource: { sha256: string; mimeType: string; bytes: number };
    let verifiedNarration: { sha256: string; mimeType: string; bytes: number };
    try {
      verifiedSource = await fingerprintMarketingAsset(input.sourceVideo.url, ["video/"]);
      verifiedNarration = await fingerprintMarketingAsset(input.narration.url, ["audio/"]);
    } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "The selected video or Arabic narration could not be verified automatically. Use reachable public HTTPS media files." }); }
    if (item.previewHash?.toLowerCase() !== verifiedSource.sha256) throw new TRPCError({ code: "BAD_REQUEST", message: "The source reel has changed since its verified preview. Attach it again so the CRM can verify the current file automatically." });
    input.sourceVideo.sha256 = verifiedSource.sha256;
    input.sourceVideo.mimeType = verifiedSource.mimeType;
    input.narration.sha256 = verifiedNarration.sha256;
    input.narration.mimeType = verifiedNarration.mimeType;
    const now = Date.now();
    const approvalKey = (assetType: string, hash: string) => `reel-input:${item.id}:${assetType}:${hash}`;
    const recordApproval = async (assetType: "source_video" | "arabic_narration", asset: z.infer<typeof approvedReelInputAsset>) => {
      await db.update(marketingReelCompositionInputApprovals).set({ status: "superseded", supersededAt: now, updatedAt: now })
        .where(and(eq(marketingReelCompositionInputApprovals.weeklyItemId, item.id), eq(marketingReelCompositionInputApprovals.assetType, assetType), eq(marketingReelCompositionInputApprovals.status, "approved")));
      await db.insert(marketingReelCompositionInputApprovals).values({
        approvalKey: approvalKey(assetType, asset.sha256), weeklyItemId: item.id, assetType, assetUrl: asset.url, assetSha256: asset.sha256, mimeType: asset.mimeType,
        status: "approved", approvedByUserId: ctx.user.id, approvedAt: now, supersededAt: null, createdAt: now, updatedAt: now,
      }).onDuplicateKeyUpdate({ set: { assetUrl: asset.url, mimeType: asset.mimeType, status: "approved", approvedByUserId: ctx.user.id, approvedAt: now, supersededAt: null, updatedAt: now } });
      const [record] = await db.select().from(marketingReelCompositionInputApprovals).where(eq(marketingReelCompositionInputApprovals.approvalKey, approvalKey(assetType, asset.sha256))).limit(1);
      if (!record) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Approved composition input could not be recorded." });
      return record;
    };
    const sourceApproval = await recordApproval("source_video", input.sourceVideo);
    const narrationApproval = await recordApproval("arabic_narration", input.narration);
    const compositionKey = `reel-compose:${item.id}:${sourceApproval.id}:${narrationApproval.id}`;
    const [existing] = await db.select().from(marketingReelCompositions).where(eq(marketingReelCompositions.compositionKey, compositionKey)).limit(1);
    if (existing?.status === "review_ready") return { compositionId: existing.id, status: "review_ready" as const, previewUrl: existing.outputUrl, externalOperationsEnabled: false };
    const creation = existing ?? (await db.insert(marketingReelCompositions).values({
      compositionKey, weeklyItemId: item.id, status: "running", sourceVideoApprovalId: sourceApproval.id, narrationApprovalId: narrationApproval.id,
      sourceDurationMs: 0, sourceWidth: 0, sourceHeight: 0, narrationDurationMs: 0, outputStorageKey: null, outputUrl: null, outputSha256: null, outputBytes: null,
      outputDurationMs: null, outputVideoCodec: null, outputAudioCodec: null,
      inputManifestJson: JSON.stringify({ sourceApprovalId: sourceApproval.id, narrationApprovalId: narrationApproval.id, externalActions: false }), errorSummary: null,
      requestedByUserId: ctx.user.id, createdAt: now, completedAt: null, updatedAt: now,
    }));
    const compositionId = existing?.id ?? Number((creation as { insertId?: number }).insertId);
    try {
      const result = await composeApprovedReelForReview({ weeklyItemId: item.id, sourceVideo: input.sourceVideo, narration: input.narration });
      await db.transaction(async tx => {
        await tx.update(marketingReelCompositions).set({ status: "review_ready", sourceDurationMs: result.sourceProbe.durationMs, sourceWidth: result.sourceProbe.width!, sourceHeight: result.sourceProbe.height!, narrationDurationMs: result.narrationProbe.durationMs, outputStorageKey: result.outputStorageKey, outputUrl: result.outputUrl, outputSha256: result.outputSha256, outputBytes: result.outputBytes, outputDurationMs: result.outputProbe.durationMs, outputVideoCodec: result.outputProbe.videoCodec, outputAudioCodec: result.outputProbe.audioCodec, inputManifestJson: JSON.stringify(result.inputManifest), errorSummary: null, completedAt: Date.now(), updatedAt: Date.now() }).where(eq(marketingReelCompositions.id, compositionId));
        await tx.update(marketingGeneratedMediaAssets).set({ status: "superseded", supersededAt: Date.now(), updatedAt: Date.now() }).where(and(eq(marketingGeneratedMediaAssets.weeklyItemId, item.id), eq(marketingGeneratedMediaAssets.status, "review_ready"), isNull(marketingGeneratedMediaAssets.supersededAt)));
        await tx.insert(marketingGeneratedMediaAssets).values({
          assetKey: `system-media:reel:${item.id}:${result.outputSha256}`,
          weeklyItemId: item.id,
          contentPacketId: null,
          assetType: "reel",
          providerAlias: "elevay-review-only-compositor",
          origin: "system_generated",
          generationTaskId: null,
          status: "review_ready",
          storageKey: result.outputStorageKey,
          assetUrl: result.outputUrl,
          assetSha256: result.outputSha256,
          mimeType: "video/mp4",
          metadataJson: JSON.stringify({ compositionId, inputManifest: result.inputManifest, reviewOnly: true }),
          supersededAt: null,
          generatedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }).onDuplicateKeyUpdate({ set: { status: "review_ready", supersededAt: null, updatedAt: Date.now() } });
        await tx.update(marketingWeeklyResultsItems).set({ previewUrl: result.outputUrl, previewHash: result.outputSha256, status: "draft", blockedReason: null, lastEditedByUserId: ctx.user.id, updatedAt: Date.now() }).where(eq(marketingWeeklyResultsItems.id, item.id));
      });
      await appendWeeklyResultsItemEvent({ itemId: item.id, action: "reel_narration_composed_for_review", fromStatus: item.status, toStatus: "draft", changedFields: ["preview"], payload: { compositionId, sourceApprovalId: sourceApproval.id, narrationApprovalId: narrationApproval.id, outputHash: result.outputSha256, reviewOnly: true, noPublishCommand: true, externalOperationsEnabled: false }, actorUserId: ctx.user.id, createdAt: Date.now() });
      await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_reel_composition", compositionId, JSON.stringify({ weeklyItemId: item.id, sourceApprovalId: sourceApproval.id, narrationApprovalId: narrationApproval.id, reviewOnly: true, externalOperationsEnabled: false }));
      return { compositionId, status: "review_ready" as const, previewUrl: result.outputUrl, previewHash: result.outputSha256, externalOperationsEnabled: false };
    } catch {
      await db.update(marketingReelCompositions).set({ status: "failed", errorSummary: "review_only_composition_failed", completedAt: Date.now(), updatedAt: Date.now() }).where(eq(marketingReelCompositions.id, compositionId));
      throw new TRPCError({ code: "BAD_REQUEST", message: "The approved video and narration could not be composed for review. Their media streams, dimensions, duration, and fingerprints must be valid." });
    }
  }),

  saveWeeklyResultsPerformance: protectedProcedure.input(weeklyResultsPerformanceInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    if (!isSaturdayDate(input.periodStart)) throw new TRPCError({ code: "BAD_REQUEST", message: "Performance snapshots must use the Saturday that starts the measured week." });
    const unsafe = input.notes ? findDisallowedWeeklyResultsData(input.notes) : null;
    if (unsafe) throw new TRPCError({ code: "BAD_REQUEST", message: `Performance notes cannot include ${unsafe}. Keep them aggregate only.` });
    const db = await requireDb();
    const now = Date.now();
    const values = { spendEgp: input.spendEgp.toFixed(2), impressions: input.impressions, clicks: input.clicks, leadForms: input.leadForms, qualifiedLeads: input.qualifiedLeads, clientStageLeads: input.clientStageLeads, notes: input.notes ? normalizeWeeklyResultsText(input.notes) : null, recordedByUserId: ctx.user.id, recordedAt: now, updatedAt: now };
    await db.insert(marketingWeeklyResultsPerformanceSnapshots).values({ periodStart: input.periodStart, source: "manual_aggregate", ...values }).onDuplicateKeyUpdate({ set: values });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_weekly_results_performance", input.periodStart, JSON.stringify({ source: "manual_aggregate", externalOperationsEnabled: false }));
    return { success: true, externalOperationsEnabled: false };
  }),

  listWeeklyExecutiveBriefs: protectedProcedure.query(async ({ ctx }) => {
    await requireCapability(ctx.user, "view_analytics");
    const db = await requireDb();
    const briefs = await db.select().from(marketingWeeklyExecutiveBriefs)
      .orderBy(desc(marketingWeeklyExecutiveBriefs.periodStart), desc(marketingWeeklyExecutiveBriefs.version));
    const events = briefs.length === 0 ? [] : await db.select().from(marketingWeeklyExecutiveBriefEvents)
      .where(inArray(marketingWeeklyExecutiveBriefEvents.briefId, briefs.map(brief => brief.id)))
      .orderBy(desc(marketingWeeklyExecutiveBriefEvents.createdAt));
    return {
      briefs: briefs.map(brief => ({
        id: brief.id,
        briefKey: brief.briefKey,
        periodStart: brief.periodStart,
        version: brief.version,
        status: brief.status,
        snapshotHash: brief.snapshotHash,
        contextNote: brief.contextNote,
        decision: brief.decision,
        decisionNote: brief.decisionNote,
        capturedAt: brief.capturedAt,
        decidedAt: brief.decidedAt,
        stoppedAt: brief.stoppedAt,
        snapshot: parseJson<Record<string, unknown>>(brief.snapshotJson, {}),
        events: events.filter(event => event.briefId === brief.id).map(event => ({
          action: event.action,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          decision: event.decision,
          note: event.note,
          payload: parseJson<Record<string, unknown>>(event.payloadJson, {}),
          createdAt: event.createdAt,
        })),
      })),
      policy: "Weekly Executive Briefs are aggregate-only internal snapshots and decisions. They cannot send messages, schedule a task, connect Meta, create or alter campaigns, spend, publish, call a provider, send CAPI, or change CRM data.",
    };
  }),

  captureWeeklyExecutiveBrief: protectedProcedure.input(weeklyExecutiveBriefCaptureInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    if (!isMondayPeriodStart(input.periodStart)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The weekly period must start on a Monday and use YYYY-MM-DD." });
    }
    const contextNote = input.contextNote ? normalizeWeeklyExecutiveBriefText(input.contextNote) : null;
    const unsafe = contextNote ? findDisallowedWeeklyExecutiveBriefData(contextNote) : null;
    if (unsafe) throw new TRPCError({ code: "BAD_REQUEST", message: `Context notes cannot include ${unsafe}. Use aggregate evidence only.` });
    const db = await requireDb();
    const [latest] = await db.select({ version: marketingWeeklyExecutiveBriefs.version }).from(marketingWeeklyExecutiveBriefs)
      .where(eq(marketingWeeklyExecutiveBriefs.periodStart, input.periodStart))
      .orderBy(desc(marketingWeeklyExecutiveBriefs.version)).limit(1);
    const version = (latest?.version ?? 0) + 1;
    const snapshot = await getPilotReadinessExecutiveData();
    const snapshotJson = JSON.stringify({ ...snapshot, capturedForPeriodStart: input.periodStart, externalOperationsEnabled: false });
    const snapshotHash = crypto.createHash("sha256").update(snapshotJson).digest("hex");
    const now = Date.now();
    const result = await db.insert(marketingWeeklyExecutiveBriefs).values({
      briefKey: weeklyExecutiveBriefKey(input.periodStart, version),
      periodStart: input.periodStart,
      version,
      status: "captured",
      snapshotJson,
      snapshotHash,
      contextNote,
      decision: null,
      decisionNote: null,
      capturedByUserId: ctx.user.id,
      capturedAt: now,
      decidedByUserId: null,
      decidedAt: null,
      stoppedByUserId: null,
      stoppedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const briefId = Number((result as { insertId?: number }).insertId);
    await db.insert(marketingWeeklyExecutiveBriefEvents).values({
      briefId,
      action: "captured",
      fromStatus: null,
      toStatus: "captured",
      decision: null,
      note: contextNote,
      payloadJson: JSON.stringify({ snapshotHash, readinessStatus: snapshot.readiness.status, externalOperationsEnabled: false }),
      actorUserId: ctx.user.id,
      createdAt: now,
    });
    await writeAuditLog(auditCtxFromTrpc(ctx), "create", "marketing_weekly_executive_brief", briefId, JSON.stringify({ periodStart: input.periodStart, version, snapshotHash, readinessStatus: snapshot.readiness.status }));
    return { success: true, briefId, snapshotHash, status: "captured" as const, externalOperationsEnabled: false };
  }),

  decideWeeklyExecutiveBrief: protectedProcedure.input(weeklyExecutiveBriefDecisionInput).mutation(async ({ ctx, input }) => {
    await requireMarketingSystemAdministrator(ctx.user);
    const note = normalizeWeeklyExecutiveBriefText(input.note);
    const unsafe = findDisallowedWeeklyExecutiveBriefData(note);
    if (unsafe) throw new TRPCError({ code: "BAD_REQUEST", message: `Decision notes cannot include ${unsafe}. Use aggregate evidence only.` });
    const db = await requireDb();
    const [brief] = await db.select().from(marketingWeeklyExecutiveBriefs)
      .where(eq(marketingWeeklyExecutiveBriefs.id, input.briefId)).limit(1);
    if (!brief) throw new TRPCError({ code: "NOT_FOUND", message: "Weekly Executive Brief not found." });
    const nextStatus = statusForWeeklyExecutiveBriefDecision(input.decision);
    if (!weeklyExecutiveBriefCanTransition(brief.status as WeeklyExecutiveBriefStatus, nextStatus)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This Executive Brief is already terminal or cannot take that decision." });
    }
    const now = Date.now();
    await db.update(marketingWeeklyExecutiveBriefs).set({
      status: nextStatus,
      decision: input.decision,
      decisionNote: note,
      decidedByUserId: ctx.user.id,
      decidedAt: now,
      stoppedByUserId: nextStatus === "stopped" ? ctx.user.id : brief.stoppedByUserId,
      stoppedAt: nextStatus === "stopped" ? now : brief.stoppedAt,
      updatedAt: now,
    }).where(eq(marketingWeeklyExecutiveBriefs.id, brief.id));
    await db.insert(marketingWeeklyExecutiveBriefEvents).values({
      briefId: brief.id,
      action: input.decision,
      fromStatus: brief.status,
      toStatus: nextStatus,
      decision: input.decision,
      note,
      payloadJson: JSON.stringify({ snapshotHash: brief.snapshotHash, explicitOwnerDecision: true, externalOperationsEnabled: false }),
      actorUserId: ctx.user.id,
      createdAt: now,
    });
    await writeAuditLog(auditCtxFromTrpc(ctx), "update", "marketing_weekly_executive_brief_decision", brief.id, JSON.stringify({ briefKey: brief.briefKey, fromStatus: brief.status, toStatus: nextStatus, decision: input.decision, snapshotHash: brief.snapshotHash }));
    return { success: true, status: nextStatus, externalOperationsEnabled: false };
  }),
});
