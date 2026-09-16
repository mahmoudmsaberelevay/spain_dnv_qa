import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const desktopRoot = resolve(import.meta.dirname, "..");
const projectRoot = resolve(desktopRoot, "..");
const readDesktop = relativePath => readFileSync(resolve(desktopRoot, relativePath), "utf8");
const readProject = relativePath => readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("ELEVAY connected desktop integration", () => {
  it("keeps the production CRM as the single source of truth", () => {
    const main = readDesktop("src/main.mjs");
    expect(main).toContain('const SESSION_PARTITION = "elevay-desktop-session"');
    expect(main).not.toContain('persist:elevay');
    expect(main).not.toMatch(/DATABASE_URL|JWT_SECRET|META_CAPI_TOKEN|GMAIL_APP_PASSWORD/);
    expect(main).toContain("session.fromPartition(SESSION_PARTITION)");
  });

  it("enables hardened Electron isolation and blocks certificate overrides", () => {
    const main = readDesktop("src/main.mjs");
    expect(main).toContain("contextIsolation: true");
    expect(main).toContain("nodeIntegration: false");
    expect(main).toContain("sandbox: true");
    expect(main).toContain("webSecurity: true");
    expect(main).toContain("allowRunningInsecureContent: false");
    expect(main).toContain("webviewTag: false");
    expect(main).toContain('app.on("certificate-error"');
    expect(main).toContain("callback(false)");
  });

  it("provides native download, print, external-link, reload, and navigation handling", () => {
    const main = readDesktop("src/main.mjs");
    expect(main).toContain('targetSession.on("will-download"');
    expect(main).toContain("dialog.showSaveDialog");
    expect(main).toContain("contents.print({ printBackground: true })");
    expect(main).toContain("shell.openExternal");
    expect(main).toContain("contents.reloadIgnoringCache()");
    expect(main).toContain("contents.goBack()");
    expect(main).toContain("contents.goForward()");
  });

  it("retains every major live CRM route family in the application loaded by desktop", () => {
    const appRoutes = readProject("client/src/App.tsx");
    const routeFamilies = [
      "/contracting",
      "/analysis",
      "/finance",
      "/docs",
      "/broadcast",
      "/chat",
      "/admin/permissions",
      "/admin/security",
      "/admin/client-portal",
      "/wa-qc",
      "/leads",
      "/marketing",
      "/reports",
      "/ai-council",
      "/backup",
    ];
    routeFamilies.forEach(route => expect(appRoutes).toContain(`path="${route}`));
    expect(appRoutes.match(/<Route path=/g)?.length).toBeGreaterThanOrEqual(60);
  });

  it("packages a normal Windows x64 installer with shortcuts and uninstall support", () => {
    const packageJson = JSON.parse(readDesktop("package.json"));
    expect(packageJson.build.appId).toBe("com.elevay.desktop");
    expect(packageJson.build.win.target[0]).toEqual({ target: "nsis", arch: ["x64"] });
    expect(packageJson.build.nsis.oneClick).toBe(false);
    expect(packageJson.build.nsis.createDesktopShortcut).toBe(true);
    expect(packageJson.build.nsis.createStartMenuShortcut).toBe(true);
    expect(packageJson.build.nsis.uninstallDisplayName).toBe("ELEVAY Desktop");
  });

  it("uses a self-contained recovery page that never stores CRM data offline", () => {
    const offline = readDesktop("src/offline.html");
    expect(offline).toContain("Connect to the internet to continue");
    expect(offline).toContain("No information is stored in an offline copy on this computer");
    expect(offline).toContain('Content-Security-Policy');
    expect(offline).not.toMatch(/clientName|clientCode|receipt|passport|phone number/i);
  });
});
