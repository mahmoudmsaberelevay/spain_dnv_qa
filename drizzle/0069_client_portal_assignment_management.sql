ALTER TABLE `client_portal_applications`
  ADD COLUMN `accessRevokedAt` timestamp NULL,
  ADD COLUMN `accessRevokedBy` int NULL;

CREATE INDEX `client_portal_applications_active_access_idx`
  ON `client_portal_applications` (`portalUserId`, `accessRevokedAt`, `isPrimary`);
