CREATE TABLE IF NOT EXISTS `client_employee_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `staffUserId` int NOT NULL,
  `refreshTokenHash` varchar(255) NOT NULL,
  `deviceName` varchar(255),
  `platform` varchar(50),
  `osVersion` varchar(100),
  `appVersion` varchar(50),
  `locale` enum('en','ar') NOT NULL DEFAULT 'en',
  `ipAddress` varchar(64),
  `expiresAt` timestamp NOT NULL,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revokedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `client_employee_sessions_id` PRIMARY KEY(`id`),
  CONSTRAINT `client_employee_sessions_publicId_unique` UNIQUE(`publicId`),
  INDEX `client_employee_sessions_staff_active_idx` (`staffUserId`, `revokedAt`, `expiresAt`)
);
