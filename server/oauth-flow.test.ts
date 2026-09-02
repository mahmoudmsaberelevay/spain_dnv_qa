import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeOAuthState, encodeOAuthState } from "../shared/const";

const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Manus OAuth flow", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "document");
  });

  it("round-trips the redirect, destination, and one-time nonce", () => {
    const payload = {
      redirectUri: "https://elevay.vip/api/oauth/callback",
      origin: "https://elevay.vip",
      returnPath: "/finance/clients?search=محمد",
      nonce: "test-nonce-123",
    };

    expect(decodeOAuthState(encodeOAuthState(payload))).toEqual(payload);
    expect(decodeOAuthState("not-valid-base64-json")).toEqual({});
  });

  it("uses the supported Manus authorization endpoint and parameter names", () => {
    const source = readProjectFile("client/src/const.ts");

    expect(source).toContain('new URL("/login", oauthPortalUrl)');
    expect(source).toContain('url.searchParams.set("app_id", appId)');
    expect(source).toContain('url.searchParams.set("redirect_url", redirectUri)');
    expect(source).toContain('url.searchParams.set("state", state)');
    expect(source).not.toContain("/app-auth");
  });

  it("generates a complete authorization request only when sign-in starts", async () => {
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "https://manus.im");
    vi.stubEnv("VITE_APP_ID", "elevay-test-app");
    const assign = vi.fn();
    const cookieWrites: string[] = [];

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin: "https://elevay.vip", assign } },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        set cookie(value: string) {
          cookieWrites.push(value);
        },
      },
    });

    const { getLoginUrl, startLogin } = await import("../client/src/const");
    const loginUrl = new URL(getLoginUrl("/finance/clients"));
    const state = decodeOAuthState(loginUrl.searchParams.get("state") ?? "");

    expect(loginUrl.origin).toBe("https://manus.im");
    expect(loginUrl.pathname).toBe("/login");
    expect(loginUrl.searchParams.get("app_id")).toBe("elevay-test-app");
    expect(loginUrl.searchParams.get("redirect_url")).toBe("https://elevay.vip/api/oauth/callback");
    expect(state).toMatchObject({
      origin: "https://elevay.vip",
      redirectUri: "https://elevay.vip/api/oauth/callback",
      returnPath: "/finance/clients",
    });
    expect(cookieWrites[0]).toContain("__Host-oauth_state=");

    startLogin("/finance");
    expect(assign).toHaveBeenCalledOnce();
  });

  it("validates the one-time nonce before exchanging the OAuth code", () => {
    const callbackSource = readProjectFile("server/_core/oauth.ts");
    const sdkSource = readProjectFile("server/_core/sdk.ts");

    expect(callbackSource).toContain("nonce !== expectedNonce");
    expect(callbackSource).toContain("sdk.exchangeCodeForToken(code, state)");
    expect(sdkSource).toContain('typeof parsed.redirectUri === "string"');
  });

  it("starts login at event time rather than generating authorization URLs during render", () => {
    const files = [
      "client/src/main.tsx",
      "client/src/components/DashboardLayout.tsx",
      "client/src/components/MobileLayout.tsx",
      "client/src/pages/ElevayHome.tsx",
    ];

    for (const file of files) {
      const source = readProjectFile(file);
      expect(source).not.toContain("href={getLoginUrl");
      expect(source).not.toContain("window.location.href = getLoginUrl");
    }
  });
});
