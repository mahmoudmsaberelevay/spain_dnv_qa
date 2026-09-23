# ELEVAY Connected Desktop — macOS DMG Release Validation

**Release:** ELEVAY Desktop 1.1.0  
**Validation date:** 23 September 2026  
**Native build:** GitHub Actions run `35852799437` on macOS 14  
**Workflow source checkpoint:** `5751b19af217fef2b7c0110bb242fb92ded6edfa`

## Release Type

This release is a **connected ELEVAY macOS desktop application**. It securely loads the live CRM at `https://elevay.vip`, so it exposes the same current modules, server-side data, permissions, automations, notifications, uploads, downloads, reports, Client Portal, and integrations as the web system. It does not contain a separate local CRM database, duplicate client data, or embedded server credentials.

The application is one **universal** macOS build for both Intel (`x86_64`) and Apple Silicon (`arm64`) Macs. It requires macOS Ventura 13.0 or later.

## Native Verification

The native macOS 14 workflow completed successfully. It verified the DMG with `hdiutil`, mounted the disk image, located the application bundle, confirmed bundle identifier `com.elevay.desktop`, confirmed minimum system version `13.0.0`, confirmed the microphone usage description, and required both `x86_64` and `arm64` slices through `lipo`. The workflow then generated SHA-256 manifests and uploaded the private release artifacts.

The large private artifact was downloaded as four independently checksummed parts. All four part hashes passed before reconstruction, and the reconstructed DMG passed the original workflow SHA-256 manifest.

| Item | Verified value |
|---|---|
| Installer | `ELEVAY-1.1.0-universal.dmg` |
| Size | 207,019,994 bytes |
| SHA-256 | `ee8b11e4d024b430038dec9088acace79b0cf8dbfcf28c8492557c2aea9da5bf` |
| CPU support | Intel x86_64 and Apple Silicon arm64 |
| Minimum macOS | Ventura 13.0 |
| Bundle identifier | `com.elevay.desktop` |
| Signing status | Unsigned and not notarized |

## Installation

Open the DMG and drag **ELEVAY** to **Applications**. Because no Apple Developer ID certificate was supplied, this release is intentionally unsigned and not notarized. On first launch, open **Applications**, Control-click **ELEVAY**, choose **Open**, and confirm **Open**. Subsequent launches work normally.

For standard double-click installation without the Gatekeeper warning, a future release should be signed with an Apple Developer ID Application certificate and notarized by Apple.

## Security and Data Handling

The desktop shell preserves sandboxing, context isolation, disabled page Node integration, trusted ELEVAY HTTPS navigation, certificate-error rejection, non-persistent desktop sessions, safe external-link handling, native download dialogs, printing, microphone-only media permission, and an offline page that stores no CRM data. Existing ELEVAY server authorization remains authoritative.
