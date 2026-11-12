# ELEVAY Plaud integration and Train Your AI Agent

## Scope and release status

This is an integration in the existing CRM, not a separate application. It reads existing Plaud recordings and existing raw transcripts through Plaud's official remote MCP service. It does not record audio, generate transcription or summaries, train models, create embeddings, call an AI provider, automatically upload a dataset, or schedule collection. No paid plan is bought or activated by this implementation.

**Acceptance gate:** implementation and synthetic test success do not establish a working owner account connection. Mark the feature end-to-end complete only after an employee connects their actual Plaud account, explicitly imports one authorized recording into a permitted Lead, sees that distinct entry on the deployed shared page, and successfully downloads the matching date-range TXT. No synthetic record should be inserted into the live database to satisfy this gate.

## Routes and normal employee workflow

- Shared page: `/train-your-ai-agent`, with the exact navigation label **Train Your AI Agent**.
- On an existing permitted Lead's Notes card, choose **Import from Plaud**.
- Read and accept the company-sharing notice, then connect your own Plaud account. Authorize in Plaud's own browser page; never paste Plaud credentials into the CRM.
- Select one of your recordings whose raw transcript is available, acknowledge sharing, and import it. The import stores one existing Lead note plus linked canonical transcript provenance atomically. It never creates a Lead or assigns an unrelated recording automatically.
- Refresh the shared page or use its normal query invalidation. No second provider fetch or collection job is required for catalogue visibility or export.
- Disconnecting Plaud removes the private connection, not company notes already explicitly imported.

The fixed production OAuth callback is `https://elevay.vip/api/plaud/oauth/callback`. Private account OAuth credentials remain encrypted server-side; the browser receives an authorization redirect and connection status only. OAuth state is one-time and bound to both the CRM employee and the signed CRM session. Callback navigation is limited to approved CRM return paths.

## Deliberate shared-access policy

Every current authenticated CRM user can view and export every successful Plaud transcript attached to an existing Lead note, regardless of who imported it and without a new module permission, role or admin approval. The server independently validates a signed, unexpired, application-bound CRM session against a currently existing CRM user. The current user schema has no separate disabled-user flag; removed accounts are rejected. Automated-task identities and a decoded-only user object are not authentication.

This sharing is intentional. **Transcripts can contain identifying or sensitive client information and are not anonymized.** The connection/import notice and export interface explain this. Employees must import only recordings they are authorized to share with the company.

Unassigned recordings and connected credentials stay private to the authorizing employee. The shared page never calls everyone's Plaud accounts. Lead names/codes and View Lead links are returned only where the employee's existing scoped Lead access permits them. The transcript itself remains shared even if its linked Lead metadata is redacted. Existing Lead routes, note editing/deletion, other modules and permission endpoints are unchanged. Private import requires the existing scoped Lead edit/import permissions; this is separate from unrestricted-to-current-users catalogue access.

## Source identity and history

`plaud_transcript_imports` stores structured source `plaud`, the hashed proven account/workspace scope, exact recording identity, existing Lead ID, note ID, importer identity/name, recording title, valid call start timestamp where available, import time, effective date, duration where available, canonical plain transcript and a transcript hash. The unique import identity is derived from source scope plus recording ID, never from transcript content, title or timestamps. The note ID is also unique.

Repeated clicks and regeneration of the same source recording cannot create a second catalogue entry or overwrite its canonical imported wording. Different recordings remain separate even if their text and dates match. A recording already imported against another Lead is not silently reattached or duplicated.

The ordinary note remains in the existing Lead-note history. The canonical provenance transcript is an immutable record of the successful source import. Editing the displayed Lead note through existing note endpoints does not rewrite the canonical dataset. Removing the original note or Lead excludes its linked transcript from ordinary listing/export through the relational eligibility joins; this module does not add deletion or retention operations. Explicitly lifecycle-deleted provenance is likewise excluded. It does not reconstruct source content from a combined note or infer provenance from the word Plaud.

There was no Plaud integration/provenance structure in the implementation base, so there is no reliable legacy Plaud history to backfill. Ordinary historical notes are not inspected or relabelled. Legacy material without reliable structured source metadata and transcript boundaries is unsupported for automatic backfill.

## Dates and display

