import { and, asc, desc, eq, gte, lte, or } from "drizzle-orm";
import {
  finEmployees,
  finEmployeeSalaryRates,
  hrAttendance,
  hrEmployeeSchedules,
  hrHolidays,
  hrLeaveEntitlements,
  hrLeaveRequests,
} from "../drizzle/schema";
import { getDb } from "./db";
import { updateEmployee } from "./finDb";
import { isHrAdministrator } from "../shared/hrAccess";
import { assertHrAttendanceDate } from "../shared/hrAttendance";
import { getHrAttendanceCreditDates } from "../shared/hrAttendanceCredits";
import { getHrDefaultAnnualLeaveDays } from "../shared/hrAnnualLeavePolicy";
import {
  getCairoBusinessDate,
  selectEffectiveEmployeeSalaryRate,
} from "../shared/financialEmployeeSalaryRates";
import {
  calculateHrPayroll,
  countHrLeaveWorkingDays,
  HR_SALARY_DAYS,
  isHrWorkingDay,
  listHrDates,
} from "../shared/hrPayroll";

export class HrManagementError extends Error {
  constructor(
    public readonly reason:
      | "FORBIDDEN"
      | "UNLINKED"
      | "INACTIVE"
      | "NOT_FOUND"
      | "INVALID_INPUT"
      | "INVALID_RANGE"
      | "CONFLICT"
      | "INSUFFICIENT_BALANCE",
    message: string
  ) {
    super(message);
    this.name = "HrManagementError";
  }
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;
type LeaveRequest = typeof hrLeaveRequests.$inferSelect;
type Entitlement = typeof hrLeaveEntitlements.$inferSelect;
type Allocation = { year: number; days: number };
export type HrLeaveBalance = {
  year: number;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
};

const employeeColumns = {
  id: finEmployees.id,
  name: finEmployees.name,
  crmUserId: finEmployees.crmUserId,
  salary: finEmployees.salary,
  isActive: finEmployees.isActive,
  hrSelfServiceRequired: finEmployees.hrSelfServiceRequired,
};

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

function positiveId(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new HrManagementError(
      "INVALID_INPUT",
      `${label} must be a positive integer`
    );
  }
}

function requireAdmin(actorId: number) {
  positiveId(actorId, "Actor ID");
  if (!isHrAdministrator({ id: actorId })) {
    throw new HrManagementError(
      "FORBIDDEN",
      "HR administration is restricted to designated HR administrators"
    );
  }
}

function validYear(year: number) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new HrManagementError(
      "INVALID_INPUT",
      "Year must be a four-digit calendar year"
    );
  }
}

function boundedText(value: string, label: string, max = 1000) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new HrManagementError(
      "INVALID_INPUT",
      `${label} is required and must contain at most ${max} characters`
    );
  }
  return value.trim();
}

function dateKey(value: string) {
  try {
    if (typeof value !== "string")
      throw new Error("HR dates must use YYYY-MM-DD");
    return assertHrAttendanceDate(value);
  } catch (error) {
    throw new HrManagementError(
      "INVALID_RANGE",
      error instanceof Error ? error.message : "Invalid date"
    );
  }
}

function dateRange(from: string, to: string) {
  dateKey(from);
  dateKey(to);
  try {
    return listHrDates(from, to);
  } catch (error) {
    throw new HrManagementError(
      "INVALID_RANGE",
      error instanceof Error ? error.message : "Invalid date range"
    );
  }
}

function futureDate(value: string, strictlyFuture = false) {
  const date = dateKey(value);
  const today = getCairoBusinessDate();
  if (strictlyFuture ? date <= today : date < today) {
    throw new HrManagementError(
      "INVALID_RANGE",
      strictlyFuture
        ? "Only future dates may be removed; today's and historical records are protected"
        : "Effective dates must be today or later in Cairo; historical records are protected"
    );
  }
  return date;
}

function activeEmployee(employee: { isActive: boolean; hrSelfServiceRequired?: boolean }) {
  if (!employee.isActive || employee.hrSelfServiceRequired === false)
    throw new HrManagementError(
      "INACTIVE",
      "The employee is inactive or Financial-only and cannot make HR changes"
    );
}

