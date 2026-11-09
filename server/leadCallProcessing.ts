import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm";
import { leadCallRecords, leadCallPolicies, type LeadCallRecord, type LeadCallPolicy, type InsertLeadCallRecord } from "../drizzle/schema";
import { getDb } from "./db";
import { getLeadCallsConfig } from "./leadCallsConfig";
import {
  CallProcessingError, MAX_RECORDING_DURATION_MS, downloadTwilioRecording, transcribeAzureRecording,
  summarizeCallTranscript, deleteTwilioRecording, readCallProcessingConfig, recordingAccessAllowed,
  azureTranscriptionUrl, azureTranscriptionDefinition, safeProcessingError, type CallProcessingConfig, type CallTranscript, type CallSummary, type TranscriptSegment,
} from "./leadCallProcessingProviders";

export const CALL_PROCESSING_LEASE_MS = 180_000;
export const CALL_PROCESSING_STAGE_TIMEOUT_MS = 105_000;
export const CALL_PROCESSING_MAX_ATTEMPTS = 3;
export type ProcessingStage = "transcription" | "summary";
export type ProcessingClaim = { row: LeadCallRecord; token: string; stage: ProcessingStage };
export type ProcessingPatch = Partial<InsertLeadCallRecord>;
export type ProcessingCounts = { claimed: number; completed: number; failed: number; blocked: number };
/** All implementation methods must be atomic. Claims and commits recheck persisted policy. */
export interface CallProcessingStore {
  policy(): Promise<LeadCallPolicy | null>;
  claim(now: number, leaseMs: number): Promise<ProcessingClaim | null>;
  isCurrent(claim: ProcessingClaim, now: number): Promise<boolean>;
  commit(claim: ProcessingClaim, patch: ProcessingPatch, now: number): Promise<boolean>;
}
export interface CallProcessingProviders {
  download(config: CallProcessingConfig, sid: string, signal: AbortSignal): Promise<Awaited<ReturnType<typeof downloadTwilioRecording>>>;
  transcribe(config: CallProcessingConfig, audio: Awaited<ReturnType<typeof downloadTwilioRecording>>, signal: AbortSignal): Promise<CallTranscript>;
  summarize(config: CallProcessingConfig, transcript: CallTranscript, startedAt: number, signal: AbortSignal): Promise<CallSummary>;
}
export function processingPolicyApproved(policy: LeadCallPolicy | null): boolean {
  return !!(policy?.enabled && policy.callingApproved && policy.processingApproved && policy.consentRequired && policy.mediaProtectionConfirmed && policy.policyVersion?.trim() && policy.recordingNoticeAr?.trim() && policy.recordingNoticeEn?.trim());
}
export function processingRowEligible(row: LeadCallRecord, now: number): boolean {
  return recordingAccessAllowed(row, now) && row.recordingStatus === "available" && row.consentStatus === "accepted" && row.recordingConsentAt !== null && !!row.recordingSid;
}
export function getCallProcessingReadiness(config: CallProcessingConfig = readCallProcessingConfig()) {
  const reasons: string[] = [];
  if (!config.enabled) reasons.push("processing_disabled");
  if (!config.paidApproved) reasons.push("processing_provider_approval_required");
  if (!/^AC[0-9a-fA-F]{32}$/.test(config.accountSid)) reasons.push("missing_or_invalid_TWILIO_ACCOUNT_SID");
  if (!(config.apiKeySid && config.apiKeySecret) && !config.authToken.trim()) reasons.push("missing_TWILIO_RECORDING_CREDENTIALS");
  if (config.apiKeySid && config.apiKeySecret && !/^SK[0-9a-fA-F]{32}$/.test(config.apiKeySid)) reasons.push("invalid_TWILIO_API_KEY_SID");
  if (!config.azureEndpoint) reasons.push("missing_AZURE_SPEECH_ENDPOINT_or_REGION");
  else { try { azureTranscriptionUrl(config.azureEndpoint); } catch { reasons.push("invalid_AZURE_SPEECH_ENDPOINT"); } }
  try { azureTranscriptionDefinition(config, 2); } catch { reasons.push("invalid_CALL_TRANSCRIPTION_LOCALES"); }
  if (!config.azureKey) reasons.push("missing_AZURE_SPEECH_KEY");
  if (!config.openAiApiKey) reasons.push("missing_OPENAI_API_KEY");
  if (!config.summaryModel.trim()) reasons.push("missing_CALL_SUMMARY_MODEL");
  return { ready: reasons.length === 0, reasons };
}
export function processingRetryAt(attempts: number, now: number): number { return now + Math.min(5 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1)); }
function releaseLease(): ProcessingPatch { return { processingLeaseToken: null, processingLeaseUntil: null }; }
function transcriptFromRow(row: LeadCallRecord): CallTranscript {
  const stored = row.transcriptSegmentsJson;
  // Durable storage contains UI-compatible segments plus provider metadata. Handle JSON-string drivers.
  let raw: unknown = stored;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = []; } }
  const segments: TranscriptSegment[] = Array.isArray(raw) ? raw.map((segment: any) => ({
    text: typeof segment?.text === "string" ? segment.text : "", speaker: typeof segment?.speakerLabel === "string" ? segment.speakerLabel : "Unknown speaker",
    channel: typeof segment?.channel === "number" ? segment.channel : null,
    startMs: typeof segment?.startSeconds === "number" ? segment.startSeconds * 1000 : null, endMs: typeof segment?.endSeconds === "number" ? segment.endSeconds * 1000 : null,
    locale: typeof segment?.locale === "string" ? segment.locale : null, confidence: typeof segment?.confidence === "number" ? segment.confidence : null,
  })) : [];
  const text = row.transcript ?? "";
  const arabic = (text.match(/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/g) ?? []).length; const latin = (text.replace(/^(?:Unknown speaker|Channel \d+|Speaker \d+|Agent|Customer): /gm, "").match(/[A-Za-z]/g) ?? []).length;
  return { text, segments, primaryLanguage: arabic > 0 && arabic >= latin ? "ar" : latin > 0 ? "en" : "unknown", durationMs: row.durationSeconds * 1000 };
}
export function transcriptSegmentsForStorage(transcript: CallTranscript) {
  return transcript.segments.map(s => ({ speaker: s.speaker === "Agent" ? "agent" : s.speaker === "Customer" ? "customer" : "unknown", speakerLabel: s.speaker, text: s.text,
    ...(s.startMs === null ? {} : { startSeconds: s.startMs / 1000 }), ...(s.endMs === null ? {} : { endSeconds: s.endMs / 1000 }), ...(s.channel === null ? {} : { channel: s.channel }), locale: s.locale, confidence: s.confidence }));
}
export function summaryForStorage(summary: CallSummary) {
  return { ...summary, language: summary.primaryLanguage, mainReason: summary.reason, customerInterests: summary.interests ?? [], servicesDiscussed: summary.services ?? [], pricingQuestions: summary.pricing ?? [], followUpActions: summary.requestedFollowups ?? [], suggestedFollowUpDate: summary.suggestedNextDate };
}
/** Finite callback-owned processor. One leased provider stage at a time; no scheduling or detached work. */
export function createCallProcessingWorker(options: { store: CallProcessingStore; providers: CallProcessingProviders; config: CallProcessingConfig; now?: () => number; signal?: AbortSignal }) {
  const now = options.now ?? Date.now;
  let running: Promise<ProcessingCounts> | null = null;
  async function run(limit: number): Promise<ProcessingCounts> {
    const counts: ProcessingCounts = { claimed: 0, completed: 0, failed: 0, blocked: 0 };
    const readiness = getCallProcessingReadiness(options.config);
    if (!readiness.ready || !processingPolicyApproved(await options.store.policy())) { counts.blocked++; return counts; }
    // API limits 1..10 but production entry always caps to 1 to fit a heartbeat's 2-minute lifetime.
    for (let i = 0; i < Math.max(1, Math.min(10, Math.floor(limit))); i++) {
      if (options.signal?.aborted) { counts.blocked++; break; }
      if (!processingPolicyApproved(await options.store.policy())) { counts.blocked++; break; }
      const claim = await options.store.claim(now(), CALL_PROCESSING_LEASE_MS); if (!claim) break;
      counts.claimed++;
      const timeout = AbortSignal.timeout(CALL_PROCESSING_STAGE_TIMEOUT_MS);
      const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
      try {
        if (!processingRowEligible(claim.row, now()) || !await options.store.isCurrent(claim, now())) throw new CallProcessingError("LEASE_LOST");
        if (claim.row.durationSeconds * 1000 > MAX_RECORDING_DURATION_MS) throw new CallProcessingError("RECORDING_TOO_LONG");
        if (claim.stage === "transcription") {
          const audio = await options.providers.download(options.config, claim.row.recordingSid!, signal);
          if (!await options.store.isCurrent(claim, now()) || !processingPolicyApproved(await options.store.policy())) throw new CallProcessingError("LEASE_LOST");
          // REST-recording path has not had an approved channel-order pilot. Never guess speaker roles.
          const transcript = await options.providers.transcribe(options.config, audio, signal);
          const saved = await options.store.commit(claim, { transcript: transcript.text, transcriptSegmentsJson: transcriptSegmentsForStorage(transcript), transcriptionStatus: "completed", summaryStatus: transcript.text.trim() ? "queued" : "completed", processingErrorCode: null, processingAttempts: 0, nextAttemptAt: transcript.text.trim() ? now() : null, ...releaseLease() }, now());
          if (!saved) throw new CallProcessingError("LEASE_LOST");
        } else {
          const transcript = transcriptFromRow(claim.row);
          // Successful transcript is never downloaded/transcribed again for summary-only retry.
          const summary = await options.providers.summarize(options.config, transcript, claim.row.startedAt ?? claim.row.createdAt, signal);
          const saved = await options.store.commit(claim, { aiSummaryJson: summaryForStorage(summary), callOutcome: summary.outcome, suggestedNextAction: summary.requestedFollowups?.join("\n") ?? null, summaryStatus: "completed", transcriptionStatus: "completed", nextAttemptAt: null, processingErrorCode: null, ...releaseLease() }, now());
          if (!saved) throw new CallProcessingError("LEASE_LOST");
        }
        counts.completed++;
      } catch (error) {
        const safe = safeProcessingError(error);
        if (safe.code === "LEASE_LOST") { counts.blocked++; continue; }
        const attempts = claim.row.processingAttempts;
        const retry = safe.retryable && attempts < CALL_PROCESSING_MAX_ATTEMPTS;
        const status = safe.code === "PROCESSING_DISABLED" || safe.code === "PROVIDER_NOT_CONFIGURED" ? "blocked" : retry ? "queued" : "failed";
        const saved = await options.store.commit(claim, { ...(claim.stage === "transcription" ? { transcriptionStatus: status } : { summaryStatus: status }), processingErrorCode: safe.code, nextAttemptAt: retry ? processingRetryAt(attempts, now()) : null, ...releaseLease() }, now());
        if (!saved || status === "blocked") counts.blocked++; else counts.failed++;
      }
    }
    return counts;
  }
  return {
    runOnce(limit = 1) { if (running) return running; running = run(limit).finally(() => { running = null; }); return running; },
  };
}

