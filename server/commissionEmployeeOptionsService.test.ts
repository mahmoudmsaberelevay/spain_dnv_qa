import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  finEmployees,
  modulePermissions,
  userPermissions,
} from "../drizzle/schema";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
import { listCommissionEmployeeOptions } from "./commissionEmployeeOptionsService";

const userId = 933743;
const dialect = new MySqlDialect();
const input = { userId, isFinancialAdmin: false };
let moduleRows: any[];
let pageRows: any[];
let employees: any[];
let queries: {
  table: unknown;
  selection: Record<string, unknown>;
  where?: any;
  order?: any;
}[];
let db: any;

function fakeDb() {
  return {
    select: vi.fn((selection: Record<string, unknown>) => ({
      from: (table: unknown) => {
        const query = { table, selection } as (typeof queries)[number];
        queries.push(query);
        const result = () => {
          const { params } = dialect.sqlToQuery(query.where);
          if (table === modulePermissions)
            return moduleRows.filter(
              row => row.userId === params[0] && row.module === params[1]
            );
          if (table === userPermissions)
            return pageRows.filter(
              row => row.userId === params[0] && row.pageKey === params[1]
            );
          if (table === finEmployees)
            return employees
              .filter(row => row.isActive === params[0])
              .sort((a, b) => a.name.localeCompare(b.name));
          throw new Error("Unexpected table read");
        };
        const builder: any = {
          where: (condition: unknown) => {
            query.where = condition;
            return builder;
          },
          limit: async (limit: number) => result().slice(0, limit),
          orderBy: async (order: unknown) => {
            query.order = order;
            return result();
          },
        };
        return builder;
      },
    })),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  moduleRows = [{ userId, module: "financial", accessLevel: "full" }];
  pageRows = [
    {
      userId,
      pageKey: "fin_commission_receipts",
      canAccess: true,
      canCreate: true,
      canEdit: true,
    },
  ];
  employees = [
    {
      id: 2,
      name: "Ziad",
      isActive: true,
      salary: "PRIVATE",
      crmUserId: 123,
      crmEmail: "private@example.test",
      ledgerTotal: "PRIVATE",
    },
    {
      id: 1,
      name: "Madonna",
      isActive: true,
      salary: "PRIVATE",
      crmUserId: 456,
      balance: "PRIVATE",
    },
    { id: 3, name: "Inactive", isActive: false, salary: "PRIVATE" },
  ];
  queries = [];
  db = fakeDb();
  mocks.getDb.mockResolvedValue(db);
});

afterEach(() => {
  for (const method of [
    "insert",
    "update",
    "delete",
    "execute",
    "transaction",
  ]) {
    expect(db[method]).not.toHaveBeenCalled();
  }
});

async function expectDenied() {
  await expect(listCommissionEmployeeOptions(input)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Employee selection is not permitted",
  });
  expect(queries.some(query => query.table === finEmployees)).toBe(false);
}

describe("commission employee options service (mock database only)", () => {
  it("allows Madonna's existing full-module and commission create/edit permission, with active names ordered", async () => {
    await expect(listCommissionEmployeeOptions(input)).resolves.toEqual([
      { id: 1, name: "Madonna" },
      { id: 2, name: "Ziad" },
    ]);
    expect(queries.map(query => query.table)).toEqual([
      modulePermissions,
      userPermissions,
      finEmployees,
    ]);
    expect(dialect.sqlToQuery(queries[0].where).params).toEqual([
      userId,
      "financial",
    ]);
    expect(dialect.sqlToQuery(queries[1].where).params).toEqual([
      userId,
      "fin_commission_receipts",
    ]);
    expect(queries[2].selection).toEqual({
      id: finEmployees.id,
      name: finEmployees.name,
    });
    expect(dialect.sqlToQuery(queries[2].where)).toMatchObject({
      sql: "`finEmployees`.`isActive` = ?",
      params: [true],
    });
    expect(dialect.sqlToQuery(queries[2].order).sql).toBe(
      "`finEmployees`.`name` asc"
    );
  });

  it.each(["canCreate", "canEdit"])(
    "allows commission %s independently when page access is enabled",
    async permission => {
      pageRows[0] = {
        ...pageRows[0],
        canCreate: false,
        canEdit: false,
        [permission]: true,
      };
      await expect(listCommissionEmployeeOptions(input)).resolves.toHaveLength(
        2
      );
    }
  );

  it("allows another eligible user without a hardcoded Madonna grant", async () => {
    moduleRows[0].userId = 99;
    pageRows[0].userId = 99;
    await expect(
      listCommissionEmployeeOptions({ userId: 99, isFinancialAdmin: false })
    ).resolves.toHaveLength(2);
  });

  it.each(["none", "viewer", "level1", "unknown"])(
    "denies financial module %s before employee reads",
    async accessLevel => {
      moduleRows[0].accessLevel = accessLevel;
      await expectDenied();
      expect(queries).toHaveLength(1);
    }
  );

  it("denies absent module permission", async () => {
    moduleRows = [];
    await expectDenied();
  });
  it("denies full access to another module", async () => {
    moduleRows[0].module = "contracting";
    await expectDenied();
  });
  it("denies another user's financial permission", async () => {
    moduleRows[0].userId = 99;
    await expectDenied();
  });
  it("denies absent commission page permission", async () => {
    pageRows = [];
    await expectDenied();
  });
  it("denies a different page's permission", async () => {
    pageRows[0].pageKey = "fin_salary_receipts";
    await expectDenied();
  });
  it("denies another user's page permission", async () => {
    pageRows[0].userId = 99;
    await expectDenied();
  });
  it("denies revoked page access even with create/edit flags", async () => {
    pageRows[0].canAccess = false;
    await expectDenied();
  });
  it("denies page viewers without create/edit", async () => {
    pageRows[0].canCreate = false;
    pageRows[0].canEdit = false;
    await expectDenied();
  });
  it("denies incomplete page flags", async () => {
    pageRows[0] = { userId, pageKey: "fin_commission_receipts" };
    await expectDenied();
  });

  it("preserves legacy Financial-admin access without module or page rows", async () => {
    moduleRows = [];
    pageRows = [];
    await expect(
      listCommissionEmployeeOptions({ userId: 1, isFinancialAdmin: true })
    ).resolves.toHaveLength(2);
    expect(queries.map(query => query.table)).toEqual([finEmployees]);
  });

  it("returns only id/name even when an adapter over-returns sensitive fields", async () => {
    const result = await listCommissionEmployeeOptions(input);
    for (const option of result)
      expect(Object.keys(option).sort()).toEqual(["id", "name"]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    for (const query of queries) {
      expect(Object.keys(query.selection)).not.toEqual([]);
      expect(Object.keys(query.selection)).not.toContain("salary");
      expect(Object.keys(query.selection)).not.toContain("crmUserId");
      expect(Object.keys(query.selection)).not.toContain("ledgerTotal");
    }
  });

  it("requires an available database even for legacy admins", async () => {
    mocks.getDb.mockResolvedValue(null);
    await expect(
      listCommissionEmployeeOptions({ userId: 1, isFinancialAdmin: true })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(queries).toHaveLength(0);
  });

  it("fails closed with a generic error on database failure", async () => {
    db.select.mockImplementation(() => {
      throw new Error("PRIVATE connection details");
    });
    await expect(listCommissionEmployeeOptions(input)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to load employee options",
    });
    expect(queries).toHaveLength(0);
  });
});
