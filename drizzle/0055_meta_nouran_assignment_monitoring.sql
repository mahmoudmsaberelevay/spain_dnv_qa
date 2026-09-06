ALTER TABLE `leads`
  ADD COLUMN `assignedConsultantUserId` int NULL,
  ADD COLUMN `metaAssignmentStatus` enum('not_applicable','assigned','preserved','pending','manual_review') NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN `metaAssignmentErrorCode` varchar(100) NULL,
  ADD COLUMN `metaAssignmentUpdatedAt` bigint NULL;

ALTER TABLE `lead_meta_attributions`
  ADD COLUMN `routingConsultantUserId` int NULL,
  ADD COLUMN `routingConsultantDisplayName` varchar(255) NULL,
  ADD COLUMN `matchMethod` enum('new_lead','meta_lead_id','phone','email') NOT NULL DEFAULT 'new_lead',
  ADD COLUMN `duplicateIndicator` boolean NOT NULL DEFAULT false,
  ADD COLUMN `ambiguousMatch` boolean NOT NULL DEFAULT false;

ALTER TABLE `meta_webhook_inbox`
  ADD COLUMN `ingestionSource` enum('webhook','reconciliation') NOT NULL DEFAULT 'webhook',
  ADD COLUMN `signatureValidated` boolean NOT NULL DEFAULT false,
  ADD COLUMN `matchMethod` varchar(50) NULL,
  ADD COLUMN `duplicateIndicator` boolean NOT NULL DEFAULT false,
  ADD COLUMN `ambiguousMatch` boolean NOT NULL DEFAULT false,
  ADD COLUMN `requiresManualReview` boolean NOT NULL DEFAULT false,
  ADD COLUMN `manualReviewReason` varchar(100) NULL,
  ADD COLUMN `assignmentStatus` enum('not_applicable','assigned','preserved','pending','manual_review') NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN `lastErrorCode` varchar(100) NULL;

ALTER TABLE `meta_webhook_inbox`
  MODIFY COLUMN `status` enum('pending','processing','processed','failed','retrying','dead_letter','manual_review') NOT NULL DEFAULT 'pending';

CREATE INDEX `idx_leads_meta_assignment_status` ON `leads` (`isMetaTestLead`, `metaAssignmentStatus`, `createdAt`);
CREATE INDEX `idx_meta_inbox_monitoring` ON `meta_webhook_inbox` (`isTestLead`, `ingestionSource`, `status`, `receivedAt`);
CREATE INDEX `idx_meta_inbox_assignment` ON `meta_webhook_inbox` (`assignmentStatus`, `requiresManualReview`, `receivedAt`);

CREATE TABLE `meta_assignment_policies` (
  `id` int AUTO_INCREMENT NOT NULL,
  `policyKey` varchar(100) NOT NULL,
  `consultantUserId` int NOT NULL,
  `consultantDisplayName` varchar(255) NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `backfillBaselineAt` bigint NOT NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  CONSTRAINT `meta_assignment_policies_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `meta_assignment_policies_policy_key_unique` UNIQUE(`policyKey`)
);

CREATE TABLE `meta_lead_assignment_audits` (
  `id` int AUTO_INCREMENT NOT NULL,
  `assignmentKey` varchar(255) NOT NULL,
  `leadId` int NULL,
  `metaLeadId` varchar(100) NULL,
  `previousConsultant` varchar(255) NULL,
  `newConsultantUserId` int NULL,
  `newConsultant` varchar(255) NULL,
  `reason` varchar(100) NOT NULL DEFAULT 'meta_default_assignment',
  `outcome` enum('assigned','preserved','pending','manual_review','skipped_test') NOT NULL,
  `systemActor` varchar(100) NOT NULL DEFAULT 'system:meta_ingestion',
  `createdAt` bigint NOT NULL,
  CONSTRAINT `meta_lead_assignment_audits_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `meta_lead_assignment_audits_assignment_key_unique` UNIQUE(`assignmentKey`)
);
CREATE INDEX `idx_meta_assignment_audits_lead` ON `meta_lead_assignment_audits` (`leadId`, `createdAt`);
CREATE INDEX `idx_meta_assignment_audits_meta_lead` ON `meta_lead_assignment_audits` (`metaLeadId`, `createdAt`);

