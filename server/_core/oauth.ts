import {
  COOKIE_NAME,
  OAUTH_STATE_COOKIE,
  SESSION_EXPIRY_MS,
  decodeOAuthState,
} from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    const { redirectUri, origin, returnPath, nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];

    if (!redirectUri || !origin || !nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }

    let expectedRedirectUri: string;
    try {
      expectedRedirectUri = `${new URL(origin).origin}/api/oauth/callback`;
    } catch {
      res.status(403).json({ error: "invalid oauth origin" });
      return;
    }

    if (redirectUri !== expectedRedirectUri) {
      res.status(403).json({ error: "invalid oauth redirect" });
      return;
    }

    res.clearCookie(OAUTH_STATE_COOKIE, {
      path: "/",
      sameSite: "none",
      secure: true,
    });

    const fallbackOrigin = origin;

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
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

      // Use a browser session cookie so OAuth users also sign in again after
      // closing their browser. The signed token itself retains its configured
      // lifetime for non-browser clients that supply it explicitly.
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, cookieOptions);

      // Redirect to the frontend origin + returnPath
      const safeReturnPath = returnPath?.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/";
      const redirectTarget = `${origin}${safeReturnPath}`;
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