const retainedWhere = (now: number) => and(isNull(leadCallRecords.deletedAt), gt(leadCallRecords.retentionExpiresAt, now), eq(leadCallRecords.consentStatus, "accepted"), isNotNull(leadCallRecords.recordingConsentAt), eq(leadCallRecords.recordingStatus, "available"), isNotNull(leadCallRecords.recordingSid));
const dueWhere = (now: number) => and(retainedWhere(now), or(isNull(leadCallRecords.nextAttemptAt), lte(leadCallRecords.nextAttemptAt, now)), or(isNull(leadCallRecords.processingLeaseUntil), lte(leadCallRecords.processingLeaseUntil, now)), or(
  or(eq(leadCallRecords.transcriptionStatus, "queued"), eq(leadCallRecords.transcriptionStatus, "processing")),
  and(eq(leadCallRecords.transcriptionStatus, "completed"), or(eq(leadCallRecords.summaryStatus, "queued"), eq(leadCallRecords.summaryStatus, "processing"))),
));
/** All claim transactions lock the singleton policy first, enforcing global concurrency=1 across instances. */
export function createDrizzleCallProcessingStore(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): CallProcessingStore {
  const readPolicy = async (tx: any, lock = false): Promise<LeadCallPolicy | null> => {
    const query = tx.select().from(leadCallPolicies).where(eq(leadCallPolicies.policyKey, "default")).limit(1);
    const rows = await (lock ? query.for("update") : query); return rows[0] ?? null;
  };
  const currentWhere = (claim: ProcessingClaim, now: number) => and(eq(leadCallRecords.id, claim.row.id), eq(leadCallRecords.processingLeaseToken, claim.token), gt(leadCallRecords.processingLeaseUntil, now), retainedWhere(now));
  return {
    policy: () => readPolicy(db),
    claim: (now, leaseMs) => db.transaction(async tx => {
      if (!processingPolicyApproved(await readPolicy(tx, true))) return null;
      const active = await tx.select({ id: leadCallRecords.id }).from(leadCallRecords).where(and(gt(leadCallRecords.processingLeaseUntil, now), isNotNull(leadCallRecords.processingLeaseToken), isNull(leadCallRecords.deletedAt))).limit(1);
      if (active.length) return null;
      const rows = await tx.select().from(leadCallRecords).where(dueWhere(now)).orderBy(asc(leadCallRecords.nextAttemptAt), asc(leadCallRecords.id)).limit(1).for("update");
      const row = rows[0]; if (!row) return null;
      const stage: ProcessingStage = row.transcriptionStatus === "completed" ? "summary" : "transcription";
      if (row.processingAttempts >= CALL_PROCESSING_MAX_ATTEMPTS) {
        const exhausted = { ...(stage === "summary" ? { summaryStatus: "failed" } : { transcriptionStatus: "failed" }), processingErrorCode: "ATTEMPTS_EXHAUSTED", nextAttemptAt: null, ...releaseLease(), updatedAt: now };
        await tx.update(leadCallRecords).set(exhausted).where(eq(leadCallRecords.id, row.id));
        const { updateCallActivity } = await import("./leadCallsDb");
        await updateCallActivity(tx as any, { ...row, ...exhausted } as LeadCallRecord);
        return null;
      }
      const token = randomUUID();
      const patch = { ...(stage === "summary" ? { summaryStatus: "processing" } : { transcriptionStatus: "processing" }), processingAttempts: row.processingAttempts + 1, processingLeaseToken: token, processingLeaseUntil: now + leaseMs, updatedAt: now };
      const [claimResult] = await tx.update(leadCallRecords).set(patch).where(and(eq(leadCallRecords.id, row.id), dueWhere(now)));
      if (claimResult.affectedRows !== 1) return null;
      return { row: { ...row, ...patch }, token, stage };
    }),
    isCurrent: async (claim, now) => {
      if (!processingPolicyApproved(await readPolicy(db))) return false;
      return (await db.select({ id: leadCallRecords.id }).from(leadCallRecords).where(currentWhere(claim, now)).limit(1)).length === 1;
    },
    commit: (claim, patch, now) => db.transaction(async tx => {
      if (!processingPolicyApproved(await readPolicy(tx, true))) return false;
      const rows = await tx.select().from(leadCallRecords).where(currentWhere(claim, now)).limit(1).for("update"); if (!rows.length) return false;
      await tx.update(leadCallRecords).set({ ...patch, updatedAt: now }).where(currentWhere(claim, now));
      // Refresh the same linked timeline activity, not a disconnected activity or duplicate row.
      const { updateCallActivity } = await import("./leadCallsDb");
      await updateCallActivity(tx as any, { ...rows[0], ...patch, updatedAt: now } as LeadCallRecord);
      return true;
    }),
  };
}
const productionProviders: CallProcessingProviders = {
  download: (config, sid, signal) => downloadTwilioRecording(config, sid, fetch, signal),
  transcribe: (config, audio, signal) => transcribeAzureRecording(config, audio, undefined, fetch, signal),
  summarize: (config, transcript, startedAt, signal) => summarizeCallTranscript(config, transcript, startedAt, fetch, signal),
};
let productionRun: Promise<ProcessingCounts> | null = null;
/** Parent calls this with {limit:1} and awaits it from the signed callback/managed Heartbeat. */
export function processLeadCallQueue(options: { limit?: number; signal?: AbortSignal } = {}): Promise<ProcessingCounts> {
  if (productionRun) return productionRun;
  productionRun = (async () => {
    const base = getLeadCallsConfig(); const config = readCallProcessingConfig();
    config.enabled = base.enabled && base.processingEnabled;
    config.accountSid = base.accountSid; config.apiKeySid = base.apiKeySid; config.apiKeySecret = base.apiKeySecret; config.authToken = base.authToken;
    if (!getCallProcessingReadiness(config).ready) return { claimed: 0, completed: 0, failed: 0, blocked: 1 };
    const db = await getDb(); if (!db) return { claimed: 0, completed: 0, failed: 0, blocked: 1 };
    const worker = createCallProcessingWorker({ store: createDrizzleCallProcessingStore(db), providers: productionProviders, config, signal: options.signal });
    return worker.runOnce(1); // deliberate one stage / heartbeat; limit cannot raise production concurrency or timeout.
  })().catch(() => ({ claimed: 0, completed: 0, failed: 0, blocked: 1 })).finally(() => { productionRun = null; });
  return productionRun;
}

