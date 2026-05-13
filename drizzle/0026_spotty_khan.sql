CREATE TABLE `wa_media_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` varchar(256) NOT NULL,
	`mediaId` varchar(256),
	`storageKey` varchar(512),
	`storageUrl` varchar(1024),
	`mimeType` varchar(128),
	`fileName` varchar(512),
	`fileSize` int,
	`downloadStatus` enum('pending','downloaded','failed') NOT NULL DEFAULT 'pending',
	`downloadError` text,
	`downloadedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wa_media_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wa_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` varchar(256) NOT NULL,
	`groupId` varchar(128) NOT NULL,
	`senderId` varchar(64) NOT NULL,
	`senderName` varchar(256),
	`senderPhone` varchar(32),
	`messageType` enum('text','image','video','audio','document','sticker','location','reaction','contacts','unknown') NOT NULL DEFAULT 'text',
	`textContent` text,
	`caption` text,
	`mediaId` varchar(256),
	`mimeType` varchar(128),
	`fileName` varchar(512),
	`latitude` varchar(32),
	`longitude` varchar(32),
	`locationName` varchar(256),
	`reactionEmoji` varchar(16),
	`reactedToMessageId` varchar(256),
	`rawPayload` json,
	`whatsappTimestamp` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wa_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `wa_messages_messageId_unique` UNIQUE(`messageId`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phoneNumberId` varchar(64) NOT NULL,
	`displayName` varchar(128),
	`accessToken` text,
	`webhookVerifyToken` varchar(128),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_config_phoneNumberId_unique` UNIQUE(`phoneNumberId`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` varchar(128) NOT NULL,
	`name` varchar(256),
	`description` text,
	`phoneNumberId` varchar(64),
	`isActive` boolean NOT NULL DEFAULT true,
	`messageCount` int NOT NULL DEFAULT 0,
	`lastMessageAt` timestamp,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_groups_groupId_unique` UNIQUE(`groupId`)
);
