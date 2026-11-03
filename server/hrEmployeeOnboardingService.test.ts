import { MySqlDialect } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { finEmployees, users } from "../drizzle/schema";

const dependencies = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: dependencies.getDb }));
import {
  getHrEmployeeOnboarding,
  HrOnboardingError,
  linkHrEmployeeLogin,
} from "./hrEmployeeOnboardingService";

type Row = Record<string, unknown>;
const dialect = new MySqlDialect();
const input = {
  employeeId: 7,
  userId: 42,
  reason: "Explicit staff login link",
};
const employee = (overrides: Row = {}) => ({
  id: 7,
  crmUserId: null,
  isActive: true,
  ...overrides,
});

/** Queued, memory-only query builders: no connection or SQL execution. Predicates
 * are rendered solely to check the service's identity/conditional-write contract.
 * This does not simulate MySQL locking or prove database-level race isolation.
 */
function queuedDb(
  reads: Row[][] = [],
  options: { updateError?: unknown; onUpdate?: (values: Row) => void } = {}
) {
  const pending = [...reads];
  const queries: any[] = [];
  function select(projection: unknown) {
    if (!pending.length) throw new Error("Unexpected onboarding SELECT");
    const rows = pending.shift()!;
    const query: any = {
      projection,
      from: vi.fn(() => query),
      leftJoin: vi.fn(() => query),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => query),
      for: vi.fn(() => query),
      then: (resolve: any, reject: any) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    queries.push(query);
    return query;
  }
  const set = vi.fn((values: Row) => ({
    where: updateWhere.mockImplementation(async () => {
      if (options.updateError) throw options.updateError;
      options.onUpdate?.(values);
      return [{ affectedRows: 1 }];
    }),
  }));
  const updateWhere = vi.fn();
  const forbidden = () => {
    throw new Error("Unexpected onboarding write outside employee link update");
  };
  const tx = {
    select: vi.fn(select),
    update: vi.fn(() => ({ set })),
    insert: vi.fn(forbidden),
    delete: vi.fn(forbidden),
    execute: vi.fn(forbidden),
  };
  const db = {
    select: vi.fn(select),
    update: vi.fn(forbidden),
    insert: vi.fn(forbidden),
    delete: vi.fn(forbidden),
    execute: vi.fn(forbidden),
    transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) =>
      callback(tx)
    ),
  };
  dependencies.getDb.mockResolvedValue(db);
  return { db, tx, queries, pending, set, updateWhere };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("HR employee onboarding named-actor authorization", () => {
  it.each([0, 900, 901, -1, Number.NaN])(
    "denies unrelated actor %s before any database access",
    async actorId => {
      await expect(getHrEmployeeOnboarding(actorId)).rejects.toMatchObject({
        message: "HR onboarding is restricted to Mahmoud, Madonna, and Ziad.",
      });
      await expect(linkHrEmployeeLogin(actorId, input)).rejects.toBeInstanceOf(
        HrOnboardingError
      );
      expect(dependencies.getDb).not.toHaveBeenCalled();
    }
  );

  it.each([1, 120001, 191, 933743])(
    "allows verified named actor %i for inventory and explicit linking",
    async actorId => {
      queuedDb([[], []]);
      await expect(getHrEmployeeOnboarding(actorId)).resolves.toEqual({
        employees: [],
        users: [],
        summary: { unlinkedEmployees: 0, unlinkedUsers: 0 },
      });
      const memory = queuedDb([[{ id: 42 }], [employee()], []]);
      await expect(linkHrEmployeeLogin(actorId, input)).resolves.toEqual({
        employeeId: 7,
        userId: 42,
        changed: true,
      });
      expect(memory.db.transaction).toHaveBeenCalledTimes(1);
      expect(memory.pending).toHaveLength(0);
    }
  );

  it("fails closed with a friendly error when no database is available", async () => {
    dependencies.getDb.mockResolvedValue(null);
    const message = "Database unavailable. No employee links were changed.";
    await expect(getHrEmployeeOnboarding(1)).rejects.toMatchObject({ message });
    await expect(linkHrEmployeeLogin(191, input)).rejects.toMatchObject({
      message,
    });
  });
});

