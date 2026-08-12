import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createCouncilCase,
  getCouncilCaseWorkspace,
  listCouncilCases,
  updateCouncilCase,
  type CouncilCaseStatus,
} from "./aiCouncilDb";
import { auditCtxFromTrpc, writeAuditLog } from "./auditLog";
import { getUserModuleAccess, isOwner } from "./permissionsRouter";
import { protectedProcedure, router } from "./_core/trpc";
import { finalizeCouncilDecision, startCouncilReviews, syncManusCouncilOpinion } from "./aiCouncilService";

async function getCouncilAccess(ctx: { user: { id: number; openId: string | null; email?: string | null } }) {
  if (isOwner(ctx.user)) return "full" as const;
  return (await getUserModuleAccess(ctx.user.id)).aiCouncil;
}

async function requireCouncilView(ctx: { user: { id: number; openId: string | null; email?: string | null } }) {
  const access = await getCouncilAccess(ctx);
  if (access === "none") throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to the Administrative AI Council." });
  return access;
}

async function requireCouncilFullAccess(ctx: { user: { id: number; openId: string | null; email?: string | null } }) {
  const access = await requireCouncilView(ctx);
  if (access !== "full") throw new TRPCError({ code: "FORBIDDEN", message: "You have view-only access to the Administrative AI Council." });
}

const councilCaseInput = z.object({
  title: z.string().trim().min(3).max(255),
  brief: z.string().trim().min(20).max(50_000),
  language: z.enum(["en", "ar", "both"]).default("en"),
  financialAssumptions: z.string().trim().max(20_000).optional(),
});

export const aiCouncilRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requireCouncilView(ctx);
    return listCouncilCases();
  }),

  workspace: protectedProcedure
    .input(z.object({ councilCaseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireCouncilView(ctx);
      const workspace = await getCouncilCaseWorkspace(input.councilCaseId);
      if (!workspace) throw new TRPCError({ code: "NOT_FOUND", message: "Council case not found." });
      return workspace;
    }),

  create: protectedProcedure
    .input(councilCaseInput)
    .mutation(async ({ ctx, input }) => {
      await requireCouncilFullAccess(ctx);
      const councilCase = await createCouncilCase({
        ...input,
        financialAssumptions: input.financialAssumptions || null,
        createdByUserId: ctx.user.id,
      });
      await writeAuditLog(auditCtxFromTrpc(ctx), "create", "ai_council_case", councilCase?.id, "Created Administrative AI Council case.");
      return councilCase;
    }),

  updateDraft: protectedProcedure
    .input(councilCaseInput.partial().extend({ councilCaseId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireCouncilFullAccess(ctx);
      const { councilCaseId, ...updates } = input;
      const workspace = await getCouncilCaseWorkspace(councilCaseId);
      if (!workspace) throw new TRPCError({ code: "NOT_FOUND", message: "Council case not found." });
      if (workspace.councilCase.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft council cases can be edited." });
      }
      const councilCase = await updateCouncilCase(councilCaseId, {
        ...(updates.title ? { title: updates.title.trim() } : {}),
        ...(updates.brief ? { brief: updates.brief.trim() } : {}),
        ...(updates.language ? { language: updates.language } : {}),
        ...(updates.financialAssumptions !== undefined ? { financialAssumptions: updates.financialAssumptions.trim() || null } : {}),
      });
      await writeAuditLog(auditCtxFromTrpc(ctx), "update", "ai_council_case", councilCaseId, "Updated Administrative AI Council draft.");
      return councilCase;
    }),

  status: protectedProcedure
    .input(z.object({ councilCaseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireCouncilView(ctx);
      const workspace = await getCouncilCaseWorkspace(input.councilCaseId);
      if (!workspace) throw new TRPCError({ code: "NOT_FOUND", message: "Council case not found." });
      return {
        status: workspace.councilCase.status as CouncilCaseStatus,
        opinionCount: workspace.opinions.length,
        hasDecision: Boolean(workspace.decision),
      };
    }),

  startReviews: protectedProcedure
    .input(z.object({ councilCaseId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireCouncilFullAccess(ctx);
      const workspace = await startCouncilReviews(input.councilCaseId);
      await writeAuditLog(auditCtxFromTrpc(ctx), "update", "ai_council_case", input.councilCaseId, "Started connected provider reviews.");
      return workspace;
    }),

  syncManus: protectedProcedure
    .input(z.object({ councilCaseId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireCouncilFullAccess(ctx);
      const workspace = await syncManusCouncilOpinion(input.councilCaseId);
      await writeAuditLog(auditCtxFromTrpc(ctx), "sync", "ai_council_case", input.councilCaseId, "Synced Manus council task status.");
      return workspace;
    }),

  finalizeDecision: protectedProcedure
    .input(z.object({ councilCaseId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireCouncilFullAccess(ctx);
      const decision = await finalizeCouncilDecision(input.councilCaseId, ctx.user.id);
      await writeAuditLog(auditCtxFromTrpc(ctx), "create", "ai_council_decision", input.councilCaseId, "Chairperson finalized the council decision.");
      return decision;
    }),
});