/** Owner separately approves this destructive policy. No cron, live deletion, or schema mutations here. */
export async function purgeExpiredLeadCalls(options: { limit?: number; signal?: AbortSignal } = {}): Promise<{ purged: number; failed: number; blocked: number }> {
  const config = readCallProcessingConfig();
  if (!config.retentionEnabled || !config.retentionApproved || !config.policyOwner.trim()) return { purged: 0, failed: 0, blocked: 1 };
  if (options.signal?.aborted) return { purged: 0, failed: 0, blocked: 1 };
  const db = await getDb(); if (!db) return { purged: 0, failed: 0, blocked: 1 };
  const now = Date.now(); const counts = { purged: 0, failed: 0, blocked: 0 };
  const base = getLeadCallsConfig(); Object.assign(config, { accountSid: base.accountSid, apiKeySid: base.apiKeySid, apiKeySecret: base.apiKeySecret, authToken: base.authToken });
  const claim = await db.transaction(async tx => {
    const policies = await tx.select().from(leadCallPolicies).where(eq(leadCallPolicies.policyKey, "default")).limit(1).for("update");
    if (!policies[0]?.policyVersion || policies[0].updatedBy < 1) return null;
    const rows = await tx.select().from(leadCallRecords).where(and(lte(leadCallRecords.retentionExpiresAt, now), or(isNull(leadCallRecords.deletedAt), eq(leadCallRecords.recordingStatus, "deletion_pending")), or(isNull(leadCallRecords.processingLeaseUntil), lte(leadCallRecords.processingLeaseUntil, now)))).orderBy(asc(leadCallRecords.retentionExpiresAt)).limit(1).for("update");
    const row = rows[0]; if (!row) return null;
    const token = randomUUID();
    const patch = { deletedAt: row.deletedAt ?? now, transcript: null, transcriptSegmentsJson: null, aiSummaryJson: null, callOutcome: null, suggestedNextAction: null, transcriptionStatus: "blocked", summaryStatus: "blocked", recordingStatus: row.recordingSid ? "deletion_pending" : "deleted", processingErrorCode: null, nextAttemptAt: null, processingLeaseToken: token, processingLeaseUntil: now + CALL_PROCESSING_LEASE_MS, updatedAt: now };
    await tx.update(leadCallRecords).set(patch).where(eq(leadCallRecords.id, row.id));
    const { updateCallActivity } = await import("./leadCallsDb"); await updateCallActivity(tx as any, { ...row, ...patch });
    return { row, token };
  });
  if (!claim) return counts;
  try {
    // Locally hidden before provider deletion; no stale processor can commit after this tombstone.
    if (claim.row.recordingSid) await deleteTwilioRecording(config, claim.row.recordingSid, fetch, options.signal);
    await db.update(leadCallRecords).set({ recordingStatus: "deleted", recordingSid: null, recordingCallSid: null, ...releaseLease(), updatedAt: Date.now() }).where(and(eq(leadCallRecords.id, claim.row.id), eq(leadCallRecords.processingLeaseToken, claim.token), isNotNull(leadCallRecords.deletedAt)));
    counts.purged++;
  } catch (error) {
    await db.update(leadCallRecords).set({ processingErrorCode: safeProcessingError(error).code, ...releaseLease(), updatedAt: Date.now() }).where(and(eq(leadCallRecords.id, claim.row.id), eq(leadCallRecords.processingLeaseToken, claim.token), isNotNull(leadCallRecords.deletedAt)));
    counts.failed++;
  }
  return counts;
}
