CREATE TABLE `lead_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`userId` int,
	`activityType` enum('created','assigned','note_added','whatsapp_sent','email_sent','call_made','stage_changed','document_uploaded','followup_scheduled','meeting_scheduled','status_updated','task_created','task_completed') NOT NULL,
	`description` text NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `lead_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lead_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(255),
	`note` text NOT NULL,
	`isPinned` boolean DEFAULT false,
	`isImportant` boolean DEFAULT false,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `lead_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lead_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`assignedTo` varchar(255),
	`taskType` enum('call','whatsapp','email','meeting','document_request','other') NOT NULL,
	`dueDate` bigint NOT NULL,
	`completed` boolean DEFAULT false,
	`completedAt` bigint,
	`notes` text,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `lead_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`phone` varchar(50),
	`whatsapp` varchar(50),
	`email` varchar(320),
	`nationality` varchar(100),
	`countryOfResidence` varchar(100),
	`dob` date,
	`gender` enum('male','female','other'),
	`maritalStatus` enum('single','married','divorced','widowed'),
	`familyMembers` int DEFAULT 1,
	`passportStatus` enum('valid','expired','none'),
	`preferredLanguage` varchar(50),
	`interestedProgram` varchar(100),
	`interestedCountry` varchar(100),
	`budgetRange` varchar(100),
	`netWorth` varchar(100),
	`occupation` varchar(100),
	`monthlyIncome` varchar(100),
	`educationLevel` varchar(100),
	`travelHistory` text,
	`visaRefusals` boolean DEFAULT false,
	`criminalRecord` boolean DEFAULT false,
	`sourceOfFunds` varchar(100),
	`leadSource` varchar(100),
	`metaCampaign` varchar(255),
	`metaAdset` varchar(255),
	`metaAd` varchar(255),
	`utmParams` text,
	`assignedTo` varchar(255),
	`stage` enum('fresh','contacted','qualified','prospect','client','dormant','not_qualified_budget','not_qualified_work','not_qualified_study','not_qualified_criminal','not_qualified_other') NOT NULL DEFAULT 'fresh',
	`leadScore` int DEFAULT 0,
	`priority` enum('low','medium','high') DEFAULT 'medium',
	`notes` text,
	`lastContactAt` bigint,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
