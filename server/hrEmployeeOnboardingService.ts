import { and, asc, eq, isNull } from "drizzle-orm";
import { finEmployees, users } from "../drizzle/schema";
import { getDb } from "./db";
import { isHrAdministrator } from "../shared/hrAccess";

export class HrOnboardingError extends Error {}
function assertAdmin(userId: number) {
  if (!isHrAdministrator({ id: userId }))
    throw new HrOnboardingError(
      "HR onboarding is restricted to Mahmoud, Madonna, and Ziad."
    );
}
export async function getHrEmployeeOnboarding(actorUserId: number) {
  assertAdmin(actorUserId);
  const db = await getDb();
  if (!db)
    throw new HrOnboardingError(
      "Database unavailable. No employee links were changed."
    );
  // Never select authentication fields, salary data, or a raw users row.
  const employees = await db
    .select({
      id: finEmployees.id,
      name: finEmployees.name,
      isActive: finEmployees.isActive,
      crmUserId: finEmployees.crmUserId,
      hrSelfServiceRequired: finEmployees.hrSelfServiceRequired,
      crmUserEmail: users.email,
    })
    .from(finEmployees)
    .leftJoin(users, eq(finEmployees.crmUserId, users.id))
    .orderBy(asc(finEmployees.name));
  const accounts = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .orderBy(asc(users.name));
  const linked = new Map(
    employees.filter(e => e.crmUserId != null).map(e => [e.crmUserId!, e.id])
  );
  return {
    employees,
    users: accounts.map(user => ({
      ...user,
      linkedEmployeeId: linked.get(user.id) ?? null,
    })),
    summary: {
      unlinkedEmployees: employees.filter(
        e => e.isActive && e.hrSelfServiceRequired && !e.crmUserEmail
      ).length,
      unlinkedUsers: accounts.filter(u => !linked.has(u.id)).length,
    },
  };
}
export async function linkHrEmployeeLogin(
  actorUserId: number,
  input: { employeeId: number; userId: number; reason: string }
) {
  assertAdmin(actorUserId);
  if (
    !Number.isSafeInteger(input.employeeId) ||
    input.employeeId <= 0 ||
    !Number.isSafeInteger(input.userId) ||
    input.userId <= 0 ||
    input.reason.trim().length < 3
  ) {
    throw new HrOnboardingError(
      "Choose an existing employee, a CRM login, and a reason."
    );
  }
  const db = await getDb();
  if (!db)
    throw new HrOnboardingError(
      "Database unavailable. No employee links were changed."
    );
  try {
    return await db.transaction(async tx => {
      // Serialize all link claims for this account; employee row lock also protects competing reassignments.
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1)
        .for("update");
      if (!user)
        throw new HrOnboardingError("The selected CRM login no longer exists.");
      const [employee] = await tx
        .select({
          id: finEmployees.id,
          crmUserId: finEmployees.crmUserId,
          isActive: finEmployees.isActive,
        })
        .from(finEmployees)
        .where(eq(finEmployees.id, input.employeeId))
        .limit(1)
        .for("update");
      if (!employee || !employee.isActive)
        throw new HrOnboardingError("Select an existing active employee.");
      if (employee.crmUserId === input.userId)
        return {
          employeeId: employee.id,
          userId: input.userId,
          changed: false,
        };
      if (employee.crmUserId != null)
        throw new HrOnboardingError(
          "This employee already has a CRM login. HR onboarding cannot replace it or reassign attendance history."
        );
      const [other] = await tx
        .select({ id: finEmployees.id })
        .from(finEmployees)
        .where(eq(finEmployees.crmUserId, input.userId))
        .limit(1);
      if (other)
        throw new HrOnboardingError(
          "This CRM login is already linked to another employee."
        );
      await tx
        .update(finEmployees)
        .set({ crmUserId: input.userId, hrSelfServiceRequired: true })
        .where(
          and(eq(finEmployees.id, employee.id), isNull(finEmployees.crmUserId))
        );
      return { employeeId: employee.id, userId: input.userId, changed: true };
    });
  } catch (error) {
    if (error instanceof HrOnboardingError) throw error;
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause.code === "ER_DUP_ENTRY" || cause.cause?.code === "ER_DUP_ENTRY")
      throw new HrOnboardingError(
        "The CRM login was linked by another administrator. Refresh the list and try again."
      );
    throw error;
  }
}
