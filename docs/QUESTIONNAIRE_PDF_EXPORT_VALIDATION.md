# Client Documentation Questionnaire PDF Export — Validation Record

**Date:** 22 September 2026  
**Scope:** Caribbean/non-Spain Client Documentation questionnaires, including current drafts, submitted questionnaires, and future questionnaire versions

## Delivered Behavior

The Caribbean Client Documentation panel now shows **Export Questionnaire PDF** whenever a questionnaire has started. Authorized Client Documentation staff can download the authoritative questionnaire directly from the CRM without opening the client questionnaire link.

The export includes the client identity and code, program, questionnaire version, lifecycle status, started/last-saved/submitted/generated timestamps, every question in the stored questionnaire definition, every answer, required/optional labels, bilingual question labels, and all repeatable-table rows. Draft exports clearly identify unanswered questions; submitted exports preserve the final answers.

## Current and Future Questionnaire Support

A new additive `definitionJson` snapshot is stored with every questionnaire. Existing questionnaire records were backfilled with the current versioned definition without changing their answers, status, saved step, or timestamps. New drafts and submissions persist their exact definition automatically.

The staff review and PDF generator read the questionnaire's stored definition rather than assuming only the latest form. This protects historical exports if questions, sections, answer types, or repeatable-table fields change later. If a legacy record lacks a valid snapshot, the system falls back safely to the current definition. Meaningful compatibility fields not represented in the snapshot are included in an **Additional Stored Answers** section; empty compatibility-only fields are omitted.

## Authorization and Audit

The export is a protected CRM procedure. It requires an authenticated staff session and Client Documentation module access. Users with `none` access are rejected. Every successful export creates an audit-log entry with case ID, questionnaire public ID, version, status, question count, and answer count. Raw answers are not written to the audit metadata.

The export does not mutate questionnaire answers, statuses, Client Documentation workflow stages, clients, contracts, payments, or Financial records.

## PDF and Runtime Design

The PDF is generated server-side with PDFKit and bundled Unicode-capable fonts. The file is returned to the browser as a PDF payload and downloaded with a safe deterministic filename. The production build copies and hash-verifies the two required fonts beside the compiled server bundle, preventing the missing-runtime-asset failure class.

The document uses ELEVAY navy and teal branding, page headers and footers, page numbering, section banners, required/optional markers, answer cards, repeatable-row blocks, and export provenance.

## Verification Evidence

- The additive migration was applied successfully.
- Every existing questionnaire record has a valid stored definition snapshot.
- Existing answer JSON, status, current saved step, started time, last-saved time, and submitted time were preserved.
- A read-only live-data verifier generated PDFs for every existing questionnaire: one draft and one submitted record.
- The draft PDF contained 230 questions with 18 answered; the submitted PDF contained 230 questions with all 230 answered.
- The submitted export rendered as a valid 44-page PDF; the draft rendered as a valid 41-page PDF.
- Visual inspection confirmed the branded first page, repeatable-table row layout, and clean final declaration/provenance page.
- An authenticated browser check displayed the new button on a submitted questionnaire and downloaded a valid 44-page PDF through the real CRM procedure.
- Temporary downloaded PDFs and live-data verification artifacts were deleted after verification.
- **45 focused tests across four suites passed.**
- The production build passed and copied the Spain contract template plus both questionnaire PDF fonts with matching SHA-256 hashes.
- Changed questionnaire PDF files have no TypeScript diagnostics. The repository-wide checker continues to report **83 unrelated pre-existing diagnostics**, including the established legacy `server/routers.ts` lines outside this feature.
- `git diff --check` passed.

## Data Safety

This release used additive schema changes only. No questionnaire answer, lifecycle status, client, contract, receipt, invoice, payment, document, chat, or Financial record was deleted or rewritten. The only existing-record update was the questionnaire-definition snapshot backfill required to keep current and future exports version-accurate.
