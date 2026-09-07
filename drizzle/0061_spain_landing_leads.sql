CREATE TABLE IF NOT EXISTS `spain_landing_inquiries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `externalSubmissionId` int NOT NULL,
  `leadId` int,
  `source` varchar(100) NOT NULL DEFAULT 'Spain_landing page',
  `program` varchar(100) NOT NULL DEFAULT 'Spain DNV',
  `language` enum('en','ar') NOT NULL,
  `jobPosition` varchar(80) NOT NULL,
  `matchMethod` enum('new','phone','email','manual_review') NOT NULL,
  `status` enum('processing','created','matched','manual_review','failed') NOT NULL DEFAULT 'processing',
  `processingToken` varchar(64),
  `payloadFingerprint` varchar(64) NOT NULL,
  `lastErrorCode` varchar(100),
  `firstReceivedAt` bigint NOT NULL,
  `processedAt` bigint,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  CONSTRAINT `spain_landing_inquiries_id` PRIMARY KEY(`id`),
  CONSTRAINT `spain_landing_inquiries_externalSubmissionId_unique` UNIQUE(`externalSubmissionId`)
);

CREATE INDEX `idx_spain_landing_inquiries_lead` ON `spain_landing_inquiries` (`leadId`);
CREATE INDEX `idx_spain_landing_inquiries_status_received` ON `spain_landing_inquiries` (`status`, `firstReceivedAt`);

INSERT INTO `lead_sources` (`name`, `color`, `isActive`, `isDefault`, `createdAt`)
SELECT 'Spain_landing page', '#5BA3B8', 1, 0, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM `lead_sources` WHERE `name` = 'Spain_landing page'
);
