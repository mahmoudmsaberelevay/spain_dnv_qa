import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
} from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import {
  APP_URL,
  canGrantPermission,
  classifyNavigation,
  isTrustedOrigin,
  sanitizeDownloadFilename,
} from "./security.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OFFLINE_FILE = path.join(__dirname, "offline.html");
const WINDOWS_ICON_FILE = path.join(__dirname, "..", "assets", "elevay.ico");
const MACOS_ICON_FILE = path.join(__dirname, "..", "assets", "elevay-mac.png");
const SESSION_PARTITION = "elevay-desktop-session";
const APP_ID = "com.elevay.desktop";
const SMOKE_TEST = process.env.ELEVAY_DESKTOP_SMOKE === "1";
const IS_MACOS = process.platform === "darwin";

let mainWindow = null;
let appSession = null;
let showingOfflinePage = false;

app.setAppUserModelId(APP_ID);
app.commandLine.appendSwitch("autoplay-policy", "user-gesture-required");
app.commandLine.appendSwitch("disable-features", "AutofillServerCommunication,PasswordImport,PasswordManagerOnboarding");

function trustedOfflineFile(value) {
  try {
    return value.startsWith("file:") && path.resolve(fileURLToPath(value)) === path.resolve(OFFLINE_FILE);
  } catch {
    return false;
  }
}

async function openExternalSafely(value) {
  if (classifyNavigation(value) !== "external") return false;
  await shell.openExternal(value, { activate: true });
  return true;
}

function secureWebPreferences() {
  return {
    partition: SESSION_PARTITION,
    preload: path.join(__dirname, "preload.cjs"),
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    safeDialogs: true,
    spellcheck: true,
    backgroundThrottling: false,
    devTools: !app.isPackaged,
  };
}

function isAllowedInAppNavigation(value) {
  const classification = classifyNavigation(value);
  return classification === "internal"
    || classification === "trusted-blob"
    || classification === "local-popup"
    || trustedOfflineFile(value);
}

function handleNavigation(event, value) {
  if (isAllowedInAppNavigation(value)) return;
  event.preventDefault();
  void openExternalSafely(value);
}

function hardenWindow(window) {
  const contents = window.webContents;
  if (!IS_MACOS) window.setMenuBarVisibility(false);

  contents.on("will-attach-webview", event => event.preventDefault());
  contents.on("will-navigate", handleNavigation);
  contents.on("will-redirect", handleNavigation);

  contents.setWindowOpenHandler(({ url }) => {
    const classification = classifyNavigation(url);
    if (["internal", "trusted-blob", "local-popup"].includes(classification)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          show: true,
          backgroundColor: "#ffffff",
          webPreferences: secureWebPreferences(),
        },
      };
    }

    void openExternalSafely(url);
    return { action: "deny" };
  });

  contents.on("did-create-window", child => hardenWindow(child));

  contents.on("before-input-event", (event, input) => {
    const command = input.control || input.meta;
    const key = input.key.toLowerCase();

    if (input.key === "F12" || (command && input.shift && key === "i") || (command && key === "l")) {
      event.preventDefault();
      return;
    }
    if (input.key === "F5" || (command && key === "r")) {
      event.preventDefault();
      contents.reloadIgnoringCache();
      return;
    }
    if (command && key === "p") {
      event.preventDefault();
      void contents.print({ printBackground: true });
      return;
    }
    if ((input.alt && input.key === "Left" || (IS_MACOS && input.meta && input.key === "[")) && contents.canGoBack()) {
      event.preventDefault();
      contents.goBack();
      return;
    }
    if ((input.alt && input.key === "Right" || (IS_MACOS && input.meta && input.key === "]")) && contents.canGoForward()) {
      event.preventDefault();
      contents.goForward();
    }
  });
}

function installApplicationMenu() {
  if (!IS_MACOS) {
    Menu.setApplicationMenu(null);
    return;
  }

  const reload = () => mainWindow?.webContents.reloadIgnoringCache();
  const print = () => void mainWindow?.webContents.print({ printBackground: true });
  const navigateBack = () => {
    if (mainWindow?.webContents.canGoBack()) mainWindow.webContents.goBack();
  };
  const navigateForward = () => {
    if (mainWindow?.webContents.canGoForward()) mainWindow.webContents.goForward();
  };

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        { label: "Print…", accelerator: "CmdOrCtrl+P", click: print },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Back", accelerator: "CmdOrCtrl+[", click: navigateBack },
        { label: "Forward", accelerator: "CmdOrCtrl+]", click: navigateForward },
        { label: "Reload ELEVAY", accelerator: "CmdOrCtrl+R", click: reload },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ]));
}

