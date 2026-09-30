-- ELEVAY Financial integrity: enforce one payment projection per receipt
-- Preconditions were verified read-only on 2026-09-30:
--   * no duplicate non-null finClients.contractId values
--   * no duplicate payments.invoiceId values
-- This migration does not create, delete, or modify any financial amount.
-- It must be applied only after owner approval under the Pass 2 remediation rules.

ALTER TABLE `payments`
  ADD CONSTRAINT `payments_invoice_unique` UNIQUE (`invoiceId`),
  ADD INDEX `payments_contract_paid_idx` (`contractId`, `paidAt`);

ALTER TABLE `finClients`
  ADD CONSTRAINT `fin_clients_contract_unique` UNIQUE (`contractId`);

-- Rollback (only if the associated application deployment is rolled back first):
-- ALTER TABLE `payments`
--   DROP INDEX `payments_contract_paid_idx`,
--   DROP INDEX `payments_invoice_unique`;
-- ALTER TABLE `finClients`
--   DROP INDEX `fin_clients_contract_unique`;