CREATE TABLE `meta_notification_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `notificationKey` varchar(255) NOT NULL,
  `notificationType` enum('lead_alert','admin_alert') NOT NULL,
  `leadId` int NULL,
  `metaLeadId` varchar(100) NULL,
  `safeAlertCode` varchar(100) NULL,
  `status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `nextAttemptAt` bigint NULL,
  `recipientCount` int NOT NULL DEFAULT 0,
  `lastError` text NULL,
  `sentAt` bigint NULL,
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  CONSTRAINT `meta_notification_log_id_pk` PRIMARY KEY(`id`),
  CONSTRAINT `meta_notification_log_notification_key_unique` UNIQUE(`notificationKey`)
);
CREATE INDEX `idx_meta_notification_retry` ON `meta_notification_log` (`status`, `nextAttemptAt`, `createdAt`);

CREATE TABLE `meta_webhook_security_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventType` enum('signed_accepted','signature_failure','verification_failure') NOT NULL,
  `safeCode` varchar(100) NOT NULL,
  `occurredAt` bigint NOT NULL,
  CONSTRAINT `meta_webhook_security_events_id_pk` PRIMARY KEY(`id`)
);
CREATE INDEX `idx_meta_webhook_security_time` ON `meta_webhook_security_events` (`eventType`, `occurredAt`);

CREATE TABLE `meta_monitoring_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `capturedAt` bigint NOT NULL,
  `signedWebhookCount` int NOT NULL DEFAULT 0,
  `signatureFailureCount` int NOT NULL DEFAULT 0,
  `processedInboxCount` int NOT NULL DEFAULT 0,
  `failedInboxCount` int NOT NULL DEFAULT 0,
  `retryInboxCount` int NOT NULL DEFAULT 0,
  `p50IngestionDelaySeconds` int NULL,
  `p95IngestionDelaySeconds` int NULL,
  `metaLeadIdCoverageBps` int NULL,
  `attributionCoverageBps` int NULL,
  `programCoverageBps` int NULL,
  `assignmentCoverageBps` int NULL,
  `unassignedOverTenMinutes` int NOT NULL DEFAULT 0,
  `duplicateAttributionCount` int NOT NULL DEFAULT 0,
  `ambiguousMatchCount` int NOT NULL DEFAULT 0,
  `manualReviewCount` int NOT NULL DEFAULT 0,
  `stageOrderViolationCount` int NOT NULL DEFAULT 0,
  `testLeadLeakageCount` int NOT NULL DEFAULT 0,
  `productionSendingEnabled` boolean NOT NULL DEFAULT false,
  CONSTRAINT `meta_monitoring_snapshots_id_pk` PRIMARY KEY(`id`)
);
CREATE INDEX `idx_meta_monitoring_snapshots_time` ON `meta_monitoring_snapshots` (`capturedAt`);

INSERT INTO `meta_assignment_policies`
  (`policyKey`, `consultantUserId`, `consultantDisplayName`, `isActive`, `backfillBaselineAt`, `createdAt`, `updatedAt`)
SELECT
  'META_DEFAULT_CONSULTANT',
  u.id,
  u.name,
  true,
  1788547867000,
  UNIX_TIMESTAMP() * 1000,
  UNIX_TIMESTAMP() * 1000
FROM `users` u
WHERE LOWER(TRIM(REGEXP_REPLACE(COALESCE(u.name, ''), '[[:space:]]+', ' '))) = 'nouran mamdouh'
  AND LOWER(COALESCE(u.email, '')) LIKE '%@elevay.com'
  AND u.lastSignedIn >= DATE_SUB(NOW(), INTERVAL 180 DAY)
  AND EXISTS (SELECT 1 FROM `leads_permissions` lp WHERE lp.userId = u.id AND lp.canView = true)
  AND (
    SELECT COUNT(*) FROM `users` u2
    WHERE LOWER(TRIM(REGEXP_REPLACE(COALESCE(u2.name, ''), '[[:space:]]+', ' '))) = 'nouran mamdouh'
      AND LOWER(COALESCE(u2.email, '')) LIKE '%@elevay.com'
      AND u2.lastSignedIn >= DATE_SUB(NOW(), INTERVAL 180 DAY)
      AND EXISTS (SELECT 1 FROM `leads_permissions` lp2 WHERE lp2.userId = u2.id AND lp2.canView = true)
  ) = 1
ON DUPLICATE KEY UPDATE
  `consultantUserId` = VALUES(`consultantUserId`),
  `consultantDisplayName` = VALUES(`consultantDisplayName`),
  `isActive` = true,
  `backfillBaselineAt` = VALUES(`backfillBaselineAt`),
  `updatedAt` = VALUES(`updatedAt`);
