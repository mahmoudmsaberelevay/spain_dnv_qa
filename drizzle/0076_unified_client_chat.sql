-- Standalone ELEVAY chat system for Client Documentation, Client Portal, and mobile.
-- Additive only: existing client, portal-message, and WhatsApp records are unchanged.

CREATE TABLE `client_chat_conversations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `publicId` VARCHAR(36) NOT NULL,
  `clientCaseId` INT NOT NULL,
  `primaryPortalApplicationId` INT NULL,
  `status` ENUM('active','archived','blocked') NOT NULL DEFAULT 'active',
  `assignedStaffUserId` INT NULL,
  `waitingOn` ENUM('none','client','staff') NOT NULL DEFAULT 'none',
  `lastMessageId` INT NULL,
  `lastMessageAt` BIGINT NULL,
  `lastClientMessageAt` BIGINT NULL,
  `lastStaffMessageAt` BIGINT NULL,
  `createdByStaffUserId` INT NULL,
  `createdAt` BIGINT NOT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_conversations_publicId_unique` (`publicId`),
  UNIQUE KEY `client_chat_conversations_case_unique` (`clientCaseId`),
  KEY `client_chat_conversations_status_activity_idx` (`status`, `lastMessageAt`),
  KEY `client_chat_conversations_assigned_activity_idx` (`assignedStaffUserId`, `lastMessageAt`)
);

CREATE TABLE `client_chat_participants` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `publicId` VARCHAR(36) NOT NULL,
  `conversationId` INT NOT NULL,
  `participantType` ENUM('staff','portal') NOT NULL,
  `staffUserId` INT NULL,
  `portalUserId` INT NULL,
  `role` ENUM('client','consultant','paralegal','manager','admin','observer') NOT NULL,
  `status` ENUM('active','left','revoked','blocked') NOT NULL DEFAULT 'active',
  `canSend` BOOLEAN NOT NULL DEFAULT TRUE,
  `canViewInternal` BOOLEAN NOT NULL DEFAULT FALSE,
  `canManage` BOOLEAN NOT NULL DEFAULT FALSE,
  `notificationPreferences` JSON NULL,
  `muteUntil` BIGINT NULL,
  `lastReadMessageId` INT NULL,
  `clearedThroughMessageId` INT NULL,
  `lastSeenAt` BIGINT NULL,
  `typingExpiresAt` BIGINT NULL,
  `joinedAt` BIGINT NOT NULL,
  `leftAt` BIGINT NULL,
  `createdAt` BIGINT NOT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_participants_publicId_unique` (`publicId`),
  UNIQUE KEY `client_chat_participants_staff_unique` (`conversationId`, `staffUserId`),
  UNIQUE KEY `client_chat_participants_portal_unique` (`conversationId`, `portalUserId`),
  KEY `client_chat_participants_active_idx` (`conversationId`, `status`),
  KEY `client_chat_participants_staff_idx` (`staffUserId`, `status`),
  KEY `client_chat_participants_portal_idx` (`portalUserId`, `status`)
);

CREATE TABLE `client_chat_messages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `publicId` VARCHAR(36) NOT NULL,
  `conversationId` INT NOT NULL,
  `clientMessageId` VARCHAR(64) NOT NULL,
  `legacyPortalMessageId` INT NULL,
  `senderParticipantId` INT NULL,
  `senderType` ENUM('client','staff','system') NOT NULL,
  `senderNameSnapshot` VARCHAR(255) NOT NULL,
  `visibility` ENUM('client','internal') NOT NULL DEFAULT 'client',
  `messageType` ENUM('text','image','video','file','voice','audio','system') NOT NULL DEFAULT 'text',
  `body` TEXT NULL,
  `replyToMessageId` INT NULL,
  `isImportant` BOOLEAN NOT NULL DEFAULT FALSE,
  `isPinned` BOOLEAN NOT NULL DEFAULT FALSE,
  `editedAt` BIGINT NULL,
  `deletedAt` BIGINT NULL,
  `deletedByParticipantId` INT NULL,
  `createdAt` BIGINT NOT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_messages_publicId_unique` (`publicId`),
  UNIQUE KEY `client_chat_messages_client_id_unique` (`clientMessageId`),
  UNIQUE KEY `client_chat_messages_legacy_portal_unique` (`legacyPortalMessageId`),
  KEY `client_chat_messages_conversation_cursor_idx` (`conversationId`, `id`),
  KEY `client_chat_messages_conversation_created_idx` (`conversationId`, `createdAt`),
  KEY `client_chat_messages_reply_idx` (`replyToMessageId`)
);

CREATE TABLE `client_chat_message_receipts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `messageId` INT NOT NULL,
  `participantId` INT NOT NULL,
  `deliveredAt` BIGINT NULL,
  `readAt` BIGINT NULL,
  `listenedAt` BIGINT NULL,
  `deviceName` VARCHAR(255) NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_receipts_message_participant_unique` (`messageId`, `participantId`),
  KEY `client_chat_receipts_participant_read_idx` (`participantId`, `readAt`)
);

CREATE TABLE `client_chat_message_versions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `messageId` INT NOT NULL,
  `versionNumber` INT NOT NULL,
  `body` TEXT NULL,
  `editedByParticipantId` INT NULL,
  `editReason` VARCHAR(255) NULL,
  `createdAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_message_versions_unique` (`messageId`, `versionNumber`),
  KEY `client_chat_message_versions_message_idx` (`messageId`, `createdAt`)
);

