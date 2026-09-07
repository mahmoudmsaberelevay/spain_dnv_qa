# ELEVAY Client Production Implementation

- [x] Create dedicated portal identity, session, application, document, message, notification, audit, content, provider, and delivery schema.
- [x] Apply a non-destructive database migration.
- [x] Implement isolated client authentication with lockout, first-login password change, refresh rotation, reuse detection, recovery, and device revocation.
- [x] Enforce portal ownership and public-ID-only client APIs.
- [x] Implement read-only case workflow, dates, applicants, documents, secure messaging, notifications, and account deletion requests.
- [x] Implement admin-only CRM Client Portal account, message, document, program, provider, and synchronization management.
- [x] Implement official-site program synchronization with images, manual override protection, structural validation, last-known-good retention, hiding, and reactivation.
- [x] Add workflow, key-date, document, and message notifications plus staff CRM/email alerts.
- [x] Host iOS and Android association metadata for both employee and client applications.
- [x] Add focused security tests and a self-cleaning cross-client isolation verifier.
- [x] Validate the CRM production build and authenticated admin UI.
- [x] Document the post-deployment Heartbeat schedule activation and task-UID persistence step; it cannot target the production endpoint before this checkpoint is published.
- [x] Document separate EAS project creation and `EXPO_PUBLIC_EAS_PROJECT_ID` setup; Expo credentials were not available and no employee project identity was reused.
- [x] Document Android release-signing fingerprint verification after the first EAS build.
- [x] Document the pilot real-device acceptance sequence required before store submission.

## Scope correction completed

- [x] Replace the five-destination client tab bar with exactly Home and My Applications.
- [x] Make Home display CRM-managed program cards and service-provider cards.
- [x] Make My Applications display only documentation folders assigned to the signed-in client.
- [x] Route authenticated clients to the assigned primary documentation folder after sign-in.
- [x] Project the legacy CRM Client Documentation checklist into the client folder view.
- [x] Add explicit "Assign to Client App" control on the CRM Client Documentation detail page.
- [x] Clarify Client Portal account creation as credentials first, followed by documentation-folder selection.
- [x] Validate mobile TypeScript, lint, tests, web export, CRM build, and focused portal security tests.

## Unified mobile administrator access completed

- [x] Add `client` and `admin` account roles to the isolated client portal identity system.
- [x] Provision the requested administrator with a one-way bcrypt password hash and no client-folder assignment.
- [x] Use the normal mobile login form for both client and administrator accounts.
- [x] Route administrators to a role-protected mobile admin dashboard.
- [x] Add protected administrator APIs for Client Documentation folder selection and client credential creation.
- [x] Add protected administrator APIs and mobile controls for adding, editing, showing, and hiding vendors.
- [x] Verify the admin role, available documentation folders, vendor API, anonymous denial, server build, and focused security tests.

## Program PDF content update completed

- [x] Extract structured English and Arabic summaries from all 20 supplied program PDFs.
- [x] Match 19 substantive summaries to their exact residency or citizenship database records.
- [x] Skip the blank duplicate Malta PDF while using the substantive Malta citizenship and permanent-residence PDFs.
- [x] Store processing time, presence rules, investment options, benefits, eligibility, family, process, fee notes, and disclaimer in versioned structured data.
- [x] Protect PDF-derived summaries from automatic website synchronization overwrites.
- [x] Rebuild mobile program pages with bilingual at-a-glance facts, investment cards, and organized detail sections.
- [x] Validate all 19 database records, production public API delivery, mobile TypeScript, lint, tests, Expo export, Expo Doctor, CRM build, and focused portal security tests.
