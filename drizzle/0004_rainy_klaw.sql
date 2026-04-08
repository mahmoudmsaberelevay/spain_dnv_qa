CREATE TABLE `clientCases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`clientCode` varchar(64) NOT NULL,
	`applicationType` enum('freelancer','business_owner') NOT NULL,
	`maritalStatus` enum('single','family') NOT NULL,
	`paralegal` enum('Madonna','Monica','Marina') NOT NULL,
	`consultant` enum('Mahmoud','Ziad','Fouad','Kirolos') NOT NULL,
	`schengenDate` timestamp,
	`embassyAppointmentDate` timestamp,
	`expectedSubmissionDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientCases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clientDocuments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientCaseId` int NOT NULL,
	`docKey` varchar(64) NOT NULL,
	`docName` varchar(255) NOT NULL,
	`category` enum('main','family') NOT NULL DEFAULT 'main',
	`expirationMonths` int,
	`requiresMofa` boolean NOT NULL DEFAULT false,
	`requiresEmbassy` boolean NOT NULL DEFAULT false,
	`received` boolean NOT NULL DEFAULT false,
	`receivedDate` timestamp,
	`mofaAttested` boolean NOT NULL DEFAULT false,
	`mofaAttestedDate` timestamp,
	`embassyAttested` boolean NOT NULL DEFAULT false,
	`embassyAttestedDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientDocuments_id` PRIMARY KEY(`id`)
);