async function lockEmployee(db: Executor, employeeId: number) {
  positiveId(employeeId, "Employee ID");
  const [employee] = await db
    .select(employeeColumns)
    .from(finEmployees)
    .where(eq(finEmployees.id, employeeId))
    .limit(1)
    .for("update");
  if (!employee)
    throw new HrManagementError("NOT_FOUND", "Financial employee not found");
  activeEmployee(employee);
  return employee;
}

async function findOwnEmployee(db: Executor, userId: number, lock = false) {
  positiveId(userId, "User ID");
  const query = db
    .select(employeeColumns)
    .from(finEmployees)
    .where(eq(finEmployees.crmUserId, userId))
    .limit(1);
  const [employee] = await (lock ? query.for("update") : query);
  return employee?.hrSelfServiceRequired === false ? null : employee ?? null;
}

async function holidays(db: Executor, lock = false) {
  const query = db
    .select()
    .from(hrHolidays)
    .orderBy(asc(hrHolidays.holidayDate));
  // Current reads at approval avoid a repeatable-read snapshot from the initial
  // request lookup. TiDB rejects FOR SHARE; FOR UPDATE keeps a supported current
  // locking read rather than disabling locks or enabling no-op shared locks.
  return lock ? query.for("update") : query;
}

async function approvedRequests(
  db: Executor,
  employeeId: number,
  lock = false
) {
  const query = db
    .select()
    .from(hrLeaveRequests)
    .where(
      and(
        eq(hrLeaveRequests.employeeId, employeeId),
        eq(hrLeaveRequests.status, "approved")
      )
    );
  return lock ? query.for("update") : query;
}

function frozenAllocation(request: LeaveRequest): Allocation[] {
  try {
    const parsed: unknown = JSON.parse(request.daysByYear);
    if (!Array.isArray(parsed)) throw new Error("Not an allocation array");
    const seen = new Set<number>();
    const allocation: Allocation[] = parsed.map((item: unknown) => {
      const row = item as Allocation | null;
      if (
        !row ||
        !Number.isInteger(row.year) ||
        row.year < 1000 ||
        row.year > 9999 ||
        !Number.isInteger(row.days) ||
        row.days < 0 ||
        row.days > 366 ||
        seen.has(row.year)
      ) {
        throw new Error("Invalid frozen allocation");
      }
      seen.add(row.year);
      return { year: row.year, days: row.days };
    });
    if (
      allocation.reduce((sum, row) => sum + row.days, 0) !==
      request.requestedDays
    ) {
      throw new Error("Frozen allocation does not match requested days");
    }
    return allocation;
  } catch {
    // Fail closed: corrupted approved allocations must never silently free leave.
    throw new HrManagementError(
      "CONFLICT",
      `Leave request ${request.id} has an invalid stored allocation`
    );
  }
}

function balance(
  year: number,
  entitlements: Entitlement[],
  requests: LeaveRequest[]
): HrLeaveBalance {
  const totalDays = Number(
    entitlements.find(row => row.year === year)?.totalDays ??
      getHrDefaultAnnualLeaveDays(year)
  );
  const usedDays = requests
    .filter(row => row.status === "approved")
    .reduce(
      (sum, request) =>
        sum +
        (frozenAllocation(request).find(row => row.year === year)?.days ?? 0),
      0
    );
  if (!Number.isFinite(totalDays) || totalDays < 0) {
    throw new HrManagementError(
      "CONFLICT",
      "The stored leave entitlement is invalid"
    );
  }
  return { year, totalDays, usedDays, remainingDays: totalDays - usedDays };
}

