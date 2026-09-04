ALTER TABLE `leads`
  ADD COLUMN `isMetaTestLead` tinyint(1) NOT NULL DEFAULT 0 AFTER `isOrganic`;

ALTER TABLE `lead_meta_attributions`
  ADD COLUMN `isTestLead` tinyint(1) NOT NULL DEFAULT 0 AFTER `metaIsOrganic`;

ALTER TABLE `meta_webhook_inbox`
  ADD COLUMN `isTestLead` tinyint(1) NOT NULL DEFAULT 0 AFTER `metaCreatedTime`;

ALTER TABLE `meta_crm_event_log`
  ADD COLUMN `isTestLead` tinyint(1) NOT NULL DEFAULT 0 AFTER `sourceStage`;

CREATE INDEX `leads_is_meta_test_idx` ON `leads` (`isMetaTestLead`);
CREATE INDEX `lead_meta_attributions_test_idx` ON `lead_meta_attributions` (`isTestLead`, `leadId`);
CREATE INDEX `meta_webhook_inbox_test_idx` ON `meta_webhook_inbox` (`isTestLead`, `status`);
CREATE INDEX `meta_crm_event_log_test_idx` ON `meta_crm_event_log` (`isTestLead`, `status`, `eventTime`);
