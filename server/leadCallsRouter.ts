import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, publicProcedure } from "./_core/trpc";
import {
  leadCallAgentSettings,
  leadCallPolicies,
  users,
} from "../drizzle/schema";
import {
  authorizeCallLead,
  callUserProjection,
  isCallPolicyOwner,
  requireCallActor,
  requireCallAdmin,
  requireCallGrant,
} from "./leadCallsAccess";
import {
  getLeadCallsConfig,
  getLeadCallsReadiness,
  normalizeLeadCallPhone,
} from "./leadCallsConfig";
import {
  getCallPolicy,
  listLeadCalls,
  prepareLeadCall,
  requireCallsDb,
  writeCallAudit,
} from "./leadCallsDb";
import {
  canListenToCalls,
  cancelLeadCall,
  getAuthorizedCall,
  mintCallVoiceToken,
  refreshCallVoiceToken,
  toLeadCallDto,
} from "./leadCallsService";
import { callDataIsRetained } from "../shared/leadCalls";

const signedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const callActor = await requireCallActor(ctx.req);
  ctx.res.setHeader("Cache-Control", "private, no-store");
  return next({ ctx: { ...ctx, callActor } });
});
export function assertCallMutationOrigin(
  origin: string | undefined,
  approvedOrigins: string | string[]
) {
  const approved =
    typeof approvedOrigins === "string" ? [approvedOrigins] : approvedOrigins;
  if (!origin || !approved.includes(origin))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Trusted HTTPS calling origin required",
    });
}
const mutationProcedure = signedProcedure.use(({ ctx, next }) => {
  assertCallMutationOrigin(
    ctx.req.get("origin"),
    getLeadCallsConfig().browserOrigins
  );
  ctx.res.setHeader("Cache-Control", "no-store");
  return next();
});
const id = z.number().int().positive();
const settingsInput = z
  .object({
    userId: id,
    canCall: z.boolean(),
    canListen: z.boolean(),
    callerId: z.string().max(32).nullable(),
    maxCallsPerHour: z.number().int().min(1).max(60),
  })
  .strict();
export const callPolicyInput = z
  .object({
    policyVersion: z.string().trim().min(1).max(100),
    confirmed: z.boolean(),
    enabled: z.boolean().default(false),
    callingApproved: z.boolean().default(false),
    processingApproved: z.boolean().default(false),
    mediaProtectionConfirmed: z.boolean().default(false),
    recordingNoticeAr: z.string().trim().min(10).max(2000),
    recordingNoticeEn: z.string().trim().min(10).max(2000),
    retentionDays: z.number().int().min(1).max(365).default(90),
  })
  .strict();
