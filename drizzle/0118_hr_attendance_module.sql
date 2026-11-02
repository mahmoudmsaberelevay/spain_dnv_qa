-- Separate HR attendance module. Financial remains the owner of employee and salary data.
-- Attendance is scoped through finEmployees.crmUserId in the server router; no user
-- name, email, salary, or other private CRM fields are duplicated here.
CREATE TABLE `hrAttendance` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employeeId` int NOT NULL,
  `attendanceDate` date NOT NULL,
  `checkInAt` timestamp NOT NULL,
  `checkOutAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `hrAttendance_id` PRIMARY KEY(`id`),
  CONSTRAINT `hr_attendance_employee_date_unique` UNIQUE(`employeeId`, `attendanceDate`)
);

CREATE INDEX `hr_attendance_employee_date_idx`
  ON `hrAttendance` (`employeeId`, `attendanceDate`);
CREATE INDEX `hr_attendance_date_idx`
  ON `hrAttendance` (`attendanceDate`);
