import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

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

    try {
      const { redirectUri, origin, returnPath } = parseState(state);

      // Re-encode state as legacy format (just the redirectUri) for the SDK
      // because the SDK's decodeState() expects btoa(redirectUri)
      const sdkState = btoa(redirectUri);
      const tokenResponse = await sdk.exchangeCodeForToken(code, sdkState);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      // ── Domain restriction: only @elevay.com + the owner gmail are allowed ──
      const userEmail = userInfo.email ?? "";
      const ALLOWED_EMAILS = ["mahmoud.saberelevay@gmail.com", "walid.mammdouh@gmail.com"];
      const isElevayDomain = userEmail.endsWith("@elevay.com");
      const isExempted = ALLOWED_EMAILS.includes(userEmail);
      if (!isElevayDomain && !isExempted) {
        const deniedOrigin = origin || redirectUri;
        const deniedUrl = `${deniedOrigin}/access-denied?reason=domain`;
        console.warn(`[OAuth] Login blocked for non-elevay email: ${userEmail}`);
        res.redirect(302, deniedUrl);
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
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirect to the frontend origin + returnPath so the app loads correctly
      // regardless of which domain (elevay.vip, manus.space, localhost) was used
      const safeReturnPath = returnPath && returnPath.startsWith("/") ? returnPath : "/";
      const redirectTarget = origin ? `${origin}${safeReturnPath}` : safeReturnPath;
      console.log(`[OAuth] Login success for ${userInfo.openId}, redirecting to ${redirectTarget}`);
      res.redirect(302, redirectTarget);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
