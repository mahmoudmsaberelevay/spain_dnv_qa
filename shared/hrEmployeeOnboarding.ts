/** Financial-only records may intentionally have no login. Staff must be explicitly linked. */
export function assertHrEmployeeOnboarding(employee: {
  isActive?: boolean;
  hrSelfServiceRequired?: boolean;
  crmUserId?: number | null;
}): void {
  if (
    employee.isActive !== false &&
    employee.hrSelfServiceRequired !== false &&
    !employee.crmUserId
  ) {
    throw new Error(
      "Select the employee's CRM login before activating HR staff. Use Financial-only only for a record that does not require staff attendance."
    );
  }
}
