CREATE TABLE `crmShipments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shipmentDate` varchar(10) NOT NULL,
	`companyName` varchar(200) NOT NULL,
	`shipmentNumber` varchar(100) NOT NULL,
	`direction` enum('from','to') NOT NULL,
	`partyName` varchar(200) NOT NULL,
	`driveUrl` varchar(2000) NOT NULL,
	`requestKey` varchar(36) NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crmShipments_id` PRIMARY KEY(`id`),
	CONSTRAINT `crmShipments_requestKey_unique` UNIQUE(`requestKey`)
);
--> statement-breakpoint
CREATE INDEX `crm_shipments_date_idx` ON `crmShipments` (`shipmentDate`);--> statement-breakpoint
CREATE INDEX `crm_shipments_number_idx` ON `crmShipments` (`shipmentNumber`);