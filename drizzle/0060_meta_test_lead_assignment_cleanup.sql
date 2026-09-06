-- Synthetic Meta Test Leads must never remain operationally assigned.
-- This cleanup is idempotent and preserves Lead, attribution, event, inbox,
-- activity, and assignment-audit history.
UPDATE `leads`
SET
  `assignedTo` = NULL,
  `assignedConsultantUserId` = NULL,
  `metaAssignmentStatus` = 'not_applicable',
  `metaAssignmentErrorCode` = NULL,
  `metaAssignmentUpdatedAt` = UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000,
  `updatedAt` = UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000
WHERE `isMetaTestLead` = 1;

UPDATE `meta_lead_assignment_audits`
SET
  `previousConsultant` = NULL,
  `newConsultantUserId` = NULL,
  `newConsultant` = NULL,
  `outcome` = 'skipped_test',
  `systemActor` = 'system:meta_test_cleanup'
WHERE `leadId` IN (SELECT `id` FROM `leads` WHERE `isMetaTestLead` = 1);

UPDATE `meta_notification_log`
SET
  `status` = 'suppressed',
  `recipientCount` = 0,
  `lastError` = 'META_TEST_LEAD_NOTIFICATION_SUPPRESSED',
  `nextAttemptAt` = NULL,
  `updatedAt` = UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000
WHERE `leadId` IN (SELECT `id` FROM `leads` WHERE `isMetaTestLead` = 1)
  AND `status` IN ('pending', 'failed');
