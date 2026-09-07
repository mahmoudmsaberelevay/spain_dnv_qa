CREATE TABLE IF NOT EXISTS `database_backup_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `scheduleCronTaskUid` varchar(65) DEFAULT NULL,
  `cronExpression` varchar(100) NOT NULL,
  `timeZone` varchar(64) NOT NULL DEFAULT 'Africa/Cairo',
  `isEnabled` boolean NOT NULL DEFAULT true,
  `authorizedTestRunUntil` bigint DEFAULT NULL,
  `lastAttemptAt` bigint DEFAULT NULL,
  `lastSuccessAt` bigint DEFAULT NULL,
  `lastFailureAt` bigint DEFAULT NULL,
  `lastErrorCode` varchar(80) DEFAULT NULL,
  `lastArtifactKey` varchar(500) DEFAULT NULL,
  `lastArtifactSizeBytes` bigint DEFAULT NULL,
  `lastEmailSuccessCount` int NOT NULL DEFAULT 0,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `database_backup_settings_name_unique` (`name`),
  UNIQUE KEY `database_backup_settings_schedule_uid_unique` (`scheduleCronTaskUid`)
);

CREATE TABLE IF NOT EXISTS `database_backup_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `runKey` varchar(160) NOT NULL,
  `taskUid` varchar(65) NOT NULL,
  `status` enum('processing','success','failed','skipped') NOT NULL DEFAULT 'processing',
  `artifactKey` varchar(500) DEFAULT NULL,
  `artifactSizeBytes` bigint DEFAULT NULL,
  `emailSuccessCount` int NOT NULL DEFAULT 0,
  `emailFailureCount` int NOT NULL DEFAULT 0,
  `errorCode` varchar(80) DEFAULT NULL,
  `startedAt` bigint NOT NULL,
  `completedAt` bigint DEFAULT NULL,
  `durationMs` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `database_backup_runs_run_key_unique` (`runKey`),
  KEY `database_backup_runs_task_uid_idx` (`taskUid`)
);

INSERT INTO `database_backup_settings`
  (`name`, `scheduleCronTaskUid`, `cronExpression`, `timeZone`, `isEnabled`, `updatedAt`)
VALUES
  ('primary-database-backup', '35xAWZJMQcb3whajGuJ6qL', '0 0 15,16 * * 1-4', 'Africa/Cairo', true, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000)
ON DUPLICATE KEY UPDATE
  `scheduleCronTaskUid` = VALUES(`scheduleCronTaskUid`),
  `cronExpression` = VALUES(`cronExpression`),
  `timeZone` = VALUES(`timeZone`),
  `isEnabled` = VALUES(`isEnabled`),
  `updatedAt` = VALUES(`updatedAt`);
