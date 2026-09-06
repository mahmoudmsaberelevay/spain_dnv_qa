ALTER TABLE `leads`
  MODIFY COLUMN `metaSyncStatus` enum('pending','sent','failed','retrying','manual_review','approval_gated') DEFAULT 'pending';

ALTER TABLE `meta_crm_event_log`
  MODIFY COLUMN `status` enum('pending','sent','failed','retrying','dead_letter','manual_review','approval_gated') DEFAULT 'pending' NOT NULL,
  ADD COLUMN `deliveryMode` enum('production','test','approval_gated','legacy_unknown') NULL,
  ADD COLUMN `testEventCodeUsed` boolean NOT NULL DEFAULT false,
  ADD COLUMN `productionGateEnabledAtAttempt` boolean NULL,
  ADD COLUMN `requestDispatchedAt` bigint NULL,
  ADD COLUMN `metaResponseReceiptId` varchar(255) NULL,
  ADD COLUMN `deliveryEvidenceCode` varchar(100) NULL;

UPDATE `meta_crm_event_log`
SET
  `deliveryMode` = 'legacy_unknown',
  `deliveryEvidenceCode` = 'LEGACY_SENT_STATUS_NO_PROVENANCE'
WHERE `status` = 'sent' AND `deliveryMode` IS NULL;

UPDATE `meta_crm_event_log`
SET
  `status` = 'approval_gated',
  `deliveryMode` = 'approval_gated',
  `testEventCodeUsed` = false,
  `productionGateEnabledAtAttempt` = false,
  `requestDispatchedAt` = NULL,
  `metaResponseReceiptId` = NULL,
  `deliveryEvidenceCode` = 'META_PRODUCTION_APPROVAL_REQUIRED',
  `errorCode` = 'META_PRODUCTION_APPROVAL_REQUIRED',
  `nextAttemptAt` = NULL
WHERE
  `status` = 'manual_review'
  AND `attempts` = 0
  AND `lastError` = 'Production Meta CRM event sending is disabled pending explicit approval';

UPDATE `leads`
SET `metaSyncStatus` = 'approval_gated'
WHERE
  `metaSyncStatus` = 'manual_review'
  AND `metaSyncError` = 'Production Meta CRM event sending is disabled pending explicit approval';
