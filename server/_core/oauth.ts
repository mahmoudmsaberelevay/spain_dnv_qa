import { COOKIE_NAME, SESSION_EXPIRY_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Parse the state parameter which may be:
 * 1. New format: base64-encoded JSON { redirectUri, origin, returnPath }
 * 2. Legacy format: base64-encoded plain redirectUri string
 */
function parseState(state: string): { redirectUri: string; origin: string; returnPath: string } {
  try {
    const decoded = atob(state);
    // Try JSON first (new format)
    try {
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed.redirectUri === "string") {
        return {
          redirectUri: parsed.redirectUri,
          origin: parsed.origin ?? "",
          returnPath: parsed.returnPath ?? "/",
        };
      }
    } catch {
      // Not JSON — legacy format: decoded string IS the redirectUri
    }
    // Legacy: the decoded string is the redirectUri itself
    const url = new URL(decoded);
    return {
      redirectUri: decoded,
      origin: url.origin,
      returnPath: "/",
    };
  } catch {
    return { redirectUri: "", origin: "", returnPath: "/" };
  }
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // Parse state early so we can redirect back to login on any error
    const { redirectUri, origin, returnPath } = parseState(state);
    const loginUrl = `${ENV.oAuthPortalUrl}/app-auth?appId=${ENV.appId}&redirectUri=${encodeURIComponent(redirectUri)}&type=signIn`;
    const fallbackOrigin = origin || "https://elevay.vip";

    try {
      // Re-encode state as legacy format (just the redirectUri) for the SDK
      // because the SDK's decodeState() expects btoa(redirectUri)
      const sdkState = btoa(redirectUri);
      const tokenResponse = await sdk.exchangeCodeForToken(code, sdkState);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        console.error("[OAuth] openId missing from user info");
        res.redirect(302, `${fallbackOrigin}/login?error=auth_failed`);
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: SESSION_EXPIRY_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_EXPIRY_MS });

      // Redirect to the frontend origin + returnPath
      const safeReturnPath = returnPath && returnPath.startsWith("/") ? returnPath : "/";
      const redirectTarget = origin ? `${origin}${safeReturnPath}` : safeReturnPath;
      console.log(`[OAuth] Login success for ${userInfo.openId}, redirecting to ${redirectTarget}`);
      res.redirect(302, redirectTarget);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("[OAuth] Callback failed:", errMsg);

      // Instead of showing a raw JSON error, redirect back to the home page
      // so the user can try again. The OAuth code may have expired due to
      // server cold-start delay — retrying will generate a fresh code.
      res.redirect(302, `${fallbackOrigin}/?error=session_expired`);
    }
  });
}
