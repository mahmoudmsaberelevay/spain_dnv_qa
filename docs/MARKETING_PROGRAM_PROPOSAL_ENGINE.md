# Marketing Program Proposal Engine

**Author:** Manus AI  
**Last verified:** 9 September 2026

The Marketing **Program Proposal** page now uses a deterministic, source-based calculator for the 12 programme summaries supplied by ELEVAY. Each programme exposes only its applicable investment routes and criteria. The cost engine calculates confirmed amounts first; AI is limited to writing the overview and recommendation and cannot alter the itemized lines or total.[1] [2]

> **Quote rule:** Only source-supported one-time amounts are included in **Total Known One-Time Cost**. Recurring costs, optional illustrations, ambiguous charges, missing fee schedules, and “provided on request” fees are shown separately and excluded from the total.

## Supported Programmes and Inputs

| Programme | Routes | Programme-specific inputs |
| --- | --- | --- |
| Antigua & Barbuda Citizenship | NDF, Higher Education, approved real estate, business establishment | Spouse; children 0–11; children 12–17; other adult dependants; parents 55+ |
| Dominica Citizenship | Contribution, approved real estate | Standard/Iranian due-diligence schedule; spouse; dependant age bands; parents 65+; additional members beyond four by age; optional expedited passport; property value |
| Egypt Residency | Real estate for one, three, or five years; bank deposit for one or three years | Property value for the selected real-estate term |
| Hungary Guest Investor Residency | Property fund, residential real estate, public donation | Property value; optional expected annual rental income |
| Latvia Residency | Capital, financial investment, government bonds, real estate | Spouse; children; property value |
| Malta Permanent Residency | Property purchase or rental | Spouse; children; spouses of dependent children; parents; grandparents; purchase value or annual rent |
| Nauru Citizenship | Treasury Fund contribution | Total family; siblings; dependants aged 16+; passport count |
| São Tomé & Príncipe Citizenship | National Development Fund contribution | Total family; adult applicants; passport count |
| St. Kitts & Nevis Citizenship | SISC, developer real estate, private real estate, public benefit | Spouse; dependant age bands; parents 55+; additional members beyond four by age; property value; optional accelerated schedule |
| St. Lucia Citizenship | NEF, approved real estate, government bonds, enterprise | Spouse; dependant age bands; parents 55+; siblings; additional dependants beyond three by age; post-approval newborn/spouse/dependant additions |
| Türkiye Citizenship | Real estate, capital investment, job creation | Property value; selectable 1–6% transfer-tax rate; optional annual property-cost illustration |
| Vanuatu Citizenship | Development Support Programme contribution | Spouse; children under 18; other adult dependants; restricted-nationality eligibility note |

All selector definitions, source filenames, programme currencies, route rules, and disclosure text are centralized in the shared catalogue.[1]

## Calculation Controls

The server validates that the selected route belongs to the selected programme and validates all visible fields against their type, minimum, maximum, and select-list options. Family-package programmes require users to allocate every member beyond the included package into the correct age surcharge group. This prevents a total from being calculated with missing age data.[2]

| Control | Behavior |
| --- | --- |
| Fixed programme route | Adds the supplied fixed investment amount |
| Family tier | Selects the supplied tier using total applicant count |
| Property value | Enforces the supplied minimum before applying percentage costs |
| Per-person fees | Multiplies the supplied fee by the applicable applicant/passport count |
| Age-based fees | Uses the explicit age-band fields entered in the form |
| Nationality schedule | Applies only the selected source-listed schedule, such as Dominica standard or Iranian due diligence |
| Percentage cost | Applies the source-listed rate to its identified base, such as property value |
| Recurring cost | Shows the annual amount but excludes it from the one-time total |
| Unclear calculation base | Displays **Confirmation required** and excludes the amount |
| Missing route amount | Marks the proposal **Price confirmation required** rather than inventing a total |

## Proposal Result and PDF

The result shows every line’s category, formula, amount, and inclusion status. It then displays the known one-time total, assumptions, unresolved costs, source-based programme overview, and ELEVAY recommendation. The PDF print view includes the same selected criteria, itemized lines, formula notes, inclusion status, total, source filename, assumptions, and non-guarantee notice.[2] [3]

The quote status is:

| Status | Meaning |
| --- | --- |
| **Complete known-cost quote** | All configured costs are calculable and no excluded cost is known |
| **Partial — exclusions listed** | The known total is valid, but recurring, ambiguous, or request-only items are separately disclosed |
| **Price confirmation required** | The source does not provide a monetary investment amount for the selected route |

## Validation Evidence

The automated suite verifies all 12 programmes, every configured route, family tiers, age bands, nationality schedules, percentage formulas, recurring-cost exclusions, ambiguous-fee exclusions, route authorization, deterministic fallback, and structured AI narrative behavior. A controlled authenticated browser scenario for **Vanuatu, family of five** produced an itemized total of **USD 200,000**: USD 190,000 contribution, USD 5,000 passport delivery, and USD 5,000 due diligence. No CRM record was created.[2] [4]

| Validation | Result |
| --- | --- |
| Proposal regression scenarios | 18 passed |
| Complete Marketing regression suite | 4 files / 34 tests passed |
| Production build | Passed with three pre-existing build warnings |
| Desktop authenticated UI | 12 programmes visible; dynamic fields and itemized result verified |
| Mobile viewport | Direct access and responsive programme/route form verified at 375 × 812 |

## Operational Safeguards

Programme pricing is commercial and can change. Before sending a proposal, staff should review all amber confirmation items, request missing professional or legal fees, confirm current government schedules, and ensure dependant definitions match the client. The calculator does not provide legal or tax advice and never guarantees approval.

To update a programme, revise the shared catalogue and deterministic calculation branch together, add a regression scenario for the change, then rerun all Marketing tests and the production build before publication.

## References

[1]: ./research/PROPOSAL_PRICING_SOURCES.md "Program Proposal pricing source register"
[2]: ../server/marketingProposalCalculator.ts "Deterministic Program Proposal calculation engine"
[3]: ../client/src/pages/marketing/ProgramProposal.tsx "Dynamic Proposal form, itemized results, and PDF print view"
[4]: ../server/marketingProposalService.test.ts "Program Proposal regression scenarios"
