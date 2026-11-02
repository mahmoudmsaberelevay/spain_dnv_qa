-- Stage 1 HR foundation: Financial remains the only writer of employee salary data.
-- The CRM-user association is explicit and nullable: no historical employee is guessed
-- or linked by name/email during this migration.
ALTER TABLE `finEmployees`
  ADD COLUMN `crmUserId` int NULL;

ALTER TABLE `finEmployees`
  ADD UNIQUE INDEX `fin_employees_crm_user_unique` (`crmUserId`);

CREATE TABLE `finEmployeeSalaryRates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employeeId` int NOT NULL,
  `monthlySalary` decimal(14,2) NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'EGP',
  `effectiveFrom` date NOT NULL,
  `createdByUserId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `finEmployeeSalaryRates_id` PRIMARY KEY(`id`),
  CONSTRAINT `fin_employee_salary_rates_employee_effective_unique` UNIQUE(`employeeId`, `effectiveFrom`)
);

CREATE INDEX `fin_employee_salary_rates_employee_effective_idx`
  ON `finEmployeeSalaryRates` (`employeeId`, `effectiveFrom`);

-- Seed today's effective rate from the existing Financial salary value. This does not
-- assert any prior salary history and leaves CRM-login links unassigned for review.
INSERT INTO `finEmployeeSalaryRates` (`employeeId`, `monthlySalary`, `currency`, `effectiveFrom`)
SELECT `employee`.`id`, COALESCE(`employee`.`salary`, 0), 'EGP', CURRENT_DATE()
FROM `finEmployees` AS `employee`
LEFT JOIN `finEmployeeSalaryRates` AS `rate`
  ON `rate`.`employeeId` = `employee`.`id`
WHERE `rate`.`id` IS NULL;
