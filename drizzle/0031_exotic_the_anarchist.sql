CREATE TABLE `nationalVisaWorkflows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientCaseId` int NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`wifeName` varchar(255),
	`childrenData` text,
	`followUpEmail` varchar(255),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nationalVisaWorkflows_id` PRIMARY KEY(`id`)
);