async function showOfflinePage() {
  if (!mainWindow || mainWindow.isDestroyed() || showingOfflinePage) return;
  showingOfflinePage = true;
  await mainWindow.loadFile(OFFLINE_FILE);
}

async function loadElevay() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  showingOfflinePage = false;
  try {
    await mainWindow.loadURL(APP_URL);
    return true;
  } catch {
    await showOfflinePage();
    return false;
  }
}

function configureSession(targetSession) {
  targetSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || contents.getURL();
    callback(canGrantPermission({
      permission,
      requestingUrl,
      mediaTypes: details.mediaTypes,
    }));
  });

  targetSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    const requestingUrl = requestingOrigin || details.requestingUrl || contents?.getURL() || "";
    return canGrantPermission({
      permission,
      requestingUrl,
      mediaTypes: details.mediaTypes,
    });
  });

  targetSession.on("will-download", async (_event, item, contents) => {
    if (!isTrustedOrigin(contents.getURL())) {
      item.cancel();
      return;
    }

    item.pause();
    const suggestedName = sanitizeDownloadFilename(item.getFilename());
    const result = await dialog.showSaveDialog({
      title: "Save ELEVAY file",
      defaultPath: path.join(app.getPath("downloads"), suggestedName),
      buttonLabel: "Save",
    });

    if (result.canceled || !result.filePath) {
      item.cancel();
      return;
    }

    item.setSavePath(result.filePath);
    if (item.isPaused()) item.resume();
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: "ELEVAY",
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#07111f",
    ...(!IS_MACOS && { icon: WINDOWS_ICON_FILE }),
    webPreferences: secureWebPreferences(),
  });

  hardenWindow(mainWindow);
  const defaultAgent = mainWindow.webContents.getUserAgent();
  mainWindow.webContents.setUserAgent(`${defaultAgent} ELEVAYDesktop/${app.getVersion()}`);

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.on("did-finish-load", () => {
    if (!SMOKE_TEST) return;
    const loadedUrl = mainWindow?.webContents.getURL() ?? "";
    const isProduction = isTrustedOrigin(loadedUrl);
    console.log(JSON.stringify({
      smoke: "elevay-desktop",
      loadedUrl,
      title: mainWindow?.webContents.getTitle() ?? "",
      isProduction,
    }));
    setTimeout(() => app.exit(isProduction ? 0 : 2), 250);
  });
  if (SMOKE_TEST) mainWindow.removeAllListeners("ready-to-show");
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, _errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || trustedOfflineFile(validatedUrl)) return;
    void showOfflinePage();
  });
  mainWindow.webContents.on("render-process-gone", () => {
    void dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "ELEVAY needs to reload",
      message: "The application window stopped unexpectedly.",
      detail: "Your information remains stored in the live ELEVAY system. Reload the application to continue.",
      buttons: ["Reload"],
    }).then(() => loadElevay());
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void loadElevay();
}

ipcMain.handle("desktop:get-version", () => app.getVersion());
ipcMain.handle("desktop:retry-connection", () => loadElevay());
ipcMain.handle("desktop:open-external", (_event, value) => openExternalSafely(String(value ?? "")));

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.on("certificate-error", (event, _contents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(false);
  });

  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: "ELEVAY",
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: "Copyright © 2026 ELEVAY",
    });
    if (IS_MACOS && app.dock) app.dock.setIcon(MACOS_ICON_FILE);
    appSession = session.fromPartition(SESSION_PARTITION);
    configureSession(appSession);
    createMainWindow();
    installApplicationMenu();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

export const desktopRuntimeContract = Object.freeze({
  appId: APP_ID,
  appUrl: APP_URL,
  sessionPartition: SESSION_PARTITION,
  offlineUrl: pathToFileURL(OFFLINE_FILE).toString(),
});
