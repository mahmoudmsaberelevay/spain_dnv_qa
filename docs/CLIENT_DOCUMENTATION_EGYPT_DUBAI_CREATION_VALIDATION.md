# Client Documentation — Egypt and Dubai Creation Validation

**Date:** 21 September 2026

## Scope

Client Documentation creation now begins by asking whether the client is based in **Egypt** or **Dubai**.

- **Egypt** preserves the existing workflow. Staff must search for and select an existing Financial Client by name, code, mobile number, or email. The server independently reloads that Financial Client and uses its authoritative name, code, mobile number, and database link.
- **Dubai** does not query or create an Egypt Financial Client. Staff first enter the client name and mobile number, then continue through the existing program, family, consultant, contract-link, three-payment, and applicable Spain or Caribbean workflow fields. The server generates a non-PII documentation code in the format `DXB-YYYYMMDD-XXXXXXXX`.

## Data Model and Migration

The additive migration adds `clientOrigin` (`egypt` or `dubai`) and `clientMobile` to Client Documentation cases. Existing cases default to Egypt. Immediately after migration, the live database contained **28 cases: 28 Egypt, 0 Dubai, and 0 newly stored mobile values**, proving that no existing case was reclassified or otherwise rewritten.

Dubai cases have `finClientId = null`; Egypt cases remain linked to the selected Financial Client. Client origin and mobile are displayed in the documentation list and case detail.

## Interface Verification

The authenticated Client Documentation page rendered all 28 existing cases with an **Egypt** label. Opening **New Client** displayed the location choice as the first form stage.

The default Egypt state rendered **Select Existing Egypt Client** with search by name, code, mobile, or email. Switching the unsaved form to Dubai immediately removed the Egypt selector and rendered **New Dubai Client**, required **Client Name** and **Mobile Number** fields, and the message that the CRM generates the Dubai documentation code automatically. All remaining existing creation fields continued below unchanged. No case was created during browser verification.

## Validation

- **132 tests across 21 relevant suites passed**, covering the new origin policy plus Client Documentation, payments, Spain and Caribbean workflows, employee access, chat, Client Portal, security, and mobile compatibility.
- Production build passed.
- `git diff --check` passed.
- The full TypeScript checker retained the existing repository baseline; no new diagnostics were reported in the newly added origin policy, shared helper, creation form, detail view, or schema fields.
- Drizzle generation was attempted, but the legacy migration journal prompted for unrelated historical Marketing table rewrites. It was stopped rather than accepting unrelated changes. The reviewed additive migration was applied directly and verified.

## Safeguards

The server does not trust client-supplied Egypt names or codes. It resolves the selected Finance client by ID and rejects missing or invalid Egypt links. Dubai creation rejects any Finance-client link and requires a name plus a mobile number containing 7–15 digits. Validation did not create test clients, payment schedules, documents, chats, or portal assignments.
