ALTER TABLE `meta_reconciliation_state`
  ADD COLUMN `scheduleCronTaskUid` varchar(65) NULL;

CREATE UNIQUE INDEX `meta_reconciliation_task_uid_uq`
  ON `meta_reconciliation_state` (`scheduleCronTaskUid`);
