CREATE TABLE `upcomingPayments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`finClientId` int,
	`consultant` enum('Mahmoud','Fouad','Kirolos','Ziad') NOT NULL,
	`paymentFor` enum('First','Second','Third') NOT NULL,
	`dueDate` date NOT NULL,
	`dueAmount` decimal(12,2) NOT NULL,
	`paidAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`status` enum('Pending','Done') NOT NULL DEFAULT 'Pending',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `upcomingPayments_id` PRIMARY KEY(`id`)
);
