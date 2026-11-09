import twilio from "twilio";
import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { leadCallRecords, type LeadCallRecord } from "../drizzle/schema";
import {
  callDataIsRetained,
  isTerminalCallStatus,
  type LeadCallDto,
  type LeadCallStatus,
  type LeadCallSummary,
  type LeadCallTranscriptSegment,
} from "../shared/leadCalls";
import {
  authorizeCallLead,
  requireCallGrant,
  type CallActor,
  type CallsDb,
} from "./leadCallsAccess";
import {
  findCall,
  getCallPolicy,
  matchesCallIntent,
  updateCallActivity,
  writeCallAudit,
} from "./leadCallsDb";
import {
  getLeadCallsReadiness,
  VOICE_TOKEN_TTL_SECONDS,
  type LeadCallsConfig,
} from "./leadCallsConfig";

export function toLeadCallDto(
  row: LeadCallRecord,
  canListen = false,
  now = Date.now()
): LeadCallDto {
  const retained = callDataIsRetained(row, now);
  const recordingAvailable =
    canListen &&
    retained &&
    row.consentStatus === "accepted" &&
    row.recordingStatus === "available" &&
    !!row.recordingSid;
  return {
    id: row.id,
    leadId: row.leadId,
    agentId: row.agentId,
    agentName: row.agentName,
    activityId: row.activityId,
    callerId: row.callerId,
    destination: row.destination,
    direction: row.direction,
    status: row.status as LeadCallStatus,
    durationSeconds: row.durationSeconds,
    startedAt: row.startedAt,
    answeredAt: row.answeredAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    transcript: canListen && retained ? row.transcript : null,
    transcriptSegments:
      canListen && retained
        ? (row.transcriptSegmentsJson as LeadCallTranscriptSegment[] | null)
        : null,
    aiSummary:
      canListen && retained
        ? (row.aiSummaryJson as LeadCallSummary | null)
        : null,
    callOutcome: canListen && retained ? row.callOutcome : null,
    suggestedNextAction: canListen && retained ? row.suggestedNextAction : null,
    transcriptionStatus: row.transcriptionStatus,
    summaryStatus: row.summaryStatus,
    recordingStatus: row.recordingStatus,
    consentStatus: row.consentStatus,
    recordingAvailable,
    recordingPlaybackUrl: recordingAvailable
      ? `/api/calls/${row.id}/recording`
      : null,
    parentCallSid: row.parentCallSid,
    childCallSid: row.childCallSid,
  };
}
export async function getAuthorizedCall(
  db: CallsDb,
  actor: CallActor,
  callId: number,
  edit = false
) {
  const row = await findCall(db, callId);
  if (!row || !callDataIsRetained(row))
    throw new TRPCError({ code: "NOT_FOUND", message: "Call unavailable" });
  await authorizeCallLead(db, actor, row.leadId, edit);
  return row;
}
export async function canListenToCalls(
  db: CallsDb,
  actor: CallActor
): Promise<boolean> {
  try {
    await requireCallGrant(db, actor, "canListen");
    return true;
  } catch {
    return false;
  }
}
export async function mintCallVoiceToken(
  db: CallsDb,
  actor: CallActor,
  callId: number,
  intentToken: string,
  config: LeadCallsConfig
) {
  const row = await getAuthorizedCall(db, actor, callId, true);
  await requireCallGrant(db, actor, "canCall");
  const policy = await getCallPolicy(db);
  if (!getLeadCallsReadiness(config, policy).ready)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Calling disabled or awaiting owner approval",
    });
  if (row.agentId !== actor.id || !matchesCallIntent(row, intentToken))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Call intent invalid or expired",
    });
  return signCallVoiceToken(row.agentIdentity, config);
}
export async function refreshCallVoiceToken(
  db: CallsDb,
  actor: CallActor,
  callId: number,
  config: LeadCallsConfig
) {
  const row = await getAuthorizedCall(db, actor, callId, true);
  await requireCallGrant(db, actor, "canCall");
  const policy = await getCallPolicy(db);
  if (
    !getLeadCallsReadiness(config, policy).ready ||
    row.agentId !== actor.id ||
    !row.parentCallSid ||
    !row.intentConsumedAt ||
    isTerminalCallStatus(row.status) ||
    row.activeAgentId !== actor.id
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Token refresh requires your bound active call",
    });
  // Refresh cannot launch another call: original server intent remains consumed.
  return signCallVoiceToken(row.agentIdentity, config);
}
function signCallVoiceToken(identity: string, config: LeadCallsConfig) {
  const AccessToken = twilio.jwt.AccessToken;
  const token = new AccessToken(
    config.accountSid,
    config.apiKeySid,
    config.apiKeySecret,
    { identity, ttl: VOICE_TOKEN_TTL_SECONDS }
  );
  token.addGrant(
    new AccessToken.VoiceGrant({
      outgoingApplicationSid: config.twimlAppSid,
      incomingAllow: false,
    })
  );
  return {
    token: token.toJwt(),
    identity,
    expiresAt: Date.now() + VOICE_TOKEN_TTL_SECONDS * 1000,
  };
}
export function createCallTwilioClient(config: LeadCallsConfig) {
  return twilio(config.apiKeySid, config.apiKeySecret, {
    accountSid: config.accountSid,
    autoRetry: false,
    timeout: 10_000,
  });
}
export async function cancelLeadCall(
  db: CallsDb,
  actor: CallActor,
  callId: number,
  config: LeadCallsConfig
) {
  const row = await getAuthorizedCall(db, actor, callId, true);
  if (row.agentId !== actor.id && actor.role !== "admin")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the calling agent or administrator can end the call",
    });
  if (isTerminalCallStatus(row.status)) return { success: true as const };
  if (row.parentCallSid) {
    if (!config.enabled)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Provider operations disabled; end the browser call",
      });
    try {
      await createCallTwilioClient(config)
        .calls(row.parentCallSid)
        .update({ status: "completed" });
    } catch {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message:
          "Unable to confirm provider call termination; end the browser call",
      });
    }
  }
  await db.transaction(async tx => {
    const current = await findCall(tx, callId, true);
    if (!current || isTerminalCallStatus(current.status)) return;
    // A voice webhook could claim the intent while cancellation was awaiting a provider request.
    if (!row.parentCallSid && current.parentCallSid)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Call connected while cancellation was requested; end the browser call",
      });
    const patch = {
      status: "canceled",
      endedAt: Date.now(),
      activeAgentId: null,
      activeLeadId: null,
      updatedAt: Date.now(),
    };
    await tx
      .update(leadCallRecords)
      .set(patch)
      .where(eq(leadCallRecords.id, callId));
    await updateCallActivity(tx, { ...current, ...patch });
    await writeCallAudit(tx, actor.id, "canceled", callId);
  });
  return { success: true as const };
}
