CREATE TABLE IF NOT EXISTS `marketing_ready_summaries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `category` varchar(32) NOT NULL,
  `originalFileName` varchar(255) NOT NULL,
  `storageKey` varchar(768) NOT NULL,
  `fileSizeBytes` bigint NOT NULL,
  `pageCount` int NULL,
  `sha256Digest` varchar(64) NOT NULL,
  `uploadedByUserId` int NOT NULL,
  `uploadedByEmail` varchar(320) NULL,
  `createdAt` bigint NOT NULL,
  `deletedAt` bigint NULL,
  `deletedByUserId` int NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `marketing_ready_summaries_sha256_unique` (`sha256Digest`),
  KEY `marketing_ready_summaries_active_category_idx` (`deletedAt`, `category`, `title`)
);
