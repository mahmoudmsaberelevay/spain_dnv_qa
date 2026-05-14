ALTER TABLE `clientCases` MODIFY COLUMN `paralegal` enum('Madonna','Monica','Marina');--> statement-breakpoint
ALTER TABLE `clientCases` ADD `schengenVisaValid` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `clientCases` ADD `schengenExpiryDate` date;--> statement-breakpoint
ALTER TABLE `clientCases` ADD `embassyEmailDate` date;--> statement-breakpoint
ALTER TABLE `clientCases` ADD `driveLink` text;