ALTER TABLE `invoices`
ADD COLUMN `receiptDate` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `invoices`
SET `receiptDate` = `createdAt`;