describe("HR onboarding inventory field whitelist", () => {
  it("selects only safe identity fields and reports broken/required links without matching names or emails", async () => {
    const employees = [
      {
        id: 7,
        name: "Same display name",
        isActive: true,
        crmUserId: null,
        hrSelfServiceRequired: true,
        crmUserEmail: null,
      },
      {
        id: 8,
        name: "Same display name",
        isActive: true,
        crmUserId: 42,
        hrSelfServiceRequired: true,
        crmUserEmail: "staff@elevay.com",
      },
      {
        id: 9,
        name: "Broken login reference",
        isActive: true,
        crmUserId: 99,
        hrSelfServiceRequired: true,
        crmUserEmail: null,
      },
      {
        id: 10,
        name: "Inactive employee",
        isActive: false,
        crmUserId: null,
        hrSelfServiceRequired: true,
        crmUserEmail: null,
      },
      {
        id: 11,
        name: "Financial only",
        isActive: true,
        crmUserId: null,
        hrSelfServiceRequired: false,
        crmUserEmail: null,
      },
    ];
    const accounts = [
      { id: 42, name: "Same display name", email: "staff@elevay.com" },
      { id: 43, name: "Same display name", email: "staff@elevay.com" },
      { id: 44, name: null, email: null },
    ];
    const memory = queuedDb([employees, accounts]);
    await expect(getHrEmployeeOnboarding(1)).resolves.toEqual({
      employees,
      users: [
        { ...accounts[0], linkedEmployeeId: 8 },
        { ...accounts[1], linkedEmployeeId: null },
        { ...accounts[2], linkedEmployeeId: null },
      ],
      summary: { unlinkedEmployees: 2, unlinkedUsers: 2 },
    });
    expect(memory.db.select.mock.calls).toEqual([
      [
        {
          id: finEmployees.id,
          name: finEmployees.name,
          isActive: finEmployees.isActive,
          crmUserId: finEmployees.crmUserId,
          hrSelfServiceRequired: finEmployees.hrSelfServiceRequired,
          crmUserEmail: users.email,
        },
      ],
      [{ id: users.id, name: users.name, email: users.email }],
    ]);
    expect(memory.queries[0].from).toHaveBeenCalledWith(finEmployees);
    expect(memory.queries[0].leftJoin).toHaveBeenCalledWith(
      users,
      expect.anything()
    );
    expect(
      dialect.sqlToQuery(memory.queries[0].leftJoin.mock.calls[0][1])
    ).toEqual({
      sql: "`finEmployees`.`crmUserId` = `users`.`id`",
      params: [],
    });
    expect(memory.queries[1].from).toHaveBeenCalledWith(users);
    expect(
      memory.queries.map(query => query.orderBy.mock.calls.length)
    ).toEqual([1, 1]);
    expect(memory.db.transaction).not.toHaveBeenCalled();
    expect(memory.db.update).not.toHaveBeenCalled();
    expect(memory.db.insert).not.toHaveBeenCalled();
    expect(memory.db.delete).not.toHaveBeenCalled();
    expect(memory.pending).toHaveLength(0);
  });
});

