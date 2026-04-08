CREATE TABLE `contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractCode` varchar(32) NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`invoicingName` varchar(255),
	`clientMobile` varchar(32),
	`familyMembers` int NOT NULL,
	`contractValue` decimal(10,2) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'EUR',
	`status` enum('pending','signed','cancelled') NOT NULL DEFAULT 'pending',
	`consultantName` varchar(128),
	`docUrl` text,
	`driveFileId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contracts_contractCode_unique` UNIQUE(`contractCode`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceCode` varchar(32) NOT NULL,
	`contractId` int NOT NULL,
	`contractCode` varchar(32) NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`amountEur` decimal(10,2) NOT NULL,
	`amountEgp` decimal(12,2),
	`exchangeRate` decimal(10,4),
	`status` enum('unpaid','paid') NOT NULL DEFAULT 'unpaid',
	`pdfUrl` text,
	`driveFileId` varchar(255),
	`notes` text,
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceCode_unique` UNIQUE(`invoiceCode`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`invoiceId` int NOT NULL,
	`amountEur` decimal(10,2) NOT NULL,
	`amountEgp` decimal(12,2),
	`exchangeRate` decimal(10,4),
	`paidAt` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
