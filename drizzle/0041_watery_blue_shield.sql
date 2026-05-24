ALTER TABLE `leads` ADD `metaLeadId` varchar(100);--> statement-breakpoint
ALTER TABLE `leads` ADD `metaPageId` varchar(100);--> statement-breakpoint
ALTER TABLE `leads` ADD `metaCampaignId` varchar(100);--> statement-breakpoint
ALTER TABLE `leads` ADD `metaAdsetId` varchar(100);--> statement-breakpoint
ALTER TABLE `leads` ADD `metaAdId` varchar(100);--> statement-breakpoint
ALTER TABLE `leads` ADD `isOrganic` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `leads` ADD `utmSource` varchar(100);--> statement-breakpoint
ALTER TABLE `leads` ADD `utmMedium` varchar(100);--> statement-breakpoint
ALTER TABLE `leads` ADD `utmCampaign` varchar(255);--> statement-breakpoint
ALTER TABLE `leads` ADD `utmContent` varchar(255);--> statement-breakpoint
ALTER TABLE `leads` ADD `utmTerm` varchar(255);--> statement-breakpoint
ALTER TABLE `leads` ADD `fbclid` varchar(255);--> statement-breakpoint
ALTER TABLE `leads` ADD `fbcCookie` varchar(255);--> statement-breakpoint
ALTER TABLE `leads` ADD `fbpCookie` varchar(255);--> statement-breakpoint
ALTER TABLE `leads` ADD `ipAddress` varchar(64);--> statement-breakpoint
ALTER TABLE `leads` ADD `userAgent` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `investmentBudget` varchar(100);--> statement-breakpoint
ALTER TABLE `leads` ADD `numberOfApplicants` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `leads` ADD `estimatedDealValue` decimal(12,2);--> statement-breakpoint
ALTER TABLE `leads` ADD `dealCurrency` varchar(10) DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE `leads` ADD `consultationBookedDate` bigint;--> statement-breakpoint
ALTER TABLE `leads` ADD `consultationCompletedDate` bigint;--> statement-breakpoint
ALTER TABLE `leads` ADD `contractSignedDate` bigint;--> statement-breakpoint
ALTER TABLE `leads` ADD `contractValueUsd` decimal(12,2);--> statement-breakpoint
ALTER TABLE `leads` ADD `contractValueEur` decimal(12,2);--> statement-breakpoint
ALTER TABLE `leads` ADD `paymentReceivedDate` bigint;--> statement-breakpoint
ALTER TABLE `leads` ADD `totalPaymentsReceived` decimal(12,2);--> statement-breakpoint
ALTER TABLE `leads` ADD `gdprConsent` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `leads` ADD `consentTimestamp` bigint;--> statement-breakpoint
ALTER TABLE `leads` ADD `dataSharingConsent` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `leads` ADD `marketingOptIn` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `leads` ADD `optOutSignal` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `leads` ADD `dataRegion` varchar(20);