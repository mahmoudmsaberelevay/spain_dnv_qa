# Project TODO

- [x] Audit current Meta monitoring, CAPI outbox, assignment, connector, and UI implementation against live evidence
- [x] Persist privacy-safe delivery provenance for each CRM event attempt without exposing credentials or raw payloads
- [x] Represent Production CAPI approval blocking as `approval_gated` instead of false retry exhaustion
- [x] Add `metaSyncStatus` filter to the read-only `get_meta_lead_monitoring` connector
- [x] Improve Meta Ops loading states and pending-event diagnostics without changing existing access controls
- [x] Add or update focused Vitest coverage for provenance, approval gate, connector privacy/filtering, and UI status mapping
- [x] Apply additive database migration and verify existing records remain intact
- [x] Run focused tests, TypeScript/build checks, and visual verification
- [x] Verify Production CAPI remains disabled and no automatic retry, Backfill, or reconciliation mutation occurs
- [x] Save and publish a checkpoint with the completed fixes
