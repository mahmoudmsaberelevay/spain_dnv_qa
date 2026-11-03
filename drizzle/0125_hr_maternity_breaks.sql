ALTER TABLE `hrEmployeeSchedules` ADD `maternityBreakMode` varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `hrEmployeeSchedules` ADD `maternityBreakStart1` varchar(5);--> statement-breakpoint
ALTER TABLE `hrEmployeeSchedules` ADD `maternityBreakStart2` varchar(5);--> statement-breakpoint
ALTER TABLE `hrEmployeeSchedules` ADD `maternityBreakUntil` date;
