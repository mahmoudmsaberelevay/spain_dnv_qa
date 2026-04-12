ALTER TABLE `invoices` MODIFY COLUMN `contractId` int;--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `contractCode` varchar(32);--> statement-breakpoint
ALTER TABLE `invoices` ADD `isLegacyReceipt` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `legacyFinClientId` int;