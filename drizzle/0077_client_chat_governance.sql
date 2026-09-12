ALTER TABLE `client_portal_documents`
  ADD COLUMN `sourceChatMessageId` int NULL,
  ADD COLUMN `sourceChatAttachmentId` int NULL;

CREATE INDEX `client_portal_documents_chat_source_idx`
  ON `client_portal_documents` (`sourceChatAttachmentId`);

ALTER TABLE `client_chat_conversations`
  ADD COLUMN `retentionPolicy` enum('indefinite','seven_years') NOT NULL DEFAULT 'indefinite',
  ADD COLUMN `legalHoldAt` bigint NULL,
  ADD COLUMN `legalHoldReason` varchar(500) NULL,
  ADD COLUMN `legalHoldByStaffUserId` int NULL;

ALTER TABLE `client_chat_scheduled_messages`
  MODIFY COLUMN `heartbeatTaskUid` varchar(65) NULL;

CREATE UNIQUE INDEX `client_chat_scheduled_task_uid_unique`
  ON `client_chat_scheduled_messages` (`heartbeatTaskUid`);