export const leadCallsRouter = router({
  readiness: signedProcedure
    .input(z.object({ leadId: id.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const config = getLeadCallsConfig();
      const canManage = isCallPolicyOwner(ctx.callActor);
      try {
        const db = await requireCallsDb(),
          policy = await getCallPolicy(db),
          readiness = getLeadCallsReadiness(config, policy);
        let canCall = false,
          validPhone: boolean | null = null;
        let hasCallGrant = false;
        try {
          await requireCallGrant(db, ctx.callActor, "canCall");
          canCall = true;
          hasCallGrant = true;
        } catch {
          readiness.reasons.push("agent_calling_permission_required");
        }
        if (input?.leadId) {
          try {
            const lead = await authorizeCallLead(
              db,
              ctx.callActor,
              input.leadId,
              true
            );
            validPhone =
              !!normalizeLeadCallPhone(lead.phone) && !lead.optOutSignal;
          } catch {
            canCall = false;
            readiness.reasons.push("lead_calling_access_denied");
          }
        }
        return {
          ...readiness,
          hasCallGrant,
          canCall: canCall && readiness.ready && validPhone !== false,
          canManage,
          validPhone,
          approvedCallerIds:
            ctx.callActor.role === "admin" ? config.approvedCallerIds : [],
        };
      } catch {
        return {
          enabled: config.enabled,
          processingEnabled: false,
          ready: false,
          hasCallGrant: false,
          canCall: false,
          canManage,
          reasons: ["calling_database_or_schema_unavailable"],
          validPhone: null,
          approvedCallerIds: [],
        };
      }
    }),
  prepare: mutationProcedure
    .input(z.object({ leadId: id }).strict())
    .mutation(async ({ ctx, input }) =>
      prepareLeadCall(
        await requireCallsDb(),
        ctx.callActor,
        input.leadId,
        getLeadCallsConfig()
      )
    ),
  token: mutationProcedure
    .input(
      z
        .object({
          callId: id,
          intentToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        })
        .strict()
    )
    .mutation(async ({ ctx, input }) =>
      mintCallVoiceToken(
        await requireCallsDb(),
        ctx.callActor,
        input.callId,
        input.intentToken,
        getLeadCallsConfig()
      )
    ),
  refreshToken: mutationProcedure
    .input(z.object({ callId: id }).strict())
    .mutation(async ({ ctx, input }) =>
      refreshCallVoiceToken(
        await requireCallsDb(),
        ctx.callActor,
        input.callId,
        getLeadCallsConfig()
      )
    ),
  list: signedProcedure
    .input(z.object({ leadId: id }).strict())
    .query(async ({ ctx, input }) => {
      const db = await requireCallsDb();
      await authorizeCallLead(db, ctx.callActor, input.leadId);
      const canListen = await canListenToCalls(db, ctx.callActor);
      return (await listLeadCalls(db, input.leadId))
        .filter(row => callDataIsRetained(row))
        .map(row => toLeadCallDto(row, canListen));
    }),
  get: signedProcedure
    .input(z.object({ callId: id }).strict())
    .query(async ({ ctx, input }) => {
      const db = await requireCallsDb();
      return toLeadCallDto(
        await getAuthorizedCall(db, ctx.callActor, input.callId),
        await canListenToCalls(db, ctx.callActor)
      );
    }),
  cancel: mutationProcedure
    .input(z.object({ callId: id }).strict())
    .mutation(async ({ ctx, input }) =>
      cancelLeadCall(
        await requireCallsDb(),
        ctx.callActor,
        input.callId,
        getLeadCallsConfig()
      )
    ),
  agentSettings: signedProcedure.query(async ({ ctx }) => {
    requireCallAdmin(ctx.callActor);
    const db = await requireCallsDb();
    const agents = await db.select(callUserProjection).from(users);
    const settings = await db.select().from(leadCallAgentSettings);
    return agents.map(agent => {
      const setting = settings.find(row => row.userId === agent.id);
      return {
        userId: agent.id,
        name: agent.name,
        canCall: setting?.canCall ?? false,
        canListen: setting?.canListen ?? false,
        callerId: setting?.callerId ?? null,
        maxCallsPerHour: setting?.maxCallsPerHour ?? 10,
      };
    });
  }),
  setAgentSettings: mutationProcedure
    .input(settingsInput)
    .mutation(async ({ ctx, input }) => {
      requireCallAdmin(ctx.callActor);
      const config = getLeadCallsConfig();
      if (input.callerId && !config.approvedCallerIds.includes(input.callerId))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Caller ID is not in the server-approved allowlist",
        });
      const db = await requireCallsDb();
      const [agent] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!agent)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent unavailable",
        });
      await db.transaction(async tx => {
        await tx
          .insert(leadCallAgentSettings)
          .values({
            ...input,
            updatedBy: ctx.callActor.id,
            updatedAt: Date.now(),
          })
          .onDuplicateKeyUpdate({
            set: {
              ...input,
              updatedBy: ctx.callActor.id,
              updatedAt: Date.now(),
            },
          });
        await writeCallAudit(
          tx,
          ctx.callActor.id,
          "permissions_updated",
          input.userId
        );
      });
      return { success: true as const };
    }),
  policy: signedProcedure.query(async ({ ctx }) => {
    if (!isCallPolicyOwner(ctx.callActor))
      throw new TRPCError({ code: "FORBIDDEN" });
    return getCallPolicy(await requireCallsDb());
  }),
  confirmPolicy: mutationProcedure
    .input(callPolicyInput)
    .mutation(async ({ ctx, input }) => {
      if (!isCallPolicyOwner(ctx.callActor))
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the configured owner can confirm legal and spending policy",
        });
      const { confirmed, ...fields } = input;
      const values = {
        ...fields,
        enabled: confirmed && fields.enabled,
        callingApproved: confirmed && fields.callingApproved,
        processingApproved: confirmed && fields.processingApproved,
        mediaProtectionConfirmed: confirmed && fields.mediaProtectionConfirmed,
        consentRequired: true,
        updatedBy: ctx.callActor.id,
        updatedAt: Date.now(),
      };
      const db = await requireCallsDb();
      await db.transaction(async tx => {
        await tx
          .insert(leadCallPolicies)
          .values({ policyKey: "default", ...values })
          .onDuplicateKeyUpdate({ set: values });
        await writeCallAudit(
          tx,
          ctx.callActor.id,
          "policy_updated",
          ctx.callActor.id
        );
      });
      return { success: true as const };
    }),
});
