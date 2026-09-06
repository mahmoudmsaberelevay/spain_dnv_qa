CREATE TABLE IF NOT EXISTS `client_portal_users` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `primaryClientCaseId` int NOT NULL,
  `username` varchar(100) NOT NULL,
  `email` varchar(320) NOT NULL,
  `mobile` varchar(64),
  `passwordHash` varchar(255) NOT NULL,
  `status` enum('active','disabled') NOT NULL DEFAULT 'active',
  `mustChangePassword` boolean NOT NULL DEFAULT true,
  `consultant` varchar(128),
  `paralegal` varchar(128),
  `locale` enum('en','ar') NOT NULL DEFAULT 'en',
  `notificationPreferences` json,
  `failedLoginAttempts` int NOT NULL DEFAULT 0,
  `lockedUntil` timestamp NULL,
  `passwordResetTokenHash` varchar(255),
  `passwordResetExpiresAt` timestamp NULL,
  `lastLoginAt` timestamp NULL,
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `client_portal_users_id` PRIMARY KEY(`id`),
  CONSTRAINT `client_portal_users_publicId_unique` UNIQUE(`publicId`),
  CONSTRAINT `client_portal_users_username_unique` UNIQUE(`username`),
  CONSTRAINT `client_portal_users_email_unique` UNIQUE(`email`),
  INDEX `client_portal_users_primary_case_idx` (`primaryClientCaseId`),
  INDEX `client_portal_users_status_idx` (`status`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `client_portal_applications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `portalUserId` int NOT NULL,
  `clientCaseId` int NOT NULL,
  `label` varchar(255),
  `isPrimary` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `client_portal_applications_id` PRIMARY KEY(`id`),
  CONSTRAINT `client_portal_applications_publicId_unique` UNIQUE(`publicId`),
  CONSTRAINT `client_portal_applications_user_case_unique` UNIQUE(`portalUserId`,`clientCaseId`),
  INDEX `client_portal_applications_user_idx` (`portalUserId`),
  INDEX `client_portal_applications_case_idx` (`clientCaseId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `client_portal_applicants` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `portalApplicationId` int NOT NULL,
  `relation` enum('main','spouse','child','dependent') NOT NULL,
  `fullName` varchar(255) NOT NULL,
  `birthDate` date,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `client_portal_applicants_id` PRIMARY KEY(`id`),
  CONSTRAINT `client_portal_applicants_publicId_unique` UNIQUE(`publicId`),
  INDEX `client_portal_applicants_application_idx` (`portalApplicationId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `client_portal_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `portalUserId` int NOT NULL,
  `refreshTokenHash` varchar(255) NOT NULL,
  `deviceName` varchar(255),
  `platform` varchar(50),
  `osVersion` varchar(100),
  `appVersion` varchar(50),
  `pushToken` varchar(512),
  `ipAddress` varchar(64),
  `expiresAt` timestamp NOT NULL,
  `lastSeenAt` timestamp NOT NULL DEFAULT (now()),
  `revokedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `client_portal_sessions_id` PRIMARY KEY(`id`),
  CONSTRAINT `client_portal_sessions_publicId_unique` UNIQUE(`publicId`),
  INDEX `client_portal_sessions_user_idx` (`portalUserId`),
  INDEX `client_portal_sessions_active_idx` (`portalUserId`,`revokedAt`,`expiresAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `client_portal_documents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `portalApplicationId` int NOT NULL,
  `applicantId` int,
  `documentType` varchar(128) NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `fileKey` varchar(1024) NOT NULL,
  `mimeType` varchar(128) NOT NULL,
  `fileSize` int NOT NULL,
  `source` enum('client_upload','client_scan','staff') NOT NULL,
  `visibleToClient` boolean NOT NULL DEFAULT true,
  `reviewStatus` enum('submitted','under_review','accepted','replacement_required') NOT NULL DEFAULT 'submitted',
  `clientComment` text,
  `uploadedByPortalUserId` int,
  `uploadedByStaffUserId` int,
  `reviewedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `client_portal_documents_id` PRIMARY KEY(`id`),
  CONSTRAINT `client_portal_documents_publicId_unique` UNIQUE(`publicId`),
  INDEX `client_portal_documents_application_idx` (`portalApplicationId`),
  INDEX `client_portal_documents_visible_idx` (`portalApplicationId`,`visibleToClient`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `client_portal_messages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `portalApplicationId` int NOT NULL,
  `senderType` enum('client','staff') NOT NULL,
  `senderPortalUserId` int,
  `senderStaffUserId` int,
  `visibility` enum('internal','client') NOT NULL DEFAULT 'client',
  `body` text NOT NULL,
  `attachmentDocumentId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `client_portal_messages_id` PRIMARY KEY(`id`),
  CONSTRAINT `client_portal_messages_publicId_unique` UNIQUE(`publicId`),
  INDEX `client_portal_messages_application_visibility_idx` (`portalApplicationId`,`visibility`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `client_portal_notifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `portalUserId` int NOT NULL,
  `type` varchar(64) NOT NULL,
  `titleEn` varchar(255) NOT NULL,
  `titleAr` varchar(255) NOT NULL,
  `bodyEn` text NOT NULL,
  `bodyAr` text NOT NULL,
  `entityType` varchar(64),
  `entityPublicId` varchar(36),
  `isRead` boolean NOT NULL DEFAULT false,
  `readAt` timestamp NULL,
  `createdAt` bigint NOT NULL,
  CONSTRAINT `client_portal_notifications_id` PRIMARY KEY(`id`),
  CONSTRAINT `client_portal_notifications_publicId_unique` UNIQUE(`publicId`),
  INDEX `client_portal_notifications_user_idx` (`portalUserId`,`isRead`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `client_portal_audit_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `portalUserId` int,
  `clientCaseId` int,
  `action` varchar(100) NOT NULL,
  `recordType` varchar(100),
  `recordPublicId` varchar(64),
  `outcome` enum('success','denied','failure') NOT NULL DEFAULT 'success',
  `ipAddress` varchar(64),
  `userAgent` varchar(512),
  `deviceName` varchar(255),
  `osVersion` varchar(100),
  `appVersion` varchar(50),
  `correlationId` varchar(64),
  `details` text,
  `createdAt` bigint NOT NULL,
  CONSTRAINT `client_portal_audit_logs_id` PRIMARY KEY(`id`),
  INDEX `client_portal_audit_user_idx` (`portalUserId`,`createdAt`),
  INDEX `client_portal_audit_client_idx` (`clientCaseId`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `client_portal_delivery_outbox` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventType` varchar(64) NOT NULL,
  `channel` enum('email','push','crm_notification') NOT NULL,
  `recipient` varchar(512) NOT NULL,
  `payload` json NOT NULL,
  `status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `lastError` text,
  `processedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `client_portal_delivery_outbox_id` PRIMARY KEY(`id`),
  INDEX `client_portal_outbox_status_idx` (`status`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `public_programs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `slug` varchar(160) NOT NULL,
  `category` enum('residency','citizenship') NOT NULL,
  `nameEn` varchar(255) NOT NULL,
  `nameAr` varchar(255),
  `country` varchar(128) NOT NULL,
  `summaryEn` text,
  `summaryAr` text,
  `details` json,
  `imageUrl` varchar(1024),
  `sourceUrl` varchar(1024) NOT NULL,
  `sourceHash` varchar(64),
  `isOverridden` boolean NOT NULL DEFAULT false,
  `isActive` boolean NOT NULL DEFAULT true,
  `displayOrder` int NOT NULL DEFAULT 0,
  `lastSyncedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `public_programs_id` PRIMARY KEY(`id`),
  CONSTRAINT `public_programs_publicId_unique` UNIQUE(`publicId`),
  CONSTRAINT `public_programs_slug_unique` UNIQUE(`slug`),
  INDEX `public_programs_public_idx` (`category`,`isActive`,`displayOrder`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `public_service_providers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `providerType` enum('lawyer','accountant','service_facilitator') NOT NULL,
  `name` varchar(255) NOT NULL,
  `country` varchar(128) NOT NULL,
  `city` varchar(128),
  `logoUrl` varchar(1024),
  `description` text,
  `services` json,
  `price` decimal(14,2),
  `currency` varchar(10),
  `phone` varchar(64),
  `whatsapp` varchar(64),
  `email` varchar(320),
  `website` varchar(1024),
  `languages` json,
  `availability` varchar(255),
  `displayOrder` int NOT NULL DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `public_service_providers_id` PRIMARY KEY(`id`),
  CONSTRAINT `public_service_providers_publicId_unique` UNIQUE(`publicId`),
  INDEX `public_service_providers_public_idx` (`providerType`,`isActive`,`displayOrder`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `public_content_sync_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `triggerType` enum('scheduled','manual') NOT NULL,
  `status` enum('running','success','failed') NOT NULL,
  `programsFound` int NOT NULL DEFAULT 0,
  `programsCreated` int NOT NULL DEFAULT 0,
  `programsUpdated` int NOT NULL DEFAULT 0,
  `errorMessage` text,
  `startedAt` timestamp NOT NULL DEFAULT (now()),
  `completedAt` timestamp NULL,
  CONSTRAINT `public_content_sync_runs_id` PRIMARY KEY(`id`),
  INDEX `public_content_sync_runs_started_idx` (`startedAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `public_content_sync_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `scheduleCronTaskUid` varchar(65),
  `lastSuccessfulAt` timestamp NULL,
  `lastAttemptAt` timestamp NULL,
  `lastError` text,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `public_content_sync_settings_id` PRIMARY KEY(`id`),
  CONSTRAINT `public_content_sync_settings_task_unique` UNIQUE(`scheduleCronTaskUid`)
);
