-- Existing Commission Database records with a positive Qualifier Commission
-- are Marketing-sourced by business rule. This update is idempotent and
-- leaves all non-qualifier commission records unchanged.
UPDATE `finCommissions`
SET `leadSource` = 'Marketing'
WHERE COALESCE(`qualifierCommissionAmount`, 0) > 0
  AND (`leadSource` IS NULL OR `leadSource` <> 'Marketing');