describe("HR onboarding explicit ID-only linking", () => {
  it("locks and links the selected IDs, sets only crmUserId/hrSelfServiceRequired, and preserves salary/history", async () => {
    const existing = {
      ...employee(),
      name: "Original financial employee",
      salary: "18000.00",
      hrSelfServiceRequired: false,
    };
    const salaryHistory = [
      { employeeId: 7, effectiveFrom: "2026-01-01", monthlySalary: "16000.00" },
      { employeeId: 7, effectiveFrom: "2026-10-01", monthlySalary: "18000.00" },
    ];
    const attendanceHistory = [
      { id: 5, employeeId: 7, attendanceDate: "2026-11-02" },
    ];
    const before = structuredClone({
      existing,
      salaryHistory,
      attendanceHistory,
    });
    const memory = queuedDb([[{ id: 42 }], [employee()], []], {
      onUpdate: values => Object.assign(existing, values),
    });
    // Direct callers cannot smuggle Financial changes through extra properties.
    await expect(
      linkHrEmployeeLogin(1, {
        ...input,
        name: "Forged name",
        email: "forged@elevay.com",
        salary: "1.00",
        isActive: false,
        crmUserId: 999,
      } as typeof input)
    ).resolves.toEqual({ employeeId: 7, userId: 42, changed: true });
    expect(memory.db.select).not.toHaveBeenCalled();
    expect(memory.db.transaction).toHaveBeenCalledTimes(1);
    expect(memory.tx.select.mock.calls).toEqual([
      [{ id: users.id }],
      [
        {
          id: finEmployees.id,
          crmUserId: finEmployees.crmUserId,
          isActive: finEmployees.isActive,
        },
      ],
      [{ id: finEmployees.id }],
    ]);
    expect(memory.queries.map(query => query.from.mock.calls[0][0])).toEqual([
      users,
      finEmployees,
      finEmployees,
    ]);
    expect(
      memory.queries.map(query =>
        dialect.sqlToQuery(query.where.mock.calls[0][0])
      )
    ).toEqual([
      { sql: "`users`.`id` = ?", params: [42], typings: ["none"] },
      { sql: "`finEmployees`.`id` = ?", params: [7], typings: ["none"] },
      {
        sql: "`finEmployees`.`crmUserId` = ?",
        params: [42],
        typings: ["none"],
      },
    ]);
    for (const query of memory.queries)
      expect(query.limit).toHaveBeenCalledWith(1);
    expect(memory.queries[0].for).toHaveBeenCalledWith("update");
    expect(memory.queries[1].for).toHaveBeenCalledWith("update");
    expect(memory.tx.update.mock.calls).toEqual([[finEmployees]]);
    expect(memory.set.mock.calls).toEqual([
      [{ crmUserId: 42, hrSelfServiceRequired: true }],
    ]);
    expect(dialect.sqlToQuery(memory.updateWhere.mock.calls[0][0])).toEqual({
      sql: "(`finEmployees`.`id` = ? and `finEmployees`.`crmUserId` is null)",
      params: [7],
      typings: ["none"],
    });
    expect(existing).toEqual({
      ...before.existing,
      crmUserId: 42,
      hrSelfServiceRequired: true,
    });
    expect(salaryHistory).toEqual(before.salaryHistory);
    expect(attendanceHistory).toEqual(before.attendanceHistory);
    expect(memory.tx.insert).not.toHaveBeenCalled();
    expect(memory.tx.delete).not.toHaveBeenCalled();
    expect(memory.tx.execute).not.toHaveBeenCalled();
    expect(memory.db.update).not.toHaveBeenCalled();
    expect(memory.pending).toHaveLength(0);
  });

  it("rejects a nonexistent CRM account before looking up or updating an employee", async () => {
    const memory = queuedDb([[]]);
    await expect(linkHrEmployeeLogin(1, input)).rejects.toMatchObject({
      message: "The selected CRM login no longer exists.",
    });
    expect(memory.tx.select).toHaveBeenCalledTimes(1);
    expect(memory.tx.update).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", []],
    ["inactive", [employee({ isActive: false })]],
  ] as const)("rejects a %s employee without writing", async (_label, rows) => {
    const memory = queuedDb([[{ id: 42 }], [...rows]]);
    await expect(linkHrEmployeeLogin(191, input)).rejects.toMatchObject({
      message: "Select an existing active employee.",
    });
    expect(memory.tx.select).toHaveBeenCalledTimes(2);
    expect(memory.tx.update).not.toHaveBeenCalled();
  });

  it("rejects a CRM account already claimed by another employee", async () => {
    const memory = queuedDb([[{ id: 42 }], [employee()], [{ id: 8 }]]);
    await expect(linkHrEmployeeLogin(933743, input)).rejects.toMatchObject({
      message: "This CRM login is already linked to another employee.",
    });
    expect(memory.tx.update).not.toHaveBeenCalled();
  });

  it("never replaces an already-linked employee or reassigns their attendance history", async () => {
    const memory = queuedDb([[{ id: 42 }], [employee({ crmUserId: 43 })]]);
    await expect(linkHrEmployeeLogin(120001, input)).rejects.toMatchObject({
      message:
        "This employee already has a CRM login. HR onboarding cannot replace it or reassign attendance history.",
    });
    expect(memory.tx.select).toHaveBeenCalledTimes(2);
    expect(memory.tx.update).not.toHaveBeenCalled();
  });

  it("is idempotent for the same existing link without any flag or history changes", async () => {
    const memory = queuedDb([[{ id: 42 }], [employee({ crmUserId: 42 })]]);
    await expect(linkHrEmployeeLogin(191, input)).resolves.toEqual({
      employeeId: 7,
      userId: 42,
      changed: false,
    });
    expect(memory.tx.select).toHaveBeenCalledTimes(2);
    expect(memory.tx.update).not.toHaveBeenCalled();
    expect(memory.set).not.toHaveBeenCalled();
    expect(memory.pending).toHaveLength(0);
  });

  it.each([
    { employeeId: 0 },
    { employeeId: -1 },
    { employeeId: 1.5 },
    { employeeId: Number.MAX_SAFE_INTEGER + 1 },
    { employeeId: Number.NaN },
    { userId: 0 },
    { userId: -1 },
    { userId: 1.5 },
    { userId: Number.MAX_SAFE_INTEGER + 1 },
    { userId: Number.POSITIVE_INFINITY },
    { reason: "" },
    { reason: "   " },
    { reason: " ab " },
  ])("rejects invalid link input %j before getDb", async invalid => {
    await expect(
      linkHrEmployeeLogin(1, { ...input, ...invalid })
    ).rejects.toBeInstanceOf(HrOnboardingError);
    expect(dependencies.getDb).not.toHaveBeenCalled();
  });

  it.each([{ code: "ER_DUP_ENTRY" }, { cause: { code: "ER_DUP_ENTRY" } }])(
    "turns unique-claim races into a friendly retry error: %j",
    async error => {
      const memory = queuedDb([[{ id: 42 }], [employee()], []], {
        updateError: error,
      });
      const result = linkHrEmployeeLogin(1, input);
      await expect(result).rejects.toBeInstanceOf(HrOnboardingError);
      await expect(result).rejects.toMatchObject({
        message:
          "The CRM login was linked by another administrator. Refresh the list and try again.",
      });
      expect(memory.tx.update).toHaveBeenCalledTimes(1);
    }
  );

  it("preserves business error instances and does not mislabel unrelated infrastructure failures as races", async () => {
    const businessError = new HrOnboardingError("Active employee required");
    const memory = queuedDb();
    memory.db.transaction.mockRejectedValueOnce(businessError);
    await expect(linkHrEmployeeLogin(1, input)).rejects.toBe(businessError);
    const failure = Object.assign(new Error("Database timeout"), {
      code: "ER_LOCK_WAIT_TIMEOUT",
    });
    memory.db.transaction.mockRejectedValueOnce(failure);
    await expect(linkHrEmployeeLogin(1, input)).rejects.toBe(failure);
    dependencies.getDb.mockRejectedValueOnce(failure);
    await expect(getHrEmployeeOnboarding(1)).rejects.toBe(failure);
  });
});
