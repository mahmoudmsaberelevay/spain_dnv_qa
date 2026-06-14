CREATE TABLE `marketing_summaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`country` varchar(100) NOT NULL,
	`programType` varchar(100) NOT NULL,
	`programSubtype` varchar(100),
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`documentJson` text NOT NULL,
	`colorsJson` text,
	`typographyJson` text,
	`lastUpdated` varchar(20),
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `marketing_summaries_id` PRIMARY KEY(`id`)
);
