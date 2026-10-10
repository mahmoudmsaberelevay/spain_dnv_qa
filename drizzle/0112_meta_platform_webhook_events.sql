-- Durable, PII-minimized Meta Page/Instagram webhook events and signed deletion callbacks.
-- Additive only: no Lead, client, campaign, or existing Meta attribution record is changed.

CREATE TABLE IF NOT EXISTS `meta_platform_webhook_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `eventKey` varchar(64) NOT NULL,
  `payloadHash` varchar(64) NOT NULL,
  `objectType` varchar(40) NOT NULL,
  `resourceId` varchar(100) NULL,
  `field` varchar(100) NOT NULL,
  `eventType` varchar(100) NOT NULL,
  `eventTimestamp` bigint NULL,
  `actorHash` varchar(64) NULL,
  `signatureValidated` boolean NOT NULL DEFAULT false,
  `status` enum('received','processed','ignored','manual_review','failed') NOT NULL DEFAULT 'received',
  `errorCode` varchar(100) NULL,
  `receivedAt` bigint NOT NULL,
  `processedAt` bigint NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `meta_platform_webhook_events_eventKey_unique` (`eventKey`),
  KEY `meta_platform_events_received_idx` (`receivedAt`),
  KEY `meta_platform_events_status_idx` (`status`,`receivedAt`)
);

CREATE TABLE IF NOT EXISTS `meta_data_deletion_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `confirmationCode` varchar(80) NOT NULL,
  `metaUserHash` varchar(64) NOT NULL,
  `issuedAt` bigint NULL,
  `status` enum('received','processing','completed','rejected') NOT NULL DEFAULT 'received',
  `receivedAt` bigint NOT NULL,
  `completedAt` bigint NULL,
  `updatedAt` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `meta_data_deletion_requests_confirmationCode_unique` (`confirmationCode`),
  KEY `meta_deletion_status_received_idx` (`status`,`receivedAt`)
);