/** Own identity is exclusively finEmployees.crmUserId; inactive staff retain read access. */
export async function getMyHrLeave(userId: number, year: number) {
  validYear(year);
  const db = await database();
  const employee = await findOwnEmployee(db, userId);
  if (!employee)
    return {
      linked: false,
      balances: [] as HrLeaveBalance[],
      requests: [] as LeaveRequest[],
      holidays: [] as (typeof hrHolidays.$inferSelect)[],
    };
  const entitlements = await db
    .select()
    .from(hrLeaveEntitlements)
    .where(eq(hrLeaveEntitlements.employeeId, employee.id));
  const requests = await db
    .select()
    .from(hrLeaveRequests)
    .where(eq(hrLeaveRequests.employeeId, employee.id))
    .orderBy(desc(hrLeaveRequests.createdAt), desc(hrLeaveRequests.id));
  const holidayRows = await holidays(db);
  // Include allocated/requested future years so cross-year pending requests can
  // display insufficient balances without reserving or charging pending leave.
  const years = new Set([year, ...entitlements.map(row => row.year)]);
  for (const request of requests) {
    for (const allocation of frozenAllocation(request))
      years.add(allocation.year);
  }
  return {
    linked: true,
    balances: Array.from(years)
      .sort((a, b) => a - b)
      .map(value => balance(value, entitlements, requests)),
    requests,
    holidays: holidayRows,
  };
}

export async function createHrLeaveRequest(
  userId: number,
  input: { fromDate: string; toDate: string; reason: string }
) {
  positiveId(userId, "User ID");
  dateRange(input.fromDate, input.toDate);
  futureDate(input.fromDate);
  const reason = boundedText(input.reason, "Leave reason");
  const db = await database();
  return db.transaction(async tx => {
    // The employee is the common mutex for creation, review and entitlements.
    const employee = await findOwnEmployee(tx, userId, true);
    if (!employee)
      throw new HrManagementError(
        "UNLINKED",
        "Your CRM login is not linked to a Financial employee"
      );
    activeEmployee(employee);
    futureDate(input.fromDate);
    const holidayRows = await holidays(tx, true);
    const allocations = countHrLeaveWorkingDays(
      input.fromDate,
      input.toDate,
      holidayRows.map(row => row.holidayDate)
    );
    const requestedDays = allocations.reduce((sum, row) => sum + row.days, 0);
    if (requestedDays === 0)
      throw new HrManagementError(
        "INVALID_RANGE",
        "Leave must include at least one working Sunday–Thursday day, excluding holidays"
      );
    const [overlap] = await tx
      .select({ id: hrLeaveRequests.id })
      .from(hrLeaveRequests)
      .where(
        and(
          eq(hrLeaveRequests.employeeId, employee.id),
          or(
            eq(hrLeaveRequests.status, "pending"),
            eq(hrLeaveRequests.status, "approved")
          ),
          lte(hrLeaveRequests.fromDate, input.toDate),
          gte(hrLeaveRequests.toDate, input.fromDate)
        )
      )
      .limit(1)
      .for("update");
    if (overlap)
      throw new HrManagementError(
        "CONFLICT",
        "Leave overlaps a pending or approved request"
      );
    // Pending requests intentionally do not reserve entitlement. Approval checks it.
    const [inserted] = await tx.insert(hrLeaveRequests).values({
      employeeId: employee.id,
      fromDate: input.fromDate,
      toDate: input.toDate,
      reason,
      status: "pending",
      requestedDays,
      daysByYear: JSON.stringify(allocations),
    });
    const [request] = await tx
      .select()
      .from(hrLeaveRequests)
      .where(eq(hrLeaveRequests.id, inserted.insertId))
      .limit(1);
    if (!request)
      throw new Error("Leave request could not be loaded after creation");
    return request;
  });
}

