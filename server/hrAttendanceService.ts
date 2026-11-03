import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { finEmployees, hrAttendance } from "../drizzle/schema";
import { getDb } from "./db";
import {
  getAttendanceDurationMinutes,
  getCairoMonthBounds,
  resolveHrAttendanceRange,
  toHrAttendanceDate,
} from "../shared/hrAttendance";
import { getCairoBusinessDate } from "../shared/financialEmployeeSalaryRates";

export class HrAttendanceError extends Error {
  constructor(
    public readonly reason: "UNLINKED" | "INACTIVE" | "NO_OPEN_ATTENDANCE" | "INVALID_RANGE",
    message: string,
  ) {
    super(message);
    this.name = "HrAttendanceError";
  }
}

type DbExecutor = any;

async function findEmployeeByCrmUserId(db: DbExecutor, crmUserId: number) {
  const [employee] = await db
    .select({
      id: finEmployees.id,
      name: finEmployees.name,
      role: finEmployees.role,
      isActive: finEmployees.isActive,
      hrSelfServiceRequired: finEmployees.hrSelfServiceRequired,
    })
    .from(finEmployees)
    .where(eq(finEmployees.crmUserId, crmUserId))
    .limit(1);
  return employee ?? null;
}

async function requireActiveEmployeeForCrmUser(db: DbExecutor, crmUserId: number) {
  // Employee row lock serializes punches and leave changes across requests.
  const [employee] = await db.select({ id: finEmployees.id, name: finEmployees.name, role: finEmployees.role, isActive: finEmployees.isActive, hrSelfServiceRequired: finEmployees.hrSelfServiceRequired })
    .from(finEmployees).where(eq(finEmployees.crmUserId, crmUserId)).limit(1).for("update");
    if (!employee) {
      throw new HrAttendanceError(
        "UNLINKED",
      "HR onboarding is pending. Ask Mahmoud, Madonna, or Ziad to link your existing employee profile in HR Admin → Employee login links.",
      );
    }
  if (!employee.isActive || employee.hrSelfServiceRequired === false) {
    throw new HrAttendanceError("INACTIVE", "Your employee record is inactive and cannot record attendance.");
  }
  return employee;
}

function withDuration<T extends { checkInAt: Date; checkOutAt: Date | null; attendanceDate: string | Date }>(row: T, now: Date = new Date()) {
  const durationMinutes = getAttendanceDurationMinutes(row, now);
  return {
    ...row,
    attendanceDate: toHrAttendanceDate(row.attendanceDate),
    durationMinutes,
    status: row.checkOutAt ? "completed" as const : "clocked_in" as const,
  };
}

function isDuplicateKeyError(error: unknown) {
  const candidate = error as { code?: string; errno?: number } | undefined;
  return candidate?.code === "ER_DUP_ENTRY" || candidate?.errno === 1062;
}

export async function getMyHrAttendance(crmUserId: number, now: Date = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const attendanceDate = getCairoBusinessDate(now);
  const employee = await findEmployeeByCrmUserId(db, crmUserId);
  if (!employee || employee.hrSelfServiceRequired === false) {
    return {
      linked: false,
      employee: null,
      attendanceDate,
      today: null,
      openAttendance: null,
      history: [],
      monthSummary: { from: getCairoMonthBounds(now).from, to: getCairoMonthBounds(now).to, presentDays: 0, completedDays: 0, openDays: 0, totalMinutes: 0 },
    };
  }

  const [today] = await db.select().from(hrAttendance)
    .where(and(eq(hrAttendance.employeeId, employee.id), eq(hrAttendance.attendanceDate, attendanceDate)))
    .limit(1);
  const [openAttendance] = await db.select().from(hrAttendance)
    .where(and(eq(hrAttendance.employeeId, employee.id), isNull(hrAttendance.checkOutAt)))
    .orderBy(desc(hrAttendance.checkInAt))
    .limit(1);
  const history = await db.select().from(hrAttendance)
    .where(eq(hrAttendance.employeeId, employee.id))
    .orderBy(desc(hrAttendance.attendanceDate), desc(hrAttendance.checkInAt))
    .limit(20);
  const bounds = getCairoMonthBounds(now);
  const monthRows = await db.select().from(hrAttendance)
    .where(and(
      eq(hrAttendance.employeeId, employee.id),
      gte(hrAttendance.attendanceDate, bounds.from),
      lte(hrAttendance.attendanceDate, bounds.to),
    ));

  return {
    linked: true,
    employee,
    attendanceDate,
    today: today ? withDuration(today, now) : null,
    openAttendance: openAttendance ? withDuration(openAttendance, now) : null,
    history: history.map((record: any) => withDuration(record, now)),
    monthSummary: {
      ...bounds,
      presentDays: monthRows.length,
      completedDays: monthRows.filter((record: any) => record.checkOutAt).length,
      openDays: monthRows.filter((record: any) => !record.checkOutAt).length,
      totalMinutes: monthRows.reduce((total: number, record: any) => total + getAttendanceDurationMinutes(record, now), 0),
    },
  };
}

