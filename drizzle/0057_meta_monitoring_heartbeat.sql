ALTER TABLE `meta_assignment_policies`
  ADD COLUMN `monitoringCronTaskUid` varchar(65) NULL;

CREATE UNIQUE INDEX `meta_assignment_policies_monitoringCronTaskUid_unique`
  ON `meta_assignment_policies` (`monitoringCronTaskUid`);
