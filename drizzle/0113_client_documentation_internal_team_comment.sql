-- Staff-only context entered while a Client Documentation case is created.
-- Nullable and additive: no existing case, document, payment, or portal record is changed.
ALTER TABLE `clientCases`
  ADD COLUMN IF NOT EXISTS `internalTeamComment` text NULL;
