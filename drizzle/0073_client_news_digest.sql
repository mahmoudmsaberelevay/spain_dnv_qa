CREATE TABLE IF NOT EXISTS `public_news_articles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `canonicalUrlHash` varchar(64) NOT NULL,
  `url` varchar(2048) NOT NULL,
  `title` varchar(500) NOT NULL,
  `description` text,
  `sourceName` varchar(255),
  `sourceMailbox` varchar(320) NOT NULL,
  `sourceMessageId` varchar(255) NOT NULL,
  `digestReceivedAt` timestamp NOT NULL,
  `publishedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `public_news_articles_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `public_news_articles_publicId_unique` UNIQUE(`publicId`),
  CONSTRAINT `public_news_articles_canonical_url_hash_uq` UNIQUE(`canonicalUrlHash`),
  INDEX `public_news_articles_newest_idx` (`digestReceivedAt`, `id`)
);

CREATE TABLE IF NOT EXISTS `news_digest_imports` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sourceMessageId` varchar(255) NOT NULL,
  `sourceMailbox` varchar(320) NOT NULL,
  `subject` varchar(500) NOT NULL,
  `receivedAt` timestamp NOT NULL,
  `status` enum('processing','success','failed') NOT NULL DEFAULT 'processing',
  `articlesFound` int NOT NULL DEFAULT 0,
  `articlesInserted` int NOT NULL DEFAULT 0,
  `errorMessage` text,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  CONSTRAINT `news_digest_imports_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `news_digest_imports_message_uq` UNIQUE(`sourceMailbox`, `sourceMessageId`),
  INDEX `news_digest_imports_status_date_idx` (`status`, `startedAt`)
);

CREATE TABLE IF NOT EXISTS `news_digest_settings` (
  `id` int NOT NULL,
  `sourceMailbox` varchar(320) NOT NULL DEFAULT 'mahmoud.saberelevay@gmail.com',
  `subjectTrigger` varchar(255) NOT NULL DEFAULT 'Daily Digest',
  `gmailRefreshTokenEncrypted` text,
  `gmailConnectedEmail` varchar(320),
  `gmailConnectedAt` timestamp NULL,
  `scheduleCronTaskUid` varchar(65),
  `maxArticles` int NOT NULL DEFAULT 200,
  `lastAttemptAt` timestamp NULL,
  `lastSuccessfulAt` timestamp NULL,
  `lastError` text,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `news_digest_settings_id_pk` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `public_news_push_subscriptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `pushToken` varchar(255) NOT NULL,
  `locale` enum('en','ar') NOT NULL DEFAULT 'en',
  `platform` varchar(32),
  `appVersion` varchar(64),
  `isActive` boolean NOT NULL DEFAULT true,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `public_news_push_subscriptions_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `public_news_push_subscriptions_publicId_unique` UNIQUE(`publicId`),
  CONSTRAINT `public_news_push_subscriptions_token_uq` UNIQUE(`pushToken`),
  INDEX `public_news_push_subscriptions_active_seen_idx` (`isActive`, `lastSeenAt`)
);

INSERT INTO `news_digest_settings` (`id`, `sourceMailbox`, `subjectTrigger`, `maxArticles`)
VALUES (1, 'mahmoud.saberelevay@gmail.com', 'Daily Digest', 200)
ON DUPLICATE KEY UPDATE
  `sourceMailbox` = VALUES(`sourceMailbox`),
  `subjectTrigger` = VALUES(`subjectTrigger`),
  `maxArticles` = VALUES(`maxArticles`);

UPDATE `client_portal_users`
SET `notificationPreferences` = JSON_SET(COALESCE(`notificationPreferences`, JSON_OBJECT()), '$.news', true)
WHERE JSON_EXTRACT(COALESCE(`notificationPreferences`, JSON_OBJECT()), '$.news') IS NULL;
