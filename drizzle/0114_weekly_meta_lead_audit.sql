-- Owner-owned weekly verification of the Meta Lead Ads to CRM intake pipeline.
-- This is additive: it does not change Lead, client, payment, contract, or Meta history data.
CREATE TABLE IF NOT EXISTS `meta_weekly_lead_audit_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `auditKey` varchar(100) NOT NULL,
  `scheduleCronTaskUid` varchar(65) NULL,
  `isEnabled` boolean NOT NULL DEFAULT true,
  `lastAttemptAt` bigint NULL,
  `lastSuccessAt` bigint NULL,
  `lastFailureAt` bigint NULL,
  `lastErrorCode` varchar(100) NULL,
  `updatedAt` bigint NOT NULL,
  CONSTRAINT `meta_weekly_lead_audit_settings_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `meta_weekly_lead_audit_settings_auditKey_unique` UNIQUE(`auditKey`),
  CONSTRAINT `meta_weekly_lead_audit_settings_scheduleCronTaskUid_unique` UNIQUE(`scheduleCronTaskUid`)
);

CREATE TABLE IF NOT EXISTS `meta_weekly_lead_audit_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `runKey` varchar(160) NOT NULL,
  `taskUid` varchar(65) NOT NULL,
  `status` enum('processing','success','failed','skipped') NOT NULL DEFAULT 'processing',
  `integrationsChecked` int NOT NULL DEFAULT 0,
  `leadsScanned` int NOT NULL DEFAULT 0,
  `leadsImported` int NOT NULL DEFAULT 0,
  `inboxProcessed` int NOT NULL DEFAULT 0,
  `inboxFailed` int NOT NULL DEFAULT 0,
  `manualReviewCount` int NOT NULL DEFAULT 0,
  `ambiguousMatchCount` int NOT NULL DEFAULT 0,
  `duplicateAttributionCount` int NOT NULL DEFAULT 0,
  `errorCode` varchar(100) NULL,
  `startedAt` bigint NOT NULL,
  `completedAt` bigint NULL,
  `durationMs` int NULL,
  CONSTRAINT `meta_weekly_lead_audit_runs_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `meta_weekly_lead_audit_runs_runKey_unique` UNIQUE(`runKey`)
);

CREATE INDEX `idx_meta_weekly_lead_audit_runs_task_time`
  ON `meta_weekly_lead_audit_runs` (`taskUid`, `startedAt`);
