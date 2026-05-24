ALTER TABLE `lead_integrations` ADD `lastSyncAt` bigint;--> statement-breakpoint
ALTER TABLE `lead_integrations` ADD `lastSyncCount` int DEFAULT 0;