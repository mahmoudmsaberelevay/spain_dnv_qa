CREATE TABLE `lead_activity_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(150) NOT NULL,
	`activityType` enum('call','whatsapp','sms','email','meeting','note','stage_change','email_sent','other') NOT NULL DEFAULT 'other',
	`score` int NOT NULL DEFAULT 0,
	`isActive` boolean DEFAULT true,
	`isDefault` boolean DEFAULT false,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `lead_activity_presets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lead_programs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`isActive` boolean DEFAULT true,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `lead_programs_id` PRIMARY KEY(`id`)
);
