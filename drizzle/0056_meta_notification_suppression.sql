ALTER TABLE `meta_notification_log`
  MODIFY COLUMN `status` ENUM('pending','sent','failed','suppressed') NOT NULL DEFAULT 'pending';

UPDATE `meta_notification_log` n
INNER JOIN `meta_lead_assignment_audits` a
  ON a.`leadId` = n.`leadId`
 AND a.`metaLeadId` = n.`metaLeadId`
SET n.`status` = 'suppressed',
    n.`recipientCount` = 0,
    n.`lastError` = 'META_BACKFILL_NOTIFICATION_SUPPRESSED',
    n.`nextAttemptAt` = NULL,
    n.`updatedAt` = UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000
WHERE n.`notificationType` = 'lead_alert'
  AND n.`status` IN ('pending','failed')
  AND a.`systemActor` = 'system:meta_backfill';

UPDATE `meta_notification_log` n
INNER JOIN `leads` l ON l.`id` = n.`leadId`
SET n.`status` = 'suppressed',
    n.`recipientCount` = 0,
    n.`lastError` = 'META_ASSIGNMENT_ALERT_RESOLVED',
    n.`nextAttemptAt` = NULL,
    n.`updatedAt` = UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000
WHERE n.`notificationType` = 'admin_alert'
  AND n.`safeAlertCode` = 'META_REAL_LEAD_UNASSIGNED_OVER_10_MINUTES'
  AND n.`status` IN ('pending','failed')
  AND l.`assignedConsultantUserId` IS NOT NULL;
