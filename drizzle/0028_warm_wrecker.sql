CREATE TABLE `clientWorkflows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientCaseId` int NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`submissionStage` varchar(10) NOT NULL DEFAULT 'one',
	`submissionDate` varchar(20) NOT NULL,
	`schengenStatus` varchar(100),
	`yearlyIncome` int NOT NULL DEFAULT 0,
	`incomeFrequency` varchar(20) NOT NULL DEFAULT 'monthly',
	`incomePayments` text,
	`familyMembersCount` int NOT NULL DEFAULT 0,
	`applicationType` varchar(30) NOT NULL DEFAULT 'freelancer',
	`childrenData` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `clientWorkflows_id` PRIMARY KEY(`id`)
);
