# ELEVAY Connected Windows Desktop Application

The ELEVAY desktop application is a secure Windows shell for the authoritative production CRM at `https://elevay.vip`. It does not create a separate local database or copy server credentials to staff computers. Every module, permission check, data update, automation, webhook, notification, upload, download, and report continues to use the existing live ELEVAY backend.

## Supported Platform

The initial release targets Windows 10 and Windows 11 on x64 processors. The installer is generated as `ELEVAY-Setup-1.0.0-x64.exe` and installs per Windows user with optional installation-directory selection, Start Menu integration, a desktop shortcut, and normal uninstall support.

| Release item | Verified value |
| --- | --- |
| Application version | 1.0.0 |
| Installer | `ELEVAY-Setup-1.0.0-x64.exe` |
| Architecture | Windows x64 |
| Installer format | Unicode NSIS self-extracting `.exe` |
| Installer size | Approximately 96 MB |
| SHA-256 | `9f77201fcf3406bf4041a2cc0e1d2cfc5ac4bc1407f0529164373248fafbc886` |

## Security Boundaries

The app uses Chromium sandboxing, context isolation, disabled Node.js access in pages, a minimal preload bridge, HTTPS-only ELEVAY navigation, blocked certificate exceptions, no embedded database credentials, no generic IPC bridge, blocked webviews, and a non-persistent desktop browser session. The non-persistent session means staff must sign in again after fully closing the desktop application, matching the existing ELEVAY password-each-session policy.

Normal ELEVAY pages remain inside the app. External HTTPS links, email links, and telephone links open through Windows. Dangerous top-level schemes such as `javascript:`, `data:`, arbitrary `file:`, and non-HTTPS web navigation are blocked. Only ELEVAY can request desktop notifications, clipboard writing, fullscreen, and microphone audio. Camera and geolocation requests are denied.

Downloads initiated by an authenticated ELEVAY page open a native Save dialog. Existing browser-based PDF printing and report printing use the Windows print dialog. File uploads continue to use the existing secure web forms and S3-backed server routes.

## Build and Test

From the repository root, install the isolated desktop dependencies with `pnpm desktop:install`. Run focused security tests with `pnpm desktop:test`. Launch the desktop shell against production with `pnpm desktop:start`. Build the Windows installer with `pnpm desktop:build:win`.

The unsigned installer may trigger a Windows Unknown Publisher warning. A future release can be signed without changing application behavior when ELEVAY provides a valid Windows code-signing certificate.

The release passed eleven focused desktop tests covering trusted origins, blocked schemes, restricted permissions, filename sanitization, non-persistent sessions, Electron isolation, certificate-error rejection, native downloads and printing, external-link handling, major CRM route families, installer metadata, and the offline recovery page. A real Electron smoke run loaded `https://elevay.vip/` with the title `Elevay CRM`. The existing web production build also completed successfully. The installer and its embedded application archive both passed structural integrity checks, and the packaged application contained only the intended desktop source, icon, and package metadata; no server secret names were present.

## Installation

Copy `ELEVAY-Setup-1.0.0-x64.exe` to the Windows 10 or Windows 11 computer and open it. If Windows displays an Unknown Publisher warning, choose **More info** and then **Run anyway** only after confirming the filename and SHA-256 value above. Select the installation folder, complete the wizard, and open **ELEVAY** from the desktop shortcut or Start Menu. Sign in with the same authorized ELEVAY account used on the website. Closing the complete desktop application ends its local browser session, so the user signs in again on the next launch.

The connected application requires internet access. It must not be redistributed outside authorized ELEVAY staff. Existing role and page permissions remain authoritative: installing the desktop app never grants access to a module that the same account cannot access at `elevay.vip`.

## Release Model

Web-system features update immediately because the desktop app always loads the live ELEVAY CRM. A new installer is required only when the desktop shell, security policy, icon, or installer behavior changes. The application requires internet access; its offline page deliberately does not expose or store client, financial, contract, lead, chat, or documentation data.
