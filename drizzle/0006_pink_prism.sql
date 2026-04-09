ALTER TABLE `clientCases` ADD `stage` enum('preparation','submission','approved') DEFAULT 'preparation' NOT NULL;--> statement-breakpoint
ALTER TABLE `clientCases` ADD `submissionDate` timestamp;--> statement-breakpoint
ALTER TABLE `clientCases` ADD `expectedApprovalDate` timestamp;--> statement-breakpoint
ALTER TABLE `clientCases` ADD `translationDate` timestamp;--> statement-breakpoint
ALTER TABLE `clientCases` ADD `approvalDate` timestamp;--> statement-breakpoint
ALTER TABLE `clientCases` ADD `settlementFeeAmount` decimal(12,2);--> statement-breakpoint
ALTER TABLE `clientCases` ADD `settlementFeeDate` timestamp;--> statement-breakpoint
ALTER TABLE `clientCases` ADD `biometricsDate` timestamp;