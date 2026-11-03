-- Owner approval 2026-11-03: accept reported device location uncertainty up to 1,000 m.
-- Office radius remains 1 km; fresh location and identical staff/admin checks remain required.
-- Update only the prior 100 m policy at the verified office pin, never unrelated later configuration.
UPDATE `hrSettings`
SET `maxAccuracyMeters` = 1000, `changedByUserId` = 120001
WHERE `id` = 1 AND `verificationMethod` = 'geofence'
  AND `officeLatitude` = 30.0715683 AND `officeLongitude` = 30.9468446
  AND `radiusMeters` = 1000 AND `maxAccuracyMeters` = 100;
