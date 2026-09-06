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
- [ ] After deployment, create the Friday Heartbeat job and persist its returned task UID.
- [ ] After Expo authentication, create the separate EAS project and configure `EXPO_PUBLIC_EAS_PROJECT_ID`.
- [ ] Confirm the Android release signing SHA-256 fingerprint after the first EAS build.
- [ ] Perform pilot real-device acceptance testing before store submission.
