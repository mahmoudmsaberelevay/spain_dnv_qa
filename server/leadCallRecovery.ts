import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { parse } from "cookie";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "../shared/const";
import { leadCallPolicies } from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { isCallPolicyOwner, requireCallActor } from "./leadCallsAccess";
import { getLeadCallsConfig } from "./leadCallsConfig";
import {
  assertProcessingApproved,
  azureTranscriptionUrl,
  readCallProcessingConfig,
} from "./leadCallProcessingProviders";

export const CALL_RECOVERY_PATH = "/api/scheduled/lead-calls";
export const CALL_RECOVERY_CRON = "0 * * * * *";

const ownerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const actor = await requireCallActor(ctx.req);
  const config = getLeadCallsConfig();
  if (!isCallPolicyOwner(actor))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the CRM owner can manage call processing recovery",
    });
  if (
    ctx.req.method !== "GET" &&
    !config.browserOrigins.includes(ctx.req.headers.origin ?? "")
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Use the approved live CRM origin",
    });
  return next({ ctx: { ...ctx, callActor: actor } });
});

export const leadCallRecoveryRouter = router({
  status: ownerProcedure.query(async () => {
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Calling database unavailable",
      });
    const [policy] = await db
      .select()
      .from(leadCallPolicies)
      .where(eq(leadCallPolicies.policyKey, "default"))
      .limit(1);
    return {
      configured: !!policy?.scheduleCronTaskUid,
      enabled: !!policy?.scheduleEnabled,
      cadenceSeconds: 60,
    };
  }),
  enable: ownerProcedure
    .input(z.object({ approveRecovery: z.literal(true) }))
    .mutation(async ({ ctx }) => {
      const config = getLeadCallsConfig();
      const processing = readCallProcessingConfig();
      try {
        assertProcessingApproved(processing);
        azureTranscriptionUrl(processing.azureEndpoint);
        if (
          !processing.azureKey ||
          !processing.openAiApiKey ||
          !processing.summaryModel ||
          !config.enabled ||
          !config.processingEnabled
        )
          throw new Error("not-ready");
      } catch {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Configure and approve calling, Azure transcription and AI processing first",
        });
      }
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Calling database unavailable",
        });
      const session = parse(ctx.req.headers.cookie ?? "")[COOKIE_NAME];
      if (!session)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "A signed CRM session is required",
        });
      try {
        return await db.transaction(async tx => {
          const [policy] = await tx
            .select()
            .from(leadCallPolicies)
            .where(eq(leadCallPolicies.policyKey, "default"))
            .limit(1)
            .for("update");
          if (
            !policy?.enabled ||
            !policy.callingApproved ||
            !policy.processingApproved ||
            !policy.mediaProtectionConfirmed
          )
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "Approve the recording and processing policy first",
            });
          if (policy.scheduleEnabled && policy.scheduleCronTaskUid)
            return { success: true, alreadyEnabled: true };
          const job = policy.scheduleCronTaskUid
            ? (await updateHeartbeatJob(
                policy.scheduleCronTaskUid,
                {
                  enable: true,
                  cron: CALL_RECOVERY_CRON,
                  path: CALL_RECOVERY_PATH,
                },
                session
              ),
              { taskUid: policy.scheduleCronTaskUid })
            : await createHeartbeatJob(
                {
                  name: "elevay-lead-call-processing-recovery",
                  cron: CALL_RECOVERY_CRON,
                  path: CALL_RECOVERY_PATH,
                  description:
                    "Recover approved CRM call transcription jobs and enforce approved call-data retention. No calls or customer messages are initiated.",
                },
                session
              );
          if (
            typeof job.taskUid !== "string" ||
            !job.taskUid ||
            job.taskUid.length > 255
          )
            throw new Error("scheduler-response");
          await tx
            .update(leadCallPolicies)
            .set({
              scheduleCronTaskUid: job.taskUid,
              scheduleEnabled: true,
              scheduleUpdatedAt: Date.now(),
              updatedBy: ctx.callActor.id,
              updatedAt: Date.now(),
            })
            .where(eq(leadCallPolicies.id, policy.id));
          return { success: true, alreadyEnabled: false };
        });
      } catch (error) {
        if (error instanceof TRPCError && error.code === "PRECONDITION_FAILED")
          throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Call recovery setup failed. No calling credentials were changed.",
        });
      }
    }),
  pause: ownerProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Calling database unavailable",
      });
    const session = parse(ctx.req.headers.cookie ?? "")[COOKIE_NAME];
    if (!session)
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "A signed CRM session is required",
      });
    try {
      return await db.transaction(async tx => {
        const [policy] = await tx
          .select()
          .from(leadCallPolicies)
          .where(eq(leadCallPolicies.policyKey, "default"))
          .limit(1)
          .for("update");
        if (!policy) return { success: true };
        // Disable the persisted guard first in this transaction; any stale platform trigger is harmless.
        if (policy.scheduleCronTaskUid)
          await updateHeartbeatJob(
            policy.scheduleCronTaskUid,
            { enable: false },
            session
          );
        await tx
          .update(leadCallPolicies)
          .set({
            scheduleEnabled: false,
            scheduleUpdatedAt: Date.now(),
            updatedBy: ctx.callActor.id,
            updatedAt: Date.now(),
          })
          .where(eq(leadCallPolicies.id, policy.id));
        return { success: true };
      });
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Call recovery pause failed; retry from Calling settings",
      });
    }
  }),
});

export type RecoveryIdentity = { isCron?: boolean; taskUid?: string };
export type CallRecoveryDependencies = {
  authenticate: (req: Request) => Promise<RecoveryIdentity>;
  policyEnabled: (taskUid: string) => Promise<boolean>;
  run: (signal: AbortSignal) => Promise<unknown>;
};
export function createLeadCallRecoveryHandler(deps: CallRecoveryDependencies) {
  return async (req: Request, res: Response) => {
    let actor: RecoveryIdentity;
    try {
      actor = await deps.authenticate(req);
    } catch {
      return res.status(401).json({ error: "authentication-required" });
    }
    if (!actor.isCron || !actor.taskUid)
      return res.status(403).json({ error: "cron-only" });
    try {
      if (!(await deps.policyEnabled(actor.taskUid)))
        return res.json({ ok: true, skipped: "inactive-or-orphan" });
      // Ignore request body IDs: business ownership comes only from the verified scheduler identity.
      const result = await deps.run(AbortSignal.timeout(105_000));
      return res.json({ ok: true, result });
    } catch {
      return res
        .status(500)
        .json({
          error: "CALL_RECOVERY_FAILED",
          timestamp: new Date().toISOString(),
        });
    }
  };
}

export const leadCallRecoveryHandler = createLeadCallRecoveryHandler({
  authenticate: req => sdk.authenticateRequest(req),
  policyEnabled: async taskUid => {
    const db = await getDb();
    if (!db) throw new Error("database-unavailable");
    const [policy] = await db
      .select({ id: leadCallPolicies.id })
      .from(leadCallPolicies)
      .where(
        and(
          eq(leadCallPolicies.scheduleCronTaskUid, taskUid),
          eq(leadCallPolicies.scheduleEnabled, true)
        )
      )
      .limit(1);
    return !!policy;
  },
  run: async signal => {
    const { runLeadCallProcessingRecovery } = await import(
      "./leadCallProcessingWorker"
    );
    return runLeadCallProcessingRecovery({ limit: 1, signal });
  },
});