export async function reviewHrLeaveRequest(
  actorId: number,
  input: {
    requestId: number;
    decision: "approved" | "rejected";
    reason: string;
  }
) {
  requireAdmin(actorId);
  positiveId(input.requestId, "Request ID");
  if (input.decision !== "approved" && input.decision !== "rejected") {
    throw new HrManagementError(
      "INVALID_INPUT",
      "Decision must be approved or rejected"
    );
  }
  const reason = boundedText(input.reason, "Decision reason");
  const db = await database();
  return db.transaction(async tx => {
    const [reference] = await tx
      .select({ employeeId: hrLeaveRequests.employeeId })
      .from(hrLeaveRequests)
      .where(eq(hrLeaveRequests.id, input.requestId))
      .limit(1);
    if (!reference)
      throw new HrManagementError("NOT_FOUND", "Leave request not found");
    // Always lock employee before request. Subsequent reads are locking/current
    // reads so a waiting approval sees an approval that just committed.
    await lockEmployee(tx, reference.employeeId);
    const [request] = await tx
      .select()
      .from(hrLeaveRequests)
      .where(eq(hrLeaveRequests.id, input.requestId))
      .limit(1)
      .for("update");
    if (!request || request.employeeId !== reference.employeeId) {
      throw new HrManagementError(
        "CONFLICT",
        "Leave request changed while being reviewed"
      );
    }
    if (request.status === input.decision) return request;
    if (request.status !== "pending")
      throw new HrManagementError(
        "CONFLICT",
        "This request has already been decided"
      );
    const decision: Partial<typeof hrLeaveRequests.$inferInsert> = {
      status: input.decision,
      decisionReason: reason,
      reviewedByUserId: actorId,
      reviewedAt: new Date(),
    };
    if (input.decision === "approved") {
      // Named HR administrators may approve their own leave; no extra self-ban.
      const holidayRows = await holidays(tx, true);
      const allocations = countHrLeaveWorkingDays(
        request.fromDate,
        request.toDate,
        holidayRows.map(row => row.holidayDate)
      );
      const entitlements = await tx
        .select()
        .from(hrLeaveEntitlements)
        .where(eq(hrLeaveEntitlements.employeeId, request.employeeId))
        .for("update");
      const approved = await approvedRequests(tx, request.employeeId, true);
      for (const allocation of allocations) {
        const available = balance(allocation.year, entitlements, approved);
        if (allocation.days > available.remainingDays) {
          throw new HrManagementError(
            "INSUFFICIENT_BALANCE",
            `Insufficient leave balance for ${allocation.year}: ${available.remainingDays} days remain`
          );
        }
      }
      decision.daysByYear = JSON.stringify(allocations);
      decision.requestedDays = allocations.reduce(
        (sum, row) => sum + row.days,
        0
      );
    }
    await tx
      .update(hrLeaveRequests)
      .set(decision)
      .where(eq(hrLeaveRequests.id, request.id));
    return { ...request, ...decision } as LeaveRequest;
  });
}

export async function setHrLeaveEntitlement(
  actorId: number,
  input: { employeeId: number; year: number; totalDays: number; reason: string }
) {
  requireAdmin(actorId);
  validYear(input.year);
  boundedText(input.reason, "Entitlement change reason");
  if (
    typeof input.totalDays !== "number" ||
    !Number.isFinite(input.totalDays) ||
    input.totalDays < 0 ||
    input.totalDays > 366 ||
    Math.abs(input.totalDays * 100 - Math.round(input.totalDays * 100)) > 1e-7
  ) {
    throw new HrManagementError(
      "INVALID_INPUT",
      "Entitlement must be between 0 and 366 days, with at most two decimal places"
    );
  }
  const db = await database();
  return db.transaction(async tx => {
    await lockEmployee(tx, input.employeeId);
    const approved = await approvedRequests(tx, input.employeeId, true);
    if (input.totalDays < balance(input.year, [], approved).usedDays) {
      throw new HrManagementError(
        "INSUFFICIENT_BALANCE",
        "Entitlement cannot be reduced below already-approved leave usage"
      );
    }
    const values = {
      employeeId: input.employeeId,
      year: input.year,
      totalDays: input.totalDays.toFixed(2),
      changedByUserId: actorId,
    };
    await tx
      .insert(hrLeaveEntitlements)
      .values(values)
      .onDuplicateKeyUpdate({
        set: { totalDays: values.totalDays, changedByUserId: actorId },
      });
    const [row] = await tx
      .select()
      .from(hrLeaveEntitlements)
      .where(
        and(
          eq(hrLeaveEntitlements.employeeId, input.employeeId),
          eq(hrLeaveEntitlements.year, input.year)
        )
      )
      .limit(1);
    if (!row) throw new Error("Entitlement could not be loaded after saving");
    return row;
  });
}

