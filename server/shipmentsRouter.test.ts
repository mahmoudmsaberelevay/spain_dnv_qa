import { MySqlDialect, getTableConfig } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { crmShipments } from "../drizzle/schema";
import {
  EMPTY_SHIPMENT_FILTERS,
  SHIPMENT_SORT_FIELDS,
  shipmentCreateSchema,
  shipmentDirectionLabel,
} from "../shared/shipments";
import type { TrpcContext } from "./_core/context";

const dependencies = vi.hoisted(() => ({
  getDb: vi.fn(),
  writeAuditLog: vi.fn(),
  notifyShipmentCreated: vi.fn(),
}));
// Mock before importing the actual router/service. No environment initialization,
// database connection, auth mutation, provider invocation or real audit writes.
vi.mock("./db", () => ({ getDb: dependencies.getDb }));
vi.mock("./auditLog", () => ({ writeAuditLog: dependencies.writeAuditLog }));
vi.mock("./shipmentNotifications", () => ({
  notifyShipmentCreated: dependencies.notifyShipmentCreated,
}));
import { shipmentsRouter } from "./shipmentsRouter";

type Row = Record<string, unknown>;
const dialect = new MySqlDialect();
const requestKey = "e5c9a32a-1c8d-40ee-b98f-b1b6239aee71";
const entry = {
  shipmentDate: "2026-11-09",
  companyName: "Synthetic carrier",
  shipmentNumber: "SHP-100",
  direction: "from" as const,
  partyName: "Synthetic recipient",
  driveUrl: "https://drive.google.com/file/d/synthetic/view",
  recordedByName: "Synthetic manual recorder",
  notificationEmail: "shipment@example.test",
};
const createInput = { ...entry, requestKey };
const record = (overrides: Row = {}) => ({
  id: 7,
  ...entry,
  createdAt: new Date("2026-11-09T09:00:00.000Z"),
  notificationStatus: "sending",
  notificationSentAt: null,
  ...overrides,
});
const replay = (overrides: Row = {}) =>
  record({ createdByUserId: 900, ...overrides });
const listInput = { filters: { ...EMPTY_SHIPMENT_FILTERS } };
function context(
  user: Row | null = {
    id: 900,
    role: "user",
    name: "Synthetic CRM colleague",
    email: "private@example.test",
  }
): TrpcContext {
  return { user, req: { headers: {} }, res: {} } as TrpcContext;
}
function caller(user?: Row | null) {
  return shipmentsRouter.createCaller(context(user));
}

/** Memory-only queued Drizzle-shaped builders. SQL is compiled locally solely
 * to inspect predicates, projections and ordering, never sent to a server.
 * These tests do not claim actual MySQL isolation or query-execution coverage. */
function queuedDb(
  reads: Row[][] = [],
  options: {
    insertError?: unknown;
    selectError?: unknown;
    updateError?: unknown;
    affectedRows?: number;
  } = {}
) {
  const pending = [...reads];
  const queries: any[] = [];
  const forbidden = vi.fn(() => {
    throw new Error("Unexpected shipment write");
  });
  const select = vi.fn((projection: unknown) => {
    if (!pending.length && !options.selectError)
      throw new Error("Unexpected shipment SELECT");
    const rows = pending.shift() ?? [];
    const query: any = {
      projection,
      from: vi.fn(() => query),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => query),
      offset: vi.fn(() => query),
      then: (resolve: any, reject: any) =>
        (options.selectError
          ? Promise.reject(options.selectError)
          : Promise.resolve(rows)
        ).then(resolve, reject),
    };
    queries.push(query);
    return query;
  });
  const returning = vi.fn(async () => {
    if (options.insertError) throw options.insertError;
    return [{ id: 7 }];
  });
  const values = vi.fn(() => ({ $returningId: returning }));
  const updateWhere = vi.fn(async () => {
    if (options.updateError) throw options.updateError;
    return [{ affectedRows: options.affectedRows ?? 1 }];
  });
  const set = vi.fn(() => ({ where: updateWhere }));
  const db = {
    select,
    insert: vi.fn(() => ({ values })),
    update: vi.fn(() => ({ set })),
    delete: forbidden,
    execute: forbidden,
  };
  dependencies.getDb.mockResolvedValue(db);
  return {
    db,
    queries,
    pending,
    values,
    returning,
    forbidden,
    set,
    updateWhere,
  };
}
function whereSql(query: any) {
  return dialect.sqlToQuery(query.where.mock.calls[0][0]);
}
function orderSql(query: any) {
  return query.orderBy.mock.calls[0].map((order: any) =>
    dialect.sqlToQuery(order)
  );
}
function expectSafeRow(row: unknown) {
  expect(Object.keys(row as Row).sort()).toEqual(
    [
      "id",
      "shipmentDate",
      "companyName",
      "shipmentNumber",
      "direction",
      "partyName",
      "driveUrl",
      "createdAt",
      "recordedByName",
      "notificationEmail",
      "notes",
      "notificationStatus",
      "notificationSentAt",
    ].sort()
  );
}
function expectSafeProjection(query: any) {
  expect(Object.keys(query.projection).sort()).toEqual(
    [
      "id",
      "shipmentDate",
      "companyName",
      "shipmentNumber",
      "direction",
      "partyName",
      "driveUrl",
      "createdAt",
      "recordedByName",
      "notificationEmail",
      "notes",
      "notificationStatus",
      "notificationSentAt",
    ].sort()
  );
  expect(query.from).toHaveBeenCalledWith(crmShipments);
}
beforeEach(() => {
  vi.resetAllMocks();
  dependencies.notifyShipmentCreated.mockResolvedValue(true);
});

