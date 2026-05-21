CREATE TABLE `lead_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('meta','website') NOT NULL,
	`name` varchar(255) NOT NULL,
	`config` text,
	`isActive` boolean DEFAULT true,
	`webhookToken` varchar(128),
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `lead_integrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lead_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`color` varchar(20) DEFAULT '#6366f1',
	`isActive` boolean DEFAULT true,
	`isDefault` boolean DEFAULT false,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `lead_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`canView` boolean DEFAULT true,
	`canCreate` boolean DEFAULT false,
	`canEdit` boolean DEFAULT false,
	`canDelete` boolean DEFAULT false,
	`canExport` boolean DEFAULT false,
	`canImport` boolean DEFAULT false,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `leads_permissions_id` PRIMARY KEY(`id`)
);
