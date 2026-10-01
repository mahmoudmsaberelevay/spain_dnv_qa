-- ELEVAY Agentic Marketing: system-generated media association control plane.
-- Additive only. Records metadata and integrity references, never media bytes,
-- credentials, Meta publication, campaign/spend, CAPI, Lead, or client data.

CREATE TABLE IF NOT EXISTS `marketing_generated_media_assets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assetKey` varchar(180) NOT NULL,
  `weeklyItemId` int NULL,
  `contentPacketId` int NULL,
  `assetType` varchar(32) NOT NULL,
  `providerAlias` varchar(96) NOT NULL,
  `origin` varchar(48) NOT NULL DEFAULT 'system_generated',
  `generationTaskId` varchar(255) NULL,
  `status` varchar(32) NOT NULL DEFAULT 'review_ready',
  `storageKey` varchar(768) NOT NULL,
  `assetUrl` varchar(2000) NOT NULL,
  `assetSha256` varchar(64) NOT NULL,
  `mimeType` varchar(128) NOT NULL,
  `metadataJson` mediumtext NOT NULL,
  `supersededAt` bigint NULL,
  `generatedAt` bigint NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_generated_media_asset_key_unique` (`assetKey`),
  UNIQUE KEY `marketing_generated_media_url_hash_unique` (`assetUrl`, `assetSha256`),
  KEY `marketing_generated_media_weekly_item_idx` (`weeklyItemId`, `status`, `generatedAt`),
  KEY `marketing_generated_media_content_packet_idx` (`contentPacketId`, `status`, `generatedAt`)
);
