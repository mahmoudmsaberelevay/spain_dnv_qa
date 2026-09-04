ALTER TABLE `leads`
  ADD CONSTRAINT `leads_metaLeadId_unique` UNIQUE (`metaLeadId`);

ALTER TABLE `meta_reconciliation_state`
  ADD CONSTRAINT `meta_reconciliation_state_integrationId_unique` UNIQUE (`integrationId`);