export async function saveHrSchedule(
  actorId: number,
  input: {
    employeeId: number;
    startTime: string;
    endTime: string;
    graceMinutes: number;
    effectiveFrom: string;
    reason: string;
  }
) {
  requireAdmin(actorId);
  boundedText(input.reason, "Schedule change reason");
  futureDate(input.effectiveFrom);
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (
    typeof input.startTime !== "string" ||
    typeof input.endTime !== "string" ||
    !validTime.test(input.startTime) ||
    !validTime.test(input.endTime) ||
    input.endTime <= input.startTime
  ) {
    throw new HrManagementError(
      "INVALID_INPUT",
      "Schedules must use HH:mm with end after start on the same day; overnight shifts are not supported"
    );
  }
  if (
    !Number.isInteger(input.graceMinutes) ||
    input.graceMinutes < 0 ||
    input.graceMinutes > 1440
  ) {
    throw new HrManagementError(
      "INVALID_INPUT",
      "Grace minutes must be an integer between 0 and 1440"
    );
  }
  const db = await database();
  return db.transaction(async tx => {
    await lockEmployee(tx, input.employeeId);
    futureDate(input.effectiveFrom);
    const values = {
      employeeId: input.employeeId,
      startTime: input.startTime,
      endTime: input.endTime,
      graceMinutes: input.graceMinutes,
      effectiveFrom: input.effectiveFrom,
      changedByUserId: actorId,
    };
    await tx
      .insert(hrEmployeeSchedules)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          startTime: values.startTime,
          endTime: values.endTime,
          graceMinutes: values.graceMinutes,
          changedByUserId: actorId,
        },
      });
    const [row] = await tx
      .select()
      .from(hrEmployeeSchedules)
      .where(
        and(
          eq(hrEmployeeSchedules.employeeId, input.employeeId),
          eq(hrEmployeeSchedules.effectiveFrom, input.effectiveFrom)
        )
      )
      .limit(1);
    if (!row) throw new Error("Schedule could not be loaded after saving");
    return row;
  });
}

/** Financial owns salary history. Delegate only the three authorized fields. */
export async function saveHrSalary(
  actorId: number,
  input: {
    employeeId: number;
    salary: number | string;
    effectiveFrom: string;
    reason: string;
  }
) {
  requireAdmin(actorId);
  positiveId(input.employeeId, "Employee ID");
  boundedText(input.reason, "Salary change reason");
  futureDate(input.effectiveFrom);
  const text =
    typeof input.salary === "number" ? String(input.salary) : input.salary;
  if (
    typeof text !== "string" ||
    !/^\d{1,12}(?:\.\d{1,2})?$/.test(text) ||
    !Number.isFinite(Number(text))
  ) {
    throw new HrManagementError(
      "INVALID_INPUT",
      "Salary must be a non-negative amount with at most two decimal places"
    );
  }
  const db = await database();
  const [employee] = await db
    .select(employeeColumns)
    .from(finEmployees)
    .where(eq(finEmployees.id, input.employeeId))
    .limit(1);
  if (!employee)
    throw new HrManagementError("NOT_FOUND", "Financial employee not found");
  activeEmployee(employee);
  const salary = Number(text).toFixed(2);
  // Do not open a transaction around this call: Financial runs its own one.
  // No employee identity, receipt, payment or account fields are forwarded.
  await updateEmployee(input.employeeId, {
    salary,
    salaryEffectiveFrom: input.effectiveFrom,
    changedByUserId: actorId,
  });
  return {
    employeeId: input.employeeId,
    salary,
    effectiveFrom: input.effectiveFrom,
  };
}

export async function saveHrHoliday(
  actorId: number,
  input: { holidayDate: string; name: string }
) {
  requireAdmin(actorId);
  futureDate(input.holidayDate);
  const name = boundedText(input.name, "Holiday name", 160);
  const db = await database();
  return db.transaction(async tx => {
    futureDate(input.holidayDate);
    await tx
      .insert(hrHolidays)
      .values({
        holidayDate: input.holidayDate,
        name,
        changedByUserId: actorId,
      })
      .onDuplicateKeyUpdate({ set: { name, changedByUserId: actorId } });
    const [row] = await tx
      .select()
      .from(hrHolidays)
      .where(eq(hrHolidays.holidayDate, input.holidayDate))
      .limit(1);
    if (!row) throw new Error("Holiday could not be loaded after saving");
    return row;
  });
}

