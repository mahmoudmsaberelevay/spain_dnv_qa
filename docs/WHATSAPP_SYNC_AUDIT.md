# WhatsApp Synchronization Audit

## Initial Production Findings — 10 September 2026

The WhatsApp Quality Control database contains 1,052 unique messages across 38 conversations. The latest stored inbound message is dated 27 August 2026, and the latest stored outbound message is dated 28 July 2026. This confirms that the CRM feed is not currently receiving all live chat activity.

The external WhatsApp bridge responds to health requests but reports **disconnected**. Its QR recovery page is reachable and is attempting to generate a new linking code. The CRM contains no active WhatsApp Cloud API configuration, so the disconnected bridge is the current blocking dependency for broad chat capture.

The initial code audit also identified missing durable delivery/read status tracking, inconsistent timestamp units between webhook sources, no persisted webhook-health or retry ledger, and hardcoded bridge connection settings. These findings require remediation before synchronization can be reported as fully monitored.

No chat records, contacts, messages, or WhatsApp account settings were changed during this initial audit.

## CRM Hardening Completed

The linked-device architecture remains the existing **WhatsApp Web bridge**; the CRM was not migrated to Meta Cloud API. Bridge webhook ingestion now validates the shared bridge credential with constant-time comparison, validates payload shape, normalizes Unix-second, Unix-millisecond, and ISO timestamps to milliseconds, and persists a durable event ledger before returning success. Stable WhatsApp message IDs remain the source of truth for idempotency, and duplicate deliveries are acknowledged without creating duplicate chat rows.

Media mappings are unique per message. New image, video, audio, and document payloads record pending, downloaded, failed, and enriched outcomes. System messages are retained instead of discarded. Audio messages can store the original transcript plus faithful Arabic and English versions, while supported PDF and Word documents retain extracted text. An administrator-only recovery action can retry stored audio and document enrichment in controlled batches.

The WhatsApp dashboard no longer displays a static active label. It probes the bridge every 30 seconds and distinguishes **connected**, **connected but stale**, **disconnected**, and **unreachable** states. It shows last inbound/outbound activity, accepted/duplicate/failed events, media backlog, transcript backlog, and document-text backlog. Current conversations and chats refresh every 15 seconds; group and media views refresh in the background. Conversation and group lists remain sorted by client or group name and are not connected to the Leads module.

Migration `0075_whatsapp_bridge_monitoring.sql` added the event ledger, unique media mapping, bilingual transcript fields, system-message support, and corrected legacy second-scale timestamps without deleting or rewriting chat content. Production verification preserved all 1,052 messages and 38 conversations, left media mappings unique, and removed every controlled synthetic verification artifact after confirming first-delivery insertion and duplicate suppression.

Ten focused WhatsApp bridge tests pass, and the production build completes successfully. Existing unrelated TypeScript watcher errors and three longstanding authentication build warnings remain outside this change.

## Remaining Reconnection Blocker

The external bridge at `35.231.217.0:3001` remains reachable but reports **disconnected**, and its QR page remains stuck while the service is not restarted. Google Cloud access is open at account verification, but the phone approval has not completed. Until the bridge VM is restarted and the WhatsApp linked device scans a fresh QR code, new real WhatsApp chats cannot resume entering the CRM. The dashboard now reports this truthfully rather than presenting a false healthy state.

After Google approval, the remaining controlled sequence is: restart the existing Compute Engine instance or bridge service, verify `/health` reports connected or QR-ready, scan the QR in WhatsApp Linked Devices if required, send one approved inbound text and one approved media message, verify exactly-once storage and bilingual audio processing, and confirm historical message counts remain intact.

## Official Platform Requirements

Meta's current WhatsApp Business Platform documentation confirms that the `messages` webhook carries both inbound messages and outbound `sent`, `delivered`, `read`, `played`, and `failed` status notifications. Meta may retry failed webhook deliveries for up to seven days, so durable idempotency is required. The current CRM handler processes `messages` but ignores `statuses`, leaving outbound delivery and read monitoring incomplete.

