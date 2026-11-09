import express, { type Express, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import twilio from "twilio";
import { and, eq, isNull } from "drizzle-orm";
import { leadCallRecords, type LeadCallRecord } from "../drizzle/schema";
import {
  callDataIsRetained,
  isTerminalCallStatus,
  normalizeProviderCallStatus,
} from "../shared/leadCalls";
import {
  requireCallActor,
  requireCallGrant,
  type CallsDb,
} from "./leadCallsAccess";
import {
  getLeadCallsConfig,
  getLeadCallsReadiness,
  webhookUrl,
  type LeadCallsConfig,
} from "./leadCallsConfig";
import {
  applyCallStatus,
  claimVoiceIntent,
  findCall,
  getCallPolicy,
  requireCallsDb,
  updateCallActivity,
  writeCallAudit,
} from "./leadCallsDb";
import { createCallTwilioClient, getAuthorizedCall } from "./leadCallsService";

const validCallSid = (value: string | undefined) =>
  /^CA[0-9a-fA-F]{32}$/.test(value ?? "");
const validRecordingSid = (value: string | undefined) =>
  /^RE[0-9a-fA-F]{32}$/.test(value ?? "");
const CALL_PATHS = new Set([
  "voice",
  "status",
  "parent-status",
  "consent",
  "consent-result",
  "dial-complete",
  "recording",
]);
/** Host/proxy headers never participate in validation. Original URL must match one of our generated endpoints exactly. */
export function validateCallWebhook(
  req: Pick<Request, "headers" | "originalUrl" | "body">,
  config: LeadCallsConfig
): Record<string, string> {
  if (!config.webhookBaseUrl || !config.authToken || !config.accountSid)
    throw new Error("webhook_unconfigured");
  const match = /^\/api\/twilio\/([a-z-]+)(?:\?callId=([1-9][0-9]*))?$/.exec(
    req.originalUrl
  );
  if (
    !match ||
    !CALL_PATHS.has(match[1]) ||
    (!["voice", "parent-status"].includes(match[1]) && !match[2]) ||
    (["voice", "parent-status"].includes(match[1]) && match[2])
  )
    throw new Error("invalid_webhook_url");
  if (
    typeof req.headers["x-twilio-signature"] !== "string" ||
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body)
  )
    throw new Error("invalid_webhook");
  const body: Record<string, string> = Object.create(null);
  for (const [key, value] of Object.entries(req.body)) {
    if (typeof value !== "string") throw new Error("invalid_form_fields");
    body[key] = value;
  }
  if (
    !twilio.validateRequest(
      config.authToken,
      req.headers["x-twilio-signature"],
      `${config.webhookBaseUrl}${req.originalUrl}`,
      body
    ) ||
    body.AccountSid !== config.accountSid
  )
    throw new Error("invalid_webhook_signature_or_account");
  return body;
}
export function buildCallDialTwiML(
  row: LeadCallRecord,
  config: LeadCallsConfig
): string {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({
    callerId: row.callerId,
    answerOnBridge: true,
    timeout: 30,
    timeLimit: 1800,
    action: webhookUrl(config, "/api/twilio/dial-complete", row.id),
    method: "POST",
  });
  // No record-from-answer: that records the customer before affirmative consent.
  dial.number(
    {
      url: webhookUrl(config, "/api/twilio/consent", row.id),
      method: "POST",
      statusCallback: webhookUrl(config, "/api/twilio/status", row.id),
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    },
    row.destination
  );
  return response.toString();
}
export function buildCallConsentTwiML(
  callId: number,
  notices: {
    recordingNoticeAr: string | null;
    recordingNoticeEn: string | null;
  },
  config: LeadCallsConfig
) {
  const response = new twilio.twiml.VoiceResponse();
  const gather = response.gather({
    input: ["dtmf"],
    numDigits: 1,
    timeout: 8,
    actionOnEmptyResult: true,
    action: webhookUrl(config, "/api/twilio/consent-result", callId),
    method: "POST",
  });
  // Owner-approved notice contains recording/processing purpose and clear press-1 instruction.
  gather.say({ language: "ar-AE" }, notices.recordingNoticeAr ?? "");
  gather.say({ language: "en-US" }, notices.recordingNoticeEn ?? "");
  response.hangup();
  return response.toString();
}
function hangupTwiML() {
  const response = new twilio.twiml.VoiceResponse();
  response.hangup();
  return response.toString();
}
function xml(res: Response, value: string) {
  res.setHeader("Cache-Control", "no-store");
  res.type("text/xml").send(value);
}
export function hasExactCustomerLeg(
  row: LeadCallRecord,
  body: Record<string, string>,
  allowBind = false
) {
  return (
    !!row.parentCallSid &&
    validCallSid(body.CallSid) &&
    body.CallSid !== row.parentCallSid &&
    body.ParentCallSid === row.parentCallSid &&
    (row.childCallSid
      ? body.CallSid === row.childCallSid
      : allowBind && body.To === row.destination && body.From === row.callerId)
  );
}
async function consentNotice(
  db: CallsDb,
  callId: number,
  body: Record<string, string>,
  config: LeadCallsConfig
) {
  return db.transaction(async tx => {
    const row = await findCall(tx, callId, true),
      policy = await getCallPolicy(tx);
    if (
      !row ||
      !hasExactCustomerLeg(row, body, true) ||
      !getLeadCallsReadiness(config, policy).ready ||
      isTerminalCallStatus(row.status) ||
      row.consentStatus !== "pending"
    )
      throw new Error("consent_unavailable");
    if (!row.childCallSid)
      await tx
        .update(leadCallRecords)
        .set({ childCallSid: body.CallSid, updatedAt: Date.now() })
        .where(
          and(
            eq(leadCallRecords.id, row.id),
            isNull(leadCallRecords.childCallSid)
          )
        );
    return buildCallConsentTwiML(callId, policy, config);
  });
}
export async function acceptCallConsent(
  db: CallsDb,
  callId: number,
  body: Record<string, string>,
  config: LeadCallsConfig,
  provider = createCallTwilioClient
) {
  const claim = await db.transaction(async tx => {
    const row = await findCall(tx, callId, true),
      policy = await getCallPolicy(tx);
    if (
      !row ||
      !hasExactCustomerLeg(row, body) ||
      !callDataIsRetained(row) ||
      isTerminalCallStatus(row.status) ||
      !getLeadCallsReadiness(config, policy).ready
    )
      throw new Error("consent_unavailable");
    if (row.consentStatus === "declined")
      return { row, start: false, declined: true };
    if (row.consentStatus === "accepted")
      return { row, start: false, declined: false };
    const now = Date.now();
    if (body.Digits !== "1") {
      await tx
        .update(leadCallRecords)
        .set({
          consentStatus: "declined",
          recordingStatus: "none",
          transcriptionStatus: "not_requested",
          updatedAt: now,
        })
        .where(
          and(
            eq(leadCallRecords.id, callId),
            eq(leadCallRecords.consentStatus, "pending")
          )
        );
      await writeCallAudit(tx, row.agentId, "consent_declined", callId);
      return { row, start: false, declined: true };
    }
    const [result] = await tx
      .update(leadCallRecords)
      .set({
        consentStatus: "accepted",
        recordingConsentAt: now,
        recordingStartClaimedAt: now,
        recordingStatus: "starting",
        updatedAt: now,
      })
      .where(
        and(
          eq(leadCallRecords.id, callId),
          eq(leadCallRecords.consentStatus, "pending"),
          isNull(leadCallRecords.recordingStartClaimedAt)
        )
      );
    if (result.affectedRows !== 1) throw new Error("consent_claim_conflict");
    await writeCallAudit(tx, row.agentId, "consent_accepted", callId);
    return { row, start: true, declined: false };
  });
  if (claim.declined) return hangupTwiML();
  if (claim.start) {
    try {
      const recording = await provider(config)
        .calls(claim.row.parentCallSid!)
        .recordings.create({
          recordingChannels: "dual",
          recordingTrack: "both",
          recordingStatusCallback: webhookUrl(
            config,
            "/api/twilio/recording",
            callId
          ),
          recordingStatusCallbackMethod: "POST",
          recordingStatusCallbackEvent: ["in-progress", "completed", "absent"],
        });
      if (
        recording.accountSid !== config.accountSid ||
        recording.callSid !== claim.row.parentCallSid ||
        !validRecordingSid(recording.sid) ||
        recording.channels !== 2
      )
        throw new Error("recording_association_invalid");
      await db
        .update(leadCallRecords)
        .set({
          recordingSid: recording.sid,
          recordingCallSid: recording.callSid,
          recordingStatus: "recording",
          updatedAt: Date.now(),
        })
        .where(
          and(
            eq(leadCallRecords.id, callId),
            eq(leadCallRecords.consentStatus, "accepted"),
            eq(leadCallRecords.recordingStatus, "starting"),
            isNull(leadCallRecords.recordingSid)
          )
        );
    } catch {
      // Never retry recording creation blindly: an uncertain REST result might already have created it.
      await db
        .update(leadCallRecords)
        .set({
          recordingStatus: "failed",
          processingErrorCode: "recording_start_failed",
          updatedAt: Date.now(),
        })
        .where(
          and(
            eq(leadCallRecords.id, callId),
            eq(leadCallRecords.recordingStatus, "starting")
          )
        );
    }
  }
  // Empty Number-url TwiML finishes call screening and bridges the consenting customer.
  return new twilio.twiml.VoiceResponse().toString();
}
export function recordingWebhookMatches(
  row: LeadCallRecord,
  body: Record<string, string>
) {
  const expected =
    !!row.recordingSid &&
    body.RecordingSid === row.recordingSid &&
    body.CallSid === row.recordingCallSid;
  // Twilio callback can arrive before create() returns. Bind only while the single consent-authorized
  // REST creation claim is pending, on our exact parent, with provider source StartCallRecordingAPI.
  const early =
    !row.recordingSid &&
    row.recordingStatus === "starting" &&
    body.RecordingSource === "StartCallRecordingAPI";
  return (
    row.consentStatus === "accepted" &&
    !!row.recordingConsentAt &&
    !!row.recordingStartClaimedAt &&
    !!row.parentCallSid &&
    !!row.childCallSid &&
    validRecordingSid(body.RecordingSid) &&
    (expected || early) &&
    body.CallSid === row.parentCallSid &&
    (!body.ParentCallSid || body.ParentCallSid === row.parentCallSid) &&
    body.RecordingChannels === "2"
  );
}
export async function applyRecordingWebhook(
  db: CallsDb,
  callId: number,
  body: Record<string, string>,
  config: LeadCallsConfig
) {
  return db.transaction(async tx => {
    const row = await findCall(tx, callId, true);
    if (!row || !recordingWebhookMatches(row, body) || !callDataIsRetained(row))
      throw new Error("recording_unassociated");
    if (
      !["in-progress", "completed", "absent", "failed"].includes(
        body.RecordingStatus
      )
    )
      throw new Error("recording_status_invalid");
    if (row.recordingStatus === "available" || row.recordingStatus === "absent")
      return false;
    const now = Date.now(),
      policy = await getCallPolicy(tx);
    const available =
      body.RecordingStatus === "completed" &&
      /^\d+$/.test(body.RecordingDuration ?? "") &&
      Number(body.RecordingDuration) > 0;
    const processing =
      config.processingEnabled &&
      policy?.enabled &&
      policy?.processingApproved &&
      policy?.mediaProtectionConfirmed;
    const patch: Partial<LeadCallRecord> = {
      recordingStatus: available
        ? "available"
        : body.RecordingStatus === "in-progress"
          ? "recording"
          : "absent",
      updatedAt: now,
    };
    if (!row.recordingSid)
      Object.assign(patch, {
        recordingSid: body.RecordingSid,
        recordingCallSid: body.CallSid,
      });
    if (available && row.transcriptionStatus === "not_requested")
      Object.assign(patch, {
        transcriptionStatus: processing ? "queued" : "disabled",
        nextAttemptAt: processing ? now : null,
        processingErrorCode: null,
      });
    if (!available && body.RecordingStatus !== "in-progress")
      patch.processingErrorCode = "recording_unavailable";
    await tx
      .update(leadCallRecords)
      .set(patch)
      .where(
        and(
          eq(leadCallRecords.id, callId),
          row.recordingSid
            ? eq(leadCallRecords.recordingSid, body.RecordingSid)
            : isNull(leadCallRecords.recordingSid)
        )
      );
    await updateCallActivity(tx, { ...row, ...patch });
    return patch.transcriptionStatus === "queued";
  });
}
async function applyDialComplete(
  db: CallsDb,
  callId: number,
  body: Record<string, string>
) {
  await db.transaction(async tx => {
    const row = await findCall(tx, callId, true);
    if (
      !row?.parentCallSid ||
      body.CallSid !== row.parentCallSid ||
      !row.childCallSid ||
      body.DialCallSid !== row.childCallSid ||
      body.ParentCallSid
    )
      throw new Error("dial_unassociated");
    const status = normalizeProviderCallStatus(body.DialCallStatus);
    if (
      !status ||
      !isTerminalCallStatus(status) ||
      isTerminalCallStatus(row.status)
    )
      return;
    const now = Date.now(),
      patch = {
        status,
        endedAt: row.endedAt ?? now,
        activeAgentId: null,
        activeLeadId: null,
        durationSeconds: /^\d+$/.test(body.DialCallDuration ?? "")
          ? Math.min(Number(body.DialCallDuration), 86_400)
          : row.durationSeconds,
        updatedAt: now,
      };
    await tx
      .update(leadCallRecords)
      .set(patch)
      .where(eq(leadCallRecords.id, callId));
    await updateCallActivity(tx, { ...row, ...patch });
  });
}
export function validRecordingRange(value: string | undefined): boolean {
  return value === undefined || /^bytes=(?:\d+-\d*|-\d+)$/.test(value);
}
export function protectedRecordingUrl(
  config: LeadCallsConfig,
  recordingSid: string
) {
  if (
    !/^AC[0-9a-fA-F]{32}$/.test(config.accountSid) ||
    !validRecordingSid(recordingSid)
  )
    throw new Error("recording_reference_invalid");
  return `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Recordings/${recordingSid}.wav?RequestedChannels=2`;
}
export async function streamCallRecording(req: Request, res: Response) {
  try {
    const actor = await requireCallActor(req),
      db = await requireCallsDb(),
      config = getLeadCallsConfig();
    const callId = Number(req.params.id);
    if (!Number.isSafeInteger(callId) || callId <= 0) {
      res.sendStatus(404);
      return;
    }
    const row = await getAuthorizedCall(db, actor, callId);
    await requireCallGrant(db, actor, "canListen");
    const policy = await getCallPolicy(db);
    if (
      !policy?.mediaProtectionConfirmed ||
      row.consentStatus !== "accepted" ||
      row.recordingStatus !== "available" ||
      !row.recordingSid ||
      !config.authToken
    ) {
      res.sendStatus(404);
      return;
    }
    const range = req.headers.range;
    if (!validRecordingRange(range)) {
      res.sendStatus(416);
      return;
    }
    await writeCallAudit(db, actor.id, "recording_played", callId);
    const abort = new AbortController();
    req.on("aborted", () => abort.abort());
    const upstream = await fetch(
      protectedRecordingUrl(config, row.recordingSid),
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
          ...(range ? { Range: range } : {}),
        },
        redirect: "error",
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)]),
      }
    );
    if (
      ![200, 206, 416].includes(upstream.status) ||
      (upstream.status !== 416 && !upstream.body)
    ) {
      res.sendStatus(502);
      return;
    }
    res.status(upstream.status);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="call-${callId}.wav"`
    );
    for (const name of ["content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (upstream.body)
      await pipeline(Readable.fromWeb(upstream.body as any), res);
    else res.end();
  } catch (error) {
    if (!res.headersSent)
      res
        .status(
          (error as any)?.code === "UNAUTHORIZED"
            ? 401
            : (error as any)?.code === "FORBIDDEN"
              ? 403
              : 404
        )
        .json({ error: "Recording unavailable" });
    else res.destroy();
  }
}
export type LeadCallRouteOptions = {
  onRecordingReady?: (callId: number) => Promise<void>;
};
export function registerLeadCallRoutes(
  app: Express,
  options: LeadCallRouteOptions = {}
) {
  const parser = express.urlencoded({
    extended: false,
    limit: "32kb",
    parameterLimit: 100,
  });
  for (const kind of Array.from(CALL_PATHS))
    app.post(`/api/twilio/${kind}`, parser, async (req, res) => {
      let signed = false;
      try {
        const config = getLeadCallsConfig();
        const body = validateCallWebhook(req, config);
        signed = true;
        const db = await requireCallsDb();
        if (kind === "parent-status") {
          if (!validCallSid(body.CallSid) || body.ParentCallSid)
            throw new Error("invalid_parent_reference");
          const [bound] = await db
            .select({ id: leadCallRecords.id })
            .from(leadCallRecords)
            .where(eq(leadCallRecords.parentCallSid, body.CallSid))
            .limit(1);
          if (!bound) throw new Error("unassociated_parent");
          await applyCallStatus(db, bound.id, body);
          res.sendStatus(204);
          return;
        }
        const callId = Number(
          kind === "voice" ? body.CallId : req.query.callId
        );
        if (
          !Number.isSafeInteger(callId) ||
          callId <= 0 ||
          (kind !== "recording" && !validCallSid(body.CallSid))
        )
          throw new Error("invalid_call_reference");
        if (kind === "voice") {
          if (body.ParentCallSid)
            throw new Error("unexpected_voice_parameters");
          // Ignore arbitrary To/From overrides: only validated From identity and DB intent determine dialing.
          const { row } = await claimVoiceIntent(
            db,
            callId,
            body.IntentToken ?? "",
            body.From ?? "",
            body.CallSid,
            config
          );
          xml(res, buildCallDialTwiML(row, config));
        } else if (kind === "status") {
          await applyCallStatus(db, callId, body);
          res.sendStatus(204);
        } else if (kind === "consent")
          xml(res, await consentNotice(db, callId, body, config));
        else if (kind === "consent-result")
          xml(res, await acceptCallConsent(db, callId, body, config));
        else if (kind === "dial-complete") {
          await applyDialComplete(db, callId, body);
          xml(res, hangupTwiML());
        } else {
          const queued = await applyRecordingWebhook(db, callId, body, config);
          if (queued && options.onRecordingReady) {
            try {
              await options.onRecordingReady(callId);
            } catch {
              /* Durable queued job remains available to managed recovery. */
            }
          }
          res.sendStatus(204);
        }
      } catch {
        if (
          signed &&
          ["voice", "consent", "consent-result", "dial-complete"].includes(kind)
        )
          xml(res, hangupTwiML());
        else
          res
            .status(signed ? 409 : 403)
            .json({ error: "Calling webhook rejected" });
      }
    });
  app.get("/api/calls/:id/recording", streamCallRecording);
}