export async function removeHrHoliday(
  actorId: number,
  input: { id: number; reason: string }
) {
  requireAdmin(actorId);
  positiveId(input.id, "Holiday ID");
  boundedText(input.reason, "Holiday removal reason");
  const db = await database();
  return db.transaction(async tx => {
    const [row] = await tx
      .select()
      .from(hrHolidays)
      .where(eq(hrHolidays.id, input.id))
      .limit(1)
      .for("update");
    if (!row) throw new HrManagementError("NOT_FOUND", "Holiday not found");
    futureDate(row.holidayDate, true);
    await tx.delete(hrHolidays).where(eq(hrHolidays.id, input.id));
    return row;
  });
}

/** Financial payroll cycles run from the 27th through the following 26th. */
function payrollCycle(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const startMonth = month - 1 - (day < 27 ? 1 : 0);
  const from = new Date(Date.UTC(year, startMonth, 27))
    .toISOString()
    .slice(0, 10);
  const to = new Date(Date.UTC(year, startMonth + 1, 26))
    .toISOString()
    .slice(0, 10);
  dateRange(from, to);
  return { from, to };
}

function payrollCycles(dates: string[]) {
  const unique = new Map<string, ReturnType<typeof payrollCycle>>();
  for (const date of dates) {
    const cycle = payrollCycle(date);
    if (!unique.has(cycle.from)) unique.set(cycle.from, cycle);
  }
  return Array.from(unique.values());
}

