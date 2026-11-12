-- Generated from a scoped export with drizzle-kit; historical schema drift is excluded.
-- Creates an empty configuration table. Does not enable a job or modify envelopes.
CREATE TABLE `contractDocusignSyncSettings` (
  `id` int NOT NULL,
  `enabled` boolean NOT NULL DEFAULT false,
  `scheduleCronTaskUid` varchar(65),
  `leaseToken` varchar(64),
  `leaseExpiresAt` bigint,
  `lastRunAt` bigint,
  `lastErrorCode` varchar(80),
  CONSTRAINT `contractDocusignSyncSettings_id` PRIMARY KEY (`id`),
  CONSTRAINT `contract_docusign_sync_task_uid` UNIQUE (`scheduleCronTaskUid`)
);
