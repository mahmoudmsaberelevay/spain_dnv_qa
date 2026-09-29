-- ELEVAY Agentic Marketing System: Settings and Production refinement.
-- This additive migration stores administrator-entered monthly targets and versioned
-- design-system references only. It does not create provider dispatch, rendering,
-- publishing, Meta/CAPI, campaign, spend, notification, or CRM operating-data paths.

ALTER TABLE `marketing_weekly_results_settings`
  ADD COLUMN `targetLikes30d` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN `targetViews30d` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN `targetLeads30d` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN `targetQualifiedLeads30d` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN `targetSignedClients30d` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN `targetCostPerLeadEgp` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `targetMaxAdSpend30dEgp` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `requestedAutopublishThreshold` INT NOT NULL DEFAULT 90;

CREATE TABLE IF NOT EXISTS `marketing_design_system_assets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `assetKey` VARCHAR(96) NOT NULL,
  `assetType` VARCHAR(32) NOT NULL,
  `title` VARCHAR(300) NOT NULL,
  `originalFileName` VARCHAR(500) NOT NULL,
  `mimeType` VARCHAR(255) NOT NULL,
  `storageKey` VARCHAR(768) NOT NULL,
  `fileUrl` VARCHAR(2000) NOT NULL,
  `sha256Digest` VARCHAR(64) NOT NULL,
  `extractionStatus` VARCHAR(48) NOT NULL,
  `extractedText` MEDIUMTEXT NULL,
  `extractionJson` MEDIUMTEXT NOT NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `uploadedByUserId` INT NOT NULL,
  `createdAt` BIGINT NOT NULL,
  `updatedAt` BIGINT NOT NULL,
  `archivedAt` BIGINT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_design_system_asset_key_unique` (`assetKey`),
  KEY `marketing_design_system_active_type_idx` (`assetType`, `isActive`, `archivedAt`, `updatedAt`),
  KEY `marketing_design_system_digest_idx` (`sha256Digest`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rollback plan (run only after preserving files and confirming no retained plan references):
-- DROP TABLE IF EXISTS `marketing_design_system_assets`;
-- ALTER TABLE `marketing_weekly_results_settings`
--   DROP COLUMN `requestedAutopublishThreshold`,
--   DROP COLUMN `targetMaxAdSpend30dEgp`,
--   DROP COLUMN `targetCostPerLeadEgp`,
--   DROP COLUMN `targetSignedClients30d`,
--   DROP COLUMN `targetQualifiedLeads30d`,
--   DROP COLUMN `targetLeads30d`,
--   DROP COLUMN `targetViews30d`,
--   DROP COLUMN `targetLikes30d`;