function aggregatePayroll(
  input: { from: string; to: string },
  now: Date,
  cycles: ReturnType<typeof payrollCycles>,
  schedules: (typeof hrEmployeeSchedules.$inferSelect)[],
  attendance: Pick<
    typeof hrAttendance.$inferSelect,
    "attendanceDate" | "checkInAt" | "checkOutAt"
  >[],
  holidayDates: string[],
  approvedLeaveDates: string[],
  rates: Pick<
    typeof finEmployeeSalaryRates.$inferSelect,
    "effectiveFrom" | "monthlySalary"
  >[]
) {
  const today = getCairoBusinessDate(now);
  const result: ReturnType<typeof calculateHrPayroll> & {
    coveredBaseSalary: number;
    cycleBreakdown: {
      from: string;
      to: string;
      coveredFrom: string;
      coveredTo: string;
      salary: number;
      fullCycleWorkingDays: number;
      workingDays: number;
      coveredBaseSalary: number;
      totalDeduction: number;
      equivalentDays: number;
      incompleteDeductionDays: number;
    }[];
  } = {
    workingDays: 0,
    evaluatedDays: 0,
    lateMinutes: 0,
    earlyMinutes: 0,
    absentDays: 0,
    incompleteDays: 0,
    incompleteDeductionDays: 0,
    totalLostMinutes: 0,
    lostHours: 0,
    equivalentDays: 0,
    dailyRate: 0,
    hourlyRate: 0,
    minuteRate: 0,
    coveredBaseSalary: 0,
    totalDeduction: 0,
    netSalary: 0,
    days: [],
    cycleBreakdown: [],
  };
  let coveredBase = 0;
  let deduction = 0;
  const orderedSchedules = schedules
    .slice()
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  for (const cycle of cycles) {
    const calculationDate = cycle.to < today ? cycle.to : today;
    const effectiveRate = selectEffectiveEmployeeSalaryRate(
      rates,
      calculationDate
    );
    // No fallback to current/future salary when a cycle predates the ledger.
    const salary = Number(effectiveRate?.monthlySalary ?? 0);
    const payroll = calculateHrPayroll({
      ...cycle,
      now,
      salary,
      schedules,
      attendance: attendance.filter(
        row =>
          row.attendanceDate >= cycle.from && row.attendanceDate <= cycle.to
      ),
      holidays: holidayDates,
      approvedLeaveDates,
      attendanceCreditDates: getHrAttendanceCreditDates(cycle.from, cycle.to),
    });
    const days = payroll.days.filter(
      day => day.date >= input.from && day.date <= input.to
    );
    const configuredWorkingDay = (date: string) =>
      isHrWorkingDay(date, holidayDates) &&
      orderedSchedules.some(schedule => schedule.effectiveFrom <= date);
    const workingDays = days.filter(day =>
      configuredWorkingDay(day.date)
    ).length;
    // The incomplete 3-for-1 sequence is computed across the FULL cycle above.
    // Only selected days carry deductions; a third incomplete day outside the
    // report is not charged to the selected range, but still sets its context.
    const incompleteDeductionDays = days.filter(
      day => day.status === "incomplete" && day.missingMinutes > 0
    ).length;
    const equivalentDays = days.reduce((sum, day) => {
      if (!day.missingMinutes) return sum;
      const schedule = orderedSchedules
        .filter(row => row.effectiveFrom <= day.date)
        .slice(-1)[0];
      const minutes = (time: string) =>
        Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
      return (
        sum +
        day.missingMinutes /
          (minutes(schedule.endTime) - minutes(schedule.startTime))
      );
    }, 0);
    // Daily salary is ALWAYS monthly salary / 30, never salary / workdays.
    // Complete configured cycles retain the full monthly salary even when the
    // calendar cycle has 28, 29 or 31 days. Selected partial coverage uses the
    // same 30-day rate for configured calendar days, including paid weekends.
    const coveredCalendarDays = days.filter(day =>
      orderedSchedules.some(schedule => schedule.effectiveFrom <= day.date)
    ).length;
    const fullConfiguredCycle =
      days.length === payroll.days.length &&
      coveredCalendarDays === payroll.days.length;
    const coverageWeight = fullConfiguredCycle
      ? HR_SALARY_DAYS
      : Math.min(HR_SALARY_DAYS, coveredCalendarDays);
    const cycleBase = Math.min(salary, payroll.dailyRate * coverageWeight);
    const cycleDeduction = Math.min(salary, payroll.dailyRate * equivalentDays);
    coveredBase += cycleBase;
    deduction += cycleDeduction;
    result.workingDays += workingDays;
    result.evaluatedDays += days.filter(
      day =>
        configuredWorkingDay(day.date) &&
        ["present", "credited", "absent", "leave", "incomplete"].includes(
          day.status
        )
    ).length;
    result.absentDays += days.filter(day => day.status === "absent").length;
    result.incompleteDays += days.filter(
      day => day.status === "incomplete"
    ).length;
    result.incompleteDeductionDays += incompleteDeductionDays;
    result.lateMinutes += days.reduce((sum, day) => sum + day.lateMinutes, 0);
    result.earlyMinutes += days.reduce((sum, day) => sum + day.earlyMinutes, 0);
    result.totalLostMinutes += days.reduce(
      (sum, day) => sum + day.missingMinutes,
      0
    );
    result.equivalentDays += equivalentDays;
    // Informational rates refer to the last intersecting cycle, not an annual
    // wage denominator. Current Financial monthly salary stays on the employee.
    result.dailyRate = payroll.dailyRate;
    result.hourlyRate = payroll.hourlyRate;
    result.minuteRate = payroll.minuteRate;
    result.days.push(...days);
    result.cycleBreakdown.push({
      ...cycle,
      coveredFrom: cycle.from > input.from ? cycle.from : input.from,
      coveredTo: cycle.to < input.to ? cycle.to : input.to,
      salary,
      fullCycleWorkingDays: payroll.workingDays,
      workingDays,
      coveredBaseSalary: Number(cycleBase.toFixed(2)),
      totalDeduction: Number(cycleDeduction.toFixed(2)),
      equivalentDays,
      incompleteDeductionDays,
    });
  }
  result.lostHours = result.totalLostMinutes / 60;
  // Complete configured cycles contribute their whole monthly salary. Partial
  // configured calendar coverage uses the same fixed 30-day salary weight.
  // Keep exact intermediates; round only final money fields.
  result.coveredBaseSalary = Number(coveredBase.toFixed(2));
  result.totalDeduction = Number(deduction.toFixed(2));
  result.netSalary = Number(Math.max(0, coveredBase - deduction).toFixed(2));
  return result;
}

