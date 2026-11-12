import type { PlaudRange } from "@shared/plaud";

export function validPlaudDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function plaudRangeError(range: PlaudRange, required = false): string | null {
  if (!range.from && !range.to && !required) return null;
  if (!range.from || !range.to) return "Choose both a From date and a To date.";
  if (!validPlaudDate(range.from) || !validPlaudDate(range.to)) return "Enter valid calendar dates.";
  if (range.from > range.to) return "From date must be on or before To date.";
  return null;
}

export function safePlaudAuthorizationUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== "https://mcp.plaud.ai" || url.pathname !== "/authorize" || url.username || url.password || url.hash) return null;
    return url.href;
  } catch { return null; }
}

const SAFE_PROVIDER_MESSAGES: Record<string, string> = {
  PLAUD_CONFIGURATION_UNAVAILABLE: "Plaud is not configured for this CRM. Contact your administrator.",
  PLAUD_CREDENTIALS_UNAVAILABLE: "Plaud credentials are temporarily unavailable. Contact your administrator.",
  PLAUD_ACCOUNT_UNAVAILABLE: "Your Plaud account could not be verified. Reconnect your own account.",
  PLAUD_SESSION_REQUIRED: "Your CRM session has expired. Sign in again to continue.",
  PLAUD_LEAD_IMPORT_DENIED: "You are not authorized to import a transcript into this Lead.",
  PLAUD_DATE_RANGE_INVALID: "Enter a valid complete date range with From on or before To.",
  PLAUD_CONNECTION_CHANGED: "Your Plaud connection changed. Close this dialog and reconnect your own account.",
  PLAUD_CONNECTION_BUSY: "Your Plaud connection is busy. Wait a moment and try again.",
  PLAUD_TRANSCRIPT_UNAVAILABLE: "This recording has no available transcript. Check transcription in Plaud and try again.",
  PLAUD_IMPORTED_NOTE_REMOVED: "This recording's imported note was removed. No duplicate note was created. Contact your administrator.",
  PLAUD_RECORDING_ALREADY_IMPORTED: "This recording has already been imported. No duplicate note was created.",
  PLAUD_TRANSCRIPT_TOO_LARGE: "Plaud could not safely retrieve this transcript. Contact your administrator; no partial import was made.",
  PLAUD_RESPONSE_UNSUPPORTED: "Plaud returned an unsupported response. No transcript was imported. Contact your administrator.",
  PLAUD_NOT_CONFIGURED: "Plaud is not configured for this CRM. Contact your administrator.",
  PLAUD_RECONNECT_REQUIRED: "Your Plaud connection has expired. Reconnect your own account to continue.",
  PLAUD_NOT_CONNECTED: "Connect your own Plaud account to continue.",
  PLAUD_TRANSCRIPT_NOT_READY: "This recording has no ready transcript. Finish transcription in Plaud, then try again.",
  PLAUD_RECORDING_NOT_FOUND: "This recording is unavailable in your connected account. Refresh the list.",
  PLAUD_RATE_LIMITED: "Plaud is busy. Please wait a moment and try again.",
  PLAUD_PROVIDER_UNAVAILABLE: "Plaud is temporarily unavailable. Please try again later.",
  PLAUD_SHARING_POLICY_CONFLICT: "Company policy prevents sharing transcripts with all active CRM users. Contact your administrator; no import was made.",
  FORBIDDEN: "You are not authorized to perform this action for this Lead.",
  UNAUTHORIZED: "Your CRM session has expired. Sign in again to continue.",
};

/** Never display arbitrary provider responses, profile data, or server stacks. */
export function plaudSafeError(error: unknown): string {
  const value = error as { message?: unknown; data?: { code?: unknown } } | null;
  if (typeof value?.message === "string" && SAFE_PROVIDER_MESSAGES[value.message]) return SAFE_PROVIDER_MESSAGES[value.message];
  if (typeof value?.data?.code === "string" && SAFE_PROVIDER_MESSAGES[value.data.code]) return SAFE_PROVIDER_MESSAGES[value.data.code];
  return "The Plaud request could not be completed. Please try again or contact your administrator.";
}

export function formatPlaudDate(timestamp: number | null, timeZone: string): string {
  if (timestamp === null || !Number.isFinite(timestamp)) return "Date unavailable";
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(timestamp);
  } catch { return "Date unavailable"; }
}

export function formatPlaudDuration(durationMs: number | null): string | null {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) return null;
  const seconds = Math.floor(durationMs / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export class PlaudDownloadError extends Error {
  constructor(public readonly status: number) {
    super(plaudDownloadErrorMessage(status));
    this.name = "PlaudDownloadError";
  }
}

export function plaudDownloadErrorMessage(status: number): string {
  switch (status) {
    case 400: return "Enter a valid complete date range, then Apply it before exporting.";
    case 401: return "Your CRM session has expired. Sign in again to export.";
    case 403: return "Your CRM account cannot export transcripts. Contact your administrator.";
    case 404: return "No Plaud transcripts found for this date range";
    case 503: return "A consistent export could not be prepared. No file was downloaded. Please try again.";
    default: return "The export could not be completed. No file was downloaded. Please try again.";
  }
}

/** This is the authenticated native-file endpoint, not a Plaud/provider API call.
 * Collect streamed bytes for the browser's Blob download without decoding,
 * rewriting, truncating, adding a BOM, or adding any client metadata.
 */
export async function fetchPlaudTranscriptDownload(
  range: Required<PlaudRange>,
  options: { signal?: AbortSignal; onProgress?: (bytes: number) => void; fetcher?: typeof fetch } = {},
): Promise<{ blob: Blob; count: number; bytes: number; filename: string }> {
  const error = plaudRangeError(range, true);
  if (error) throw new PlaudDownloadError(400);
  const query = new URLSearchParams({ from: range.from, to: range.to });
  const response = await (options.fetcher ?? fetch)(`/api/plaud/transcripts/export?${query}`, {
    method: "GET", credentials: "include", mode: "same-origin", redirect: "error",
    headers: { Accept: "text/plain" }, signal: options.signal,
  });
  if (!response.ok) throw new PlaudDownloadError(response.status);
  const countHeader = response.headers.get("X-Plaud-Transcript-Count");
  const count = Number(countHeader);
  if (!/^text\/plain\s*;\s*charset=utf-8\s*$/i.test(response.headers.get("Content-Type") ?? "") ||
      !countHeader || !/^\d+$/.test(countHeader) || !Number.isSafeInteger(count) || count <= 0 || !response.body) {
    await response.body?.cancel();
    throw new PlaudDownloadError(503);
  }
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let bytes = 0;
  try {
    for (;;) {
      options.signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      // Copy exactly this view: its backing buffer may include unrelated bytes.
      chunks.push(Uint8Array.from(value).buffer);
      bytes += value.byteLength;
      options.onProgress?.(bytes);
    }
    options.signal?.throwIfAborted();
    if (!bytes) throw new PlaudDownloadError(503);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  return {
    blob: new Blob(chunks, { type: "text/plain;charset=utf-8" }), count, bytes,
    filename: `plaud_transcripts_${range.from}_to_${range.to}.txt`,
  };
}
