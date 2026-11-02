import fs from "node:fs";
import { getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countHrLeaveWorkingDays,
  isHrWorkingDay,
  listHrDates,
} from "../shared/hrPayroll";

const dependencies = vi.hoisted(() => ({
  getDb: vi.fn(),
  updateEmployee: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: dependencies.getDb }));
vi.mock("./finDb", () => ({ updateEmployee: dependencies.updateEmployee }));
import {
  createHrLeaveRequest,
  getHrAdminOverview,
  getMyHrLeave,
  HrManagementError,
  removeHrHoliday,
  reviewHrLeaveRequest,
  saveHrHoliday,
  saveHrSalary,
  saveHrSchedule,
  setHrLeaveEntitlement,
} from "./hrManagementService";

type Row = Record<string, any>;
const dialect = new MySqlDialect();
const calendarValue = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value;

/** Memory-only adapter: renders Drizzle predicates but NEVER connects or executes SQL.
 * Tracks projections and lock order, serializes transaction callbacks, and rolls
 * changes back on errors. It tests service decisions, not MySQL's lock engine.
 */
function memoryDb(seed: Record<string, Row[]> = {}) {
  const state: Record<string, Row[]> = {
    finEmployees: [],
    finEmployeeSalaryRates: [],
    hrAttendance: [],
    hrEmployeeSchedules: [],
    hrHolidays: [],
    hrLeaveEntitlements: [],
    hrLeaveRequests: [],
    ...structuredClone(seed),
  };
  const events: Row[] = [];
  let transactionTail = Promise.resolve();
  const tableName = (table: any) => getTableName(table);
  function matching(predicate: any, row: Row) {
    if (!predicate) return true;
    const rendered = dialect.sqlToQuery(predicate);
    let paramIndex = 0;
    const expression = rendered.sql
      .replace(
        /`[^`]+`\.`([^`]+)`/g,
        (_, column) => `calendarValue(row[${JSON.stringify(column)}])`
      )
      .replace(/\?/g, () =>
        JSON.stringify(calendarValue(rendered.params[paramIndex++]))
      )
      .replace(/\band\b/gi, "&&")
      .replace(/\bor\b/gi, "||")
      .replace(/(?<![<>!=])=(?!=)/g, "===");
    // Expression contains only our internally generated schema predicates.
    return new Function("row", "calendarValue", `return (${expression});`)(
      row,
      calendarValue
    );
  }
  function lazy(run: () => any) {
    return {
      then: (resolve: any, reject: any) =>
        Promise.resolve().then(run).then(resolve, reject),
    };
  }
  const db: any = {
    select(projection?: Record<string, any>) {
      let table: string;
      let predicate: any;
      let max: number | undefined;
      const query: any = {
        from(value: any) {
          table = tableName(value);
          return query;
        },
        where(value: any) {
          predicate = value;
          return query;
        },
        limit(value: number) {
          max = value;
          return query;
        },
        orderBy() {
          return query;
        },
        for(mode: string) {
          events.push({ type: "lock", table, mode });
          return query;
        },
        ...lazy(() => {
          events.push({
            type: "select",
            table,
            columns: projection ? Object.keys(projection) : null,
            sql: predicate ? dialect.sqlToQuery(predicate) : null,
          });
          const rows = state[table]
            .filter(row => matching(predicate, row))
            .slice(0, max);
          return structuredClone(
            rows.map(row =>
              projection
                ? Object.fromEntries(
                    Object.entries(projection).map(([key, column]) => [
                      key,
                      row[column.name],
                    ])
                  )
                : row
            )
          );
        }),
      };
      return query;
    },
    insert(value: any) {
      const table = tableName(value);
      return {
        values(values: Row) {
          let duplicateUpdate: Row | undefined;
          const insert: any = {
            onDuplicateKeyUpdate(options: { set: Row }) {
              duplicateUpdate = options.set;
              return insert;
            },
            ...lazy(() => {
              const existing =
                duplicateUpdate &&
                state[table].find(row =>
                  table === "hrHolidays"
                    ? row.holidayDate === values.holidayDate
                    : row.employeeId === values.employeeId &&
                      (table === "hrEmployeeSchedules"
                        ? row.effectiveFrom === values.effectiveFrom
                        : row.year === values.year)
                );
              if (existing) {
                Object.assign(existing, duplicateUpdate);
                events.push({ type: "upsert", table, values: duplicateUpdate });
                return [{ insertId: existing.id }];
              }
              const id = Math.max(0, ...state[table].map(row => row.id)) + 1;
              const row = {
                id,
                createdAt: new Date(),
                decisionReason: null,
                reviewedAt: null,
                reviewedByUserId: null,
                ...values,
              };
              state[table].push(structuredClone(row));
              events.push({ type: "insert", table, values });
              return [{ insertId: id }];
            }),
          };
          return insert;
        },
      };
    },
    update(value: any) {
      const table = tableName(value);
      return {
        set(values: Row) {
          return {
            where(predicate: any) {
              return lazy(() => {
                state[table]
                  .filter(row => matching(predicate, row))
                  .forEach(row => Object.assign(row, values));
                events.push({ type: "update", table, values });
                return [{ affectedRows: 1 }];
              });
            },
          };
        },
      };
    },
    delete(value: any) {
      const table = tableName(value);
      return {
        where(predicate: any) {
          return lazy(() => {
            state[table] = state[table].filter(
              row => !matching(predicate, row)
            );
            events.push({ type: "delete", table });
          });
        },
      };
    },
    transaction(callback: (tx: any) => Promise<any>) {
      const result = transactionTail.then(async () => {
        const before = structuredClone(state);
        events.push({ type: "begin" });
        try {
          const result = await callback(db);
          events.push({ type: "commit" });
          return result;
        } catch (error) {
          for (const table of Object.keys(state)) state[table] = before[table];
          events.push({ type: "rollback" });
          throw error;
        }
      });
      transactionTail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
  dependencies.getDb.mockResolvedValue(db);
  return { db, state, events };
}

const employee = (overrides: Row = {}) => ({
  id: 10,
  name: "Employee",
  crmUserId: 42,
  salary: "18000.00",
  isActive: true,
  ...overrides,
});
const request = (overrides: Row = {}) => ({
  id: 1,
  employeeId: 10,
  fromDate: "2026-11-08",
  toDate: "2026-11-08",
  requestedDays: 1,
  daysByYear: '[{"year":2026,"days":1}]',
  reason: "Annual leave",
  status: "pending",
  decisionReason: null,
  reviewedByUserId: null,
  reviewedAt: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  ...overrides,
});
const entitlement = (overrides: Row = {}) => ({
  id: 1,
  employeeId: 10,
  year: 2026,
  totalDays: "10.00",
  changedByUserId: 1,
  ...overrides,
});
const schedule = (overrides: Row = {}) => ({
  id: 1,
  employeeId: 10,
  effectiveFrom: "2026-01-01",
  startTime: "09:00",
  endTime: "17:00",
  graceMinutes: 0,
  changedByUserId: 1,
  ...overrides,
});
const decision = {
  requestId: 1,
  decision: "approved" as const,
  reason: "Approved annual leave",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T20:00:00Z"));
  memoryDb();
});
afterEach(() => vi.useRealTimers());

describe("HR leave allocation and validation", () => {
  it("splits Sunday–Thursday leave by year and excludes public holidays", () => {
    expect(
      countHrLeaveWorkingDays("2026-12-30", "2027-01-04", ["2026-12-31"])
    ).toEqual([
      { year: 2026, days: 1 },
      { year: 2027, days: 2 },
    ]);
    expect(() => listHrDates("2026-02-30", "2026-03-01")).toThrow();
    expect(() => listHrDates("2026-01-01", "2027-01-02")).toThrow("366");
  });

  it("rejects invalid dates, reverse/oversize ranges, past Cairo days and unbounded reasons as business errors", async () => {
    const bad = [
      { fromDate: "2026-02-30", toDate: "2026-03-01", reason: "Leave" },
      { fromDate: "2026-11-09", toDate: "2026-11-08", reason: "Leave" },
      { fromDate: "2026-11-08", toDate: "2027-11-09", reason: "Leave" },
      { fromDate: "2026-11-01", toDate: "2026-11-03", reason: "Leave" },
      { fromDate: "2026-11-08", toDate: "2026-11-08", reason: " ".repeat(5) },
      {
        fromDate: "2026-11-08",
        toDate: "2026-11-08",
        reason: "x".repeat(1001),
      },
    ];
    for (const input of bad)
      await expect(createHrLeaveRequest(42, input)).rejects.toBeInstanceOf(
        HrManagementError
      );
    expect(dependencies.getDb).not.toHaveBeenCalled();
  });

  it("uses Cairo today rather than the UTC day", async () => {
    vi.setSystemTime(new Date("2026-11-02T22:30:00Z")); // November 3 in Cairo.
    await expect(
      createHrLeaveRequest(42, {
        fromDate: "2026-11-02",
        toDate: "2026-11-02",
        reason: "Leave",
      })
    ).rejects.toMatchObject({ reason: "INVALID_RANGE" });
  });

  it("rejects weekend/holiday-only leave without inserting", async () => {
    const memory = memoryDb({
      finEmployees: [employee()],
      hrHolidays: [
        {
          id: 1,
          holidayDate: "2026-11-08",
          name: "Holiday",
          changedByUserId: 1,
        },
      ],
    });
    await expect(
      createHrLeaveRequest(42, {
        fromDate: "2026-11-06",
        toDate: "2026-11-08",
        reason: "Leave",
      })
    ).rejects.toMatchObject({ reason: "INVALID_RANGE" });
    expect(memory.state.hrLeaveRequests).toHaveLength(0);
  });
});

describe("HR self-service identity and overlap", () => {
  it("returns an unlinked empty result without searching by name or email", async () => {
    const memory = memoryDb({
      finEmployees: [employee({ crmUserId: 999, email: "same@example.com" })],
    });
    expect(await getMyHrLeave(42, 2026)).toEqual({
      linked: false,
      balances: [],
      requests: [],
      holidays: [],
    });
    expect(memory.events.filter(event => event.type === "select")).toHaveLength(
      1
    );
    expect(
      memory.events.find(event => event.type === "select")?.sql.params
    ).toEqual([42]);
  });

  it("ignores a forged browser employee ID and creates pending beyond available entitlement", async () => {
    const memory = memoryDb({
      finEmployees: [employee(), employee({ id: 99, crmUserId: 999 })],
    });
    const input = {
      fromDate: "2026-11-08",
      toDate: "2026-11-09",
      reason: " Annual leave ",
      employeeId: 99,
      status: "approved",
    };
    const created = await createHrLeaveRequest(42, input);
    expect(created).toMatchObject({
      employeeId: 10,
      status: "pending",
      requestedDays: 2,
      reason: "Annual leave",
    });
    expect(created.daysByYear).toBe('[{"year":2026,"days":2}]');
    expect(memory.events.filter(event => event.type === "lock")[0]).toEqual({
      type: "lock",
      table: "finEmployees",
      mode: "update",
    });
    expect(
      memory.events.some(event => event.table === "hrLeaveEntitlements")
    ).toBe(false);
  });

  it("allows inactive reads but rejects inactive/unlinked creation", async () => {
    memoryDb({
      finEmployees: [employee({ isActive: false })],
      hrLeaveRequests: [request()],
    });
    expect((await getMyHrLeave(42, 2026)).linked).toBe(true);
    await expect(
      createHrLeaveRequest(42, {
        fromDate: "2026-11-09",
        toDate: "2026-11-09",
        reason: "Leave",
      })
    ).rejects.toMatchObject({ reason: "INACTIVE" });
    await expect(
      createHrLeaveRequest(999, {
        fromDate: "2026-11-09",
        toDate: "2026-11-09",
        reason: "Leave",
      })
    ).rejects.toMatchObject({ reason: "UNLINKED" });
  });

  it.each(["pending", "approved"])(
    "blocks inclusive overlap with %s leave",
    async status => {
      const memory = memoryDb({
        finEmployees: [employee()],
        hrLeaveRequests: [
          request({
            status,
            toDate: "2026-11-10",
            requestedDays: 3,
            daysByYear: '[{"year":2026,"days":3}]',
          }),
        ],
      });
      await expect(
        createHrLeaveRequest(42, {
          fromDate: "2026-11-10",
          toDate: "2026-11-11",
          reason: "Leave",
        })
      ).rejects.toMatchObject({ reason: "CONFLICT" });
      expect(memory.state.hrLeaveRequests).toHaveLength(1);
    }
  );

  it("permits overlap with a rejected request", async () => {
    memoryDb({
      finEmployees: [employee()],
      hrLeaveRequests: [request({ status: "rejected" })],
    });
    expect(
      (
        await createHrLeaveRequest(42, {
          fromDate: "2026-11-08",
          toDate: "2026-11-08",
          reason: "Leave",
        })
      ).status
    ).toBe("pending");
  });

  it("serializes two competing creations and blocks the second overlap", async () => {
    const memory = memoryDb({ finEmployees: [employee()] });
    const input = {
      fromDate: "2026-11-08",
      toDate: "2026-11-08",
      reason: "Leave",
    };
    const results = await Promise.allSettled([
      createHrLeaveRequest(42, input),
      createHrLeaveRequest(42, input),
    ]);
    expect(results.map(row => row.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(memory.state.hrLeaveRequests).toHaveLength(1);
  });
});

describe("HR approval and frozen balances", () => {
  it("requires a named HR administrator before any database access", async () => {
    await expect(reviewHrLeaveRequest(42, decision)).rejects.toMatchObject({
      reason: "FORBIDDEN",
    });
    await expect(
      saveHrHoliday(42, { holidayDate: "2026-11-08", name: "Holiday" })
    ).rejects.toMatchObject({ reason: "FORBIDDEN" });
    expect(dependencies.getDb).not.toHaveBeenCalled();
  });

  it("recomputes current holidays at approval and locks employee before request", async () => {
    const memory = memoryDb({
      finEmployees: [employee()],
      hrLeaveEntitlements: [entitlement()],
      hrLeaveRequests: [
        request({
          toDate: "2026-11-09",
          requestedDays: 2,
          daysByYear: '[{"year":2026,"days":2}]',
        }),
      ],
      hrHolidays: [
        {
          id: 1,
          holidayDate: "2026-11-09",
          name: "New holiday",
          changedByUserId: 1,
        },
      ],
    });
    const approved = await reviewHrLeaveRequest(1, decision);
    expect(approved).toMatchObject({
      status: "approved",
      requestedDays: 1,
      daysByYear: '[{"year":2026,"days":1}]',
      reviewedByUserId: 1,
      decisionReason: decision.reason,
    });
    expect(
      memory.events.filter(event => event.type === "lock").slice(0, 2)
    ).toEqual([
      { type: "lock", table: "finEmployees", mode: "update" },
      { type: "lock", table: "hrLeaveRequests", mode: "update" },
    ]);
    expect(
      memory.events.some(
        event => event.type === "lock" && event.table === "hrLeaveEntitlements"
      )
    ).toBe(true);
    expect(
      memory.events.some(
        event =>
          event.type === "lock" &&
          event.table === "hrHolidays" &&
          event.mode === "share"
      )
    ).toBe(true);
  });

  it("is idempotent on repeated approval, preserves first reviewer details and never double charges", async () => {
    const memory = memoryDb({
      finEmployees: [employee()],
      hrLeaveEntitlements: [entitlement()],
      hrLeaveRequests: [request()],
    });
    const first = await reviewHrLeaveRequest(1, decision);
    const repeated = await reviewHrLeaveRequest(191, {
      ...decision,
      reason: "Repeated retry",
    });
    expect(repeated).toEqual(first);
    expect(memory.events.filter(event => event.type === "update")).toHaveLength(
      1
    );
    expect((await getMyHrLeave(42, 2026)).balances).toEqual([
      { year: 2026, totalDays: 10, usedDays: 1, remainingDays: 9 },
    ]);
    await expect(
      reviewHrLeaveRequest(1, { ...decision, decision: "rejected" })
    ).rejects.toMatchObject({ reason: "CONFLICT" });
  });

  it("preserves approved usage even if current holidays would recalculate it differently", async () => {
    memoryDb({
      finEmployees: [employee()],
      hrLeaveEntitlements: [entitlement({ totalDays: "3.00" })],
      hrLeaveRequests: [
        request({
          status: "approved",
          requestedDays: 2,
          daysByYear: '[{"year":2026,"days":2}]',
          toDate: "2026-11-09",
        }),
      ],
      hrHolidays: [
        {
          id: 1,
          holidayDate: "2026-11-09",
          name: "Later holiday",
          changedByUserId: 1,
        },
      ],
    });
    expect((await getMyHrLeave(42, 2026)).balances[0]).toEqual({
      year: 2026,
      totalDays: 3,
      usedDays: 2,
      remainingDays: 1,
    });
  });

  it("rejects insufficient entitlement without deciding or mutating finance", async () => {
    const memory = memoryDb({
      finEmployees: [employee()],
      hrLeaveRequests: [request()],
      hrLeaveEntitlements: [entitlement({ totalDays: "0.00" })],
    });
    await expect(reviewHrLeaveRequest(1, decision)).rejects.toMatchObject({
      reason: "INSUFFICIENT_BALANCE",
    });
    expect(memory.state.hrLeaveRequests[0].status).toBe("pending");
    expect(
      memory.events.filter(event =>
        ["insert", "update", "upsert"].includes(event.type)
      )
    ).toHaveLength(0);
    expect(dependencies.updateEmployee).not.toHaveBeenCalled();
  });

  it("checks every year atomically for cross-year approval", async () => {
    const memory = memoryDb({
      finEmployees: [employee()],
      hrLeaveEntitlements: [
        entitlement({ totalDays: "2.00" }),
        entitlement({ id: 2, year: 2027, totalDays: "1.00" }),
      ],
      hrLeaveRequests: [
        request({
          fromDate: "2026-12-30",
          toDate: "2027-01-04",
          requestedDays: 4,
          daysByYear: '[{"year":2026,"days":2},{"year":2027,"days":2}]',
        }),
      ],
    });
    await expect(reviewHrLeaveRequest(1, decision)).rejects.toMatchObject({
      reason: "INSUFFICIENT_BALANCE",
    });
    expect(memory.state.hrLeaveRequests[0].status).toBe("pending");
  });

  it("serializes competing approvals against the last available day", async () => {
    const memory = memoryDb({
      finEmployees: [employee()],
      hrLeaveEntitlements: [entitlement({ totalDays: "1.00" })],
      hrLeaveRequests: [
        request(),
        request({ id: 2, fromDate: "2026-11-09", toDate: "2026-11-09" }),
      ],
    });
    const results = await Promise.allSettled([
      reviewHrLeaveRequest(1, decision),
      reviewHrLeaveRequest(191, { ...decision, requestId: 2 }),
    ]);
    expect(results.map(row => row.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(
      memory.state.hrLeaveRequests.filter(row => row.status === "approved")
    ).toHaveLength(1);
  });

  it("rejects without entitlement, idempotently, and permits named admins to approve their own leave", async () => {
    memoryDb({ finEmployees: [employee()], hrLeaveRequests: [request()] });
    const rejection = { ...decision, decision: "rejected" as const };
    const first = await reviewHrLeaveRequest(1, rejection);
    expect(await reviewHrLeaveRequest(1, rejection)).toEqual(first);
    memoryDb({
      finEmployees: [employee({ crmUserId: 1 })],
      hrLeaveRequests: [request()],
      hrLeaveEntitlements: [entitlement()],
    });
    expect((await reviewHrLeaveRequest(1, decision)).status).toBe("approved");
  });

  it("fails closed on corrupted approved allocations", async () => {
    memoryDb({
      finEmployees: [employee()],
      hrLeaveEntitlements: [entitlement()],
      hrLeaveRequests: [
        request({ status: "approved", daysByYear: "bad json" }),
      ],
    });
    await expect(getMyHrLeave(42, 2026)).rejects.toMatchObject({
      reason: "CONFLICT",
    });
  });
});

describe("HR policy changes and Financial salary delegation", () => {
  it("requires audit reasons for entitlement, schedule, salary and holiday removal", async () => {
    await expect(
      setHrLeaveEntitlement(1, {
        employeeId: 10,
        year: 2026,
        totalDays: 20,
        reason: "",
      })
    ).rejects.toBeInstanceOf(HrManagementError);
    await expect(
      saveHrSchedule(1, {
        employeeId: 10,
        effectiveFrom: "2026-11-08",
        startTime: "09:00",
        endTime: "17:00",
        graceMinutes: 0,
        reason: "",
      })
    ).rejects.toBeInstanceOf(HrManagementError);
    await expect(
      saveHrSalary(1, {
        employeeId: 10,
        salary: 20000,
        effectiveFrom: "2026-11-08",
        reason: "",
      })
    ).rejects.toBeInstanceOf(HrManagementError);
    await expect(
      removeHrHoliday(1, { id: 1, reason: "" })
    ).rejects.toBeInstanceOf(HrManagementError);
    expect(dependencies.getDb).not.toHaveBeenCalled();
  });

  it("protects already-approved days when reducing entitlement and upserts allowable changes", async () => {
    const memory = memoryDb({
      finEmployees: [employee()],
      hrLeaveEntitlements: [entitlement()],
      hrLeaveRequests: [request({ status: "approved" })],
    });
    await expect(
      setHrLeaveEntitlement(1, {
        employeeId: 10,
        year: 2026,
        totalDays: 0,
        reason: "Adjustment",
      })
    ).rejects.toMatchObject({ reason: "INSUFFICIENT_BALANCE" });
    expect(
      (
        await setHrLeaveEntitlement(191, {
          employeeId: 10,
          year: 2026,
          totalDays: 1,
          reason: "Adjustment",
        })
      ).totalDays
    ).toBe("1.00");
    expect(memory.state.hrLeaveEntitlements).toHaveLength(1);
    expect(memory.state.hrLeaveEntitlements[0].changedByUserId).toBe(191);
  });

  it("upserts only the selected future schedule date and never overwrites historical rows", async () => {
    const memory = memoryDb({
      finEmployees: [employee()],
      hrEmployeeSchedules: [schedule()],
    });
    const input = {
      employeeId: 10,
      effectiveFrom: "2026-11-08",
      startTime: "10:00",
      endTime: "18:00",
      graceMinutes: 10,
      reason: "New shift",
    };
    await saveHrSchedule(1, input);
    await saveHrSchedule(191, { ...input, graceMinutes: 15 });
    expect(memory.state.hrEmployeeSchedules).toHaveLength(2);
    expect(memory.state.hrEmployeeSchedules[0]).toMatchObject({
      effectiveFrom: "2026-01-01",
      startTime: "09:00",
    });
    expect(memory.state.hrEmployeeSchedules[1]).toMatchObject({
      effectiveFrom: "2026-11-08",
      graceMinutes: 15,
      changedByUserId: 191,
    });
    await expect(
      saveHrSchedule(1, { ...input, effectiveFrom: "2026-11-01" })
    ).rejects.toMatchObject({ reason: "INVALID_RANGE" });
    await expect(
      saveHrSchedule(1, { ...input, startTime: "17:00", endTime: "09:00" })
    ).rejects.toMatchObject({ reason: "INVALID_INPUT" });
    await expect(
      saveHrSchedule(1, { ...input, graceMinutes: -1 })
    ).rejects.toMatchObject({ reason: "INVALID_INPUT" });
  });

  it("sends only salary/effective date/actor to the existing Financial API", async () => {
    memoryDb({ finEmployees: [employee()] });
    const input = {
      employeeId: 10,
      salary: "20000.50",
      effectiveFrom: "2026-11-08",
      reason: "Raise",
      name: "Forged name",
      crmUserId: 999,
      isActive: false,
      payment: 100,
    };
    expect(await saveHrSalary(191, input)).toEqual({
      employeeId: 10,
      salary: "20000.50",
      effectiveFrom: "2026-11-08",
    });
    expect(dependencies.updateEmployee).toHaveBeenCalledTimes(1);
    expect(dependencies.updateEmployee).toHaveBeenCalledWith(10, {
      salary: "20000.50",
      salaryEffectiveFrom: "2026-11-08",
      changedByUserId: 191,
    });
    await expect(
      saveHrSalary(1, { ...input, salary: -10 })
    ).rejects.toMatchObject({ reason: "INVALID_INPUT" });
    await expect(
      saveHrSalary(1, { ...input, salary: "1e10" })
    ).rejects.toMatchObject({ reason: "INVALID_INPUT" });
    await expect(
      saveHrSalary(1, { ...input, effectiveFrom: "2026-11-01" })
    ).rejects.toMatchObject({ reason: "INVALID_RANGE" });
  });

  it("saves future holidays and permits removal only strictly after Cairo today", async () => {
    const memory = memoryDb();
    const holiday = await saveHrHoliday(1, {
      holidayDate: "2026-11-08",
      name: " Holiday ",
    });
    await saveHrHoliday(191, {
      holidayDate: "2026-11-08",
      name: "Renamed holiday",
    });
    expect(memory.state.hrHolidays).toHaveLength(1);
    expect(
      await removeHrHoliday(1, { id: holiday.id, reason: "Correction" })
    ).toMatchObject({ name: "Renamed holiday" });
    expect(memory.state.hrHolidays).toHaveLength(0);
    const today = await saveHrHoliday(1, {
      holidayDate: "2026-11-02",
      name: "Today",
    });
    await expect(
      removeHrHoliday(1, { id: today.id, reason: "Correction" })
    ).rejects.toMatchObject({ reason: "INVALID_RANGE" });
    await expect(
      saveHrHoliday(1, { holidayDate: "2026-11-01", name: "Past" })
    ).rejects.toMatchObject({ reason: "INVALID_RANGE" });
  });

  it("leaves raw database failures untouched for infrastructure handling", async () => {
    const failure = new Error("Database offline");
    dependencies.getDb.mockRejectedValue(failure);
    await expect(getMyHrLeave(42, 2026)).rejects.toBe(failure);
  });
});

describe("HR admin overview read contracts", () => {
  it("includes employees without attendance and uses historical effective salary rather than current salary", async () => {
    const memory = memoryDb({
      finEmployees: [
        employee(),
        employee({
          id: 20,
          crmUserId: 99,
          name: "No ledger",
          salary: "50000.00",
        }),
      ],
      hrEmployeeSchedules: [schedule(), schedule({ id: 2, employeeId: 20 })],
      finEmployeeSalaryRates: [
        {
          employeeId: 10,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          monthlySalary: "10000.00",
        },
        {
          employeeId: 10,
          effectiveFrom: new Date("2026-11-01T00:00:00Z"),
          monthlySalary: "18000.00",
        },
        {
          employeeId: 20,
          effectiveFrom: new Date("2026-11-01T00:00:00Z"),
          monthlySalary: "50000.00",
        },
      ],
    });
    const result = await getHrAdminOverview(
      { from: "2026-10-25", to: "2026-10-25", year: 2026 },
      new Date("2026-11-02T20:00:00Z")
    );
    expect(result.employees).toHaveLength(2);
    expect(result.employees[0]).toMatchObject({
      salary: "18000.00",
      payroll: {
        absentDays: 1,
        dailyRate: 10000 / 30,
        totalDeduction: Number((10000 / 30).toFixed(2)),
      },
    });
    expect(result.employees[0].payroll.coveredBaseSalary).toBe(
      Number((10000 / 30).toFixed(2))
    );
    expect(result.employees[0].payroll.netSalary).toBe(0);
    expect(result.employees[1]).toMatchObject({
      salary: "50000.00",
      payroll: { absentDays: 1, dailyRate: 0, totalDeduction: 0 },
    });
    expect(
      memory.events.find(
        event => event.table === "finEmployees" && event.type === "select"
      )?.columns
    ).toEqual(["id", "name", "crmUserId", "salary", "isActive"]);
    expect(
      memory.events.every(
        event => !["insert", "upsert", "update", "delete"].includes(event.type)
      )
    ).toBe(true);
  });

  it("caps rate selection at today, applies the authorized rollout credit and labels requests", async () => {
    memoryDb({
      finEmployees: [employee()],
      hrEmployeeSchedules: [schedule()],
      hrLeaveEntitlements: [entitlement()],
      finEmployeeSalaryRates: [
        {
          employeeId: 10,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          monthlySalary: "10000.00",
        },
        {
          employeeId: 10,
          effectiveFrom: new Date("2026-11-03T00:00:00Z"),
          monthlySalary: "90000.00",
        },
      ],
      hrLeaveRequests: [
        request({
          fromDate: "2026-11-01",
          toDate: "2026-11-01",
          status: "approved",
        }),
      ],
    });
    const result = await getHrAdminOverview(
      { from: "2026-11-01", to: "2026-11-03", year: 2026 },
      new Date("2026-11-02T20:00:00Z")
    );
    expect(result.employees[0].payroll.dailyRate).toBeCloseTo(10000 / 30);
    expect(result.employees[0].payroll.coveredBaseSalary).toBe(
      Number(((10000 * 3) / 30).toFixed(2))
    );
    expect(
      result.employees[0].payroll.days.every(row =>
        ["credited", "leave"].includes(row.status)
      )
    ).toBe(true);
    expect(result.employees[0].payroll.totalDeduction).toBe(0);
    expect(result.employees[0].payroll.absentDays).toBe(0);
    expect(result.requests[0].employeeName).toBe("Employee");
    expect(result.employees[0].leaveBalance.usedDays).toBe(1);
  });

  it("aggregates cycles with independently effective salaries and the same fixed 30-day divisor", async () => {
    memoryDb({
      finEmployees: [employee()],
      hrEmployeeSchedules: [schedule()],
      finEmployeeSalaryRates: [
        {
          employeeId: 10,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          monthlySalary: "10000.00",
        },
        {
          employeeId: 10,
          effectiveFrom: new Date("2026-11-01T00:00:00Z"),
          monthlySalary: "18000.00",
        },
        {
          employeeId: 10,
          effectiveFrom: new Date("2026-12-01T00:00:00Z"),
          monthlySalary: "24000.00",
        },
      ],
    });
    const result = await getHrAdminOverview(
      { from: "2026-11-25", to: "2026-12-02", year: 2026 },
      new Date("2026-12-03T20:00:00Z")
    );
    const firstDates = listHrDates("2026-11-25", "2026-11-26");
    const secondDates = listHrDates("2026-11-27", "2026-12-02");
    const firstCovered = firstDates.filter(date => isHrWorkingDay(date)).length;
    const secondCovered = secondDates.filter(date =>
      isHrWorkingDay(date)
    ).length;
    const expected = Number(
      ((18000 * firstCovered) / 30 + (24000 * secondCovered) / 30).toFixed(2)
    );
    const payroll = result.employees[0].payroll;
    expect(payroll.totalDeduction).toBe(expected);
    expect(payroll.coveredBaseSalary).toBe(
      Number(
        (
          (18000 * firstDates.length) / 30 +
          (24000 * secondDates.length) / 30
        ).toFixed(2)
      )
    );
    expect(payroll.netSalary).toBe(
      Number((payroll.coveredBaseSalary - expected).toFixed(2))
    );
    expect(payroll.cycleBreakdown.map(cycle => cycle.salary)).toEqual([
      18000, 24000,
    ]);
    expect(payroll.dailyRate).toBe(24000 / 30);
    expect(payroll.absentDays).toBe(firstCovered + secondCovered);
  });

  it("calculates year-to-date across payroll cycles instead of dividing one monthly wage by annual days", async () => {
    memoryDb({
      finEmployees: [employee()],
      hrEmployeeSchedules: [schedule({ effectiveFrom: "2025-01-01" })],
      finEmployeeSalaryRates: [
        {
          employeeId: 10,
          effectiveFrom: new Date("2025-01-01T00:00:00Z"),
          monthlySalary: "10000.00",
        },
      ],
    });
    const result = await getHrAdminOverview(
      { from: "2026-01-01", to: "2026-12-31", year: 2026 },
      new Date("2027-02-01T20:00:00Z")
    );
    const payroll = result.employees[0].payroll;
    expect(payroll.cycleBreakdown).toHaveLength(13);
    const first = payroll.cycleBreakdown[0];
    const last = payroll.cycleBreakdown[12];
    const expectedBase = Number(
      (
        (10000 *
          Math.min(
            30,
            listHrDates(first.coveredFrom, first.coveredTo).length
          )) /
          30 +
        payroll.cycleBreakdown.slice(1, -1).reduce(sum => sum + 10000, 0) +
        (10000 *
          Math.min(30, listHrDates(last.coveredFrom, last.coveredTo).length)) /
          30
      ).toFixed(2)
    );
    const expectedAbsent = listHrDates("2026-01-01", "2026-12-31").filter(
      date =>
        isHrWorkingDay(date) && !(date >= "2026-10-27" && date <= "2026-11-03")
    ).length;
    const expectedDeduction = Number(
      ((expectedAbsent * 10000) / 30).toFixed(2)
    );
    expect(payroll.totalDeduction).toBe(expectedDeduction);
    expect(payroll.totalDeduction).toBeGreaterThan(10000 * 8);
    expect(payroll.coveredBaseSalary).toBe(expectedBase);
    expect(payroll.netSalary).toBe(
      Number((expectedBase - expectedDeduction).toFixed(2))
    );
    expect(payroll.dailyRate).toBe(10000 / 30);
  });

  it("loads the whole cycle for incomplete-punch context but charges only the selected day", async () => {
    const memory = memoryDb({
      finEmployees: [employee()],
      hrEmployeeSchedules: [schedule()],
      finEmployeeSalaryRates: [
        {
          employeeId: 10,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          monthlySalary: "10000.00",
        },
      ],
      hrAttendance: ["2026-11-08", "2026-11-09", "2026-11-10"].map(
        attendanceDate => ({
          employeeId: 10,
          attendanceDate,
          checkInAt: new Date(`${attendanceDate}T07:00:00Z`),
          checkOutAt: null,
        })
      ),
    });
    const result = await getHrAdminOverview(
      { from: "2026-11-10", to: "2026-11-10", year: 2026 },
      new Date("2026-11-11T20:00:00Z")
    );
    const payroll = result.employees[0].payroll;
    expect(payroll.incompleteDays).toBe(1);
    expect(payroll.incompleteDeductionDays).toBe(1);
    expect(payroll.equivalentDays).toBe(1);
    expect(payroll.days).toHaveLength(1);
    expect(payroll.totalDeduction).toBe(Number(payroll.dailyRate.toFixed(2)));
    expect(
      memory.events.find(
        event => event.table === "hrAttendance" && event.type === "select"
      )?.sql.params
    ).toEqual(["2026-10-27", "2026-11-26"]);
  });

  it("does not invent schedules before their first effective date", async () => {
    memoryDb({
      finEmployees: [employee()],
      hrEmployeeSchedules: [schedule({ effectiveFrom: "2026-11-05" })],
      finEmployeeSalaryRates: [
        {
          employeeId: 10,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          monthlySalary: "10000.00",
        },
      ],
    });
    const result = await getHrAdminOverview(
      { from: "2026-11-04", to: "2026-11-05", year: 2026 },
      new Date("2026-11-06T20:00:00Z")
    );
    expect(result.employees[0].payroll.days.map(day => day.status)).toEqual([
      "unconfigured",
      "absent",
    ]);
    expect(result.employees[0].payroll.absentDays).toBe(1);
  });

  it("credits all employees only for Oct27–Nov3 without fabricating punches, then enforces Wednesday normally", async () => {
    const memory = memoryDb({
      finEmployees: [
        employee(),
        employee({ id: 20, crmUserId: 99, name: "Unconfigured colleague" }),
      ],
      hrEmployeeSchedules: [schedule()],
      finEmployeeSalaryRates: [
        {
          employeeId: 10,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          monthlySalary: "10000.00",
        },
      ],
      hrAttendance: [
        {
          employeeId: 10,
          attendanceDate: "2026-11-02",
          checkInAt: new Date("2026-11-02T12:00:00Z"),
          checkOutAt: null,
        },
      ],
    });
    const before = structuredClone(memory.state.hrAttendance);
    const result = await getHrAdminOverview(
      { from: "2026-10-27", to: "2026-11-04", year: 2026 },
      new Date("2026-11-05T20:00:00Z")
    );
    for (const staff of result.employees) {
      const credit = staff.payroll.days.filter(day => day.date <= "2026-11-03");
      expect(
        credit
          .filter(day => !["weekend", "holiday"].includes(day.status))
          .every(day => day.status === "credited")
      ).toBe(true);
      expect(
        credit.reduce(
          (sum, day) =>
            sum + day.missingMinutes + day.lateMinutes + day.earlyMinutes,
          0
        )
      ).toBe(0);
    }
    expect(result.employees[0].payroll.days.at(-1)?.status).toBe("absent");
    expect(result.employees[0].payroll.totalDeduction).toBe(
      Number((10000 / 30).toFixed(2))
    );
    expect(result.employees[0].payroll.incompleteDays).toBe(0);
    expect(result.employees[0].payroll.workingDays).toBe(
      listHrDates("2026-10-27", "2026-11-04").filter(date =>
        isHrWorkingDay(date)
      ).length
    );
    expect(result.employees[1].payroll.workingDays).toBe(0);
    expect(result.employees[1].payroll.evaluatedDays).toBe(0);
    expect(memory.state.hrAttendance).toEqual(before);
    expect(
      memory.events.every(
        event => !["insert", "upsert", "update", "delete"].includes(event.type)
      )
    ).toBe(true);
  });

  it("rejects ranges over 366 days before loading records", async () => {
    await expect(
      getHrAdminOverview({ from: "2026-01-01", to: "2027-01-02", year: 2026 })
    ).rejects.toMatchObject({ reason: "INVALID_RANGE" });
    expect(dependencies.getDb).not.toHaveBeenCalled();
  });

  it("has no financial aggregate/payment/receipt mutations or browser identity resolution", () => {
    const source = fs.readFileSync(
      new URL("./hrManagementService.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(
      /(?:salaryReceipts|finTransactions|finAccounts|recalcAccountBalance|createTransaction|\.getEmployees\()/
    );
    expect(source).toContain("eq(finEmployees.crmUserId, userId)");
    expect(source).toContain('for("update")');
    expect(source).toContain("selectEffectiveEmployeeSalaryRate");
    expect(source).not.toContain("employee.email");
    expect(source).not.toContain("insert(finEmployeeSalaryRates)");
    expect(source).not.toContain("update(finEmployees)");
  });
});
