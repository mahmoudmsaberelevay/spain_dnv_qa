CREATE TABLE `commissionReceiptItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receiptId` int NOT NULL,
	`clientId` int NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`commissionFor` varchar(100) NOT NULL,
	`amountEur` decimal(14,2) NOT NULL,
	`amountEgp` decimal(14,2) NOT NULL,
	`linkedTransactionId` int,
	CONSTRAINT `commissionReceiptItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `commissionReceipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`employeeName` varchar(255) NOT NULL,
	`forMonth` varchar(20) NOT NULL,
	`eurToEgpRate` decimal(10,4) NOT NULL,
	`totalAmountEur` decimal(14,2) NOT NULL,
	`totalAmountEgp` decimal(14,2) NOT NULL,
	`receiptDate` timestamp NOT NULL,
	`status` enum('draft','paid') NOT NULL DEFAULT 'draft',
	`createdBy` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `commissionReceipts_id` PRIMARY KEY(`id`)
);
