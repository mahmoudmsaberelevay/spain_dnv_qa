-- Hold every unsent Meta Test Lead CRM event for an explicit, one-event
-- administrator-approved Meta Test Events retry. No real Lead event is changed.
UPDATE `meta_crm_event_log`
SET
  `status` = 'manual_review',
  `deliveryMode` = 'test',
  `testEventCodeUsed` = 0,
  `productionGateEnabledAtAttempt` = NULL,
  `requestDispatchedAt` = NULL,
  `metaResponseReceiptId` = NULL,
  `deliveryEvidenceCode` = 'META_TEST_EVENT_CODE_REQUIRED',
  `errorCode` = 'META_TEST_EVENT_CODE_REQUIRED',
  `lastError` = 'Meta Test Lead event is held for an explicit administrator-approved Meta Test Events retry',
  `nextAttemptAt` = NULL,
  `updatedAt` = UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000
WHERE `isTestLead` = 1
  AND `status` IN ('pending', 'failed', 'retrying', 'approval_gated');

UPDATE `leads` l
SET
  l.`metaSyncStatus` = 'manual_review',
  l.`metaSyncError` = 'Meta Test Lead event is held for an explicit administrator-approved Meta Test Events retry',
  l.`updatedAt` = UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000
WHERE l.`isMetaTestLead` = 1
  AND EXISTS (
    SELECT 1
    FROM `meta_crm_event_log` e
    WHERE e.`leadId` = l.`id`
      AND e.`isTestLead` = 1
      AND e.`status` = 'manual_review'
      AND e.`deliveryEvidenceCode` = 'META_TEST_EVENT_CODE_REQUIRED'
  );
