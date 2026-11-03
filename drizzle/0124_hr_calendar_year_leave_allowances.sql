-- Owner-authorized 2026/2027 rollout: 20 days for 2026, 22 days for 2027.
-- Attribution is the explicitly selected existing owner CRM login, not a fabricated ID.
-- The shared annual policy supplies 22 days for missing future-year rows and new staff.
-- This changes allowance totals only. No requests, approved usage, attendance,
-- salaries or financial transactions are deleted, approved, or reset.
-- Apply once as a data migration; later named-admin adjustments are authoritative.
START TRANSACTION;
-- Use the same employee-first lock order as HR entitlement changes/approvals.
SELECT id FROM finEmployees WHERE hrSelfServiceRequired = 1 ORDER BY id FOR UPDATE;
INSERT INTO hrLeaveEntitlements (employeeId, year, totalDays, changedByUserId)
SELECT staff.id, policy.year, policy.totalDays, owner.id
FROM finEmployees AS staff
CROSS JOIN (
  SELECT 2026 AS year, 20.00 AS totalDays
  UNION ALL SELECT 2027 AS year, 22.00 AS totalDays
) AS policy
JOIN users AS owner ON owner.id = 1 AND LOWER(owner.email) = 'mahmoud.saberelevay@gmail.com'
WHERE staff.hrSelfServiceRequired = 1
ON DUPLICATE KEY UPDATE totalDays = VALUES(totalDays), changedByUserId = VALUES(changedByUserId);
COMMIT;
