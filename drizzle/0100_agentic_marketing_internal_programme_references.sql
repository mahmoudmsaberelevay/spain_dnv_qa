-- Agentic Marketing System — User-Supplied Internal Programme References
-- Additive internal-reference layer only. These records are intentionally separate
-- from official-source evidence and cannot be used to approve marketing claims.

CREATE TABLE IF NOT EXISTS `marketing_internal_programme_references` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `referenceKey` VARCHAR(128) NOT NULL,
  `programKeysJson` TEXT NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `sourceFileName` VARCHAR(255) NOT NULL,
  `documentUpdatedLabel` VARCHAR(96) NULL,
  `sourceClassification` VARCHAR(64) NOT NULL DEFAULT 'user_supplied_internal_summary',
  `status` VARCHAR(64) NOT NULL DEFAULT 'internal_reference_only',
  `documentHash` VARCHAR(64) NOT NULL,
  `rawText` MEDIUMTEXT NOT NULL,
  `analysisJson` MEDIUMTEXT NOT NULL,
  `createdByUserId` INT NOT NULL,
  `createdAt` BIGINT NOT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_internal_programme_reference_key_unique` (`referenceKey`),
  KEY `marketing_internal_programme_reference_status_idx` (`status`, `updatedAt`)
);
