CREATE TABLE `aiCouncilCases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`brief` mediumtext NOT NULL,
	`language` varchar(12) NOT NULL DEFAULT 'en',
	`financialAssumptions` mediumtext,
	`status` enum('draft','running','awaiting_manus','ready_for_decision','finalized','failed') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`startedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiCouncilCases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiCouncilOpinions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`councilCaseId` int NOT NULL,
	`role` enum('strategy','critical_review','research_execution','financial','opposition','chairperson') NOT NULL,
	`provider` varchar(64) NOT NULL,
	`status` enum('queued','running','completed','needs_input','failed','unavailable') NOT NULL DEFAULT 'queued',
	`attempt` int NOT NULL DEFAULT 1,
	`externalTaskId` varchar(255),
	`externalTaskUrl` text,
	`content` mediumtext,
	`structuredContent` json,
	`sourceLinks` json,
	`errorCode` varchar(100),
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiCouncilOpinions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiCouncilDecisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`councilCaseId` int NOT NULL,
	`chairOpinionId` int,
	`decision` enum('proceed','proceed_with_conditions','defer','do_not_proceed') NOT NULL,
	`confidence` int NOT NULL,
	`summary` mediumtext NOT NULL,
	`rationale` mediumtext NOT NULL,
	`conditions` json,
	`nextSteps` json,
	`unresolvedConflicts` mediumtext,
	`finalizedByUserId` int NOT NULL,
	`finalizedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiCouncilDecisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `aiCouncilDecisions_councilCaseId_unique` UNIQUE(`councilCaseId`)
);
