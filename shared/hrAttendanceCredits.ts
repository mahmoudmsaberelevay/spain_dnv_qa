import { listHrDates } from "./hrPayroll";

/** Explicit owner authorization on 2026-11-02; applies once, never recurs monthly.
 * This reporting credit does not create, alter or conceal actual clock-in/out data.
 * It does not grant a location-verification or employee-identity bypass.
 */
export const HR_ROLLOUT_CREDIT = Object.freeze({
  id: "hr-rollout-2026-11",
  from: "2026-10-27",
  to: "2026-11-03",
  enforcementFrom: "2026-11-04",
  approvedByUserId: 1,
  reason:
    "Owner-approved on-time attendance credit for all employees before Wednesday's HR rollout",
});

export function getHrAttendanceCreditDates(from: string, to: string): string[] {
  const dates = listHrDates(from, to);
  return dates.filter(
    date => date >= HR_ROLLOUT_CREDIT.from && date <= HR_ROLLOUT_CREDIT.to
  );
}
