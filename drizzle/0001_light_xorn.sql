CREATE TABLE `analysisResults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`overallScore` int,
	`overallStatus` enum('pass','fail','needs_review'),
	`passportData` json,
	`stampVerification` json,
	`companyOwnership` json,
	`freelancingEligibility` json,
	`recommendationLetter` json,
	`flaggedIssues` json,
	`recommendations` json,
	`fullReport` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analysisResults_id` PRIMARY KEY(`id`),
	CONSTRAINT `analysisResults_caseId_unique` UNIQUE(`caseId`)
);
--> statement-breakpoint
CREATE TABLE `cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`clientEmail` varchar(320),
	`clientNationality` varchar(100),
	`notes` text,
	`status` enum('draft','in_progress','complete','issues_found') NOT NULL DEFAULT 'draft',
	`passportFullName` varchar(255),
	`passportNumber` varchar(50),
	`passportDob` varchar(50),
	`passportPob` varchar(255),
	`passportExpiry` varchar(50),
	`wizardStep` int NOT NULL DEFAULT 1,
	`analysisCompleted` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`userId` int NOT NULL,
	`docType` enum('passport_main','passport_family','company_owned','client_company','recommendation_letter','freelancing_contract','birth_certificate','marriage_certificate','police_clearance','education_certificate','other') NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` text NOT NULL,
	`mimeType` varchar(100),
	`fileSize` int,
	`analysisStatus` enum('pending','processing','pass','fail','warning') NOT NULL DEFAULT 'pending',
	`analysisResult` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
