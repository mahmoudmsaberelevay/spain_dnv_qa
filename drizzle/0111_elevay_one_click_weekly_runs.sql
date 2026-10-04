-- ELEVAY owner one-click weekly production packs.
-- Additive only. These records coordinate explicit owner-triggered regeneration of
-- three reels and four static items. They store privacy-safe settings/planning
-- snapshots only; they do not authorize publishing, Meta activity, client/Lead
-- data, credentials, campaigns, ad spend, or external messaging.

CREATE TABLE IF NOT EXISTS `marketing_one_click_weekly_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `runKey` varchar(160) NOT NULL,
  `periodStart` varchar(10) NOT NULL,
  `generationMode` varchar(48) NOT NULL DEFAULT 'owner_one_click',
  `state` varchar(48) NOT NULL DEFAULT 'queued',
  `phase` varchar(48) NOT NULL DEFAULT 'planning',
  `planId` int NULL,
  `planningTaskId` varchar(255) NULL,
  `inputSnapshotJson` mediumtext NOT NULL,
  `councilOutputsJson` mediumtext NULL,
  `progressPercent` int NOT NULL DEFAULT 0,
  `lastErrorCode` varchar(128) NULL,
  `lastErrorSummary` varchar(1000) NULL,
  `startedByUserId` int NOT NULL,
  `startedAt` bigint NOT NULL,
  `completedAt` bigint NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_one_click_weekly_runs_run_key_unique` (`runKey`),
  KEY `marketing_one_click_weekly_runs_period_state_idx` (`periodStart`, `state`),
  KEY `marketing_one_click_weekly_runs_state_updated_idx` (`state`, `updatedAt`)
);

CREATE TABLE IF NOT EXISTS `marketing_one_click_weekly_run_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `runId` int NOT NULL,
  `itemKey` varchar(200) NOT NULL,
  `position` int NOT NULL,
  `itemType` varchar(16) NOT NULL,
  `state` varchar(48) NOT NULL DEFAULT 'queued',
  `phase` varchar(48) NOT NULL DEFAULT 'planning',
  `progressPercent` int NOT NULL DEFAULT 0,
  `sceneRequestCount` int NOT NULL DEFAULT 0,
  `completedSceneRequestCount` int NOT NULL DEFAULT 0,
  `generationTaskId` varchar(255) NULL,
  `outputManifestJson` mediumtext NULL,
  `lastErrorCode` varchar(128) NULL,
  `lastErrorSummary` varchar(1000) NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  `completedAt` bigint NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_one_click_weekly_run_items_item_key_unique` (`itemKey`),
  UNIQUE KEY `marketing_one_click_weekly_run_items_run_position_unique` (`runId`, `position`),
  KEY `marketing_one_click_weekly_run_items_run_state_idx` (`runId`, `state`, `position`)
);
