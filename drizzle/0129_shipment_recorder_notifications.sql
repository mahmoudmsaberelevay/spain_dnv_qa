ALTER TABLE `crmShipments` ADD `recordedByName` varchar(200);--> statement-breakpoint
ALTER TABLE `crmShipments` ADD `notificationEmail` varchar(254);--> statement-breakpoint
ALTER TABLE `crmShipments` ADD `notificationStatus` enum('not_requested','sending','sent','failed','unknown') DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE `crmShipments` ADD `notificationSentAt` timestamp;
