# ELEVAY Standalone Client Chat — Release Report

**Prepared for:** ELEVAY Citizenship & Residency  
**Prepared by:** Manus AI  
**Date:** 12 September 2026  
**Release type:** Additive, ELEVAY-owned client communication system using adaptive polling

## Executive Summary

ELEVAY now has an owned, WhatsApp-like conversation system inside every Client Documentation folder. It is **not connected to WhatsApp, Meta, WhatsApp Web, the Cloud API, or the existing WhatsApp Quality Control module**. The same authoritative database conversation is used by the employee CRM, the Client Portal REST contract, the portal administrator view, and the ELEVAY staff mobile application.

The system uses **adaptive polling rather than WebSockets**. An open visible conversation polls its cursor frequently, list summaries refresh more slowly, hidden/background screens suspend intensive polling, and optimistic sending makes a message appear immediately while the server persists and deduplicates it.

## Delivered Capabilities

| Area | Delivered behavior |
| --- | --- |
| Folder ownership | Exactly one conversation per Client Documentation folder; all 24 existing folders were provisioned idempotently |
| Shared history | CRM, Client Portal REST, portal administration, and staff mobile use one canonical message store |
| Core messaging | Text, replies, drafts, internal notes, optimistic sends, retry identifiers, ordering, pagination, typing approximation, read and listened receipts |
| Message controls | Edit and delete-for-everyone windows, hide-for-me, reactions, stars, importance, manager pins, information/version history, reporting, moderation, and search |
| Discovery | Text, date range, sender, message type, visibility, starred, important, pinned, and mentions-me filters |
| Participants | Authorized staff/client participants, manager assignment, display names, approximate recent presence, mentions, waiting-on state, and active/archived/blocked lifecycle |
| Attachments | Up to five queued files per batch, per-file state/retry/removal, PDF/Office/image/audio/video allowlist, signature and size checks, opaque storage keys, protected access, inline previews, and 500 MB conversation quota |
| Voice | Browser/native recording, protected playback, 1×/1.5×/2× speeds, listened receipts, and failure-tolerant Arabic/English transcripts |
| Client Documents | Confirmed checklist destination, cross-folder authorization, original secure-object reuse, source message/attachment references, audit, and assigned-team internal notification |
| Notifications | Unread badges, last-message previews, protected deep links, duplicate-safe client alerts, preference-aware staff email, and staff/portal mute and channel preferences |
| Governance | Manager retention-policy record, legal hold, audited CSV export, report moderation, response target, storage/health counters, and Heartbeat-backed scheduled messages |
| Mobile | Chat remains inside each Client Documentation folder; no new global tab; attachments, voice, multi-file queue, quota visibility, optimistic sends, polling, and receipts are supported |

## Security and Privacy Controls

Authorization is checked on every conversation, message action, receipt, search, attachment access, export, preference change, assignment, governance action, and scheduled callback. Staff require Client Documentation access plus active conversation participation; clients require an active portal assignment to the exact folder. Internal notes are filtered from client messages, polling events, search, notifications, receipts, and attachment access.

Files are stored outside the webroot with opaque keys that are never returned to clients. The server checks normalized filename, extension, declared MIME type, decoded size, file signature, executable headers, checksum, conversation quota, and exact message visibility. Macro-enabled Office files, archives, executables, and unknown formats remain blocked.

Scheduled callbacks trust only the platform-authenticated task UID, not request-body identifiers. Delivery uses a deterministic retry identifier and a durable sent status, so callback retries and later cron matches cannot create duplicate messages.

## Validation Evidence

