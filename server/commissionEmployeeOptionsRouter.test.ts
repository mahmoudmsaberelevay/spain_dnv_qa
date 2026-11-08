import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const operationNames = [
    "listAccounts",
    "getAccountById",
    "createAccount",
    "updateAccount",
    "updateAccountBalance",
    "recalcAccountBalance",
    "recalcAllAccountBalances",
    "listCategories",
    "createCategory",
    "updateCategory",
    "deleteCategory",
    "listEmployees",
    "listAssignableCrmUsers",
    "listEmployeeSalaryRates",
    "createEmployee",
    "updateEmployee",
    "deleteEmployee",
    "listFinClients",
    "countFinClients",
    "getFinClientTotals",
    "getFinClientById",
    "createFinClient",
    "updateFinClient",
    "deleteFinClient",
    "getFinClientByContractId",
    "applyClientPayment",
    "recordClientManualPayment",
    "setClientPaidAmount",
    "recalcClientPaidAmount",
    "bulkDeleteTransactions",
    "listCommissions",
    "countCommissions",
    "createCommission",
    "updateCommission",
    "deleteCommission",
    "listTransactions",
    "countTransactions",
    "createTransaction",
    "getAccountStatement",
    "getFinancialSummary",
  ];
  return {
    listCommissionEmployeeOptions: vi.fn(),
    getDb: vi.fn(),
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    },
    finDb: Object.fromEntries(operationNames.map(name => [name, vi.fn()])),
    notifyFinClientAdded: vi.fn(),
    getAutomaticPostingExchangeRate: vi.fn(),
    getEurToEgpRate: vi.fn(),
  };
});

// Keep real tRPC auth/financial middleware, but isolate all persistence and external work.
vi.mock("./commissionEmployeeOptionsService", () => ({
  listCommissionEmployeeOptions: mocks.listCommissionEmployeeOptions,
}));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./finDb", () => mocks.finDb);
vi.mock("./emailService", () => ({
  notifyFinClientAdded: mocks.notifyFinClientAdded,
}));
vi.mock("./exchangeRate", () => ({
  getAutomaticPostingExchangeRate: mocks.getAutomaticPostingExchangeRate,
  getEurToEgpRate: mocks.getEurToEgpRate,
}));

import { TRPCError } from "@trpc/server";
import { financialRouter } from "./finRouter";

function caller(
  email: string | null = "madonna.adel@elevay.com",
  id = 933743,
  role = "user"
) {
  return financialRouter.createCaller({
    user:
      email === null
        ? null
        : { id, openId: "isolated-test", email, name: "Test User", role },
    req: { headers: {} },
    res: {},
  } as any);
}

function expectNoDataAccess() {
  expect(mocks.getDb).not.toHaveBeenCalled();
  for (const operation of Object.values(mocks.finDb))
    expect(operation).not.toHaveBeenCalled();
  for (const operation of Object.values(mocks.db))
    expect(operation).not.toHaveBeenCalled();
  expect(mocks.notifyFinClientAdded).not.toHaveBeenCalled();
  expect(mocks.getAutomaticPostingExchangeRate).not.toHaveBeenCalled();
  expect(mocks.getEurToEgpRate).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockResolvedValue(mocks.db);
  mocks.listCommissionEmployeeOptions.mockResolvedValue([
    { id: 1, name: "Employee Name" },
  ]);
});

describe("financial commission employee picker caller authorization (mock adapters only)", () => {
  it("allows Madonna to use employeeOptions and delegates permission validation without admin elevation", async () => {
    await expect(
      caller().commissionReceipts.employeeOptions()
    ).resolves.toEqual([{ id: 1, name: "Employee Name" }]);
    expect(mocks.listCommissionEmployeeOptions).toHaveBeenCalledTimes(1);
    expect(mocks.listCommissionEmployeeOptions).toHaveBeenCalledWith({
      userId: 933743,
      isFinancialAdmin: false,
    });
    expectNoDataAccess();
  });

  it("preserves legacy Financial admin selection and passes the real financial role", async () => {
    await expect(
      caller("hager.hany@elevay.com", 7).commissionReceipts.employeeOptions()
    ).resolves.toHaveLength(1);
    expect(mocks.listCommissionEmployeeOptions).toHaveBeenCalledTimes(1);
    expect(mocks.listCommissionEmployeeOptions).toHaveBeenCalledWith({
      userId: 7,
      isFinancialAdmin: true,
    });
    expectNoDataAccess();
  });

  it("passes a denied service permission back to the caller", async () => {
    mocks.listCommissionEmployeeOptions.mockRejectedValue(
      new TRPCError({
        code: "FORBIDDEN",
        message: "Employee selection is not permitted",
      })
    );
    await expect(
      caller().commissionReceipts.employeeOptions()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoDataAccess();
  });

  it("does not turn a CRM admin role into Financial admin access", async () => {
    await caller(
      "madonna.adel@elevay.com",
      933743,
      "admin"
    ).commissionReceipts.employeeOptions();
    expect(mocks.listCommissionEmployeeOptions).toHaveBeenCalledWith({
      userId: 933743,
      isFinancialAdmin: false,
    });
    expectNoDataAccess();
  });

  it.each([
    {
      label: "list",
      call: (c: ReturnType<typeof caller>) => c.employees.list(),
    },
    {
      label: "CRM identities",
      call: (c: ReturnType<typeof caller>) =>
        c.employees.listAssignableCrmUsers(),
    },
    {
      label: "salaryRates",
      call: (c: ReturnType<typeof caller>) =>
        c.employees.salaryRates({ employeeId: 1 }),
    },
    {
      label: "create",
      call: (c: ReturnType<typeof caller>) =>
        c.employees.create({ name: "Test Employee" }),
    },
    {
      label: "update",
      call: (c: ReturnType<typeof caller>) =>
        c.employees.update({ id: 1, name: "Test Employee" }),
    },
    {
      label: "delete",
      call: (c: ReturnType<typeof caller>) => c.employees.delete({ id: 1 }),
    },
  ])(
    "keeps employees.$label denied to Madonna before any reads or writes",
    async ({ call }) => {
      await expect(call(caller())).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Admin access required",
      });
      expect(mocks.listCommissionEmployeeOptions).not.toHaveBeenCalled();
      expectNoDataAccess();
    }
  );

  it.each([
    {
      label: "unauthenticated",
      email: null,
      role: "user",
      code: "UNAUTHORIZED",
    },
    {
      label: "non-financial",
      email: "outsider@elevay.com",
      role: "user",
      code: "FORBIDDEN",
    },
    {
      label: "CRM-admin-only",
      email: "outsider@elevay.com",
      role: "admin",
      code: "FORBIDDEN",
    },
  ])(
    "rejects $label picker callers before service or persistence access",
    async ({ email, role, code }) => {
      await expect(
        caller(email, 99, role).commissionReceipts.employeeOptions()
      ).rejects.toMatchObject({ code });
      expect(mocks.listCommissionEmployeeOptions).not.toHaveBeenCalled();
      expectNoDataAccess();
    }
  );
});
