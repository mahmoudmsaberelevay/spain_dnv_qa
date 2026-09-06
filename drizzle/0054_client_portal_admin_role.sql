ALTER TABLE `client_portal_users`
  MODIFY COLUMN `primaryClientCaseId` int NULL;

ALTER TABLE `client_portal_users`
  ADD COLUMN `accountType` enum('client','admin') NOT NULL DEFAULT 'client' AFTER `passwordHash`;
