CREATE TABLE `systemNotifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`entityId` int,
	`entityType` varchar(64),
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `systemNotifications_id` PRIMARY KEY(`id`)
);
