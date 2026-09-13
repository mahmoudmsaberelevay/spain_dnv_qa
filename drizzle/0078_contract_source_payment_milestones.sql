-- Additive ELEVAY Contract-source and Client Documentation payment-milestone migration.
-- Existing Contract and payment records remain unchanged; new fields are nullable for legacy compatibility.

ALTER TABLE `contracts` ADD COLUMN `clientOrigin` ENUM('referral','marketing') NULL AFTER `consultantName`;
ALTER TABLE `contracts` ADD COLUMN `marketingLeadId` INT NULL AFTER `clientOrigin`;
ALTER TABLE `contracts` ADD INDEX `idx_contracts_marketing_lead` (`marketingLeadId`);

ALTER TABLE `clientDocumentationPayments` ADD COLUMN `paymentMilestone` ENUM('signed','submission','approval') NULL AFTER `amountEur`;
ALTER TABLE `clientDocumentationPayments` MODIFY COLUMN `dueDate` DATE NULL;
ALTER TABLE `clientDocumentationPayments` ADD INDEX `idx_client_doc_payments_case_milestone` (`clientCaseId`, `paymentMilestone`, `archivedAt`);
