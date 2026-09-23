# Lead Owner Account Merge — Validation Record

**Validation date:** 23 September 2026  
**Scope:** Historical Lead ownership, Lead task assignment, active employee selectors, and authenticated ELEVAY user linkage

## Result

Historical data was not deleted. It had been split between legacy short names and current full usernames. The data has now been consolidated into the current ELEVAY user identities wherever the employee-to-user match was unambiguous.

The most important correction is for **Nouran Mamdouh**. Records stored as `Nouran`, `Nouran Mamdouh`, or the employee spelling `Nourhan Mamdouh` are now consolidated under the authenticated account `nouran.mamdouh@elevay.com`, user ID `12484156`. The authenticated All Leads filter shows **4,760 Leads**, and the Tasks owner filter shows **1,420 tasks** under Nouran Mamdouh.

The same controlled normalization was applied to Basmala, Eman, Fouad, Hager, Mahmoud, Marwa, and Ziad. All **7,001 assigned Leads** now carry both the canonical displayed owner and the corresponding authenticated user ID. Old short-name aliases no longer appear in the Lead Owner or Task Owner selectors.

| Canonical owner | Linked user ID | Leads after merge | Tasks after merge |
|---|---:|---:|---:|
| Basmala Shereef | 12484160 | 4 | 2 |
| Eman Ahmed | 12484158 | 926 | 2,243 |
| Fouad Abdo | 933919 | 6 | 235 |
| Hager Hany | 12484157 | 236 | 1 |
| Mahmoud Saber | 120001 | 102 | 0 |
| Marwa Abdallah | 12484159 | 966 | 1,275 |
| Nouran Mamdouh | 12484156 | 4,760 | 1,420 |
| ziad.elshurafa | 191 | 1 | 0 |

## Preservation Checks

In the controlled immediate before-and-after migration snapshot, the database retained exactly **9,620 Leads** and **5,258 Lead tasks**. Lead ID totals, Lead creation-time totals, task ID totals, task creation-time totals, and task due-date totals were unchanged. No Lead, task, status, due date, completion state, note, activity, contact detail, attribution, or historical timestamp was deleted or rewritten beyond the ownership identity fields. Normal live task creation continued afterward and is independent of this migration.

The post-migration audit found **zero residual short-name aliases** in both `leads.assignedTo` and `lead_tasks.assignedTo` for the corrected personnel.

## Future Protection

The protected personnel endpoint still begins with every active employee, but it now resolves each employee to the current authenticated username using exact ELEVAY email identity first, then exact or unique safe name matching. Lead creation, Lead editing, single assignment, bulk assignment, and task creation all persist the canonical username. Lead records also persist the supported authenticated user ID, preventing future ownership splits when employee display names change.

Authenticated browser verification confirmed the canonical owner roster, **4,760** Nouran Leads, and **1,420** Nouran tasks. Thirty-seven focused regressions passed, the production build passed, `git diff --check` passed, and the repository TypeScript baseline remained at 83 unrelated pre-existing diagnostics with zero diagnostics in changed files.