/** Caller must enforce the named HR-admin gate; this read API has no actor argument. */
export async function getHrAdminOverview(
  input: { from: string; to: string; year: number },
  now: Date = new Date()
) {
  const dates = dateRange(input.from, input.to);
  validYear(input.year);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new HrManagementError("INVALID_INPUT", "Now must be a valid Date");
  const today = getCairoBusinessDate(now);
  const cycles = payrollCycles(dates);
  const contextFrom = cycles[0].from;
  const contextTo = cycles[cycles.length - 1].to;
  const lastCalculationDate = contextTo < today ? contextTo : today;
  const db = await database();
  // Do not use Financial's aggregate employee list: it reads account transactions.
  // All employees are retained, including those with no punches (real absences).
  const employees = await db
    .select(employeeColumns)
    .from(finEmployees)
    .orderBy(asc(finEmployees.name))
    .then(rows => rows.filter(employee => employee.hrSelfServiceRequired !== false));
  const schedules = await db
    .select()
    .from(hrEmployeeSchedules)
    .orderBy(asc(hrEmployeeSchedules.effectiveFrom));
  const attendance = await db
    .select({
      employeeId: hrAttendance.employeeId,
      attendanceDate: hrAttendance.attendanceDate,
      checkInAt: hrAttendance.checkInAt,
      checkOutAt: hrAttendance.checkOutAt,
    })
    .from(hrAttendance)
    .where(
      and(
        gte(hrAttendance.attendanceDate, contextFrom),
        lte(hrAttendance.attendanceDate, contextTo)
      )
    );
  const rates = await db
    .select({
      employeeId: finEmployeeSalaryRates.employeeId,
      effectiveFrom: finEmployeeSalaryRates.effectiveFrom,
      monthlySalary: finEmployeeSalaryRates.monthlySalary,
    })
    .from(finEmployeeSalaryRates)
    .where(
      lte(
        finEmployeeSalaryRates.effectiveFrom,
        new Date(`${lastCalculationDate}T00:00:00.000Z`)
      )
    );
  const entitlements = await db
    .select()
    .from(hrLeaveEntitlements)
    .where(eq(hrLeaveEntitlements.year, input.year));
  const requests = await db
    .select()
    .from(hrLeaveRequests)
    .orderBy(desc(hrLeaveRequests.createdAt), desc(hrLeaveRequests.id));
  const holidayRows = await holidays(db);
  const holidayDates = holidayRows.map(row => row.holidayDate);
  const employeeNames = new Map(
    employees.map(employee => [employee.id, employee.name])
  );
  return {
    employees: employees.map(employee => {
      const ownSchedules = schedules.filter(
        row => row.employeeId === employee.id
      );
      const ownRequests = requests.filter(
        row => row.employeeId === employee.id
      );
      const approvedLeaveDates = Array.from(
        new Set(
          ownRequests
            .filter(row => row.status === "approved")
            .flatMap(request => {
              const from =
                request.fromDate > contextFrom ? request.fromDate : contextFrom;
              const to =
                request.toDate < contextTo ? request.toDate : contextTo;
              return from > to
                ? []
                : listHrDates(from, to).filter(date =>
                    isHrWorkingDay(date, holidayDates)
                  );
            })
        )
      );
      return {
        ...employee,
        schedules: ownSchedules,
        leaveBalance: balance(
          input.year,
          entitlements.filter(row => row.employeeId === employee.id),
          ownRequests
        ),
        payroll: aggregatePayroll(
          input,
          now,
          cycles,
          ownSchedules,
          attendance.filter(row => row.employeeId === employee.id),
          holidayDates,
          approvedLeaveDates,
          rates.filter(row => row.employeeId === employee.id)
        ),
      };
    }),
    requests: requests.map(request => ({
      ...request,
      employeeName: employeeNames.get(request.employeeId) ?? "Unknown employee",
    })),
    holidays: holidayRows,
  };
}
