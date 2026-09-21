-- One-time, short-lived launch tokens for opening the responsive Client Questionnaire
-- from the existing mobile documentation-folder document-link action.
-- Tokens are stored only as SHA-256 hashes and are bound to one active portal user,
-- application, client case, and source session.
-- The three additive Caribbean questionnaire columns align the original table with
-- the durable draft/resume service; existing submittedAt and updatedAt data remain intact.
ALTER TABLE `caribbeanQuestionnaires`
  ADD COLUMN IF NOT EXISTS `startedByPortalUserId` int NULL;

ALTER TABLE `caribbeanQuestionnaires`
  ADD COLUMN IF NOT EXISTS `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE `caribbeanQuestionnaires`
  ADD COLUMN IF NOT EXISTS `lastSavedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS `client_questionnaire_launch_tokens` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `portalUserId` int NOT NULL,
  `portalApplicationId` int NOT NULL,
  `clientCaseId` int NOT NULL,
  `sourceSessionId` int NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `usedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `client_questionnaire_launch_tokens_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `client_questionnaire_launch_tokens_publicId_unique` UNIQUE (`publicId`),
  CONSTRAINT `client_questionnaire_launch_tokens_hash_unique` UNIQUE (`tokenHash`),
  INDEX `client_questionnaire_launch_tokens_application_expiry_idx` (`portalApplicationId`, `expiresAt`, `usedAt`)
);
