-- Agentic Marketing System — Phase 5b Campaign Pilot Proposals
-- Internal planning and approval records only.
-- This migration creates no Meta account, campaign, ad set, ad, audience, budget reservation,
-- spend, payment, credential, CAPI, webhook, Lead, Contract, Financial or client record.

CREATE TABLE IF NOT EXISTS `marketing_meta_campaign_pilot_proposals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proposalKey` varchar(96) NOT NULL,
  `version` int NOT NULL,
  `strategyPacketId` int NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'proposed',
  `title` varchar(300) NOT NULL,
  `programKeysJson` mediumtext NOT NULL,
  `requestedPermissionsJson` mediumtext NOT NULL,
  `budgetPlanJson` mediumtext NOT NULL,
  `measurementPlanJson` mediumtext NOT NULL,
  `monitoringPlanJson` mediumtext NOT NULL,
  `rollbackPlanJson` mediumtext NOT NULL,
  `proposalPayloadJson` mediumtext NOT NULL,
  `proposalHash` varchar(64) NOT NULL,
  `strategyPacketHash` varchar(64) NOT NULL,
  `ownerNote` mediumtext DEFAULT NULL,
  `createdByUserId` int NOT NULL,
  `proposedAt` bigint NOT NULL,
  `decidedByUserId` int DEFAULT NULL,
  `decidedAt` bigint DEFAULT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_meta_campaign_pilot_proposal_key_unique` (`proposalKey`),
  UNIQUE KEY `marketing_meta_campaign_pilot_proposal_version_unique` (`version`),
  KEY `marketing_meta_campaign_pilot_proposal_packet_idx` (`strategyPacketId`, `status`),
  KEY `marketing_meta_campaign_pilot_proposal_status_idx` (`status`, `updatedAt`)
);
