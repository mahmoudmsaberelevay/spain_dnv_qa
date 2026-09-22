-- Preserve the exact questions, sections, answer types, and repeatable-row fields
-- used by every questionnaire version so later PDF exports remain historically accurate.
ALTER TABLE `caribbeanQuestionnaires`
  ADD COLUMN IF NOT EXISTS `definitionJson` JSON NULL AFTER `version`;

-- Existing records are backfilled by the application release procedure with the
-- current versioned questionnaire definition. No answer or status value is changed.
