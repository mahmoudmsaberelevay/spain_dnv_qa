# Spain Digital Nomad Contract Template Replacement — Validation Record

**Date:** 22 September 2026

## Scope

The Contracting module’s Spain Digital Nomad contract source has been replaced with the approved `NewspainDNV.docx` supplied by the owner. The supplied file contains 19 pages and exactly three yellow-highlighted variable fields: the Arabic client name, total number of family members, and total contract value.

The approved document also repeats the sample Arabic client name once in its legal appendix without highlighting. The prepared runtime template therefore contains two client-name placeholders so the real Arabic name replaces both occurrences and no sample identity can remain in a generated contract. The family count and value each have one explicit placeholder. Yellow highlighting was removed only from those variable runs; the remaining document content, ELEVAY letterhead, headers, footers, pagination, clauses, tracked legal content, and appendices were preserved.

## Source and Variable Mapping

| Approved source value | Runtime field | Occurrences |
| --- | --- | ---: |
| Highlighted Arabic sample name | Contract `clientName` entered in the existing **Arabic Name** field | 2, including the appendix repetition |
| Highlighted family count | Contract `familyMembers` | 1 |
| Highlighted `12,000 EUR` | Authoritative total Contracting value, formatted with `EUR` | 1 |

The versioned approved template is stored in the source tree. The Spain generator now reads this local version instead of the previous session-scoped CDN URL. Other country templates remain unchanged.

## Initial Generated-Sample Verification

A fictional, non-persisted sample was generated with Arabic name **عميل تجريبي للاختبار**, four family members, and total value **14,500.75 EUR**. The output remained 19 pages. Text inspection found the fictional name in both intended locations, the family count beside the Arabic family-count label, and the formatted value beside the total-contract-value label. It found no sample name, unresolved placeholder, or yellow variable highlight.

Visual inspection of page 1 confirmed that the Arabic client name fits correctly in the second-party section and the ELEVAY letterhead, RTL layout, footer, and page structure remain intact. Visual inspection of page 5 confirmed that family count `4` and `14,500.75 EUR` appear in the intended financial clause without overlap, clipping, or broken layout.

Visual inspection of page 17 confirmed that the second Arabic client-name occurrence in the approved appendix was replaced and remains within the intended sentence without clipping or overlap. Visual inspection of page 19 confirmed that the declaration, signature lines, ELEVAY letterhead, page number, and Cairo/Dubai footer close the 19-page contract cleanly. The gold underlining visible on the final declaration is part of the approved source document and was preserved.

## Implementation Safeguards

The generator now reads the versioned local template `server/spain_dnv_contract_template_2026_09_22.docx`, identified in code as version `2026-09-22`. The runtime replacement is fail-closed: generation stops if the template does not contain exactly two Arabic client-name placeholders, one family-count placeholder, and one contract-value placeholder. XML special characters in names are escaped, and the value formatter preserves up to two decimals.

New Spain contracts retain the established pricing ladder: €12,000 for one family member, €13,000 for two, €14,000 for three or four, and €15,000 for five or more. If Contracting supplies an explicit authoritative value, the document uses that value. Re-download now passes the stored country and stored total contract value instead of silently falling back to Spain defaults, protecting both Spain and non-Spain regenerated documents.

The approved uploaded source SHA-256 is `c55d2e47af1558b6526053c62e0c3230b8e3897f773a11570b6bf13ea2be00fd`. The prepared versioned runtime template SHA-256 is `d753f9b43c4f3f5783056e3b4a7a72760c6b9ef8155ac36e99a740eee9542cce`; the expected difference is the replacement of the three highlighted sample values with explicit placeholders and removal of variable highlighting.

## Release Validation

Seven focused tests passed across the new template regression and Contract/Lead behavior suite. They verify the template version, placeholder cardinality, Arabic name replacement in both locations, family count, decimal total value, XML escaping, absence of sample data and unresolved placeholders, the unchanged Spain pricing ladder, and stored-value regeneration wiring.

The production build completed successfully with the same three documented pre-existing authentication import warnings. The repository-wide TypeScript checker continues to report 83 unrelated baseline diagnostics, including existing legacy diagnostics in `contractGenerator.ts` and `routers.ts`; the new template imports, replacement helper, versioned asset, and regression file introduced no additional diagnostic. `git diff --check` passed, temporary audit utilities were removed, and no database mutation or existing Contracting or Financial record was performed.
