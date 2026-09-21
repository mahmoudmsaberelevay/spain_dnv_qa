# Mobile Process Timeline — Backend Compatibility Validation

**Date:** 21 September 2026

## Scope

This release changes only the ELEVAY CRM backend. It does not modify, rebuild, or otherwise touch `/home/ubuntu/elevay-mobile` or any other mobile application repository. It changes no database record, Client Documentation folder, user permission, authentication flow, chat feature, News feature, or Spain workflow behavior.

## Corrected API Contract

The rich web/CRM endpoint remains unchanged:

`GET /client-api/applications/:applicationId/workflow`

For Caribbean programs, that endpoint still returns the rich workflow object containing stages, progress percentage, current stage, and payment due dates.

The two mobile process-timeline endpoints now always return a plain array after a successful lookup:

- `GET /client-api/applications/:applicationId/process-timeline`
- `GET /client-api/employee/folders/:folderId/process-timeline`

Caribbean stages are normalized to the installed mobile application contract:

```json
{
  "key": "questionnaire",
  "position": 1,
  "titleEn": "Sending the Questionnaire Form",
  "titleAr": "إرسال نموذج الاستبيان",
  "status": "completed",
  "occurredAt": "2026-09-21T10:00:00.000Z"
}
```

The normalizer maps `order` to `position`, `date` to `occurredAt`, `completed` to `completed`, `active` to `current`, and `pending` to `upcoming`. Unexpected statuses safely become `upcoming`. Missing or invalid dates become `null`. Null, empty, malformed, or extended workflow payloads cannot return a nested object or cause a conversion exception.

Spain applications continue to use `projectClientProcessTimeline()` directly, preserving the existing array and field behavior exactly. Employee folders are now program-aware and use the same Caribbean normalizer as client folders. Employee folders without a linked portal application continue to use the existing case creation date fallback; invalid or unavailable client application IDs continue to return the existing safe 404 response before database projection.

## Files Changed

| File | Change |
|---|---|
| `server/mobileProcessTimeline.ts` | New shared backend normalizer and safe date conversion |
| `server/mobileProcessTimeline.test.ts` | New focused array-contract, status, date, malformed-input, endpoint-parity, and Spain-preservation regressions |
| `server/clientPortalRoutes.ts` | Applies normalization only to Caribbean client process-timeline responses; rich workflow and Spain branches remain unchanged |
| `server/clientEmployeeDocuments.ts` | Makes employee folder timelines program-aware and applies the same Caribbean normalization |
| `docs/MOBILE_PROCESS_TIMELINE_BACKEND_COMPATIBILITY.md` | Release validation record |
| `todo.md` | Completed project task ledger entry |

## Validation

The focused validation passed **41 tests across seven files**:

- Mobile process-timeline normalization
- Caribbean workflow projection
- Spain client process timeline
- Employee mobile folder access
- Client Portal assignment
- Client Portal account creation validation
- Client Portal security

The production build passed. It retains the three documented pre-existing `server/_core/auth-routes.ts` import warnings. `git diff --check` passed.

The requested `pnpm check` was executed. It still reports **83 pre-existing repository diagnostics**, while the four implementation/test files changed by this release have **zero TypeScript diagnostics**. The baseline diagnostics are unrelated to this backend compatibility correction.

## Deployment Effect

No mobile rebuild is required. The installed mobile binary already expects a plain timeline array; the CRM backend now restores that contract for Caribbean and other non-Spain Client Documentation programs while preserving Spain behavior.
