-- Owner revision 2026-11-03: 300 m replaces the earlier 1,000 m accuracy allowance.
-- This changes only location uncertainty. Office radius remains 1 km and freshness/admin checks remain unchanged.
UPDATE `hrSettings`
SET `maxAccuracyMeters` = 300, `changedByUserId` = 120001
WHERE `id` = 1 AND `verificationMethod` = 'geofence'
  AND `officeLatitude` = 30.0715683 AND `officeLongitude` = 30.9468446
  AND `radiusMeters` = 1000 AND `maxAccuracyMeters` = 1000;
