-- Agentic Marketing System — Provider Connection Center
-- Additive control-plane records only. No provider credential, raw callback body,
-- CRM record, campaign, asset, publication, payment, or spending mutation is created.

CREATE TABLE IF NOT EXISTS `marketing_provider_webhook_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `providerAlias` VARCHAR(96) NOT NULL,
  `providerEventId` VARCHAR(255) NOT NULL,
  `eventType` VARCHAR(120) NOT NULL,
  `payloadHash` VARCHAR(64) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'accepted',
  `errorClass` VARCHAR(120) NULL,
  `receivedAt` BIGINT NOT NULL,
  `processedAt` BIGINT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_provider_webhook_event_unique` (`providerAlias`, `providerEventId`),
  KEY `marketing_provider_webhook_status_idx` (`providerAlias`, `status`, `receivedAt`)
);

CREATE TABLE IF NOT EXISTS `marketing_autopilot_controls` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `requestedMode` VARCHAR(48) NOT NULL,
  `masterKillSwitchEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `status` VARCHAR(48) NOT NULL DEFAULT 'configuration_required',
  `lastChangedByUserId` INT NOT NULL,
  `createdAt` BIGINT NOT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_autopilot_controls_mode_unique` (`requestedMode`)
);