| Validation | Result |
| --- | --- |
| Focused chat/media/governance/scheduling tests | 30 passed across 3 files |
| Cross-module web security/regression tests | 103 passed across 21 files |
| Production web build | Passed |
| Changed chat TypeScript diagnostics | No errors |
| Mobile complete suite | 208 passed; 1 existing skipped |
| Mobile focused chat/permission/route/navigation tests | 59 passed |
| Mobile TypeScript and lint | Passed with no errors |
| Expo web release export | Passed; `/client-docs/chat` included |
| Folder/conversation integrity | 24 folders and 24 conversations; zero duplicate groups and zero orphans |
| Portal authorization integrity | Zero active portal participants without an active matching assignment |
| Internal-note isolation integrity | Zero portal receipts for internal messages |
| Scheduled validation artifacts | Zero scheduled rows created during non-mutating checks |
| WhatsApp preservation | Existing 1,052 WhatsApp records remained separate and untouched |

## Operating Limits and Truthful Boundaries

The system is fast adaptive polling, **not true real-time sockets**. Presence and typing are recent-activity approximations. It uses transport and managed-storage encryption but is **not end-to-end encrypted**, because the server must authorize, search, audit, notify, transcribe, and save documents.

The validator provides defense-in-depth file checks but is **not an antivirus engine**. A private scanner can be integrated later; until then, high-risk formats remain blocked. The seven-year retention selection records an approved policy state but does not activate destructive cleanup in this release, protecting existing client history by default.

Heartbeat currently exposes a recurring six-field cron rather than one-time expiry. After the first successful scheduled delivery, the durable row becomes sent; later annual matches safely no-op. Pending jobs can be cancelled from the Chat dialog.

The connected repository contains the **staff ELEVAY mobile application**. A separate compiled client-facing Home/My Applications repository was not available, so the sanitized Client Portal REST endpoints are complete, but this report does not claim that a separate client mobile interface has been shipped. That UI can be connected without changing the database model when its codebase is supplied.

## How Staff Use the Feature

Open **Client Documentation**, select a client folder, and choose **Chat**. The header provides Search, Schedule, Export, Governance, Moderation, and Settings according to permission. Use **Send to client** for client-visible content or switch to **Internal note** for staff-only content. Attach files or record a voice note from the composer. Each message menu provides the actions permitted by ownership, time window, and manager status.

Use **Settings** for mute, notification channels, lifecycle, waiting state, and participant assignment. Use **Governance** for storage usage, retention policy, legal hold, and audited export. Use **Moderation** to review reported messages and monitor the four-hour staff response target. Client Documentation list cards show unread count, last-message preview, waiting state, and a direct Chat link.

## Recovery and Maintenance

The database remains the source of truth. Existing legacy portal and WhatsApp tables were not dropped or rewritten. Migrations `0076_unified_client_chat.sql` and `0077_client_chat_governance.sql` are additive. The script `scripts/provision-client-chat-conversations.mjs` is idempotent and can verify that every folder has one conversation. Scheduled jobs can be inspected through the platform schedule management interface; business rows retain the trusted task UID for cancellation and investigation.

## Key Files

| File | Purpose |
| --- | --- |
| `server/clientChatService.ts` | Authorization, shared history, messages, media, preferences, governance, export, moderation, and scheduling |
| `server/clientChatRouter.ts` | Protected CRM procedures and Heartbeat job lifecycle |
| `server/clientPortalRoutes.ts` | Sanitized Client Portal message, polling, media, receipts, typing, and preference endpoints |
| `server/scheduledClientChatMessageHandler.ts` | Cron-only task-UID callback |
| `client/src/components/ClientChatPanel.tsx` | CRM Chat interface and controls |
| `drizzle/0076_unified_client_chat.sql` | Core additive chat schema |
| `drizzle/0077_client_chat_governance.sql` | Additive governance and scheduling fields |
| `docs/CLIENT_CHAT_VALIDATION_NOTES.md` | Detailed non-mutating validation record |

## Conclusion

The web CRM and staff mobile chat milestone is cohesive, security-focused, and ready for controlled production use. It preserves existing Client Documentation, Client Portal, Financial, Contracting, and WhatsApp data. The two explicit follow-ups are connecting a separate client-facing Home/My Applications UI when that repository is supplied and integrating a private antivirus service if ELEVAY later approves one.
