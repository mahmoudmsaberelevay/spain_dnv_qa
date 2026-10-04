import crypto from "node:crypto";

export const MANUS_MEDIA_AUTH_MESSAGE = "Media generation is paused: this deployed CRM server cannot authenticate its Manus media API key. No task or budget reservation was created. Update the production Manus media credential, then retry.";
const AUTH_URL = "https://api.manus.ai/v2/task.list?limit=1";
type AuthResult = { ready: boolean; status: number | null; checkedAt: number; fingerprint: string | null };
let cached: { fingerprint: string | null; result: AuthResult; expiresAt: number } | null = null;

/** Reads the deployed process at the moment of dispatch, not an imported environment snapshot. */
export function mediaCredential() {
  const value = (process.env.MANUS_MEDIA_API_KEY || process.env.MANUS_API_KEY || "").trim();
  return { value, fingerprint: value ? crypto.createHash("sha256").update(value).digest("hex").slice(0, 12) : null };
}

export async function checkManusMediaAuthentication(): Promise<AuthResult> {
  const { value, fingerprint } = mediaCredential();
  const now = Date.now();
  if (cached && cached.fingerprint === fingerprint && cached.expiresAt > now) return cached.result;
  if (!value || value.length < 20) {
    const result: AuthResult = { ready: false, status: null, checkedAt: now, fingerprint };
    cached = { fingerprint, result, expiresAt: now + 15_000 };
    return result;
  }
  let status: number | null = null;
  try {
    const response = await fetch(AUTH_URL, { headers: { "x-manus-api-key": value }, signal: AbortSignal.timeout(12_000) });
    status = response.status;
  } catch { /* network problems fail closed without creating tasks */ }
  const result: AuthResult = { ready: status === 200, status, checkedAt: now, fingerprint };
  cached = { fingerprint, result, expiresAt: now + (result.ready ? 30_000 : 15_000) };
  return result;
}

export async function requireManusMediaAuthentication(): Promise<void> {
  const result = await checkManusMediaAuthentication();
  if (!result.ready) throw new Error(MANUS_MEDIA_AUTH_MESSAGE);
}
