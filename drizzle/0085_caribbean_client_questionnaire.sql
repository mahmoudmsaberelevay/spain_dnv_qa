-- Additive multi-program Client Documentation and questionnaire journey.
-- Existing cases remain Spain and preserve every existing case, document, payment,
-- portal assignment, message, timeline event, and workflow field.
-- Statements are intentionally independent for TiDB compatibility.

ALTER TABLE `clientCases`
  ADD COLUMN IF NOT EXISTS `program` enum('spain','grenada','dominica','st_kitts','st_lucia','antigua') NOT NULL DEFAULT 'spain';

ALTER TABLE `clientCases`
  ADD COLUMN IF NOT EXISTS `caribbeanJourneyStage` enum('questionnaire','document_collection','legalization','in_process','submitted','approved','naturalization_issuing','naturalization_issued','passports_issuing','passports_issued') NULL;

ALTER TABLE `clientCases`
  ADD COLUMN IF NOT EXISTS `questionnaireSubmittedAt` timestamp NULL;

ALTER TABLE `clientCases`
  ADD COLUMN IF NOT EXISTS `questionnaireVersion` varchar(64) NULL;

ALTER TABLE `clientCases`
  ADD COLUMN IF NOT EXISTS `caribbeanLegalizationStartedAt` timestamp NULL;

ALTER TABLE `clientCases`
  ADD COLUMN IF NOT EXISTS `naturalizationIssuingDate` date NULL;

ALTER TABLE `clientCases`
  ADD COLUMN IF NOT EXISTS `naturalizationIssuedDate` date NULL;

ALTER TABLE `clientCases`
  ADD COLUMN IF NOT EXISTS `passportsIssuingDate` date NULL;

ALTER TABLE `clientCases`
  ADD COLUMN IF NOT EXISTS `passportsIssuedDate` date NULL;

CREATE TABLE IF NOT EXISTS `caribbeanQuestionnaires` (
  `id` int AUTO_INCREMENT NOT NULL,
  `publicId` varchar(36) NOT NULL,
  `clientCaseId` int NOT NULL,
  `program` enum('grenada','dominica','st_kitts','st_lucia','antigua') NOT NULL,
  `version` varchar(64) NOT NULL,
  `status` enum('draft','submitted') NOT NULL DEFAULT 'draft',
  `answersJson` json NOT NULL,
  `currentStepKey` varchar(180),
  `submittedAt` timestamp NULL,
  `submittedByPortalUserId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `caribbeanQuestionnaires_id` PRIMARY KEY(`id`),
  CONSTRAINT `caribbean_questionnaire_public_id_unique` UNIQUE(`publicId`),
  CONSTRAINT `caribbean_questionnaire_case_unique` UNIQUE(`clientCaseId`)
);

CREATE INDEX IF NOT EXISTS `caribbean_questionnaire_status_idx`
  ON `caribbeanQuestionnaires` (`status`, `updatedAt`);
