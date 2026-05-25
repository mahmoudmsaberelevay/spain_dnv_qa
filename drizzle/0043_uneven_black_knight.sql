CREATE TABLE `leads_report_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`filterJson` text NOT NULL,
	`createdByEmail` varchar(320),
	`createdByName` varchar(255),
	`createdAt` bigint NOT NULL,
	CONSTRAINT `leads_report_presets_id` PRIMARY KEY(`id`)
);
