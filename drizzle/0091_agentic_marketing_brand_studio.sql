-- Agentic Marketing System — Phase 1 Brand Studio
-- Additive only. No existing CRM, Marketing Plan, Lead, Meta, Contract, or financial record is changed.
-- Provider credentials are intentionally excluded from this schema.

CREATE TABLE IF NOT EXISTS `marketing_system_role_assignments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `role` VARCHAR(48) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `assignedByUserId` INT NOT NULL,
  `createdAt` BIGINT NOT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_system_role_user_unique` (`userId`),
  KEY `marketing_system_role_active_role_idx` (`isActive`, `role`)
);

CREATE TABLE IF NOT EXISTS `marketing_provider_profiles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `alias` VARCHAR(96) NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `modelId` VARCHAR(160) NULL,
  `purpose` VARCHAR(160) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'not_configured',
  `isEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `killSwitchEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `configuredByUserId` INT NULL,
  `notes` TEXT NULL,
  `createdAt` BIGINT NOT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_provider_alias_unique` (`alias`),
  KEY `marketing_provider_status_idx` (`status`, `isEnabled`)
);

CREATE TABLE IF NOT EXISTS `marketing_brand_discovery_sessions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `version` INT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'in_progress',
  `resetScope` VARCHAR(96) NULL,
  `currentQuestionNumber` INT NOT NULL DEFAULT 1,
  `createdByUserId` INT NOT NULL,
  `createdAt` BIGINT NOT NULL,
  `completedAt` BIGINT NULL,
  `proposedAt` BIGINT NULL,
  `approvedAt` BIGINT NULL,
  `approvedByUserId` INT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_brand_session_version_unique` (`version`),
  KEY `marketing_brand_session_status_idx` (`status`, `updatedAt`)
);

CREATE TABLE IF NOT EXISTS `marketing_brand_discovery_answers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `sessionId` INT NOT NULL,
  `questionNumber` INT NOT NULL,
  `answerText` MEDIUMTEXT NOT NULL,
  `interpretedJson` MEDIUMTEXT NULL,
  `attachmentsJson` MEDIUMTEXT NULL,
  `decisionStatus` VARCHAR(32) NOT NULL DEFAULT 'answered',
  `answeredByUserId` INT NOT NULL,
  `createdAt` BIGINT NOT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_brand_answer_session_question_unique` (`sessionId`, `questionNumber`),
  KEY `marketing_brand_answer_session_idx` (`sessionId`, `questionNumber`)
);

CREATE TABLE IF NOT EXISTS `marketing_brand_books` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `version` INT NOT NULL,
  `sessionId` INT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'proposed',
  `title` VARCHAR(255) NOT NULL,
  `brandPayloadJson` MEDIUMTEXT NOT NULL,
  `contentHash` VARCHAR(64) NOT NULL,
  `createdByUserId` INT NOT NULL,
  `createdAt` BIGINT NOT NULL,
  `approvedByUserId` INT NULL,
  `approvedAt` BIGINT NULL,
  `activatedAt` BIGINT NULL,
  `supersededAt` BIGINT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_brand_book_version_unique` (`version`),
  UNIQUE KEY `marketing_brand_book_session_unique` (`sessionId`),
  KEY `marketing_brand_book_status_idx` (`status`, `activatedAt`)
);
