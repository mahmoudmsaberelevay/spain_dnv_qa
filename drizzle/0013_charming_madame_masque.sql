CREATE TABLE `broadcastDismissals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`broadcastId` int NOT NULL,
	`dismissedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `broadcastDismissals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`authorId` int NOT NULL,
	`content` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `broadcasts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chatMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderId` int NOT NULL,
	`receiverId` int NOT NULL,
	`content` text NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pendingInvites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`token` varchar(64) NOT NULL,
	`invitePermissions` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`usedAt` timestamp,
	`usedByUserId` int,
	CONSTRAINT `pendingInvites_id` PRIMARY KEY(`id`),
	CONSTRAINT `pendingInvites_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `userPermissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`pageKey` varchar(100) NOT NULL,
	`canAccess` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userPermissions_id` PRIMARY KEY(`id`)
);
