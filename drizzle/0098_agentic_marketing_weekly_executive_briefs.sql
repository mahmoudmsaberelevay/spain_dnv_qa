-- Agentic Marketing System — Weekly Executive Briefs
-- Additive, internal aggregate-review records only.
-- No CRM entity, Meta resource, campaign, budget, spend, payment, provider, or message operation is created or changed.

CREATE TABLE IF NOT EXISTS `marketing_weekly_executive_briefs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `briefKey` VARCHAR(96) NOT NULL,
  `periodStart` VARCHAR(10) NOT NULL,
  `version` INT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'captured',
  `snapshotJson` MEDIUMTEXT NOT NULL,
  `snapshotHash` VARCHAR(64) NOT NULL,
  `contextNote` MEDIUMTEXT NULL,
  `decision` VARCHAR(48) NULL,
  `decisionNote` MEDIUMTEXT NULL,
  `capturedByUserId` INT NOT NULL,
  `capturedAt` BIGINT NOT NULL,
  `decidedByUserId` INT NULL,
  `decidedAt` BIGINT NULL,
  `stoppedByUserId` INT NULL,
  `stoppedAt` BIGINT NULL,
  `createdAt` BIGINT NOT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_weekly_executive_brief_key_unique` (`briefKey`),
  UNIQUE KEY `marketing_weekly_executive_brief_period_version_unique` (`periodStart`, `version`),
  KEY `marketing_weekly_executive_brief_status_period_idx` (`status`, `periodStart`),
  KEY `marketing_weekly_executive_brief_captured_idx` (`capturedAt`)
);

CREATE TABLE IF NOT EXISTS `marketing_weekly_executive_brief_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `briefId` INT NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `fromStatus` VARCHAR(32) NULL,
  `toStatus` VARCHAR(32) NULL,
  `decision` VARCHAR(48) NULL,
  `note` MEDIUMTEXT NULL,
  `payloadJson` MEDIUMTEXT NOT NULL,
  `actorUserId` INT NOT NULL,
  `createdAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `marketing_weekly_executive_brief_event_brief_idx` (`briefId`, `createdAt`),
  KEY `marketing_weekly_executive_brief_event_action_idx` (`action`, `createdAt`)
);
