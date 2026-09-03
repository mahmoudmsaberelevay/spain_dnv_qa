import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

function safeReturnPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/** Build the internal ELEVAY password-login URL and preserve a safe in-app destination. */
export const getSystemLoginUrl = (returnPath = "/") => {
  const safePath = safeReturnPath(returnPath);
  if (safePath === "/" || safePath.startsWith("/login")) return "/login";
  return `/login?returnTo=${encodeURIComponent(safePath)}`;
};

/** Default application sign-in: open ELEVAY's own email/password page. */
export const startSystemLogin = (returnPath = "/") => {
  window.location.assign(getSystemLoginUrl(returnPath));
};

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

/** Optional Manus OAuth sign-in. Do not use this as the default CRM login path. */
export const startLogin = (returnPath = "/") => {
  window.location.assign(getLoginUrl(returnPath));
};
