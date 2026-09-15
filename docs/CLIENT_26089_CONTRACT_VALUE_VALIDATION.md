# Client 26089 Contract Value Validation

**Validation date:** 15 September 2026  
**Scope:** Contracting and Financial Client Database  
**Data handling:** Non-mutating reconciliation; no receipt, payment, invoice, or client-history record was edited or deleted.

## Authoritative Calculation

The contract stores its authoritative value **after** the one-time discount. The Financial Client Database also stores this same net value because paid and remaining balances must be calculated against the amount the client is contractually required to pay. The original family-based value is therefore a presentation projection equal to the stored net value plus the separately stored discount.

| Measure | Amount | Rule |
| --- | ---: | --- |
| Original family-based contract value | €12,000.00 | Net value plus one-time discount |
| One-time discount | €2,000.00 | Stored separately on the contract |
| Net contract value | €10,000.00 | Original value minus discount |
| Authoritative paid amount | €180.18 | Preserved from existing paid receipt history |
| Remaining balance | €9,819.82 | Net contract value minus paid amount |

## Defect and Correction

The database values were already correct. The Financial Client Database stored **€10,000.00** as the net contract value, but its interface presented that stored amount as an ambiguous “Contract Value” and then subtracted the **€2,000.00** discount again in a separate “After Discount” display. This produced the misleading presentation of **€8,000.00**, even though the stored financial record and remaining balance were correct.

The correction makes the model explicit across both modules and exports. Contracting now presents **Original Value**, **Discount**, and **Net Contract Value**. The Financial Client Database presents **Original Contract Value**, **Discount**, and **Net Contract Value**, with the original amount reconstructed as `net + discount`. The Financial PDF and CSV exports and the Contracting CSV export use the same labels and values. No balance calculation subtracts the discount a second time.

## Validation Evidence

| Validation | Result |
| --- | --- |
| Production database reconciliation | Original €12,000.00; discount €2,000.00; Contracting net €10,000.00; Finance net €10,000.00 |
| Payment preservation | Paid amount remains €180.18 |
| Remaining-balance equation | Stored €9,819.82 equals €10,000.00 minus €180.18 |
| Financial Client Database interface | Client 26089 shows €12,000.00, −€2,000.00, €10,000.00, €180.18 paid, and €9,819.82 remaining |
| Contracting interface | Client 26089 shows €12,000 original, −€2,000 discount, and €10,000 net |
| Responsive review | Both tables remain horizontally accessible at a 375 × 812 viewport |
| Focused regression suite | Four tests passed in `server/finDb.discount.test.ts` |
| Changed-file TypeScript diagnostics | No diagnostics in the modified Contracting or Finance files |
| Production build | Passed; only three pre-existing authentication export warnings were reported |
| Diff validation | `git diff --check` passed |

## Preserved Boundaries

No schema migration was required. The correction does not rewrite historical contracts, Financial Client Database rows, invoices, receipts, or payments. Existing unrelated project-wide TypeScript diagnostics remain outside this change and are not presented as part of the client 26089 correction.
