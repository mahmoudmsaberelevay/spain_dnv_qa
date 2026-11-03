-- All existing salary, employee identity, attendance and leave history is preserved.
-- Existing unlinked records remain visible for explicit administrator review.
-- Financial-only/vendor exemptions must be deliberately selected, never inferred by name.
ALTER TABLE `finEmployees` ADD COLUMN `hrSelfServiceRequired` boolean NOT NULL DEFAULT true;
