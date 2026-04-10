ALTER TABLE `finClients` ADD `clientCode` varchar(32);--> statement-breakpoint
ALTER TABLE `finClients` ADD `email` varchar(320);--> statement-breakpoint
ALTER TABLE `finClients` ADD `address` varchar(500);--> statement-breakpoint
ALTER TABLE `finClients` ADD `program` varchar(128);--> statement-breakpoint
ALTER TABLE `finClients` ADD `signingDate` timestamp;--> statement-breakpoint
ALTER TABLE `finClients` ADD `salesPerson` varchar(128);--> statement-breakpoint
ALTER TABLE `finClients` ADD `contractValueEur` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finClients` ADD `paidAmountEur` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `finClients` ADD `remainingAmountEur` decimal(12,2);--> statement-breakpoint
ALTER TABLE `finClients` ADD `isLegacy` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `finEmployees` ADD `salary` decimal(14,2) DEFAULT '0';