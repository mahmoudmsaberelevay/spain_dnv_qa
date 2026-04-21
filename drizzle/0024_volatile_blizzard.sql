CREATE TABLE `salaryReceipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`employeeName` varchar(255) NOT NULL,
	`salaryAmount` decimal(14,2) NOT NULL,
	`deductionAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`netPaidSalary` decimal(14,2) NOT NULL,
	`forMonth` varchar(20) NOT NULL,
	`receiptDate` timestamp NOT NULL,
	`status` enum('draft','paid') NOT NULL DEFAULT 'draft',
	`linkedTransactionId` int,
	`createdBy` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `salaryReceipts_id` PRIMARY KEY(`id`)
);
