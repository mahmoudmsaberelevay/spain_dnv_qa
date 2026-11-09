import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLogs,
  leadActivities,
  leadCallAgentSettings,
  leadCallPolicies,
  leadCallRecords,
  users,
  type LeadCallRecord,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  authorizeCallLead,
  callUserProjection,
  requireCallGrant,
  type CallActor,
  type CallsDb,
} from "./leadCallsAccess";
import {
  CALL_INTENT_TTL_MS,
  getLeadCallsReadiness,
  normalizeLeadCallPhone,
  type LeadCallsConfig,
} from "./leadCallsConfig";
import {
  isTerminalCallStatus,
  normalizeProviderCallStatus,
  shouldApplyCallStatus,
} from "../shared/leadCalls";

export async function writeCallAudit(
  db: CallsDb | any,
  actorId: number,
  event:
    | "prepared"
    | "canceled"
    | "policy_updated"
    | "permissions_updated"
    | "recording_played"
    | "consent_accepted"
    | "consent_declined",
  resourceId: number
) {
  await db
    .insert(auditLogs)
    .values({
      userId: actorId,
      action:
        event === "recording_played"
          ? "view"
          : event === "prepared"
            ? "create"
            : "update",
      resource: "lead_calls",
      resourceId: String(resourceId),
      details: event,
      createdAt: Date.now(),
    });
}
export async function requireCallsDb(): Promise<CallsDb> {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Calling database unavailable",
    });
  return db;
}
export async function getCallPolicy(db: CallsDb | any) {
  const [policy] = await db
    .select()
    .from(leadCallPolicies)
    .where(eq(leadCallPolicies.policyKey, "default"))
    .limit(1);
  return policy ?? null;
}
export const hashCallIntent = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function matchesCallIntent(
  row: Pick<
    LeadCallRecord,
    "intentHash" | "intentExpiresAt" | "intentConsumedAt"
  >,
  token: string,
  now = Date.now()
) {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    row.intentConsumedAt !== null ||
    row.intentExpiresAt <= now
  )
    return false;
  const expected = Buffer.from(row.intentHash, "hex"),
    actual = Buffer.from(hashCallIntent(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function updateCallActivity(
  db: CallsDb | any,
  row: LeadCallRecord
) {
  // Sensitive phone/provider/recording/transcript data lives ONLY behind independently signed calls endpoints.
  await db
    .update(leadActivities)
    .set({
      description: `Outbound Call — ${row.status}\nAgent: ${row.agentName}\nDuration: ${row.durationSeconds}s\nTranscription: ${row.transcriptionStatus}`,
    })
    .where(
      and(
        eq(leadActivities.id, row.activityId),
        eq(leadActivities.leadId, row.leadId),
        eq(leadActivities.activityType, "call_made")
      )
    );
}
export async function findCall(
  db: CallsDb | any,
  id: number,
  lock = false
): Promise<LeadCallRecord | null> {
  const query = db
    .select()
    .from(leadCallRecords)
    .where(eq(leadCallRecords.id, id))
    .limit(1);
  const [row] = await (lock ? query.for("update") : query);
  return row ?? null;
}
export async function listLeadCalls(db: CallsDb, leadId: number) {
  return db
    .select()
    .from(leadCallRecords)
    .where(
      and(eq(leadCallRecords.leadId, leadId), isNull(leadCallRecords.deletedAt))
    )
    .orderBy(desc(leadCallRecords.createdAt))
    .limit(100);
}
export function nextAgentRate(
  grant: {
    rateWindowStartedAt: number;
    rateCount: number;
    maxCallsPerHour: number;
  },
  now: number
) {
  const reset = now >= grant.rateWindowStartedAt + 3_600_000;
  const count = reset ? 0 : grant.rateCount;
  if (count >= grant.maxCallsPerHour || grant.maxCallsPerHour < 1)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Hourly calling limit reached",
    });
  return {
    rateWindowStartedAt: reset ? now : grant.rateWindowStartedAt,
    rateCount: count + 1,
  };
}
export async function prepareLeadCall(
  db: CallsDb,
  actor: CallActor,
  leadId: number,
  config: LeadCallsConfig
) {
  const intentToken = randomBytes(32).toString("base64url"),
    now = Date.now();
  try {
    return await db.transaction(async tx => {
      const policy = await getCallPolicy(tx);
      if (!getLeadCallsReadiness(config, policy).ready)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Calling requires configuration and owner approval",
        });
      const [grant] = await tx
        .select()
        .from(leadCallAgentSettings)
        .where(eq(leadCallAgentSettings.userId, actor.id))
        .limit(1)
        .for("update");
      if (!grant?.canCall)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Calling permission required",
        });
      const lead = await authorizeCallLead(tx, actor, leadId, true);
      if (lead.optOutSignal)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Lead has opted out",
        });
      const destination = normalizeLeadCallPhone(lead.phone);
      const callerId = grant.callerId ?? config.defaultCallerId;
      if (
        !destination ||
        !callerId ||
        !config.approvedCallerIds.includes(callerId)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Approved caller ID and valid Egyptian mobile required",
        });
      // Expired unused intents can safely release slots. Consumed calls stay reserved until provider termination.
      const stale = await tx
        .select()
        .from(leadCallRecords)
        .where(
          and(
            isNull(leadCallRecords.intentConsumedAt),
            lt(leadCallRecords.intentExpiresAt, now),
            eq(leadCallRecords.status, "initializing")
          )
        )
        .for("update");
      for (const old of stale) {
        const changed = {
          ...old,
          status: "canceled",
          endedAt: now,
          activeAgentId: null,
          activeLeadId: null,
          updatedAt: now,
        };
        await tx
          .update(leadCallRecords)
          .set({
            status: changed.status,
            endedAt: now,
            activeAgentId: null,
            activeLeadId: null,
            updatedAt: now,
          })
          .where(eq(leadCallRecords.id, old.id));
        await updateCallActivity(tx, changed);
      }
      const rate = nextAgentRate(grant, now);
      await tx
        .update(leadCallAgentSettings)
        .set(rate)
        .where(eq(leadCallAgentSettings.userId, actor.id));
      const [activityResult] = await tx
        .insert(leadActivities)
        .values({
          leadId,
          userId: actor.id,
          activityType: "call_made",
          description: `Outbound Call — initializing\nAgent: ${actor.name ?? "Agent"}`,
          score: 0,
          createdAt: now,
        });
      const activityId = Number(activityResult.insertId);
      const identity = `elevay_user_${actor.id}`;
      const [result] = await tx
        .insert(leadCallRecords)
        .values({
          leadId,
          agentId: actor.id,
          agentName: actor.name ?? "Agent",
          activityId,
          intentHash: hashCallIntent(intentToken),
          intentExpiresAt: now + CALL_INTENT_TTL_MS,
          callerId,
          destination,
          agentIdentity: identity,
          activeAgentId: actor.id,
          activeLeadId: leadId,
          retentionExpiresAt: now + policy.retentionDays * 86_400_000,
          createdAt: now,
          updatedAt: now,
        });
      await writeCallAudit(tx, actor.id, "prepared", Number(result.insertId));
      return {
        callId: Number(result.insertId),
        intentToken,
        expiresAt: now + CALL_INTENT_TTL_MS,
        identity,
        destination,
        agentName: actor.name ?? "Agent",
      };
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    // Never propagate SQL or SDK messages (may contain personal data/config).
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Agent or lead already has an active call, or reservation unavailable",
    });
  }
}
export async function claimVoiceIntent(
  db: CallsDb,
  callId: number,
  token: string,
  from: string,
  parentSid: string,
  config: LeadCallsConfig
) {
  return db.transaction(async tx => {
    const row = await findCall(tx, callId, true);
    if (
      !row ||
      from !== `client:${row.agentIdentity}` ||
      !matchesCallIntent(row, token) ||
      row.parentCallSid ||
      isTerminalCallStatus(row.status)
    )
      throw new Error("invalid_intent");
    const policy = await getCallPolicy(tx);
    if (!getLeadCallsReadiness(config, policy).ready)
      throw new Error("calling_disabled");
    const [actor] = await tx
      .select(callUserProjection)
      .from(users)
      .where(eq(users.id, row.agentId))
      .limit(1);
    if (!actor) throw new Error("agent_unavailable");
    await requireCallGrant(tx, actor, "canCall");
    const lead = await authorizeCallLead(tx, actor, row.leadId, true);
    if (
      lead.optOutSignal ||
      normalizeLeadCallPhone(lead.phone) !== row.destination ||
      !config.approvedCallerIds.includes(row.callerId)
    )
      throw new Error("lead_changed");
    const now = Date.now();
    const [result] = await tx
      .update(leadCallRecords)
      .set({
        intentConsumedAt: now,
        parentCallSid: parentSid,
        status: "connecting",
        startedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(leadCallRecords.id, callId),
          isNull(leadCallRecords.intentConsumedAt),
          isNull(leadCallRecords.parentCallSid)
        )
      );
    if (result.affectedRows !== 1) throw new Error("intent_consumed");
    const updated = {
      ...row,
      intentConsumedAt: now,
      parentCallSid: parentSid,
      status: "connecting",
      startedAt: now,
      updatedAt: now,
    };
    await updateCallActivity(tx, updated);
    return { row: updated, policy };
  });
}
export async function applyCallStatus(
  db: CallsDb,
  callId: number,
  body: Record<string, string>
) {
  return db.transaction(async tx => {
    const row = await findCall(tx, callId, true);
    if (!row?.parentCallSid) throw new Error("unassociated_call");
    const parent = body.CallSid === row.parentCallSid;
    const child =
      !parent &&
      body.ParentCallSid === row.parentCallSid &&
      (!!row.childCallSid
        ? body.CallSid === row.childCallSid
        : body.To === row.destination && body.From === row.callerId);
    if (!parent && !child) throw new Error("unassociated_leg");
    if (parent && body.ParentCallSid) throw new Error("unexpected_parent");
    const sequence = Number(body.SequenceNumber);
    if (!/^[0-9]+$/.test(body.SequenceNumber ?? ""))
      throw new Error("invalid_sequence");
    const next = normalizeProviderCallStatus(body.CallStatus);
    const previous = parent ? row.parentSequence : row.childSequence;
    if (!next) throw new Error("invalid_status");
    // Parent in-progress represents browser transport, NOT an answered customer. Only terminal parent events update overall status.
    const apply =
      shouldApplyCallStatus(row.status, next, previous, sequence) &&
      (!parent || isTerminalCallStatus(next));
    const now = Date.now();
    const patch: Partial<LeadCallRecord> = {};
    if (sequence > previous)
      Object.assign(
        patch,
        parent
          ? { parentSequence: sequence }
          : { childSequence: sequence, childCallSid: body.CallSid }
      );
    if (apply) {
      patch.status = next;
      if (!parent && next === "in-progress")
        patch.answeredAt = row.answeredAt ?? now;
      if (isTerminalCallStatus(next)) {
        patch.endedAt = row.endedAt ?? now;
        patch.activeAgentId = null;
        patch.activeLeadId = null;
        if (/^\d+$/.test(body.CallDuration ?? ""))
          patch.durationSeconds = Math.min(Number(body.CallDuration), 86_400);
      }
    }
    if (Object.keys(patch).length) {
      patch.updatedAt = now;
      await tx
        .update(leadCallRecords)
        .set(patch)
        .where(eq(leadCallRecords.id, row.id));
      await updateCallActivity(tx, { ...row, ...patch });
    }
    return { ...row, ...patch };
  });
}
