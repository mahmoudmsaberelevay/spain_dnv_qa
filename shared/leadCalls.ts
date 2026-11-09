export const LEAD_CALL_STATUSES = [
  "initializing",
  "connecting",
  "ringing",
  "in-progress",
  "completed",
  "busy",
  "no-answer",
  "failed",
  "canceled",
] as const;
export type LeadCallStatus = (typeof LEAD_CALL_STATUSES)[number];
export type LeadCallProcessingStatus =
  | "not_requested"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "disabled";
export type LeadCallConsentStatus = "pending" | "accepted" | "declined";
export type LeadCallTranscriptSegment = {
  speaker: "agent" | "customer" | "unknown";
  text: string;
  startSeconds?: number;
  endSeconds?: number;
  channel?: number;
};
export type LeadCallSummary = {
  language?: string;
  mainReason?: string | null;
  customerInterests?: string[];
  requirements?: string[];
  servicesDiscussed?: string[];
  pricingQuestions?: string[];
  objections?: string[];
  sentiment?: string | null;
  commitments?: string[];
  followUpActions?: string[];
  suggestedFollowUpDate?: string | null;
  outcome?: string | null;
  [key: string]: unknown;
};
export interface LeadCallDto {
  id: number;
  leadId: number;
  agentId: number;
  agentName: string;
  activityId: number;
  callerId: string;
  destination: string;
  direction: string;
  status: LeadCallStatus;
  durationSeconds: number;
  startedAt: number | null;
  answeredAt: number | null;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
  transcript: string | null;
  transcriptSegments: LeadCallTranscriptSegment[] | null;
  aiSummary: LeadCallSummary | null;
  callOutcome: string | null;
  suggestedNextAction: string | null;
  transcriptionStatus: string;
  summaryStatus: string;
  recordingStatus: string;
  consentStatus: string;
  recordingAvailable: boolean;
  recordingPlaybackUrl: string | null;
  parentCallSid: string | null;
  childCallSid: string | null;
}
export interface LeadCallsReadiness {
  enabled: boolean;
  processingEnabled: boolean;
  ready: boolean;
  hasCallGrant: boolean;
  canCall: boolean;
  canManage: boolean;
  reasons: string[];
  validPhone: boolean | null;
  approvedCallerIds: string[];
}
export const TERMINAL_CALL_STATUSES = new Set<string>([
  "completed",
  "busy",
  "no-answer",
  "failed",
  "canceled",
]);
export function isTerminalCallStatus(status: string): boolean {
  return TERMINAL_CALL_STATUSES.has(status);
}
export function normalizeProviderCallStatus(
  status: string
): LeadCallStatus | null {
  if (status === "queued" || status === "initiated") return "connecting";
  if (status === "answered") return "in-progress";
  return (LEAD_CALL_STATUSES as readonly string[]).includes(status)
    ? (status as LeadCallStatus)
    : null;
}
/** Sequence alone is insufficient: terminal states never regress, including higher-sequence retries. */
export function shouldApplyCallStatus(
  current: string,
  next: string,
  previousSequence: number,
  sequence: number
): boolean {
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    sequence <= previousSequence ||
    isTerminalCallStatus(current)
  )
    return false;
  const rank: Record<string, number> = {
    initializing: 0,
    connecting: 1,
    ringing: 2,
    "in-progress": 3,
  };
  return (
    isTerminalCallStatus(next) || (rank[next] ?? -1) >= (rank[current] ?? 0)
  );
}
export function callDataIsRetained(
  row: { deletedAt: number | null; retentionExpiresAt: number },
  now = Date.now()
): boolean {
  return row.deletedAt === null && row.retentionExpiresAt > now;
}
export function canQueueCallRecording(
  row: {
    consentStatus: string;
    recordingStatus: string;
    transcriptionStatus: string;
    deletedAt: number | null;
    retentionExpiresAt: number;
  },
  now = Date.now()
): boolean {
  return (
    callDataIsRetained(row, now) &&
    row.consentStatus === "accepted" &&
    row.recordingStatus === "available" &&
    ["not_requested", "disabled"].includes(row.transcriptionStatus)
  );
}
