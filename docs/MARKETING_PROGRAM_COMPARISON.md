# Marketing Program Comparison

**Author:** Manus AI  
**Updated:** 9 September 2026

## Overview

The Marketing module's **Program Comparison** now presents two clearly labelled catalogs: **Residency Programs** and **Citizenship Programs**. A user can select two to six programs from either catalog, allowing Residency-to-Residency, Citizenship-to-Citizenship, and Residency-to-Citizenship comparisons in one report.

The comparison retains the existing eight criteria: government cost, processing time, family inclusion, investment or qualification basis, qualification, route to citizenship, route to permanent residence, and renewal. Results and printable exports label every selected program by pathway category so temporary residence, permanent residence, and direct citizenship are not presented as equivalent statuses.

## Residency Catalog

| Category | Programs available |
|---|---|
| Residency | Spain Digital Nomad Residency; Portugal D7 Residency; Portugal D8 Digital Nomad; Portugal D2 Entrepreneur; Greece Golden Visa; Malta Permanent Residence; UK Expansion Worker; Canada Skilled Migration |
| Citizenship | Dominica; Grenada; Egypt; Saint Kitts & Nevis; Saint Lucia; Antigua & Barbuda; Vanuatu; Nauru; São Tomé & Príncipe; Turkey |

Spain's entry follows the official international teleworker framework, including the distinction between an overseas visa and an in-country residence authorization.[1] Portugal's D7, D8, and D2 entries follow the Ministry of Foreign Affairs classification of residence pathways for passive income, remote work, and entrepreneurs.[2] Greece is classified as an investor permanent residence permit.[3] Malta MPRP is classified as permanent residence and remains explicitly distinct from citizenship.[4] The UK Expansion Worker entry states that the route is temporary and does not itself permit permanent settlement.[5] Canada Express Entry is identified as a system managing skilled-worker applications for permanent residence.[6]

## Data and AI Safeguards

The server accepts only known, unique program keys. Unknown selections are excluded and at least two valid programs remain mandatory. Residency source facts are supplied directly to the comparison model with official links and explicit **verify before filing** caveats where fees, thresholds, processing times, or filing practices vary.

The AI request uses a strict JSON schema for the selected programs and all eight criteria. Its instruction prohibits invented legal timelines, tax claims, travel counts, fees, eligibility rules, or nationality conditions. It must distinguish temporary residence, permanent residence, and citizenship, preserve filing caveats, and avoid guaranteeing approval.

## Validation

The authenticated comparison screen displayed all eight Residency programs and all ten Citizenship programs on desktop and mobile. A controlled Spain Residency versus Dominica Citizenship comparison returned HTTP 200 with both category labels, all eight criteria, a professional recommendation, and the printable export control. No comparison or client database record was created or modified because this comparison flow remains transient.

Three focused regressions passed, covering catalog completeness, unique keys, category grouping, result labels, Residency data availability, strict structured output, and non-fabrication instructions. The production build also completed successfully.

## References

[1]: https://prie.comercio.gob.es/en-us/paginas/teletrabajadores-caracter-internacional.aspx "Government of Spain — Digital nomads (international teleworkers)"
[2]: https://vistos.mne.gov.pt/en/national-visas/general-information/type-of-visa "Portugal Ministry of Foreign Affairs — National Visa Types"
[3]: https://migration.gov.gr/en/golden-visa/ "Greek Ministry of Migration and Asylum — Golden Visa"
[4]: https://residencymalta.gov.mt/legal-framework-mprp-2/ "Residency Malta Agency — Malta Permanent Residence Programme"
[5]: https://www.gov.uk/uk-expansion-worker-visa "GOV.UK — UK Expansion Worker visa"
[6]: https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry.html "Government of Canada — Express Entry"