export async function clockInForCrmUser(crmUserId: number, now: Date = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const attendanceDate = getCairoBusinessDate(now);

  return db.transaction(async (tx: DbExecutor) => {
    const employee = await requireActiveEmployeeForCrmUser(tx, crmUserId);
    const [existing] = await tx.select().from(hrAttendance)
      .where(and(eq(hrAttendance.employeeId, employee.id), eq(hrAttendance.attendanceDate, attendanceDate)))
      .limit(1);
    if (existing) return { attendance: withDuration(existing, now), created: false, employee };

    // A late clock-out must be resolved before a new Cairo-day record is opened.
    // This prevents a second open shift even if a caller bypasses the dashboard.
    const [openAttendance] = await tx.select().from(hrAttendance)
      .where(and(eq(hrAttendance.employeeId, employee.id), isNull(hrAttendance.checkOutAt)))
      .orderBy(desc(hrAttendance.checkInAt))
      .limit(1);
    if (openAttendance) return { attendance: withDuration(openAttendance, now), created: false, employee };

    try {
      const [result] = await tx.insert(hrAttendance).values({
        employeeId: employee.id,
        attendanceDate,
        checkInAt: now,
      });
      const [attendance] = await tx.select().from(hrAttendance).where(eq(hrAttendance.id, result.insertId)).limit(1);
      if (!attendance) throw new Error("Attendance record could not be loaded after check-in");
      return { attendance: withDuration(attendance, now), created: true, employee };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const [concurrentRecord] = await tx.select().from(hrAttendance)
        .where(and(eq(hrAttendance.employeeId, employee.id), eq(hrAttendance.attendanceDate, attendanceDate)))
        .limit(1);
      if (!concurrentRecord) throw error;
      return { attendance: withDuration(concurrentRecord, now), created: false, employee };
    }
  });
}

export async function clockOutForCrmUser(crmUserId: number, now: Date = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.transaction(async (tx: DbExecutor) => {
    const employee = await requireActiveEmployeeForCrmUser(tx, crmUserId);
    const [openAttendance] = await tx.select().from(hrAttendance)
      .where(and(eq(hrAttendance.employeeId, employee.id), isNull(hrAttendance.checkOutAt)))
      .orderBy(desc(hrAttendance.checkInAt))
      .limit(1);
    if (!openAttendance) {
      throw new HrAttendanceError("NO_OPEN_ATTENDANCE", "There is no open attendance record to clock out.");
    }
    await tx.update(hrAttendance).set({ checkOutAt: now }).where(eq(hrAttendance.id, openAttendance.id));
    const [attendance] = await tx.select().from(hrAttendance).where(eq(hrAttendance.id, openAttendance.id)).limit(1);
    if (!attendance) throw new Error("Attendance record could not be loaded after clock-out");
    return { attendance: withDuration(attendance, now), employee };
  });
}

export async function getHrAttendanceReport(input: { from?: string; to?: string; employeeId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let bounds: { from?: string; to?: string };
  try {
    bounds = resolveHrAttendanceRange(input.from, input.to);
  } catch (error) {
    throw new HrAttendanceError("INVALID_RANGE", error instanceof Error ? error.message : "Invalid attendance report range");
  }

  const conditions: any[] = [];
  if (bounds.from) conditions.push(gte(hrAttendance.attendanceDate, bounds.from));
  if (bounds.to) conditions.push(lte(hrAttendance.attendanceDate, bounds.to));
  if (input.employeeId) conditions.push(eq(hrAttendance.employeeId, input.employeeId));

  const rows = await db.select({
    id: hrAttendance.id,
    employeeId: hrAttendance.employeeId,
    employeeName: finEmployees.name,
    employeeRole: finEmployees.role,
    attendanceDate: hrAttendance.attendanceDate,
    checkInAt: hrAttendance.checkInAt,
    checkOutAt: hrAttendance.checkOutAt,
  }).from(hrAttendance)
    .innerJoin(finEmployees, eq(hrAttendance.employeeId, finEmployees.id))
    .where(conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(hrAttendance.attendanceDate), asc(finEmployees.name), desc(hrAttendance.checkInAt));

  const now = new Date();
  const records = rows.map((record: any) => withDuration(record, now));
  return {
    records,
    summary: {
      presentDays: records.length,
      completedDays: records.filter((record: any) => record.status === "completed").length,
      openDays: records.filter((record: any) => record.status === "clocked_in").length,
      totalMinutes: records.reduce((total: number, record: any) => total + record.durationMinutes, 0),
    },
  };
}
