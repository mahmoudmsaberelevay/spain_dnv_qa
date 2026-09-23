import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const desktopRoot = resolve(import.meta.dirname, "..");
const projectRoot = resolve(desktopRoot, "..");
const readDesktop = relativePath => readFileSync(resolve(desktopRoot, relativePath), "utf8");
const readDesktopBinary = relativePath => readFileSync(resolve(desktopRoot, relativePath));
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

  it("provides a native macOS application menu, dock icon, and platform shortcuts", () => {
    const main = readDesktop("src/main.mjs");
    expect(main).toContain("Menu.setApplicationMenu(Menu.buildFromTemplate");
    expect(main).toContain('{ role: "about" }');
    expect(main).toContain('{ role: "services" }');
    expect(main).toContain('{ role: "pasteAndMatchStyle" }');
    expect(main).toContain('accelerator: "CmdOrCtrl+["');
    expect(main).toContain('accelerator: "CmdOrCtrl+]"');
    expect(main).toContain("app.dock.setIcon(MACOS_ICON_FILE)");
    expect(main).toContain("process.platform === \"darwin\"");
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

  it("packages one universal macOS DMG for Intel and Apple Silicon", () => {
    const packageJson = JSON.parse(readDesktop("package.json"));
    expect(packageJson.version).toBe("1.1.0");
    expect(packageJson.scripts["dist:mac"]).toBe("electron-builder --mac dmg --universal");
    expect(packageJson.build.mac.target).toEqual([{ target: "dmg", arch: ["universal"] }]);
    expect(packageJson.build.mac.icon).toBe("assets/elevay.icns");
    expect(packageJson.build.mac.minimumSystemVersion).toBe("13.0.0");
    expect(packageJson.build.mac.identity).toBeNull();
    expect(packageJson.build.mac.hardenedRuntime).toBe(false);
    expect(packageJson.build.mac.extendInfo.NSMicrophoneUsageDescription).toContain("voice message");
    expect(packageJson.build.mac.artifactName).toBe("ELEVAY-${version}-${arch}.${ext}");
    expect(packageJson.build.dmg.contents).toEqual([
      { x: 160, y: 190, type: "file" },
      { x: 400, y: 190, type: "link", path: "/Applications" },
    ]);
  });

  it("ships structurally valid PNG and ICNS assets for macOS", () => {
    const png = readDesktopBinary("assets/elevay-mac.png");
    const icns = readDesktopBinary("assets/elevay.icns");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
    expect(icns.subarray(0, 4).toString("ascii")).toBe("icns");
    expect(icns.readUInt32BE(4)).toBe(icns.length);
  });

  it("uses a native macOS runner to validate the DMG and both universal slices", () => {
    const workflow = readProject(".github/workflows/build-macos-dmg.yml");
    const projectPackage = JSON.parse(readProject("package.json"));
    const workspace = readDesktop("pnpm-workspace.yaml");
    expect(workflow).toContain("runs-on: macos-14");
    expect(workflow).toContain("pnpm/action-setup@v4");
    expect(projectPackage.packageManager).toMatch(/^pnpm@10\.4\.1\+/);
    expect(workspace).toMatch(/packages:\s*\n\s*- ['"]?\.['"]?/);
    expect(workflow).not.toContain("version: 10.4.1");
    expect(workflow).not.toContain("corepack prepare");
    expect(workflow).toContain("pnpm --dir desktop test");
    expect(workflow).toContain("pnpm --dir desktop dist:mac");
    expect(workflow).toContain("hdiutil verify");
    expect(workflow).toContain("lipo -archs");
    expect(workflow).toContain("grep -qw x86_64");
    expect(workflow).toContain("grep -qw arm64");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("split -b 60m -a 2");
    expect(workflow).toContain("CHUNKS_SHA256SUMS.txt");
    for (const suffix of ["aa", "ab", "ac", "ad"]) {
      expect(workflow).toContain(`ELEVAY-macOS-universal-DMG-part-${suffix}`);
    }
  });

  it("uses a self-contained recovery page that never stores CRM data offline", () => {
    const offline = readDesktop("src/offline.html");
    expect(offline).toContain("Connect to the internet to continue");
    expect(offline).toContain("No information is stored in an offline copy on this computer");
    expect(offline).toContain('Content-Security-Policy');
    expect(offline).not.toMatch(/clientName|clientCode|receipt|passport|phone number/i);
  });
});
