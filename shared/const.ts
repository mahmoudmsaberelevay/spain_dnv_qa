export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const SESSION_EXPIRY_MS = 1000 * 60 * 60 * 8; // 8 hours
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

export const OAUTH_STATE_COOKIE = "__Host-oauth_state";

export type OAuthStatePayload = {
  redirectUri: string;
  origin: string;
  returnPath: string;
  nonce: string;
};

export function encodeOAuthState(payload: OAuthStatePayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function decodeOAuthState(value: string): Partial<OAuthStatePayload> {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object") return {};
    return {
      redirectUri: typeof parsed.redirectUri === "string" ? parsed.redirectUri : undefined,
      origin: typeof parsed.origin === "string" ? parsed.origin : undefined,
      returnPath: typeof parsed.returnPath === "string" ? parsed.returnPath : undefined,
      nonce: typeof parsed.nonce === "string" ? parsed.nonce : undefined,
    };
  } catch {
    return {};
  }
}