The call/recording start date is authoritative. A missing or invalid call timestamp uses the stored import timestamp, with an explicit **Import date used** indicator. Count, listing, order and export use the same stored effective date.

Business timezone is the application's canonical `Africa/Cairo`, unless a valid server-side `ELEVAY_BUSINESS_TIME_ZONE` is explicitly configured. Host and browser timezone do not silently change semantics. Date inputs are Gregorian `YYYY-MM-DD`; From and To must form a complete, non-reversed range. The UTC predicate is `[start of local From day, start of local day after To)`, using IANA timezone rules, including Cairo daylight-saving changes. Clear filters shows all eligible imported transcripts. Export requires a valid complete range.

## Exact TXT export

`GET /api/plaud/transcripts/export?from=YYYY-MM-DD&to=YYYY-MM-DD` is authenticated and same-site protected. It returns `Content-Type: text/plain; charset=utf-8`, attachment headers, private/no-store caching and a transcript count header. It creates no public storage object and retains no transcript-bearing temporary export file.

The content consists only of canonical transcript text, oldest effective call first with numeric import ID as the stable tie-breaker. Adjacent blocks have exactly three LF characters (`\n\n\n`) between them, with no trailing decorative separator, heading, metadata, wrapper, branding, added summary or AI rewriting. Genuine source paragraphs, speaker labels, timestamps, Arabic and mixed-language content remain intact. Line endings become LF and only outer whitespace is removed for block boundaries.

Export includes every eligible match, not the page/expanded rows. It streams bounded database batches under one repeatable-read snapshot, honors backpressure and has no hidden record-count limit. The UI shows progress. No matches return **No Plaud transcripts found for this date range**, not an empty misleading download. Retrieval/integrity/count failures abort the response rather than claiming successful completion. The audit trail records employee, range, timezone, count and timestamp, never transcript content. Display, count and export share the same eligibility predicate; missing/deleted note or Lead lifecycle rows are excluded consistently.

## Schema and restoration

Reviewed scoped Drizzle-generated migration `0134_plaud_transcript_imports.sql` creates only:

1. `plaud_connections` — encrypted per-employee credentials, version and refresh lease.
2. `plaud_oauth_states` — hashed one-time state/session binding, encrypted pending OAuth details and expiry.
3. `plaud_transcript_imports` — canonical source-linked successful-import provenance.

It also widens `lead_notes.note` from TEXT to MEDIUMTEXT, preserving historical contents and allowing long transcripts without silent truncation. There is no dropping/renaming of existing tables, data rewrite, permission grant or historical note backfill. Scoped migration provenance is retained because the historical project schema has unrelated drift that must not be automatically migrated.

For independent restores, include the new tables and the existing encrypted application-secret infrastructure. Restoring encrypted connections requires the same protected root secret; do not put that secret in ordinary backup reports, chat, source control or public storage. Changing the root secret requires employee reconnection; do not silently migrate credentials. Existing backup mechanisms are not redesigned by this feature.

## Validation and limitations

Synthetic coverage should include signed-current-user enforcement, private account isolation, one-time OAuth/session binding, encrypted credential binding/refresh fencing, source response parsing, duplicate imports and atomic rollback, shared catalogue with restricted Lead metadata, exact TXT bytes and large export, consistent snapshots, no matches/errors, Arabic, timezone/DST boundaries, loading/empty/range states and desktop/mobile navigation.

A real Plaud account must authorize its own supported MCP endpoint. Plaud's documented access is to the authorizing account's own recordings; shared Team files are not promised. Published schemas and an actual hosted deployment can differ; unsupported responses must produce sanitized errors rather than inventing data or silently omitting content. This implementation never automatically purchases API access or a subscription to resolve an entitlement issue.

Official references: [Plaud API access guidance](https://support.plaud.ai/hc/en-us/articles/60726890231449-How-can-I-get-API-access-to-my-Plaud-data), [Plaud MCP](https://support.plaud.ai/hc/en-us/articles/57751078986265-Plaud-MCP), [official MCP developer documentation](https://docs.plaud.ai/plaud-mcp-cli/mcp.md), and [Plaud recording retrieval coverage](https://support.plaud.ai/hc/en-us/articles/59291709269401-Why-doesn-t-the-Plaud-API-return-all-of-my-recordings).
