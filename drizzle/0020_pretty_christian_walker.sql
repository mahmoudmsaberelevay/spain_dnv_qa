CREATE TABLE `modulePermissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`module` varchar(50) NOT NULL,
	`accessLevel` enum('none','viewer','full') NOT NULL DEFAULT 'none',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modulePermissions_id` PRIMARY KEY(`id`)
);
