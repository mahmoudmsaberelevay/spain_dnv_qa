ALTER TABLE `public_service_providers`
  ADD COLUMN `coverImageKey` varchar(1024) NULL AFTER `logoUrl`;

ALTER TABLE `public_service_providers`
  ADD COLUMN `coverImageUrl` varchar(1024) NULL AFTER `coverImageKey`;

CREATE TABLE `public_after_settlement_services` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `category` enum('housing','banking','insurance','tax','legal','education','healthcare','utilities','relocation','other') NOT NULL DEFAULT 'other',
  `titleEn` varchar(255) NOT NULL,
  `titleAr` varchar(255),
  `descriptionEn` text,
  `descriptionAr` text,
  `providerId` int,
  `actionLabelEn` varchar(120),
  `actionLabelAr` varchar(120),
  `actionType` enum('phone','whatsapp','email','website','none') NOT NULL DEFAULT 'none',
  `actionValue` varchar(1024),
  `displayOrder` int NOT NULL DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `public_after_settlement_services_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `public_after_settlement_services_publicId_unique` UNIQUE(`publicId`)
);

CREATE INDEX `public_after_settlement_services_active_order_idx`
  ON `public_after_settlement_services` (`isActive`, `displayOrder`);

CREATE INDEX `public_after_settlement_services_provider_idx`
  ON `public_after_settlement_services` (`providerId`);
