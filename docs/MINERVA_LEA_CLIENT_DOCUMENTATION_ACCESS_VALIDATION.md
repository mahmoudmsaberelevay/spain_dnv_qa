# Minerva and Lea Client Documentation Paralegal Access — Validation Record

**Date:** 23 September 2026  
**Author:** Manus AI

## Outcome

Minerva and Lea are now supported as assignable **Client Documentation paralegals**. Their existing ELEVAY staff accounts remain standard user accounts. Both accounts have full Client Documentation module access and one synchronized legacy `client_docs` permission row with view, create, and edit enabled.

The Financial employee directory identifies both staff members as active Paralegals. The Client Documentation assignment dialog and dashboard filter now include **Minerva** and **Lea**. The server accepts either name when a case is created or reassigned, and assigned-case notifications resolve to `minerva.aguilar@elevay.com` and `lea.guerrero@elevay.com`.[1] [2]

## Authorization and Data Integrity

Neither user was promoted to administrator or owner. This update did not change their existing permissions in Contracting, Application Analysis, Financial, Leads, Marketing, Reports, WhatsApp Quality Control, Backup, or AI Council. Their Financial, Backup, and AI Council access remains disabled.

The `clientCases.paralegal` enum was expanded additively from Madonna, Monica, Marina, and Marwa to include Minerva and Lea.[3] Before and after the migration, the live database contained the same 29 Client Documentation folders: 16 assigned across existing paralegals and 13 unassigned. No client folder was reassigned, and no client, document, payment, contract, receipt, message, portal account, or financial-history record was modified.

## Verification

The live database confirms one user account per requested email, active Paralegal employee classification, full `clientDocs` module access, and one complete `client_docs` page-permission row per user. Fifty focused tests passed across assignment, employee folder access, mobile employee access, notifications, Spain workflow, Caribbean workflow, origin handling, and the existing Marwa regression. The production build and `git diff --check` passed.

The repository-wide TypeScript check retains 83 unrelated baseline diagnostics. None occur on the lines changed for this update. The automatic Drizzle generator was stopped when its legacy journal requested an unrelated `marketing_plans` column decision; the reviewed one-line additive migration was applied directly instead of accepting unrelated schema changes.

Both users should sign out and sign back in before testing so their sessions refresh. Mahmoud can then open any Client Documentation folder and use **Assign/Change Paralegal** to select Minerva or Lea. Both users also appear in **Employees with access** because they have full Client Documentation module authority.

## References

[1]: ../server/emailService.ts "ELEVAY team notification recipient mapping"
[2]: ../server/clientPortalRoutes.ts "Client Portal staff notification recipient mapping"
[3]: ../drizzle/0089_client_documentation_minerva_lea_paralegals.sql "Additive Minerva and Lea paralegal enum migration"
