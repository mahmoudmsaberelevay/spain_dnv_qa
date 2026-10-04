-- ELEVAY Meta Ads production reporting foundation.
-- Additive only. These immutable records are limited to the approved EGP account's
-- aggregate, read-only reporting snapshot and review-only proposals. They cannot
-- store credentials, Lead/client identity, media bytes, campaign/ad mutations,
-- spend instructions, publishing, or release authority.
CREATE TABLE IF NOT EXISTS `marketing_meta_ads_production_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reportKey` varchar(96) NOT NULL,
  `adAccountId` varchar(32) NOT NULL,
  `currency` varchar(10) NOT NULL,
  `windowStart` varchar(10) NOT NULL,
  `windowEnd` varchar(10) NOT NULL,
  `reportRunAt` bigint NOT NULL,
  `reportHash` varchar(64) NOT NULL,
  `snapshotJson` mediumtext NOT NULL,
  `capturedByUserId` int NOT NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_meta_ads_production_report_key_unique` (`reportKey`),
  UNIQUE KEY `marketing_meta_ads_production_report_hash_unique` (`reportHash`),
  KEY `marketing_meta_ads_production_source_window_idx` (`adAccountId`, `windowStart`, `windowEnd`),
  KEY `marketing_meta_ads_production_run_idx` (`reportRunAt`),
  KEY `marketing_meta_ads_production_captured_by_idx` (`capturedByUserId`, `reportRunAt`)
);
