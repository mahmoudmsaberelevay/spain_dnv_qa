ALTER TABLE `clientCases`
  ADD COLUMN `finClientId` int NULL,
  ADD COLUMN `contractDriveLink` text NULL;

CREATE TABLE `clientDocumentationPayments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `clientCaseId` int NOT NULL,
  `paymentName` varchar(160) NOT NULL,
  `amountEur` decimal(12,2) NOT NULL,
  `dueDate` date NOT NULL,
  `paidDate` date NULL,
  `receiptName` varchar(255) NULL,
  `receiptDriveLink` text NULL,
  `notes` text NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdByUserId` int NOT NULL,
  `updatedByUserId` int NULL,
  `archivedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `clientDocumentationPayments_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_client_documentation_payments_case`
  ON `clientDocumentationPayments` (`clientCaseId`);

CREATE INDEX `idx_client_documentation_payments_due`
  ON `clientDocumentationPayments` (`dueDate`);