The official Groups API documentation also defines lifecycle, participant, settings, suspension, and aggregated group-message status webhooks. These capabilities apply to WhatsApp Business Platform groups configured for the business account; they do not restore the currently disconnected legacy linked-device bridge automatically.

Sources:

1. Meta, **WhatsApp webhooks**, updated 26 June 2026: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview
2. Meta, **Status messages webhook reference**, updated 21 May 2026: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status
3. Meta, **Webhooks for Groups API**, updated 21 May 2026: https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/webhooks/

## Reconnection Attempt — 13 September 2026

The external endpoint at `35.231.217.0:3001` remains reachable and returns HTTP 200 with `status: disconnected` and `qrReady: false`. The existing bridge therefore still needs a service or VM restart before a fresh linked-device QR can be generated. Google Cloud access was restored using the authorized ELEVAY account, and temporary Cloud Shell access was approved for read-only project and VM discovery before any restart. The available projects include Avatr, Elevay backup, Manus Backup, and Contracts; the bridge-owning project and VM are being identified by the fixed external IP before any resource action.

The `Elevay backup` project is accessible but currently redirects Compute Engine to the API enablement page, so it has not been changed. The temporary Cloud Shell environment provisioned successfully, but its OAuth relay has not yet produced a stable terminal session in the automated browser; discovery therefore continues through the console project list and existing public bridge endpoint without enabling APIs in the wrong project.

The signed-in `mahmoud.saberelevay@gmail.com` account exposes four projects—Avatr, Elevay backup, Manus Backup, and Contracts—and all four redirect Compute Engine to the API enablement page. None can be identified as the running host behind `35.231.217.0`. The original Google sign-in chooser showed `mahmoudsaber.ali3488@gmail.com`; this alternate account is the next recovery path because the current account does not expose the bridge-owning Compute project.

At the user's direction, all cloud billing and paid-service paths were stopped. The existing no-cost QR page at `http://35.231.217.0:3001/qr` is reachable and refreshes automatically, but it remains on **Generating QR code** while `/health` continues to report `disconnected` with `qrReady: false`. No billing action, paid API activation, new hosting, or Meta Cloud API change was made.

The confirmed Google account's **All projects** view contains only Manus Backup, Contracts, Elevay backup, and Avatr; none exposes the bridge VM through Compute Engine. The bridge's direct `/api/restart` request temporarily interrupted the endpoint but did not produce `qrReady: true` after more than two minutes of polling. The QR page remains open and ready to display a code as soon as the existing host process successfully initializes WhatsApp Web.

## Successful No-Cost Reconnection — 13 September 2026

The historical task record confirmed that the bridge runs on the existing Manus Cloud Computer, not on a Google Compute Engine VM. No Google billing, paid API, new hosting, or Meta Cloud API was enabled. The original `wa-bridge.service` was still active, but its saved linked-device session had been logged out. The expired `auth_info` directory was archived privately with root-only permissions, removed, and regenerated through the existing WhatsApp Linked Devices QR process.

The QR page now refreshes automatically every eight seconds while pairing is pending so it follows WhatsApp's rotating code. After the replacement code was scanned, the local health endpoint returned `connected`, `qrReady: false`, and the QR page changed to **WhatsApp Connected**.

A controlled live inbound text produced one accepted bridge event and one duplicate replay event. The database stored exactly one new message, increasing the preserved count from 1,052 to 1,053, while duplicate message identifiers remained zero. The dashboard showed Bridge connected, one accepted event, one deduplicated replay, zero failures, and zero media backlog. All 38 existing conversations remained present.

The recovery procedure and no-cost boundary are recorded in the Cloud Computer's `AGENTS.md`. The only remaining maintenance recommendation is to rotate the legacy shared bridge credential during a separately approved maintenance window; this does not block the current connected synchronization.
