import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

function readProjectFile(relativePath: string) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("authentication credential privacy safeguards", () => {
  it("discourages browser credential saving on the login and reset forms", () => {
    const loginSource = readProjectFile("client/src/pages/Login.tsx");

    expect(loginSource).toContain('autoComplete="off"');
    expect(loginSource).toContain('autoComplete="new-password"');
    expect(loginSource).toContain('data-lpignore="true"');
    expect(loginSource).toContain('data-1p-ignore="true"');
    expect(loginSource).toContain('data-bwignore="true"');
  });

  it("marks login responses and the login shell as non-cacheable", () => {
    const authRoutesSource = readProjectFile("server/_core/auth-routes.ts");
    const serverSource = readProjectFile("server/_core/index.ts");

    expect(authRoutesSource).toContain('res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private")');
    expect(authRoutesSource).toContain('res.setHeader("Pragma", "no-cache")');
    expect(serverSource).toContain('app.use("/login"');
    expect(serverSource).toContain('res.setHeader("Expires", "0")');
  });

  it("uses session-only browser cookies without changing token validity for mobile clients", () => {
    const authRoutesSource = readProjectFile("server/_core/auth-routes.ts");
    const oauthSource = readProjectFile("server/_core/oauth.ts");

    expect(authRoutesSource).toContain("res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req));");
    expect(authRoutesSource).toContain("expiresInMs: SESSION_EXPIRY_MS");
    expect(oauthSource).toContain("res.cookie(COOKIE_NAME, sessionToken, cookieOptions);");
    expect(oauthSource).toContain("expiresInMs: SESSION_EXPIRY_MS");
  });
});

// Browser password managers remain user-controlled; these assertions only protect
// against regressions in the best-effort website-side signals.
void projectRoot;