describe("Shipment actual-router authentication and identity", () => {
  it("denies unauthenticated list, create, report without any database/audit access", async () => {
    const unauthenticated = caller(null);
    for (const action of [
      () => unauthenticated.list(listInput),
      () => unauthenticated.create(createInput),
      () => unauthenticated.report({}),
    ]) {
      await expect(action()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    expect(dependencies.getDb).not.toHaveBeenCalled();
    expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
  });
  it.each(["user", "admin"])(
    "allows a normal CRM %s with no special grant or calls-session identity",
    async role => {
      queuedDb([
        [],
        [{ total: 0, fromCount: 0, toCount: 0 }],
        [],
        [],
        [record()],
      ]);
      const ordinary = caller({ id: 900, role, name: "CRM colleague" });
      await expect(ordinary.list(listInput)).resolves.toEqual({
        rows: [],
        total: 0,
        fromCount: 0,
        toCount: 0,
      });
      await expect(ordinary.report({})).resolves.toMatchObject({
        rows: [],
        generatedBy: "CRM colleague",
      });
      await expect(ordinary.create(createInput)).resolves.toMatchObject({
        row: { id: 7 },
        created: true,
      });
    }
  );
  it("uses creator ID only from ctx.user; drops injected identity/timestamp fields and audits ID only", async () => {
    const memory = queuedDb([[], [record()]]);
    await caller().create({
      ...createInput,
      createdByUserId: 1,
      createdAt: "1999-01-01",
      userId: 1,
      email: "injected@example.test",
    } as any);
    expect(memory.values).toHaveBeenCalledWith({
      ...createInput,
      createdByUserId: 900,
      notificationStatus: "sending",
    });
    expect(dependencies.writeAuditLog.mock.calls).toEqual([
      [{ userId: 900 }, "create", "crm_shipment", 7],
    ]);
    expect(JSON.stringify(dependencies.writeAuditLog.mock.calls)).not.toMatch(
      /https|private@|Synthetic|requestKey|createdAt/
    );
    expect(memory.forbidden).not.toHaveBeenCalled();
  });
});

describe("Shipment shared-schema validation at the actual router", () => {
  it("trims required text and Drive URL before persistence", async () => {
    const memory = queuedDb([[], [record()]]);
    await caller().create({
      ...createInput,
      companyName: "  Synthetic carrier  ",
      shipmentNumber: " SHP-100 ",
      partyName: " Synthetic recipient ",
      driveUrl: ` ${entry.driveUrl} `,
      recordedByName: " Synthetic manual recorder ",
      notificationEmail: " shipment@example.test ",
    });
    expect(memory.values).toHaveBeenCalledWith({
      ...createInput,
      createdByUserId: 900,
      notificationStatus: "sending",
    });
  });
  it.each([
    { shipmentDate: "2026-02-30" },
    { shipmentDate: "2026-02-29" },
    { shipmentDate: "2026-13-01" },
    { shipmentDate: "2026-11-09T00:00:00Z" },
    { shipmentDate: " 2026-11-09 " },
    { companyName: " " },
    { companyName: "x".repeat(201) },
    { shipmentNumber: "x".repeat(101) },
    { partyName: "x".repeat(201) },
    { direction: "outbound" },
    { requestKey: "invalid" },
    { driveUrl: "http://drive.google.com/file/d/test" },
    { driveUrl: "javascript:alert(1)" },
    { driveUrl: "https://drive.google.com.evil.test/file" },
    { driveUrl: "https://example.test/file" },
    { driveUrl: "https://user:pass@drive.google.com/file" },
    { driveUrl: "https://drive.google.com:8443/file" },
    { driveUrl: "https://drive.google.com/" + "x".repeat(2000) },
    { recordedByName: undefined },
    { recordedByName: " " },
    { recordedByName: "x".repeat(201) },
    { recordedByName: " Recorder\n" },
    { recordedByName: "Recorder\u0000" },
    { recordedByName: "Recorder\u0085" },
    { notificationEmail: undefined },
    { notificationEmail: "" },
    { notificationEmail: "Name <shipment@example.test>" },
    { notificationEmail: "shipment@example.test,second@example.test" },
    { notificationEmail: "shipment@example.test;second@example.test" },
    { notificationEmail: "shipment@example.test\r\nBcc: second@example.test" },
    { notificationEmail: "shipment@example.test\n" },
    { notificationEmail: "a".repeat(245) + "@example.test" },
  ])("rejects invalid creation %j before database access", async invalid => {
    await expect(
      caller().create({ ...createInput, ...invalid } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dependencies.getDb).not.toHaveBeenCalled();
    expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
  });
  it.each([
    "https://docs.google.com/document/d/synthetic/edit",
    "https://drive.google.com/drive/folders/synthetic",
  ])("accepts valid allowed URL %s and leap date", async driveUrl => {
    const input = { ...createInput, driveUrl, shipmentDate: "2024-02-29" };
    queuedDb([[], [record(input)]]);
    await expect(caller().create(input)).resolves.toMatchObject({
      created: true,
    });
  });
  it.each([
    { filters: { from: "2026-11-10", to: "2026-11-09" } },
    { filters: { from: "2026-02-30" } },
    { page: 0 },
    { page: 1.5 },
    { pageSize: 100 },
    { sortBy: "driveUrl" },
    { sortBy: "shipmentDate; DROP TABLE users" },
    { sortOrder: "asc; delete" },
    { filters: { direction: "outbound" } },
    { filters: { search: "x".repeat(201) } },
  ])(
    "rejects unsupported list arguments %j before DB access",
    async invalid => {
      await expect(
        caller().list({ ...listInput, ...invalid } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(dependencies.getDb).not.toHaveBeenCalled();
    }
  );
  it.each([
    { shipmentId: 0 },
    { shipmentId: -1 },
    { shipmentId: 1.5 },
    { shipmentId: 7, filters: {} },
    { filters: { from: "2026-11-10", to: "2026-11-09" } },
  ])("rejects invalid report selectors %j before DB access", async input => {
    await expect(caller().report(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(dependencies.getDb).not.toHaveBeenCalled();
  });
});

describe("Shipment list SQL predicates, pagination, sort and privacy", () => {
  it("ANDs all filters with inclusive calendar bounds and OR free search, using literal LIKE escaping and bound params", async () => {
    const memory = queuedDb([
      [
        record({
          requestKey,
          createdByUserId: 900,
          email: "hidden@example.test",
          latitude: 30,
          user: { id: 1 },
        }),
      ],
      [{ total: "51", fromCount: "31", toCount: "20" }],
    ]);
    const filters = {
      from: "2026-11-01",
      to: "2026-11-09",
      direction: "from" as const,
      search: "50%_!\\' OR 1=1 --",
      companyName: " AC%_! ",
      shipmentNumber: " NUM_ ",
      partyName: " Party% ",
      driveUrl: " drive_ ",
    };
    const result = await caller().list({
      filters,
      page: 3,
      pageSize: 25,
      sortBy: "companyName",
      sortOrder: "asc",
    });
    expect(result).toMatchObject({ total: 51, fromCount: 31, toCount: 20 });
    expectSafeRow(result.rows[0]);
    expectSafeProjection(memory.queries[0]);
    const compiled = whereSql(memory.queries[0]);
    expect(compiled.sql).toContain("`crmShipments`.`shipmentDate` >= ?");
    expect(compiled.sql).toContain("`crmShipments`.`shipmentDate` <= ?");
    expect(compiled.sql).toContain("`crmShipments`.`direction` = ?");
    expect(compiled.sql).toContain(" and ");
    expect(compiled.sql).toContain(" or ");
    expect(compiled.sql.match(/escape '!'/g)).toHaveLength(10);
    expect(compiled.sql).not.toContain("OR 1=1");
    const searchPattern = "%50!%!_!!\\' OR 1=1 --%";
    expect(compiled.params).toEqual([
      "2026-11-01",
      "2026-11-09",
      "from",
      "%AC!%!_!!%",
      "%NUM!_%",
      "%Party!%%",
      "%drive!_%",
      ...Array(6).fill(searchPattern),
    ]);
    expect(whereSql(memory.queries[1])).toEqual(compiled);
    expect(memory.queries[0].limit).toHaveBeenCalledWith(25);
    expect(memory.queries[0].offset).toHaveBeenCalledWith(50);
    expect(orderSql(memory.queries[0]).map((part: any) => part.sql)).toEqual([
      "`crmShipments`.`companyName` asc",
      "`crmShipments`.`id` asc",
    ]);
    expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
  });
  it.each(
    SHIPMENT_SORT_FIELDS.flatMap(sortBy =>
      (["asc", "desc"] as const).map(sortOrder => ({ sortBy, sortOrder }))
    )
  )("whitelists stable $sortBy $sortOrder with ID tie breaker", async sort => {
    const memory = queuedDb([[], [{ total: 0 }]]);
    await caller().list({ ...listInput, ...sort });
    expect(orderSql(memory.queries[0]).map((part: any) => part.sql)).toEqual([
      `\`crmShipments\`.\`${sort.sortBy}\` ${sort.sortOrder}`,
      `\`crmShipments\`.\`id\` ${sort.sortOrder}`,
    ]);
  });
  it.each([10, 25, 50] as const)(
    "paginates page size %i in the database",
    async pageSize => {
      const memory = queuedDb([[], [{ total: 0 }]]);
      await caller().list({ ...listInput, page: 2, pageSize });
      expect(memory.queries[0].limit).toHaveBeenCalledWith(pageSize);
      expect(memory.queries[0].offset).toHaveBeenCalledWith(pageSize);
    }
  );
  it("defaults to newest date + ID, page 1 / 25, with no WHERE for empty filters", async () => {
    const memory = queuedDb([[], []]);
    await expect(caller().list(listInput)).resolves.toEqual({
      rows: [],
      total: 0,
      fromCount: 0,
      toCount: 0,
    });
    expect(memory.queries[0].where).toHaveBeenCalledWith(undefined);
    expect(memory.queries[0].offset).toHaveBeenCalledWith(0);
    expect(memory.queries[0].limit).toHaveBeenCalledWith(25);
    expect(orderSql(memory.queries[0]).map((part: any) => part.sql)).toEqual([
      "`crmShipments`.`shipmentDate` desc",
      "`crmShipments`.`id` desc",
    ]);
  });
  it.each(["from", "to"] as const)(
    "free search supports visible direction label for %s",
    async direction => {
      const memory = queuedDb([[], []]);
      const search = shipmentDirectionLabel(direction);
      await caller().list({ filters: { search } });
      const compiled = whereSql(memory.queries[0]);
      expect(compiled.sql).toContain("then 'Shipment from' else 'Shipment to'");
      expect(compiled.params).toEqual(Array(6).fill(`%${search}%`));
    }
  );
});

describe("Shipment safe bounded report", () => {
  it("returns all matching rows chronologically, safe issuer and server timestamp, without user/creator/replay fields", async () => {
    const memory = queuedDb([
      [
        record({
          requestKey,
          createdByUserId: 900,
          email: "private@example.test",
          gps: [30, 31],
          users: [{ id: 1 }],
        }),
      ],
    ]);
    const before = Date.now();
    const report = await caller({
      id: 900,
      role: "user",
      name: "\u0000Synthetic colleague private@example.test\n",
      email: "ignored@example.test",
    }).report({
      filters: { from: "2026-11-01", to: "2026-11-09", partyName: "Synthetic" },
    });
    expect(report.generatedBy).toBe("Synthetic colleague");
    expect(report.generatedAt).toBeInstanceOf(Date);
    expect((report.generatedAt as Date).getTime()).toBeGreaterThanOrEqual(
      before
    );
    expect((report.generatedAt as Date).getTime()).toBeLessThanOrEqual(
      Date.now()
    );
    expect(Object.keys(report).sort()).toEqual(
      ["rows", "generatedAt", "generatedBy", "filters"].sort()
    );
    expectSafeRow(report.rows[0]);
    expectSafeProjection(memory.queries[0]);
    expect(memory.queries[0].limit).toHaveBeenCalledWith(5001);
    expect(memory.queries[0].offset).not.toHaveBeenCalled();
    expect(orderSql(memory.queries[0]).map((part: any) => part.sql)).toEqual([
      "`crmShipments`.`shipmentDate` asc",
      "`crmShipments`.`id` asc",
    ]);
    expect(whereSql(memory.queries[0]).params).toEqual([
      "2026-11-01",
      "2026-11-09",
      "%Synthetic%",
    ]);
    expect(JSON.stringify(report)).not.toMatch(
      /private@|ignored@|requestKey|createdByUserId|gps|users/
    );
  });
  it.each([null, "", "private@example.test"])(
    "uses safe fallback issuer for name %j",
    async name => {
      queuedDb([[]]);
      await expect(
        caller({ id: 900, role: "user", name }).report({})
      ).resolves.toMatchObject({
        generatedBy: "ELEVAY team member",
        filters: EMPTY_SHIPMENT_FILTERS,
      });
    }
  );
  it("single shipment reports use bound ID only and one safe row", async () => {
    const memory = queuedDb([[record()]]);
    const report = await caller().report({ shipmentId: 7 });
    expect(report.shipmentId).toBe(7);
    expectSafeRow(report.rows[0]);
    expect(whereSql(memory.queries[0])).toMatchObject({
      sql: "`crmShipments`.`id` = ?",
      params: [7],
    });
    expect(memory.queries[0].limit).toHaveBeenCalledWith(1);
  });
  it("throws a clear not-found error for a missing selected shipment", async () => {
    queuedDb([[]]);
    await expect(caller().report({ shipmentId: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "This shipment could not be found.",
    });
  });
  it("returns exactly 5,000 rows without truncating an accepted report", async () => {
    queuedDb([Array.from({ length: 5000 }, (_, i) => record({ id: i + 1 }))]);
    expect((await caller().report({})).rows).toHaveLength(5000);
  });
  it("fetches 5,001 then fails rather than silently truncating an oversized report", async () => {
    const memory = queuedDb([
      Array.from({ length: 5001 }, (_, i) => record({ id: i + 1 })),
    ]);
    await expect(caller().report({})).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/5,000.*narrow the date range/i),
    });
    expect(memory.queries[0].limit).toHaveBeenCalledWith(5001);
  });
});

describe("Shipment immutable idempotent creation", () => {
  it("creates using a plain INSERT and returns safe row without replay/creator identity", async () => {
    const memory = queuedDb([
      [],
      [record({ requestKey, createdByUserId: 900 })],
    ]);
    const result = await caller().create(createInput);
    expect(result.created).toBe(true);
    expectSafeRow(result.row);
    expect(memory.db.insert).toHaveBeenCalledWith(crmShipments);
    expect(memory.returning).toHaveBeenCalledTimes(1);
    expect(memory.forbidden).not.toHaveBeenCalled();
    expect(whereSql(memory.queries[0]).params).toEqual([requestKey]);
    expect(Object.keys(memory.queries[0].projection)).toContain(
      "createdByUserId"
    );
    expect(Object.keys(memory.queries[0].projection)).not.toContain(
      "requestKey"
    );
    expectSafeProjection(memory.queries[1]);
  });
  it("replays the same creator and canonical payload without a write or new audit", async () => {
    const memory = queuedDb([[replay()]]);
    const result = await caller().create({
      ...createInput,
      companyName: " Synthetic carrier ",
    });
    expect(result.created).toBe(false);
    expect(result.row.id).toBe(7);
    expectSafeRow(result.row);
    expect(memory.db.insert).not.toHaveBeenCalled();
    expect(memory.forbidden).not.toHaveBeenCalled();
    expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
  });
  it.each([
    { createdByUserId: 901 },
    { shipmentDate: "2026-11-08" },
    { companyName: "Other carrier" },
    { shipmentNumber: "Other number" },
    { direction: "to" },
    { partyName: "Other party" },
    { driveUrl: "https://docs.google.com/document/d/other" },
    { recordedByName: "Other manual recorder" },
    { notificationEmail: "other@example.test" },
    { notes: "Changed shipment instruction" },
  ])(
    "rejects replay when creator or any payload field differs: %j",
    async difference => {
      const memory = queuedDb([[replay(difference)]]);
      await expect(caller().create(createInput)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(memory.db.insert).not.toHaveBeenCalled();
      expect(memory.forbidden).not.toHaveBeenCalled();
      expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
    }
  );
  it.each([
    { code: "ER_DUP_ENTRY" },
    { errno: 1062 },
    { cause: { code: "ER_DUP_ENTRY" } },
  ])(
    "resolves unique-key race via re-read for driver error %j without overwriting",
    async insertError => {
      const memory = queuedDb([[], [replay()]], { insertError });
      await expect(caller().create(createInput)).resolves.toMatchObject({
        created: false,
        row: { id: 7 },
      });
      expect(memory.values).toHaveBeenCalledTimes(1);
      expect(memory.forbidden).not.toHaveBeenCalled();
      expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
    }
  );
  it("rejects conflicting race winner instead of returning another creator's row", async () => {
    const memory = queuedDb([[], [replay({ createdByUserId: 901 })]], {
      insertError: { cause: { errno: 1062 } },
    });
    await expect(caller().create(createInput)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(memory.forbidden).not.toHaveBeenCalled();
    expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
  });
  it("does not swallow unrelated insert failure, retry insert, or audit", async () => {
    const memory = queuedDb([[]], {
      insertError: new Error(
        "Failed query: INSERT crmShipments params: secret-url"
      ),
    });
    const failure = await caller()
      .create(createInput)
      .catch(error => error);
    expect(failure).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(failure.message).not.toMatch(/query|INSERT|params|secret-url/);
    expect(memory.values).toHaveBeenCalledTimes(1);
    expect(memory.db.select).toHaveBeenCalledTimes(1);
    expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
  });
  it("does not report success when a duplicate error has no replay winner", async () => {
    queuedDb([[], []], { insertError: { cause: { code: "ER_DUP_ENTRY" } } });
    await expect(caller().create(createInput)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("Shipment safe infrastructure failure boundary", () => {
  it.each(["list", "report"] as const)(
    "hides raw SQL and driver causes for %s",
    async endpoint => {
      queuedDb([], {
        selectError: new Error(
          "Failed query SELECT users.email, gps params: https://drive.google.com/private"
        ),
      });
      const error = await (
        endpoint === "list" ? caller().list(listInput) : caller().report({})
      ).catch(failure => failure);
      expect(error).toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "The shipment action could not be completed. Please try again or contact support.",
      });
      expect(error.message).not.toMatch(/SELECT|users|gps|params|https/);
      expect(String(error.cause)).not.toMatch(/SELECT|users|gps|params|https/);
      expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
    }
  );
  it("handles unavailable DB safely", async () => {
    dependencies.getDb.mockResolvedValue(null);
    await expect(caller().list(listInput)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    await expect(caller().create(createInput)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    await expect(caller().report({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("crmShipments schema contract", () => {
  // Notification flows below use the real router/service and memory-only DB.
  it("declares calendar-date/text field widths, enum, unique replay key, server timestamp, and requested indexes", () => {
    const config = getTableConfig(crmShipments);
    expect(config.name).toBe("crmShipments");
    expect(config.columns.map(column => column.name)).toEqual([
      "id",
      "shipmentDate",
      "companyName",
      "shipmentNumber",
      "direction",
      "partyName",
      "driveUrl",
      "recordedByName",
      "notificationEmail",
      "notes",
      "notificationStatus",
      "notificationSentAt",
      "requestKey",
      "createdByUserId",
      "createdAt",
    ]);
    const columns = Object.fromEntries(
      config.columns.map(column => [column.name, column])
    );
    for (const [field, length] of [
      ["shipmentDate", 10],
      ["companyName", 200],
      ["shipmentNumber", 100],
      ["partyName", 200],
      ["driveUrl", 2000],
      ["requestKey", 36],
    ] as const) {
      expect(columns[field].getSQLType()).toBe(`varchar(${length})`);
      expect(columns[field].notNull).toBe(true);
    }
    expect(crmShipments.direction.enumValues).toEqual(["from", "to"]);
    expect(crmShipments.recordedByName.getSQLType()).toBe("varchar(200)");
    expect(crmShipments.notificationEmail.getSQLType()).toBe("varchar(254)");
    expect(crmShipments.recordedByName.notNull).toBe(false);
    expect(crmShipments.notificationEmail.notNull).toBe(false);
    expect(crmShipments.notes.notNull).toBe(false);
    expect(crmShipments.notes.getSQLType()).toBe("text");
    expect(crmShipments.notificationStatus.enumValues).toEqual([
      "not_requested",
      "sending",
      "sent",
      "failed",
      "unknown",
    ]);
    expect(crmShipments.notificationStatus.default).toBe("not_requested");
    expect(crmShipments.notificationStatus.notNull).toBe(true);
    expect(crmShipments.notificationSentAt.notNull).toBe(false);
    expect(crmShipments.notificationSentAt.getSQLType()).toBe("timestamp");
    expect(crmShipments.requestKey.isUnique).toBe(true);
    expect(crmShipments.createdByUserId.getSQLType()).toBe("int");
    expect(crmShipments.createdAt.hasDefault).toBe(true);
    expect(crmShipments.id.primary).toBe(true);
    expect(crmShipments.id.autoIncrement).toBe(true);
    expect(
      config.indexes.map(item =>
        item.config.columns.map(column => (column as any).name)
      )
    ).toEqual([["shipmentDate"], ["shipmentNumber"]]);
    expect(shipmentCreateSchema.parse(createInput)).toEqual(createInput);
  });
});

describe("Shipment one-shot notification after durable creation", () => {
  it("sends exactly once after insert and read confirmation, then persists sent time", async () => {
    const memory = queuedDb([[], [record()]]);
    dependencies.notifyShipmentCreated.mockImplementation(async (row: Row) => {
      expect(memory.returning).toHaveBeenCalledTimes(1);
      expect(memory.db.select).toHaveBeenCalledTimes(2);
      expect(memory.db.update).not.toHaveBeenCalled();
      expectSafeRow(row);
      expect(row).toMatchObject({
        recordedByName: entry.recordedByName,
        notificationEmail: entry.notificationEmail,
      });
      return true;
    });
    const result = await caller().create(createInput);
    expect(result).toMatchObject({
      created: true,
      row: { notificationStatus: "sent" },
    });
    expect(result.row.notificationSentAt).toBeInstanceOf(Date);
    expect(dependencies.notifyShipmentCreated).toHaveBeenCalledTimes(1);
    expect(memory.set).toHaveBeenCalledWith({
      notificationStatus: "sent",
      notificationSentAt: expect.any(Date),
    });
    expect(
      dialect.sqlToQuery(memory.updateWhere.mock.calls[0][0])
    ).toMatchObject({
      params: [7, "sending"],
    });
  });
  it.each([false, "exception"])(
    "keeps shipment saved when notification outcome is %s",
    async outcome => {
      const memory = queuedDb([[], [record()]]);
      const log = vi.spyOn(console, "warn").mockImplementation(() => {});
      if (outcome === "exception")
        dependencies.notifyShipmentCreated.mockRejectedValue(
          new Error("raw SMTP token and private address")
        );
      else dependencies.notifyShipmentCreated.mockResolvedValue(false);
      try {
        const result = await caller().create(createInput);
        expect(result).toMatchObject({
          created: true,
          row: {
            id: 7,
            notificationStatus: "failed",
            notificationSentAt: null,
          },
        });
        expect(result.notificationMessage).toMatch(/Shipment saved/);
        expect(memory.returning).toHaveBeenCalledTimes(1);
        expect(memory.set).toHaveBeenCalledWith({
          notificationStatus: "failed",
          notificationSentAt: null,
        });
        expect(dependencies.notifyShipmentCreated).toHaveBeenCalledTimes(1);
        expect(dependencies.writeAuditLog).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(log.mock.calls)).not.toMatch(
          /raw SMTP|token|private address/
        );
      } finally {
        log.mockRestore();
      }
    }
  );
  it.each(["sending", "sent", "failed", "unknown", "not_requested"])(
    "never resends replay with persisted state %s",
    async notificationStatus => {
      const memory = queuedDb([[replay({ notificationStatus })]]);
      expect((await caller().create(createInput)).created).toBe(false);
      expect(memory.db.insert).not.toHaveBeenCalled();
      expect(memory.db.update).not.toHaveBeenCalled();
      expect(dependencies.notifyShipmentCreated).not.toHaveBeenCalled();
    }
  );
  it("does not send mail for the losing unique-key race", async () => {
    const memory = queuedDb([[], [replay()]], {
      insertError: { cause: { code: "ER_DUP_ENTRY" } },
    });
    expect((await caller().create(createInput)).created).toBe(false);
    expect(memory.db.update).not.toHaveBeenCalled();
    expect(dependencies.notifyShipmentCreated).not.toHaveBeenCalled();
  });
  it("sends only once when concurrent calls both initially see no replay", async () => {
    const memory = queuedDb([[], [], [replay()], [replay()]]);
    let inserts = 0;
    memory.returning.mockImplementation(async () => {
      inserts += 1;
      if (inserts > 1) throw { code: "ER_DUP_ENTRY" };
      return [{ id: 7 }];
    });
    const results = await Promise.all([
      caller().create(createInput),
      caller().create(createInput),
    ]);
    expect(results.map(result => result.created).sort()).toEqual([false, true]);
    expect(memory.returning).toHaveBeenCalledTimes(2);
    expect(dependencies.notifyShipmentCreated).toHaveBeenCalledTimes(1);
    expect(memory.db.update).toHaveBeenCalledTimes(1);
    expect(dependencies.writeAuditLog).toHaveBeenCalledTimes(1);
  });
  it("returns unknown without throwing or resending if sent-state persistence fails", async () => {
    const memory = queuedDb([[], [record()]], {
      updateError: new Error("SQL secret value"),
    });
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await caller().create(createInput);
      expect(result).toMatchObject({
        created: true,
        row: { notificationStatus: "unknown", notificationSentAt: null },
      });
      expect(result.notificationMessage).toMatch(
        /saved.*uncertain.*not be sent again/
      );
      expect(dependencies.notifyShipmentCreated).toHaveBeenCalledTimes(1);
      expect(memory.db.update).toHaveBeenCalledTimes(2);
      expect(memory.set).toHaveBeenLastCalledWith({
        notificationStatus: "unknown",
        notificationSentAt: null,
      });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/SQL|secret/);
    } finally {
      log.mockRestore();
    }
  });
  it("persists unknown best-effort when the initial status update affected no rows", async () => {
    const memory = queuedDb([[], [record()]], { affectedRows: 0 });
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await caller().create(createInput)).row.notificationStatus).toBe(
        "unknown"
      );
      expect(memory.set).toHaveBeenLastCalledWith({
        notificationStatus: "unknown",
        notificationSentAt: null,
      });
      expect(dependencies.notifyShipmentCreated).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
  it("does not notify when the inserted shipment cannot be confirmed by read", async () => {
    queuedDb([[], []]);
    await expect(caller().create(createInput)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(dependencies.notifyShipmentCreated).not.toHaveBeenCalled();
  });
  it("keeps legacy list rows compatible with nullable recorder/email and safe defaults", async () => {
    queuedDb([
      [
        record({
          recordedByName: undefined,
          notificationEmail: null,
          notificationStatus: undefined,
          notificationSentAt: undefined,
        }),
      ],
      [{ total: 1 }],
    ]);
    const result = await caller().list(listInput);
    expect(result.rows[0]).toMatchObject({
      recordedByName: null,
      notificationEmail: null,
      notes: null,
      notificationStatus: "not_requested",
      notificationSentAt: null,
    });
    expectSafeRow(result.rows[0]);
  });
});

describe("Shipment optional Notes", () => {
  it("normalizes and persists multiline Notes and sends the same saved details once", async () => {
    const notes = "Deliver original documents\nCall before arrival";
    const memory = queuedDb([[], [record({ notes })]]);
    const result = await caller().create({
      ...createInput,
      notes: "  Deliver original documents\r\nCall before arrival  ",
    });
    expect(memory.values).toHaveBeenCalledWith({
      ...createInput,
      notes,
      createdByUserId: 900,
      notificationStatus: "sending",
    });
    expect(result.row.notes).toBe(notes);
    expect(dependencies.notifyShipmentCreated).toHaveBeenCalledTimes(1);
    expect(dependencies.notifyShipmentCreated).toHaveBeenCalledWith(
      expect.objectContaining({ notes })
    );
  });
  it.each([undefined, "", "  \n  "])(
    "accepts optional empty Notes %j",
    async notes => {
      queuedDb([[], [record({ notes: null })]]);
      await expect(
        caller().create({ ...createInput, notes })
      ).resolves.toMatchObject({ created: true });
    }
  );
  it.each([
    "x".repeat(2001),
    "bad\u0000note",
    "bad\u001bnote",
    "bad\u0085note",
  ])("rejects invalid Notes before DB access", async notes => {
    await expect(
      caller().create({ ...createInput, notes })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dependencies.getDb).not.toHaveBeenCalled();
  });
  it("keeps null legacy Notes replay compatible with blank input without resending", async () => {
    const memory = queuedDb([[replay({ notes: null })]]);
    await expect(
      caller().create({ ...createInput, notes: " " })
    ).resolves.toMatchObject({ created: false });
    expect(memory.db.insert).not.toHaveBeenCalled();
    expect(dependencies.notifyShipmentCreated).not.toHaveBeenCalled();
  });
  it("returns complete Notes in single-shipment and date-range reports", async () => {
    const notes = "First line\nSecond line";
    queuedDb([[record({ notes })], [record({ notes })]]);
    expect((await caller().report({ shipmentId: 7 })).rows[0].notes).toBe(
      notes
    );
    expect(
      (
        await caller().report({
          filters: { from: "2026-11-01", to: "2026-11-30" },
        })
      ).rows[0].notes
    ).toBe(notes);
    expect(dependencies.writeAuditLog).not.toHaveBeenCalled();
  });
});
