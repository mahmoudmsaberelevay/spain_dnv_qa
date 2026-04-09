CREATE TABLE `finAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'EGP',
	`balance` decimal(14,2) NOT NULL DEFAULT '0',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finAccounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finCategories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finCategories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finClients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int,
	`name` varchar(255) NOT NULL,
	`phone` varchar(64),
	`contractValue` decimal(12,2),
	`familyMembers` int,
	`consultant` varchar(128),
	`stage` enum('not_yet','started') NOT NULL DEFAULT 'not_yet',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finClients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finCommissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`finClientId` int NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`consultant` varchar(128),
	`contractValue` decimal(12,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finCommissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finEmployees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`role` varchar(128),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finEmployees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('income','expense','transfer') NOT NULL,
	`description` varchar(500) NOT NULL,
	`accountId` int,
	`categoryId` int,
	`fromAccountId` int,
	`toAccountId` int,
	`exchangeRate` decimal(10,4),
	`amount` decimal(14,2) NOT NULL,
	`convertedAmount` decimal(14,2),
	`note` text,
	`employeeId` int,
	`finClientId` int,
	`transactionDate` timestamp NOT NULL,
	`balanceBefore` decimal(14,2),
	`balanceAfter` decimal(14,2),
	`balanceBefore2` decimal(14,2),
	`balanceAfter2` decimal(14,2),
	`createdBy` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finTransactions_id` PRIMARY KEY(`id`)
);
