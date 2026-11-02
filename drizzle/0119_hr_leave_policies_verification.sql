-- Additive HR expansion. No changes to existing employees, salaries, payments or attendance.
-- No configured schedules means no historical absence penalties.
-- The owner approved location-only verification on 2026-11-02. Unknown/missing
-- settings still fail closed. Initial seed never overwrites later admin settings.
CREATE TABLE IF NOT EXISTS `hrEmployeeSchedules` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `employeeId` INT NOT NULL,
  `startTime` VARCHAR(5) NOT NULL,
  `endTime` VARCHAR(5) NOT NULL,
  `graceMinutes` INT NOT NULL DEFAULT 0,
  `effectiveFrom` DATE NOT NULL,
  `changedByUserId` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `hr_schedule_employee_effective_unique` (`employeeId`, `effectiveFrom`)
);
CREATE TABLE IF NOT EXISTS `hrHolidays` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `holidayDate` DATE NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `changedByUserId` INT NOT NULL,
  UNIQUE KEY `hr_holiday_date_unique` (`holidayDate`)
);
CREATE TABLE IF NOT EXISTS `hrLeaveEntitlements` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `employeeId` INT NOT NULL,
  `year` INT NOT NULL,
  `totalDays` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `changedByUserId` INT NOT NULL,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `hr_leave_employee_year_unique` (`employeeId`, `year`)
);
CREATE TABLE IF NOT EXISTS `hrLeaveRequests` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `employeeId` INT NOT NULL,
  `fromDate` DATE NOT NULL,
  `toDate` DATE NOT NULL,
  `requestedDays` INT NOT NULL,
  `daysByYear` TEXT NOT NULL,
  `reason` VARCHAR(1000) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `decisionReason` VARCHAR(1000),
  `reviewedByUserId` INT,
  `reviewedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `hr_leave_employee_dates_idx` (`employeeId`, `fromDate`, `toDate`),
  KEY `hr_leave_status_idx` (`status`)
);
CREATE TABLE IF NOT EXISTS `hrSettings` (
  `id` INT NOT NULL PRIMARY KEY,
  `verificationMethod` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `officeLatitude` DECIMAL(10,7) NOT NULL DEFAULT 30.0712522,
  `officeLongitude` DECIMAL(10,7) NOT NULL DEFAULT 30.9468691,
  `radiusMeters` INT NOT NULL DEFAULT 100,
  `maxAccuracyMeters` INT NOT NULL DEFAULT 100,
  `changedByUserId` INT,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS `hrPunchAttempts` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `action` VARCHAR(12) NOT NULL,
  `accepted` BOOLEAN NOT NULL,
  `reason` VARCHAR(300) NOT NULL,
  `latitude` DECIMAL(10,7),
  `longitude` DECIMAL(10,7),
  `accuracyMeters` DECIMAL(12,2),
  `distanceMeters` DECIMAL(12,2),
  `userAgent` VARCHAR(500),
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `hr_punch_user_date_idx` (`userId`, `createdAt`)
);

INSERT INTO `hrSettings` (`id`, `verificationMethod`, `officeLatitude`, `officeLongitude`, `radiusMeters`, `maxAccuracyMeters`, `changedByUserId`)
VALUES (1, 'geofence', 30.0712522, 30.9468691, 100, 100, 1)
ON DUPLICATE KEY UPDATE `id` = `id`;
