ALTER TABLE `leads`
  ADD COLUMN `normalizedPhone` varchar(50),
  ADD COLUMN `normalizedEmail` varchar(320),
  ADD COLUMN `metaLeadCreatedAt` bigint,
  ADD COLUMN `firstReceivedAt` bigint,
  ADD COLUMN `metaLastEventSent` varchar(255),
  ADD COLUMN `metaLastEventSentAt` bigint,
  ADD COLUMN `metaSyncStatus` enum('pending','sent','failed','retrying','manual_review') DEFAULT 'pending',
  ADD COLUMN `metaSyncError` text;

CREATE TABLE `lead_meta_attributions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `leadId` int NOT NULL,
  `metaLeadId` varchar(100) NOT NULL,
  `metaPageId` varchar(100),
  `metaFormId` varchar(100),
  `metaFormName` varchar(255),
  `metaCampaignId` varchar(100),
  `metaCampaignName` varchar(255),
  `metaAdSetId` varchar(100),
  `metaAdSetName` varchar(255),
  `metaAdId` varchar(100),
  `metaAdName` varchar(255),
  `metaIsOrganic` boolean DEFAULT false,
  `source` varchar(100) NOT NULL DEFAULT 'Meta Instant Form',
  `program` varchar(150),
  `utmSource` varchar(100),
  `utmMedium` varchar(100),
  `utmCampaign` varchar(255),
  `utmContent` varchar(255),
  `utmTerm` varchar(255),
  `metaLeadCreatedAt` bigint NOT NULL,
  `firstReceivedAt` bigint NOT NULL,
  `isPrimary` boolean NOT NULL DEFAULT false,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  CONSTRAINT `lead_meta_attributions_metaLeadId_unique` UNIQUE (`metaLeadId`)
);

CREATE TABLE `meta_webhook_inbox` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `webhookKey` varchar(255) NOT NULL,
  `metaLeadId` varchar(100) NOT NULL,
  `metaPageId` varchar(100),
  `metaFormId` varchar(100),
  `metaAdId` varchar(100),
  `metaAdGroupId` varchar(100),
  `metaCreatedTime` bigint,
  `leadId` int,
  `status` enum('pending','processing','processed','failed','retrying','dead_letter') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `nextAttemptAt` bigint,
  `lastError` text,
  `receivedAt` bigint NOT NULL,
  `processedAt` bigint,
  `updatedAt` bigint NOT NULL,
  CONSTRAINT `meta_webhook_inbox_webhookKey_unique` UNIQUE (`webhookKey`)
);

CREATE TABLE `meta_integration_mappings` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `mappingKey` varchar(255) NOT NULL,
  `mappingType` enum('form','campaign','adset','ad','page','crm_stage') NOT NULL,
  `matchValue` varchar(255) NOT NULL,
  `matchName` varchar(255),
  `program` varchar(150),
  `outputValue` varchar(255),
  `priority` int NOT NULL DEFAULT 100,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdBy` int,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  CONSTRAINT `meta_integration_mappings_mappingKey_unique` UNIQUE (`mappingKey`)
);

CREATE TABLE `meta_crm_event_log` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `leadId` int NOT NULL,
  `metaLeadId` varchar(100),
  `eventName` varchar(255) NOT NULL,
  `eventTime` bigint NOT NULL,
  `eventId` varchar(255) NOT NULL,
  `sourceType` varchar(64) NOT NULL,
  `sourceId` varchar(100),
  `sourceStage` varchar(100),
  `status` enum('pending','sent','failed','retrying','dead_letter','manual_review') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `nextAttemptAt` bigint,
  `hasLeadId` boolean NOT NULL DEFAULT false,
  `hasEmailHash` boolean NOT NULL DEFAULT false,
  `hasPhoneHash` boolean NOT NULL DEFAULT false,
  `metaResponse` text,
  `errorCode` varchar(100),
  `lastError` text,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  `sentAt` bigint,
  CONSTRAINT `meta_crm_event_log_eventId_unique` UNIQUE (`eventId`)
);

CREATE TABLE `meta_reconciliation_state` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `integrationId` int,
  `cursor` text,
  `status` enum('idle','running','success','failed') NOT NULL DEFAULT 'idle',
  `lastAttemptAt` bigint,
  `lastSuccessAt` bigint,
  `lastError` text,
  `leadsScanned` int NOT NULL DEFAULT 0,
  `leadsImported` int NOT NULL DEFAULT 0,
  `eventsRetried` int NOT NULL DEFAULT 0,
  `updatedAt` bigint NOT NULL
);

CREATE INDEX `leads_normalizedPhone_idx` ON `leads` (`normalizedPhone`);
CREATE INDEX `leads_normalizedEmail_idx` ON `leads` (`normalizedEmail`);
CREATE INDEX `lead_meta_attributions_leadId_idx` ON `lead_meta_attributions` (`leadId`);
CREATE INDEX `lead_meta_attributions_campaign_idx` ON `lead_meta_attributions` (`metaCampaignId`);
CREATE INDEX `lead_meta_attributions_adset_idx` ON `lead_meta_attributions` (`metaAdSetId`);
CREATE INDEX `lead_meta_attributions_ad_idx` ON `lead_meta_attributions` (`metaAdId`);
CREATE INDEX `meta_webhook_inbox_status_idx` ON `meta_webhook_inbox` (`status`, `nextAttemptAt`);
CREATE INDEX `meta_integration_mappings_lookup_idx` ON `meta_integration_mappings` (`mappingType`, `matchValue`, `isActive`);
CREATE INDEX `meta_crm_event_log_lead_idx` ON `meta_crm_event_log` (`leadId`, `eventTime`);
CREATE INDEX `meta_crm_event_log_status_idx` ON `meta_crm_event_log` (`status`, `nextAttemptAt`);

INSERT INTO `meta_integration_mappings`
  (`mappingKey`, `mappingType`, `matchValue`, `matchName`, `program`, `outputValue`, `priority`, `isActive`, `createdAt`, `updatedAt`)
VALUES
  ('campaign:120246486726420741', 'campaign', '120246486726420741', 'Spain DNV Campaign', 'Spain DNV', NULL, 10, true, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('crm_stage:fresh', 'crm_stage', 'fresh', 'New Meta Lead stored successfully', NULL, 'Initial Lead from Facebook', 10, true, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('crm_stage:contacted', 'crm_stage', 'contacted', 'First genuine contact completed', NULL, 'Contacted', 20, true, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('crm_stage:meeting_scheduled', 'crm_stage', 'activity:meeting_scheduled', 'Meeting booked or confirmed', NULL, 'Marketing Qualified Lead', 30, true, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('crm_stage:qualified', 'crm_stage', 'qualified', 'Qualified stage', NULL, 'Marketing Qualified Lead', 30, true, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('crm_stage:prospect', 'crm_stage', 'prospect', 'Genuine sales opportunity', NULL, 'Sales Opportunity', 40, true, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000),
  ('crm_stage:contract_signed', 'crm_stage', 'contract:signed', 'Genuine signed Contract', NULL, 'Converted', 50, true, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000)
ON DUPLICATE KEY UPDATE
  `matchName` = VALUES(`matchName`),
  `program` = VALUES(`program`),
  `outputValue` = VALUES(`outputValue`),
  `priority` = VALUES(`priority`),
  `isActive` = VALUES(`isActive`),
  `updatedAt` = VALUES(`updatedAt`);