CREATE TABLE `client_chat_message_mentions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `messageId` INT NOT NULL,
  `participantId` INT NOT NULL,
  `notifiedAt` BIGINT NULL,
  `createdAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_message_mentions_unique` (`messageId`, `participantId`),
  KEY `client_chat_message_mentions_participant_idx` (`participantId`, `createdAt`)
);

CREATE TABLE `client_chat_message_stars` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `messageId` INT NOT NULL,
  `participantId` INT NOT NULL,
  `createdAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_message_stars_unique` (`messageId`, `participantId`),
  KEY `client_chat_message_stars_participant_idx` (`participantId`, `createdAt`)
);

CREATE TABLE `client_chat_reactions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `messageId` INT NOT NULL,
  `participantId` INT NOT NULL,
  `reaction` VARCHAR(32) NOT NULL,
  `createdAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_reactions_unique` (`messageId`, `participantId`, `reaction`),
  KEY `client_chat_reactions_message_idx` (`messageId`)
);

CREATE TABLE `client_chat_attachments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `publicId` VARCHAR(36) NOT NULL,
  `messageId` INT NOT NULL,
  `fileKey` VARCHAR(1024) NOT NULL,
  `originalFileName` VARCHAR(255) NOT NULL,
  `safeFileName` VARCHAR(255) NOT NULL,
  `mimeType` VARCHAR(128) NOT NULL,
  `fileSize` INT NOT NULL,
  `sha256` VARCHAR(64) NOT NULL,
  `width` INT NULL,
  `height` INT NULL,
  `durationMs` INT NULL,
  `waveform` JSON NULL,
  `scanStatus` ENUM('pending','clean','rejected','failed') NOT NULL DEFAULT 'pending',
  `transcriptStatus` ENUM('not_applicable','pending','complete','failed') NOT NULL DEFAULT 'not_applicable',
  `transcriptOriginal` TEXT NULL,
  `transcriptArabic` TEXT NULL,
  `transcriptEnglish` TEXT NULL,
  `savedClientDocumentId` INT NULL,
  `createdAt` BIGINT NOT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_attachments_publicId_unique` (`publicId`),
  UNIQUE KEY `client_chat_attachments_message_hash_unique` (`messageId`, `sha256`),
  KEY `client_chat_attachments_message_idx` (`messageId`),
  KEY `client_chat_attachments_scan_idx` (`scanStatus`, `createdAt`)
);

CREATE TABLE `client_chat_hidden_messages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `messageId` INT NOT NULL,
  `participantId` INT NOT NULL,
  `hiddenAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_hidden_message_unique` (`messageId`, `participantId`)
);

CREATE TABLE `client_chat_drafts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `conversationId` INT NOT NULL,
  `participantId` INT NOT NULL,
  `body` TEXT NULL,
  `replyToMessageId` INT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_drafts_participant_unique` (`conversationId`, `participantId`)
);

CREATE TABLE `client_chat_scheduled_messages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `publicId` VARCHAR(36) NOT NULL,
  `conversationId` INT NOT NULL,
  `senderParticipantId` INT NOT NULL,
  `body` TEXT NOT NULL,
  `visibility` ENUM('client','internal') NOT NULL DEFAULT 'client',
  `scheduledFor` BIGINT NOT NULL,
  `status` ENUM('scheduled','sending','sent','cancelled','failed') NOT NULL DEFAULT 'scheduled',
  `heartbeatTaskUid` VARCHAR(191) NULL,
  `sentMessageId` INT NULL,
  `failureReason` VARCHAR(500) NULL,
  `createdAt` BIGINT NOT NULL,
  `updatedAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_scheduled_messages_publicId_unique` (`publicId`),
  KEY `client_chat_scheduled_due_idx` (`status`, `scheduledFor`)
);

CREATE TABLE `client_chat_message_reports` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `publicId` VARCHAR(36) NOT NULL,
  `messageId` INT NOT NULL,
  `reporterParticipantId` INT NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `status` ENUM('open','reviewed','dismissed','actioned') NOT NULL DEFAULT 'open',
  `reviewedByStaffUserId` INT NULL,
  `reviewedAt` BIGINT NULL,
  `createdAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_message_reports_publicId_unique` (`publicId`),
  KEY `client_chat_reports_reporter_idx` (`reporterParticipantId`, `status`),
  KEY `client_chat_reports_message_idx` (`messageId`)
);

CREATE TABLE `client_chat_audit_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `publicId` VARCHAR(36) NOT NULL,
  `conversationId` INT NULL,
  `messageId` INT NULL,
  `actorStaffUserId` INT NULL,
  `actorPortalUserId` INT NULL,
  `action` VARCHAR(100) NOT NULL,
  `outcome` ENUM('success','denied','failure') NOT NULL DEFAULT 'success',
  `metadata` JSON NULL,
  `createdAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_chat_audit_events_publicId_unique` (`publicId`),
  KEY `client_chat_audit_conversation_idx` (`conversationId`, `createdAt`),
  KEY `client_chat_audit_action_idx` (`action`, `createdAt`)
);

CREATE TABLE `client_chat_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `conversationId` INT NOT NULL,
  `eventType` ENUM('message_created','message_edited','message_deleted','reaction_changed','receipt_changed','typing_changed','presence_changed','attachment_changed','participant_changed','conversation_changed') NOT NULL,
  `entityId` INT NULL,
  `actorParticipantId` INT NULL,
  `metadata` JSON NULL,
  `createdAt` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `client_chat_events_conversation_cursor_idx` (`conversationId`, `id`),
  KEY `client_chat_events_conversation_time_idx` (`conversationId`, `createdAt`)
);
