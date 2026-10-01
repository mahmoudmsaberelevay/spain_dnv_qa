-- ELEVAY Agentic Marketing: owner-bounded Manus review-preview media controls.
-- Additive only. These tables do not authorize Meta, publishing, campaign change,
-- advertising spend, CAPI, Lead/client access, or external messaging.

CREATE TABLE IF NOT EXISTS `marketing_media_production_controls` (
  `id` int NOT NULL AUTO_INCREMENT,
  `controlKey` varchar(96) NOT NULL,
  `isEnabled` boolean NOT NULL DEFAULT false,
  `state` varchar(32) NOT NULL DEFAULT 'disabled',
  `monthlyBudgetUsd` decimal(10,2) NOT NULL,
  `perItemBudgetUsd` decimal(10,2) NOT NULL,
  `providerAlias` varchar(96) NOT NULL DEFAULT 'manus-orchestrator',
  `configuredByUserId` int NOT NULL,
  `lastError` varchar(1000) NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_media_production_control_key_unique` (`controlKey`)
);

CREATE TABLE IF NOT EXISTS `marketing_media_production_jobs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `jobKey` varchar(160) NOT NULL,
  `idempotencyKey` varchar(255) NOT NULL,
  `weeklyItemId` int NOT NULL,
  `itemSnapshotHash` varchar(64) NOT NULL,
  `mediaKind` varchar(32) NOT NULL,
  `state` varchar(48) NOT NULL,
  `reservedCostUsd` decimal(10,2) NOT NULL,
  `manusTaskId` varchar(255) NULL,
  `manusTaskUrl` varchar(2000) NULL,
  `taskAttachmentsJson` mediumtext NOT NULL,
  `errorCode` varchar(128) NULL,
  `errorSummary` varchar(1000) NULL,
  `requestedByUserId` int NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  `completedAt` bigint NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_media_production_job_key_unique` (`jobKey`),
  UNIQUE KEY `marketing_media_production_idempotency_unique` (`idempotencyKey`),
  KEY `marketing_media_production_item_idx` (`weeklyItemId`, `state`, `createdAt`)
);
