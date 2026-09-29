import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  marketingBrandBooks,
  marketingBrandDiscoveryAnswers,
  marketingBrandDiscoverySessions,
  marketingKnowledgeClaims,
  marketingKnowledgeSources,
  marketingProviderProfiles,
  marketingSystemRoleAssignments,
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
    questions: BRAND_DISCOVERY_QUESTIONS,
    answers: record.answers.map(answer => ({
      ...answer,
      interpretedFields: parseJson<Record<string, unknown>>(answer.interpretedJson, {}),
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
