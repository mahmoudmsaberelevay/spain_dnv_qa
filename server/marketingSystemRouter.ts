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
