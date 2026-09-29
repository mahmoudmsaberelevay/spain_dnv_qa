-- ELEVAY Agentic Marketing System: bounded weekly multi-model automation
-- Additive control plane only. No CRM, provider, media, Meta, CAPI, or publishing data is changed here.

CREATE TABLE IF NOT EXISTS `marketing_weekly_automation_controls` (
  `id` int NOT NULL AUTO_INCREMENT,
  `controlKey` varchar(96) NOT NULL,
  `isEnabled` boolean NOT NULL DEFAULT false,
  `state` varchar(48) NOT NULL DEFAULT 'disabled',
  `monthlyBudgetUsd` decimal(12,2) NOT NULL DEFAULT '100.00',
  `perRunReserveUsd` decimal(12,2) NOT NULL DEFAULT '20.00',
  `scheduleTaskUid` varchar(255) NULL,
  `manusWebhookId` varchar(255) NULL,
  `lastRunAt` bigint NULL,
  `lastRunStatus` varchar(48) NULL,
  `lastError` text NULL,
  `configuredByUserId` int NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_weekly_automation_control_key_unique` (`controlKey`),
  KEY `marketing_weekly_automation_control_state_idx` (`state`, `updatedAt`)
);

CREATE TABLE IF NOT EXISTS `marketing_weekly_automation_jobs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `jobKey` varchar(96) NOT NULL,
  `idempotencyKey` varchar(160) NOT NULL,
  `periodStart` varchar(10) NOT NULL,
  `triggerType` varchar(32) NOT NULL,
  `state` varchar(48) NOT NULL DEFAULT 'queued',
  `inputSnapshotJson` mediumtext NOT NULL,
  `openAiOutputJson` mediumtext NULL,
  `anthropicOutputJson` mediumtext NULL,
  `manusTaskId` varchar(255) NULL,
  `manusTaskUrl` varchar(2000) NULL,
  `manusOutputJson` mediumtext NULL,
  `attachmentsJson` mediumtext NOT NULL,
  `planId` int NULL,
  `reservedCostUsd` decimal(12,2) NOT NULL DEFAULT '0.00',
  `errorCode` varchar(120) NULL,
  `errorSummary` text NULL,
  `createdByUserId` int NOT NULL,
  `startedAt` bigint NULL,
  `completedAt` bigint NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_weekly_automation_job_key_unique` (`jobKey`),
  UNIQUE KEY `marketing_weekly_automation_job_idempotency_unique` (`idempotencyKey`),
  UNIQUE KEY `marketing_weekly_automation_manus_task_unique` (`manusTaskId`),
  KEY `marketing_weekly_automation_job_period_idx` (`periodStart`, `state`),
  KEY `marketing_weekly_automation_job_state_idx` (`state`, `updatedAt`)
);

CREATE TABLE IF NOT EXISTS `marketing_weekly_automation_budget_ledger` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entryKey` varchar(160) NOT NULL,
  `periodKey` varchar(7) NOT NULL,
  `jobId` int NOT NULL,
  `entryType` varchar(48) NOT NULL,
  `amountUsd` decimal(12,2) NOT NULL DEFAULT '0.00',
  `note` text NULL,
  `createdAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_weekly_automation_budget_entry_unique` (`entryKey`),
  KEY `marketing_weekly_automation_budget_period_idx` (`periodKey`, `createdAt`),
  KEY `marketing_weekly_automation_budget_job_idx` (`jobId`, `createdAt`)
);
