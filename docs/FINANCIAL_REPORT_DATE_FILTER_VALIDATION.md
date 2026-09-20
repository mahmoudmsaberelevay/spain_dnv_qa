# Financial Reports Date Filter — Validation Record

**Date:** 20 September 2026  
**Scope:** Financial module → Reports → All Expenses, All Income, Account Statement, and Detailed Report

## Reported Behavior

The Account Statement screenshot showed From and To set to 20 September 2026 while January transactions remained visible. The active route is `/finance/reports`, and the issue was reproduced against the current Financial Reports component.

## Diagnosis

The reporting interface depended on browser-native date input behavior, while different report tabs used different date representations. All Expenses and All Income filtered strings in the browser, Account Statement sent date-only strings that the server converted directly with `new Date(...)`, and Detailed Report forwarded browser `Date` objects. End dates could resolve to midnight rather than the end of the selected day. Account Statement could also keep the previous query’s rows visible during a date refresh.

Direct controlled DOM events proved that the underlying account query could filter when React received a valid date value. This isolated the failure to date-entry normalization and stale display behavior rather than missing financial records.

## Implemented Correction

A shared financial date-range utility now provides one rule for all report paths:

- Date-only values use strict `YYYY-MM-DD` validation.
- The From boundary is `00:00:00.000` on the selected day.
- The To boundary is inclusive through `23:59:59.999` on the selected day.
- Browser calendar values are converted to stable date-only strings before the Detailed Report query.
- Existing Date-based Financial pages remain compatible through Cairo business-date interpretation.
- Reversed ranges are normalized safely.
- Empty bounds remain the explicit **All Time** default.

The transaction list and count procedures now normalize their boundaries before querying. Account Statement applies the same normalized range on the server and also filters previously cached rows immediately in the browser while a replacement query is loading. Its visible totals, running balance, transaction count, and PDF export all use the same filtered rows. The Export PDF button shows an Updating state and cannot export stale results during refresh.

The native From and To inputs now react to both input and change events, and the interface displays the active period directly below the controls. The shared calendar filter also displays the active period and prevents an inverted From/To range.

## Validation

The authenticated preview produced the following results for the one-day period 20 September 2026:

| Report | Verified result |
|---|---|
| All Expenses | Period label showed the selected day; 0 matching expenses; total recalculated to EGP 0.00 |
| All Income | 1 matching income transaction; total recalculated from that row |
| Account Statement — CIB EGP | 2 current matching movements, both dated 20 September; no January rows; totals and running balance reconciled |
| Detailed Report | Default rendered as **Period: All Time**; date selections are serialized through the shared normalized backend path |

The live database changed legitimately during validation: the CIB EGP all-time statement increased from 301 to 303 movements and the selected day increased from one to two movements. No transaction was created, updated, or deleted by this repair. The final non-mutating integration check compared the selected day with the current all-time dataset and confirmed:

- CIB EGP: 2 selected-day movements out of 303 all-time movements.
- All Expenses: 0 selected-day rows.
- All Income: 1 selected-day row.
- Detailed Report: 2 selected-day rows.
- Rows outside the selected range: 0.

Seven focused date-range tests and eight related finance/receipt regressions passed, for **15 passing tests** across three files. The production build passed. Changed-file TypeScript diagnostics were clean; the repository-wide checker still reports 86 unrelated pre-existing diagnostics. The build retained the three documented pre-existing authentication import warnings.

## Data Safety

This was a code-only reporting correction. No Financial, Contracting, receipt, invoice, client, account, or historical transaction record was changed or deleted.
