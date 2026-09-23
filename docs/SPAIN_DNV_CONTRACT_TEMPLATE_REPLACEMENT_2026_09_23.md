# Spain Digital Nomad Contract Template Replacement — 23 September 2026

## Scope

The active Spain Digital Nomad contract source has been replaced with the newly supplied `SpainDNV.docx`. The approved source is a 20-page Arabic contract and supersedes the 22 September template for all newly generated and regenerated Spain Digital Nomad contracts.

The source file SHA-256 is `1d791c878cdecb726b9ba3d33727bb07604c4f8058a0cb9d4d24cb40b0dde5d2`. The prepared runtime template SHA-256 is `2445f48c8cbade8dff11ba8577b3288287ba049cb2e326f883ccbfe4379bae14`; the expected difference is limited to replacing the supplied example values with runtime placeholders and removing their yellow highlight formatting.

## Variable Mapping

Word stores the three conceptual highlighted fields across five yellow-highlight XML runs because of the document’s internal table layout. The preparation process maps all rendered occurrences safely:

| Supplied value | Runtime source | Rendered occurrences |
| --- | --- | ---: |
| Highlighted Arabic client name | Contract `clientName` from the existing **Arabic Name** field | 1 highlighted party occurrence plus 1 repeated name in the fee annex |
| Highlighted family-member count | Contract `familyMembers` | 1 |
| Highlighted total contract value | Authoritative stored Contracting value, formatted in EUR | 1 |

The prepared template contains exactly two `{{CLIENT_NAME_AR}}` placeholders, one `{{FAMILY_MEMBERS}}` placeholder, and one `{{CONTRACT_VALUE}}` placeholder. Generation fails closed if the cardinality changes. Client names are XML-escaped, family size is inserted as an integer, and the authoritative total value supports two decimal places.

## Layout and Content Verification

A fictional, non-persisted contract was generated with an Arabic test name, four family members, and a total value of `14,500.75 EUR`. The output rendered as 20 pages.

Visual verification confirmed:

- Page 1 shows the Arabic client name in the second-party section with intact ELEVAY branding and RTL layout.
- Page 6 shows family size `4` and total value `14,500.75 EUR` in the intended financial clauses without overlap or clipping.
- Page 18 shows the repeated client name in the annex fee paragraph.
- Page 20 preserves the final declaration, signature fields, page number, Cairo/Dubai footer, and closing layout.

The generated Word XML contains the fictional name in both required locations, the supplied family size once, and the supplied value once. It contains no original sample client name, unresolved runtime placeholder, or yellow variable highlight.

## Runtime and Regression Verification

The generator now identifies the active template as version `2026-09-23` and reads `server/spain_dnv_contract_template_2026_09_23.docx`. The production asset copier places the same file beside `dist/index.js` and compares its SHA-256 after every build.

Nine focused regressions passed across the Spain template, production asset, and Contract/Lead behavior suites. The full production build passed and copied the 109,770-byte runtime template with an identical hash. Changed files produced no TypeScript diagnostics; the repository-wide checker retains 83 unrelated pre-existing diagnostics. `git diff --check` passed.

No existing contract, receipt, invoice, client, payment, or Financial record was created, edited, or deleted. The previous approved template remains in source history for legal traceability but is no longer selected by the generator or copied as the active production asset.
