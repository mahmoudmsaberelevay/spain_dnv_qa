-- Agentic Marketing System — Meta Ads Strategy Approval Packets
-- Additive planning-governance records only. No Meta credential, ad account, campaign, ad set,
-- ad, budget, spend, payment, provider, CAPI, Lead or existing CRM table is created or changed.
CREATE TABLE IF NOT EXISTS `marketing_meta_ads_strategy_approval_packets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `packetKey` varchar(96) NOT NULL,
  `version` int NOT NULL,
  `strategySessionId` int NOT NULL,
  `brandBookId` int NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'proposed',
  `packetPayloadJson` mediumtext NOT NULL,
  `packetHash` varchar(64) NOT NULL,
  `sourceAnswerHash` varchar(64) NOT NULL,
  `ownerNote` mediumtext,
  `createdByUserId` int NOT NULL,
  `proposedAt` bigint NOT NULL,
  `decidedByUserId` int,
  `decidedAt` bigint,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_meta_ads_strategy_packet_key_unique` (`packetKey`),
  UNIQUE KEY `marketing_meta_ads_strategy_packet_version_unique` (`version`),
  KEY `marketing_meta_ads_strategy_packet_session_idx` (`strategySessionId`, `status`),
  KEY `marketing_meta_ads_strategy_packet_status_idx` (`status`, `updatedAt`)
);
