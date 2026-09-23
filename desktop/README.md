# ELEVAY Connected Desktop Application

The ELEVAY desktop application is a secure connected shell for the authoritative production CRM at `https://elevay.vip`. It does not create a separate local database or copy server credentials to staff computers. Every module, permission check, data update, automation, webhook, notification, upload, download, report, questionnaire, contract, and integration continues to use the same live ELEVAY backend.

## Supported Platforms

| Platform | Architecture | Installer | Minimum operating system |
| --- | --- | --- | --- |
| Windows | x64 | NSIS `.exe` | Windows 10 or Windows 11 |
| macOS | Universal: Intel x86_64 + Apple Silicon arm64 | `.dmg` | macOS 13 Ventura |

The macOS release contains both processor architectures in one application. It runs natively on Intel Macs and Apple Silicon Macs without requiring Rosetta.

## Full-System Parity

The desktop application always loads the live CRM, so it exposes the same Contracting, Client Documentation, Financial, Leads, Marketing, Reporting, Client Portal Administration, Security and Audit, WhatsApp Quality Control, AI Council, backup, chat, and other authorized pages as the website. Role, module, page, and owner-only permissions remain authoritative. Installing the desktop app never grants a user additional access.

Web-system changes become available automatically because the shell connects to the production CRM. A new desktop installer is required only when the Electron shell, security policy, native icon, or packaging behavior changes.

## Security Boundaries

The app uses Chromium sandboxing, context isolation, disabled Node.js access in pages, a minimal preload bridge, HTTPS-only ELEVAY navigation, blocked certificate exceptions, no embedded database credentials, no generic IPC bridge, blocked webviews, and a non-persistent desktop browser session. Staff must sign in again after fully closing the desktop application, matching the existing ELEVAY password-each-session policy.

Normal ELEVAY pages remain inside the app. External HTTPS links, email links, and telephone links open in the operating system’s default application. Dangerous top-level schemes such as `javascript:`, `data:`, arbitrary `file:`, and non-HTTPS web navigation are blocked. Only ELEVAY can request desktop notifications, clipboard writing, fullscreen, and microphone audio. Camera and geolocation requests are denied.

Downloads initiated by an authenticated ELEVAY page open a native Save dialog. Existing PDF and report printing uses the native operating-system print dialog. File uploads continue to use the existing secure web forms and S3-backed server routes.

## Native macOS Experience

The macOS build includes a branded ELEVAY dock icon, About panel, native application menu, standard Edit commands, Cmd+R reload, Cmd+P print, Cmd+[ back, Cmd+] forward, fullscreen, minimize, zoom, window activation, single-instance behavior, and macOS-native Save dialogs. The app follows the normal macOS lifecycle: closing the final window leaves the app available in the dock, and clicking the dock icon creates a new window when needed.

## Build and Test

From the repository root, install the isolated desktop dependencies with `pnpm desktop:install`. Run focused desktop security and integration regressions with `pnpm desktop:test`. Launch the connected shell against production with `pnpm desktop:start`.

Build the Windows installer with `pnpm desktop:build:win`. Build the universal macOS DMG on a Mac with `pnpm desktop:build:mac`. The checked-in `Build ELEVAY macOS DMG` workflow runs on a native macOS runner, executes the desktop tests, creates the DMG, verifies it with `hdiutil`, mounts it read-only, validates the bundle identifier and microphone usage description, confirms both x86_64 and arm64 executable slices with `lipo`, generates SHA-256 checksums, and uploads the release artifact.

## macOS Installation

Open the DMG and drag **ELEVAY** into **Applications**. The initial DMG is intentionally unsigned because no Apple Developer ID certificate or notarization credentials are stored in the repository. On first launch, macOS Gatekeeper may block the app. Control-click **ELEVAY** in Applications, choose **Open**, then confirm **Open**. Only use a DMG whose filename and SHA-256 match the published release record.

For frictionless double-click installation, automatic Gatekeeper trust, and broad external distribution, a future release should be signed with an ELEVAY-owned Apple Developer ID Application certificate and notarized by Apple. Signing changes distribution trust only; it does not change CRM features or permissions.

## Windows Installation

Copy `ELEVAY-Setup-1.0.0-x64.exe` to a Windows 10 or Windows 11 computer and open it. If Windows displays an Unknown Publisher warning, choose **More info** and then **Run anyway** only after confirming the expected filename and SHA-256. Select the installation folder, complete the wizard, and open **ELEVAY** from the desktop shortcut or Start Menu.

## Release Model

The connected application requires internet access and must not be redistributed outside authorized ELEVAY staff. Its offline page deliberately does not expose or store client, financial, contract, lead, chat, or documentation data. macOS and Windows installers are excluded from source control and delivered as release artifacts with SHA-256 checksums.
