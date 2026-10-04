-- ELEVAY owner-reviewed OpenAI/Higgsfield marketing-media review runs.
-- Additive only. These isolated records do not invoke providers, authorize publishing,
-- establish budgets or caps, or store foreign-key constraints.

CREATE TABLE IF NOT EXISTS `marketing_review_media_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `runKey` varchar(200) NOT NULL,
  `weeklyItemId` int NOT NULL,
  `itemSnapshotHash` varchar(64) NOT NULL,
  `itemType` varchar(16) NOT NULL,
  `status` varchar(48) NOT NULL,
  `inputManifestJson` mediumtext NOT NULL,
  `costQuoteJson` mediumtext NOT NULL,
  `estimatedCostUsd` decimal(12,4) NULL,
  `ownerReviewedByUserId` int NULL,
  `ownerReviewedAt` bigint NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  `completedAt` bigint NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_review_media_runs_run_key_unique` (`runKey`),
  KEY `marketing_review_media_runs_weekly_item_created_idx` (`weeklyItemId`, `createdAt`)
);

CREATE TABLE IF NOT EXISTS `marketing_review_media_steps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `runId` int NOT NULL,
  `stepKey` varchar(200) NOT NULL,
  `stepType` varchar(32) NOT NULL,
  `sceneIndex` int NULL,
  `provider` varchar(32) NOT NULL,
  `model` varchar(128) NOT NULL,
  `idempotencyKey` varchar(255) NOT NULL,
  `requestBodyHash` varchar(64) NOT NULL,
  `estimatedCostUsd` decimal(12,4) NULL,
  `actualCostUsd` decimal(12,4) NULL,
  `state` varchar(48) NOT NULL,
  `providerRequestId` varchar(255) NULL,
  `statusUrl` varchar(2000) NULL,
  `cancelUrl` varchar(2000) NULL,
  `assetUrl` varchar(2000) NULL,
  `storageKey` varchar(400) NULL,
  `assetSha256` varchar(64) NULL,
  `errorCode` varchar(100) NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  `completedAt` bigint NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_review_media_steps_step_key_unique` (`stepKey`),
  UNIQUE KEY `marketing_review_media_steps_idempotency_key_unique` (`idempotencyKey`),
  KEY `marketing_review_media_steps_run_state_idx` (`runId`, `state`)
);
