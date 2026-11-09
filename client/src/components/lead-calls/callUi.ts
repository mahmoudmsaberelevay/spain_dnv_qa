import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export type CallUiStatus = "review" | "initializing" | "ready" | "connecting" | "ringing" | "in_progress" | "completed" | "busy" | "no_answer" | "failed" | "canceled";

const TERMINAL_STATUSES = new Set(["completed", "busy", "no_answer", "failed", "canceled"]);
export function isTerminalCallStatus(status: string) {
  return TERMINAL_STATUSES.has(status.replaceAll("-", "_"));
}
export function callStatusLabel(status: string) {
  const labels: Record<string, string> = {
    review: "Review call", initializing: "Initializing", prepared: "Ready to start", ready: "Ready to start",
    connecting: "Connecting", initiated: "Connecting", queued: "Connecting", ringing: "Ringing",
    in_progress: "In Progress", completed: "Completed", busy: "Busy", no_answer: "No Answer", failed: "Failed", canceled: "Canceled",
  };
  return labels[status.replaceAll("-", "_")] ?? "Updating status";
}

/** Display validation only. The server always reloads and validates the DB phone. */
export function normalizeDisplayPhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const western = value.trim().replace(/[٠-٩۰-۹]/g, digit => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
  // Do not extract a plausible number from arbitrary notes, extensions, or URLs.
  if (!/^[+\d\s().-]+$/.test(western)) return null;
  const normalized = western.startsWith("00") ? `+${western.slice(2)}` : western;
  try {
    const phone = parsePhoneNumberFromString(normalized, "EG");
    return phone?.isValid() && !phone.ext ? String(phone.number) : null;
  } catch {
    return null;
  }
}

export function formatCallDuration(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

/** Never display arbitrary SDK/provider/server message strings (may contain PII or tokens). */
export function safeCallError(error: unknown): string {
  const value = error && typeof error === "object" ? error as { code?: unknown; name?: unknown; data?: { code?: unknown } } : {};
  if (value.name === "NotAllowedError" || value.name === "SecurityError" || value.code === 31208) {
    return "Microphone access was blocked. Allow microphone access in your browser, then try again.";
  }
  if (value.name === "NotFoundError" || value.code === 31201) return "No microphone was found. Connect a headset or microphone and try again.";
  if (value.name === "NotReadableError") return "The microphone is in use or unavailable. Close other audio apps and try again.";
  if (value.code === 20101 || value.code === 20104 || value.code === 31204 || value.code === 31205) {
    return "The calling session expired. End this session and prepare a new call.";
  }
  if (value.code === 31003 || value.code === 31009 || value.code === 53405) return "The calling connection was lost. Check your network and try again.";
  const code = value.data?.code ?? value.code;
  if (code === "UNAUTHORIZED") return "Your login expired. Sign in again before calling.";
  if (code === "FORBIDDEN") return "Calling is not authorized for this account or lead. Ask your administrator to review access and policy approval.";
  if (code === "CONFLICT") return "A call is already active for this agent or lead. Finish it before starting another.";
  if (code === "TOO_MANY_REQUESTS") return "The calling limit has been reached. Wait before trying again.";
  if (code === "PRECONDITION_FAILED" || code === "SERVICE_UNAVAILABLE") return "Calling is unavailable. Ask your administrator to review the paid-service approval and calling configuration.";
  if (code === "BAD_REQUEST") return "This call could not be prepared. Check the lead phone number and calling configuration.";
  return "The call could not continue. Check your microphone and network, or ask your administrator for help.";
}

export function protectedRecordingPath(callId: number, available: boolean): string | null {
  return available && Number.isSafeInteger(callId) && callId > 0 ? `/api/calls/${callId}/recording` : null;
}

export function transcriptSpeakerLabel(segment: { speaker: string; channel?: number }) {
  if (segment.speaker === "agent") return "Agent";
  if (segment.speaker === "customer") return "Customer";
  if (segment.channel === 0 || segment.channel === 1) return `Channel ${segment.channel + 1}`;
  return "Unknown speaker";
}

export function needsCallPolling(call: { status: string; transcriptionStatus?: string | null; summaryStatus?: string | null; recordingStatus?: string | null }) {
  const pending = new Set(["queued", "processing", "pending", "in_progress", "retrying", "recording"]);
  return !isTerminalCallStatus(call.status) || [call.transcriptionStatus, call.summaryStatus, call.recordingStatus].some(value => value && pending.has(value));
}

/** Match by immutable activity ID only; never infer matches from descriptions or timestamps. */
export function mergeCallTimeline<A extends { id: number; createdAt: number | Date }, C extends { id: number; activityId: number | null; createdAt: number | Date }>(activities: readonly A[], calls: readonly C[]) {
  const byActivity = new Map(calls.filter(call => call.activityId != null).map(call => [call.activityId, call]));
  const activityIds = new Set(activities.map(activity => activity.id));
  const rows: ({ key: string; activity: A; call: C | undefined; createdAt: number } | { key: string; activity: undefined; call: C; createdAt: number })[] = activities.map(activity => ({
    key: `activity-${activity.id}`, activity, call: byActivity.get(activity.id), createdAt: Number(activity.createdAt),
  }));
  const seen = new Set<number>();
  for (const call of calls) {
    if (seen.has(call.id)) continue;
    seen.add(call.id);
    if (call.activityId != null && activityIds.has(call.activityId)) continue;
    rows.push({ key: `call-${call.id}`, activity: undefined, call, createdAt: Number(call.createdAt) });
  }
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}
