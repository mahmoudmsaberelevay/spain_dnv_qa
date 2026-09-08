ALTER TABLE `clientCases`
  ADD COLUMN `clientPortalSignedAt` timestamp NULL,
  ADD COLUMN `appointmentBookingSubmittedAt` timestamp NULL,
  ADD COLUMN `embassyReplyConfirmedAt` timestamp NULL,
  ADD COLUMN `secondPaymentAmount` decimal(12,2) NULL,
  ADD COLUMN `secondPaymentCurrency` varchar(10) NULL DEFAULT 'EUR',
  ADD COLUMN `secondPaymentDueDate` date NULL,
  ADD COLUMN `secondPaymentStatus` enum('pending','paid') NULL DEFAULT 'pending',
  ADD COLUMN `travelDate` timestamp NULL,
  ADD COLUMN `arrivalConfirmationAt` timestamp NULL,
  ADD COLUMN `spanishTeamSubmittedAt` timestamp NULL,
  ADD COLUMN `swornTranslationSubmittedAt` timestamp NULL,
  ADD COLUMN `spanishGovernmentSubmittedAt` timestamp NULL,
  ADD COLUMN `spanishGovernmentReceiptDocumentPublicId` varchar(36) NULL,
  ADD COLUMN `approvalTransitionAt` timestamp NULL,
  ADD COLUMN `approvalDocumentPublicId` varchar(36) NULL,
  ADD COLUMN `thirdPaymentAmount` decimal(12,2) NULL,
  ADD COLUMN `thirdPaymentCurrency` varchar(10) NULL DEFAULT 'EUR',
  ADD COLUMN `thirdPaymentDueDate` date NULL,
  ADD COLUMN `thirdPaymentStatus` enum('pending','paid') NULL DEFAULT 'pending',
  ADD COLUMN `travelByDate` date NULL,
  ADD COLUMN `biometricsLocation` varchar(500) NULL,
  ADD COLUMN `biometricsTimezone` varchar(100) NULL DEFAULT 'Europe/Madrid',
  ADD COLUMN `biometricsStatus` enum('not_booked','confirmed','cancelled','completed') NULL DEFAULT 'not_booked',
  ADD COLUMN `biometricsBookedAt` timestamp NULL,
  ADD COLUMN `residencyCardStatus` enum('not_started','processing','ready_for_collection','collected') NULL DEFAULT 'not_started',
  ADD COLUMN `residencyCardReadyAt` timestamp NULL,
  ADD COLUMN `residencyCardCollectionLocation` varchar(500) NULL,
  ADD COLUMN `residencyCardCollectionInstructions` text NULL,
  ADD COLUMN `residencyCardDocumentPublicId` varchar(36) NULL,
  ADD COLUMN `applicationTimezone` varchar(100) NULL DEFAULT 'Africa/Cairo';

ALTER TABLE `clientDocuments`
  ADD COLUMN `legalStatus` enum('pending','mofa_submitted','mofa_received','embassy_submitted','embassy_received') NOT NULL DEFAULT 'pending',
  ADD COLUMN `portalDocumentPublicId` varchar(36) NULL;

ALTER TABLE `client_portal_documents`
  ADD COLUMN `clientDocumentId` int NULL,
  ADD INDEX `idx_portal_document_checklist` (`clientDocumentId`);

ALTER TABLE `client_portal_notifications`
  ADD COLUMN `idempotencyKey` varchar(191) NULL,
  ADD UNIQUE INDEX `uniq_portal_notification_idempotency` (`idempotencyKey`);

ALTER TABLE `client_portal_delivery_outbox`
  ADD COLUMN `idempotencyKey` varchar(191) NULL,
  ADD UNIQUE INDEX `uniq_portal_outbox_idempotency` (`idempotencyKey`);

CREATE TABLE IF NOT EXISTS `client_application_activities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `publicId` varchar(36) NOT NULL,
  `clientCaseId` int NOT NULL,
  `actorType` enum('staff','client','system') NOT NULL,
  `actorStaffUserId` int NULL,
  `actorPortalUserId` int NULL,
  `actorName` varchar(255) NOT NULL,
  `eventType` varchar(80) NOT NULL,
  `titleEn` varchar(255) NOT NULL,
  `titleAr` varchar(255) NOT NULL,
  `bodyEn` text NOT NULL,
  `bodyAr` text NOT NULL,
  `entityType` varchar(64) NULL,
  `entityPublicId` varchar(64) NULL,
  `metadata` json NULL,
  `visibleToClient` boolean NOT NULL DEFAULT true,
  `idempotencyKey` varchar(191) NOT NULL,
  `occurredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_client_activity_public_id` (`publicId`),
  UNIQUE KEY `uniq_client_activity_idempotency` (`idempotencyKey`),
  INDEX `idx_client_activity_case_time` (`clientCaseId`, `occurredAt`)
);

CREATE TABLE IF NOT EXISTS `client_reminder_deliveries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `idempotencyKey` varchar(191) NOT NULL,
  `clientCaseId` int NOT NULL,
  `portalUserId` int NOT NULL,
  `ruleKey` varchar(80) NOT NULL,
  `scheduledFor` timestamp NOT NULL,
  `status` enum('pending','sent','skipped','failed') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `lastError` text NULL,
  `sentAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_client_reminder_idempotency` (`idempotencyKey`),
  INDEX `idx_client_reminder_status_schedule` (`status`, `scheduledFor`),
  INDEX `idx_client_reminder_case` (`clientCaseId`)
);

CREATE TABLE IF NOT EXISTS `client_reminder_settings` (
  `id` int NOT NULL,
  `scheduleCronTaskUid` varchar(65) NULL,
  `enabled` boolean NOT NULL DEFAULT true,
  `lastRunAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_client_reminder_task_uid` (`scheduleCronTaskUid`)
);
