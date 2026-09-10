CREATE TABLE `wa_bridge_events` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `eventType` enum('message','duplicate','media_stored','media_failed','invalid','error') NOT NULL,
  `outcome` enum('accepted','duplicate','rejected','failed') NOT NULL,
  `messageId` varchar(256),
  `groupId` varchar(128),
  `errorCode` varchar(64),
  `occurredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `wa_bridge_events_id` PRIMARY KEY(`id`)
);

CREATE INDEX `wa_bridge_events_occurred_idx` ON `wa_bridge_events` (`occurredAt`);
CREATE INDEX `wa_bridge_events_outcome_occurred_idx` ON `wa_bridge_events` (`outcome`, `occurredAt`);
CREATE INDEX `wa_bridge_events_message_idx` ON `wa_bridge_events` (`messageId`);
CREATE UNIQUE INDEX `wa_media_files_message_unique` ON `wa_media_files` (`messageId`);
CREATE INDEX `wa_media_files_status_created_idx` ON `wa_media_files` (`downloadStatus`, `createdAt`);

UPDATE `wa_messages`
SET `whatsappTimestamp` = `whatsappTimestamp` * 1000
WHERE `whatsappTimestamp` IS NOT NULL
  AND `whatsappTimestamp` > 0
  AND `whatsappTimestamp` < 1000000000000;

ALTER TABLE `wa_messages`
MODIFY COLUMN `messageType` enum('text','image','video','audio','document','sticker','location','reaction','contacts','system','unknown') NOT NULL DEFAULT 'text';

ALTER TABLE `wa_messages` ADD COLUMN `transcriptArabic` text AFTER `transcriptLang`;
ALTER TABLE `wa_messages` ADD COLUMN `transcriptEnglish` text AFTER `transcriptArabic`;
