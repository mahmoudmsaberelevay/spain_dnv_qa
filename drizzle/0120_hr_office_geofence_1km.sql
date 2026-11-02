-- Owner-supplied office pin: https://maps.app.goo.gl/LC6MGhxv1hQRZQ2f7
-- Google Maps place pin: 30.0715683, 30.9468446, verified 2026-11-02.
-- Configuration-only change: no punches, schedules, salaries, leave or payroll writes.
-- Update the prior approved seed only; never overwrite subsequent admin changes.
UPDATE `hrSettings`
SET `verificationMethod` = 'geofence',
    `officeLatitude` = 30.0715683,
    `officeLongitude` = 30.9468446,
    `radiusMeters` = 1000,
    `changedByUserId` = 1
WHERE `id` = 1
  AND `verificationMethod` = 'geofence'
  AND `officeLatitude` = 30.0712522
  AND `officeLongitude` = 30.9468691
  AND `radiusMeters` IN (100, 1000);
