# Conditional Schengen Appointment Workflow Validation

## Scope

This validation covers the additive Client Documentation rule requested on 14 September 2026: when a client is explicitly recorded without a valid Schengen visa, the system exposes a **Schengen Appointment Date** entry, inserts a conditional timeline step immediately after **Embassy Email**, and creates one idempotent client reminder from the second day after the Embassy Email until the appointment date is recorded.

## Desktop Verification

An existing no-visa Client Documentation folder was opened in the authenticated preview without saving any change. The page rendered the established **Schengen Visa — None** state, the Embassy Email date, the explanatory line **“Schengen booking reminder: second day after this email”**, and the new **Schengen Appointment Date** action. Existing payments, employee access, milestones, documents, and Client App assignments remained available.

Opening the new action displayed a dedicated date dialog that states the reminder stops after the appointment is recorded. The dialog used the Embassy Email date as the minimum selectable date and made no change during verification. A full phone-width capture at 375 × 812 pixels confirmed the new action remains visible in the existing responsive action grid and that the surrounding Client Documentation controls remain usable.

## Data-Safety Check

The migration added one nullable `schengenAppointmentDate` column. The pre-release count-only audit found 24 existing Client Documentation folders, 11 currently recorded without a valid Schengen visa, zero existing Schengen appointment values, and zero active Client Portal accounts immediately eligible for this new reminder. Therefore, publication will not cause a historical reminder burst.

## Automated Validation

Five focused suites passed with 22 tests. Coverage includes the nullable additive migration, no-visa scope validation, Embassy Email ordering, exact conditional timeline placement, valid-visa exclusion, second-day boundary, appointment stop condition, delivery idempotency, shared Client Portal timeline projection, and existing Spain workflow preservation. The production build completed successfully.

The existing `client-lifecycle-reminders-daily` Heartbeat remains enabled at `0 0 6 * * *` UTC and last completed on 14 September 2026. The new rule reuses that durable Autoscale-compatible job; no duplicate schedule was created. Recent authenticated desktop and phone-width checks produced no new Schengen workflow, Client Documentation, portal, or lifecycle request failures.

## Operating Rule

The reminder is eligible when `schengenVisaValid` is explicitly false, an Embassy Email date exists, no Schengen Appointment Date exists, and at least two Cairo calendar days have elapsed. Its stable idempotency key permits one delivery for that Embassy Email date. Recording an appointment stops the outstanding state while preserving delivery and lifecycle history. Changing the Embassy Email after an appointment is protected so the email cannot be cleared or moved after the recorded appointment date.
