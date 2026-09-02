import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

function safeReturnPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/** Build a fresh Manus OAuth URL at the moment the user starts sign-in. */
export const getLoginUrl = (returnPath = "/") => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const origin = window.location.origin;
  const redirectUri = `${origin}/api/oauth/callback`;
  const nonce = crypto.randomUUID();

  document.cookie = `${OAUTH_STATE_COOKIE}=${encodeURIComponent(nonce)}; Path=/; Max-Age=600; SameSite=None; Secure`;

  const state = encodeOAuthState({
    redirectUri,
    origin,
    returnPath: safeReturnPath(returnPath),
    nonce,
  });

  const url = new URL("/login", oauthPortalUrl);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("redirect_url", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
};

/** Start OAuth only from a click handler or redirect effect, never during render. */
export const startLogin = (returnPath = "/") => {
  window.location.assign(getLoginUrl(returnPath));
};
