import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  contractDocusignEnvelopes,
  contractDocusignSyncSettings,
} from "../drizzle/schema";

const h = vi.hoisted(() => ({
  db: null as any,
  ready: {
    configured: true,
    environment: "production",
    missingSettings: [],
  } as any,
  config: {
    accountId: "00000000-0000-4000-8000-000000000001",
    environment: "production",
    privateKey: "NEVER_EXPOSE_SYNTHETIC_PEM",
  },
  auth: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  refresh: vi.fn(),
}));
const ui = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  data: null as any,
  fetching: false,
  isError: false,
  query: vi.fn(),
  mutate: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useId: () => "sync-test-id",
  useState: (initial: unknown) => {
    const index = ui.cursor++;
    if (!(index in ui.slots)) ui.slots[index] = initial;
    return [
      ui.slots[index],
      (value: unknown) => {
        ui.slots[index] = value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = ui.cursor++;
    if (!(index in ui.slots)) ui.slots[index] = { current: initial };
    return ui.slots[index];
  },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    contractDocusign: {
      syncStatus: {
        useQuery: (...args: unknown[]) => {
          ui.query(...args);
          return {
            data: ui.data,
            isLoading: false,
            isError: ui.isError,
            isFetching: ui.fetching,
            refetch: ui.refetch,
          };
        },
      },
      configureSync: {
        useMutation: () => ({ mutateAsync: ui.mutate, isPending: false }),
      },
    },
    useUtils: () => ({
      contractDocusign: {
        syncStatus: {
          setData: (_input: unknown, data: unknown) => {
            ui.data = data;
          },
          invalidate: ui.invalidate,
        },
      },
    }),
  },
}));
vi.mock("./db", () => ({ getDb: async () => h.db }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: h.auth } }));
vi.mock("./_core/heartbeat", () => ({
  createHeartbeatJob: h.create,
  updateHeartbeatJob: h.update,
}));
vi.mock("./contractDocusignConfig", async original => ({
  ...(await original<any>()),
  configReadiness: () => h.ready,
  getDocusignConfig: () => h.config,
}));
vi.mock("./contractDocusignService", () => ({
  POLL_INTERVAL_MS: 900_000,
  getContractDocusignService: () => ({ refresh: h.refresh }),
}));
import {
  configureContractDocusignSync,
  getContractDocusignSyncStatus,
  scheduledContractDocusignSyncHandler,
} from "./contractDocusignSync";
import { DocusignError } from "./contractDocusignConfig";
import ContractDocusignSyncControls from "../client/src/components/ContractDocusignSyncControls";

const dialect = new MySqlDialect();
const compiled = (where: any) => dialect.sqlToQuery(where);
const NOW = new Date("2026-11-12T12:00:00Z");
const UID = "task_synthetic_own";
const syntheticError = () =>
  new Error(
    "PRIVATE_CANARY raw provider body https://private.example/token?s=secret"
  );
function setting(patch: any = {}) {
  return {
    id: 1,
    enabled: false,
    scheduleCronTaskUid: null,
    leaseToken: null,
    leaseExpiresAt: null,
    lastRunAt: null,
    lastErrorCode: null,
    ...patch,
  };
}
function candidate(patch: any = {}, source: any = {}) {
  const row = {
    id: "00000000-0000-4000-8000-000000000010",
    contractId: 10,
    status: "sent",
    environment: "production",
    accountId: h.config.accountId,
    providerEnvelopeId: "00000000-0000-4000-8000-000000000020",
    createdAt: new Date(NOW.getTime() - 3_600_000),
    lastCheckedAt: null,
    lastCheckAttemptAt: null,
    documentSourceSnapshot: {
      contractCode: "2611001",
      completionProfile: "verified-production-v1",
    },
    ...patch,
  };
  return {
    envelope: row,
    sourceStatus: "pending",
    sourceCode: "2611001",
    ...source,
  };
}
class MemoryDb {
  row: any = null;
  rows: any[] = [];
  queries: { sql: string; params: unknown[] }[] = [];
  inTransaction = false;
  failSelect = false;
  failUpdate = false;
  private tail = Promise.resolve();
  private matches(where: any) {
    if (!this.row) return false;
    const q = compiled(where);
    this.queries.push(q);
    // Evaluate literal settings predicates, including all UID/token fencing clauses.
    const pieces = q.sql.split("?");
    for (let i = 0; i < q.params.length; i++) {
      const match = pieces[i].match(
        /`(id|scheduleCronTaskUid|leaseToken|enabled|leaseExpiresAt)`\s*(=|>)\s*$/
      );
      if (!match) continue;
      const [_, field, operator] = match;
      const expected = q.params[i];
      const actual = this.row[field];
      if (
        operator === "=" &&
        (field === "enabled"
          ? Number(actual) !== Number(expected)
          : actual !== expected)
      )
        return false;
      if (operator === ">" && !(actual > Number(expected))) return false;
    }
    return true;
  }
  select(_fields?: any) {
    const db = this;
    let table: any,
      where: any,
      take = 100;
    const result = () => {
      if (db.failSelect) throw syntheticError();
      if (table === contractDocusignSyncSettings)
        return where && db.matches(where) ? [{ ...db.row }] : [];
      if (where) db.queries.push(compiled(where));
      // Intentionally broad mocked join. Runtime eligibility must defend against bad rows.
      return db.rows.slice(0, take);
    };
    const q: any = {
      from(value: any) {
        table = value;
        return q;
      },
      where(value: any) {
        where = value;
        return q;
      },
      innerJoin() {
        return q;
      },
      orderBy() {
        return q;
      },
      limit(value: number) {
        take = value;
        return q;
      },
      for(value: string) {
        expect(value).toBe("update");
        expect(db.inTransaction).toBe(true);
        return Promise.resolve(result());
      },
      then(resolve: any, reject: any) {
        return Promise.resolve().then(result).then(resolve, reject);
      },
    };
    return q;
  }
  insert(table: any) {
    expect(table).toBe(contractDocusignSyncSettings);
    return {
      values: (value: any) => ({
        onDuplicateKeyUpdate: async () => {
          this.row ??= setting(value);
        },
      }),
    };
  }
  update(table: any) {
    expect(table).toBe(contractDocusignSyncSettings);
    return {
      set: (patch: any) => ({
        where: async (where: any) => {
          if (this.failUpdate) throw syntheticError();
          if (this.matches(where)) this.row = { ...this.row, ...patch };
        },
      }),
    };
  }
  async transaction(fn: any) {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    this.inTransaction = true;
    try {
      return await fn(this);
    } finally {
      this.inTransaction = false;
      release();
    }
  }
}
function response() {
  const res: any = { code: 200, body: undefined, setHeader: vi.fn() };
  res.status = vi.fn((code: number) => {
    res.code = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}
async function callback(
  body: any = { taskUid: "FOREIGN_BODY_UID", contractId: 99 }
) {
  const res = response();
  await scheduledContractDocusignSyncHandler({ headers: {}, body } as any, res);
  return res;
}
let db: MemoryDb;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  db = new MemoryDb();
  h.db = db;
  h.ready = {
    configured: true,
    environment: "production",
    missingSettings: [],
  };
  h.config.environment = "production";
  h.auth.mockResolvedValue({ isCron: true, taskUid: UID });
  h.create.mockImplementation(async () => {
    expect(db.inTransaction).toBe(false);
    return { taskUid: UID };
  });
  h.update.mockImplementation(async () => {
    expect(db.inTransaction).toBe(false);
    return {};
  });
  h.refresh.mockImplementation(async () => {
    expect(db.inTransaction).toBe(false);
    return { errorCode: null };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("opt-in production scheduler lifecycle", () => {
  it("status is disabled by default, read-only and contains no UID or configuration", async () => {
    expect(await getContractDocusignSyncStatus()).toEqual({
      enabled: false,
      environment: "production",
      canEnable: true,
      scheduleExists: false,
      busy: false,
      reconciliationRequired: false,
      lastRunAt: null,
      lastErrorCode: null,
    });
    expect(db.row).toBeNull();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.refresh).not.toHaveBeenCalled();
  });
  it("creates exactly the required job and persists its fresh response UID", async () => {
    const status = await configureContractDocusignSync(
      true,
      "decoded-owner-session"
    );
    expect(h.create).toHaveBeenCalledWith(
      {
        name: "elevay-docusign-contract-status",
        cron: "0 */15 * * * *",
        path: "/api/scheduled/contract-docusign-sync",
      },
      "decoded-owner-session"
    );
    expect(db.row).toMatchObject({
      enabled: true,
      scheduleCronTaskUid: UID,
      leaseToken: null,
      leaseExpiresAt: null,
      lastErrorCode: null,
    });
    expect(status.enabled).toBe(true);
    expect(JSON.stringify(status)).not.toContain(UID);
    expect(h.update).not.toHaveBeenCalled();
  });
  it("resumes and pauses the persisted UID without re-creation", async () => {
    db.row = setting({ scheduleCronTaskUid: UID });
    await configureContractDocusignSync(true, "owner");
    expect(h.update).toHaveBeenLastCalledWith(
      UID,
      {
        enable: true,
        cron: "0 */15 * * * *",
        path: "/api/scheduled/contract-docusign-sync",
      },
      "owner"
    );
    await configureContractDocusignSync(false, "owner");
    expect(h.update).toHaveBeenLastCalledWith(UID, { enable: false }, "owner");
    expect(db.row.enabled).toBe(false);
    expect(h.create).not.toHaveBeenCalled();
  });
  it("rejects demo enable and returns disabled status with no SDK calls", async () => {
    h.ready.environment = "demo";
    db.row = setting({ enabled: true, scheduleCronTaskUid: UID });
    await expect(
      configureContractDocusignSync(true, "owner")
    ).rejects.toMatchObject({ safeCode: "PRODUCTION_REQUIRED" });
    expect((await getContractDocusignSyncStatus()).enabled).toBe(false);
    await configureContractDocusignSync(false, "owner");
    expect(db.row.enabled).toBe(false);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
  it("blocks missing production configuration and empty owner token", async () => {
    h.ready.configured = false;
    await expect(
      configureContractDocusignSync(true, "owner")
    ).rejects.toMatchObject({ safeCode: "SETTINGS_REQUIRED" });
    await expect(
      configureContractDocusignSync(false, "")
    ).rejects.toMatchObject({ safeCode: "OWNER_SESSION_REQUIRED" });
    expect(h.create).not.toHaveBeenCalled();
  });
  it("concurrent enable calls reserve only one external create", async () => {
    let finish!: (value: any) => void;
    h.create.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const first = configureContractDocusignSync(true, "owner");
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    await expect(
      configureContractDocusignSync(true, "owner")
    ).rejects.toMatchObject({ safeCode: "SYNC_BUSY" });
    finish({ taskUid: UID });
    await first;
    expect(h.create).toHaveBeenCalledTimes(1);
  });
  it("lost create response blocks blind retries even after local pause", async () => {
    h.create.mockRejectedValue(syntheticError());
    await expect(
      configureContractDocusignSync(true, "owner")
    ).rejects.toMatchObject({ safeCode: "SCHEDULE_CREATE_UNCERTAIN" });
    expect(db.row).toMatchObject({
      enabled: false,
      leaseToken: null,
      lastErrorCode: "SCHEDULE_CREATE_UNCERTAIN",
    });
    expect((await getContractDocusignSyncStatus()).reconciliationRequired).toBe(
      true
    );
    await configureContractDocusignSync(false, "owner");
    await expect(
      configureContractDocusignSync(true, "owner")
    ).rejects.toMatchObject({ safeCode: "SCHEDULE_RECONCILIATION_REQUIRED" });
    expect(h.create).toHaveBeenCalledTimes(1);
  });
  it("crashed pending creation remains uncertain after lease expiry", async () => {
    db.row = setting({
      lastErrorCode: "SCHEDULE_CREATE_PENDING",
      leaseToken: "old",
      leaseExpiresAt: NOW.getTime() - 1,
    });
    await expect(
      configureContractDocusignSync(true, "owner")
    ).rejects.toMatchObject({ safeCode: "SCHEDULE_RECONCILIATION_REQUIRED" });
    expect(h.create).not.toHaveBeenCalled();
  });
  it("does not accept malformed scheduler UID responses", async () => {
    h.create.mockResolvedValue({ taskUid: "private/invalid?token" });
    await expect(
      configureContractDocusignSync(true, "owner")
    ).rejects.toMatchObject({ safeCode: "SCHEDULE_CREATE_UNCERTAIN" });
    expect(db.row.scheduleCronTaskUid).toBeNull();
  });
  it("failed remote pause remains locally disabled and sanitized", async () => {
    db.row = setting({ enabled: true, scheduleCronTaskUid: UID });
    h.update.mockRejectedValue(syntheticError());
    await expect(
      configureContractDocusignSync(false, "owner")
    ).rejects.toMatchObject({ safeCode: "SCHEDULE_UPDATE_FAILED" });
    expect(db.row).toMatchObject({
      enabled: false,
      leaseToken: null,
      lastErrorCode: "SCHEDULE_UPDATE_FAILED",
    });
  });
  it("sanitizes arbitrary persisted and thrown errors", async () => {
    db.row = setting({ lastErrorCode: "PRIVATE_CANARY" });
    expect((await getContractDocusignSyncStatus()).lastErrorCode).toBe(
      "SYNC_OPERATION_FAILED"
    );
    db.failSelect = true;
    await expect(getContractDocusignSyncStatus()).rejects.toMatchObject({
      safeCode: "SYNC_OPERATION_FAILED",
      message: "SYNC_OPERATION_FAILED",
    });
  });
  it("configuration completion is fenced against a replacement lease", async () => {
    h.create.mockImplementation(async () => {
      db.row.leaseToken = "replacement";
      return { taskUid: UID };
    });
    await expect(
      configureContractDocusignSync(true, "owner")
    ).rejects.toMatchObject({ safeCode: "SCHEDULE_CREATE_UNCERTAIN" });
    expect(db.row.leaseToken).toBe("replacement");
    expect(db.row.scheduleCronTaskUid).toBeNull();
  });
});

describe("authenticated bounded production polling", () => {
  beforeEach(() => {
    db.row = setting({ enabled: true, scheduleCronTaskUid: UID });
    db.rows = [candidate()];
  });
  it("rejects regular users, missing UIDs, and authentication failures without work", async () => {
    for (const auth of [
      { isCron: false, taskUid: UID },
      { isCron: true },
      { isCron: true, taskUid: "bad/uid" },
    ]) {
      h.auth.mockResolvedValue(auth);
      expect((await callback()).code).toBe(403);
    }
    h.auth.mockRejectedValue(syntheticError());
    expect((await callback()).body).toEqual({
      ok: false,
      safeCode: "CRON_ONLY",
    });
    expect(h.refresh).not.toHaveBeenCalled();
  });
  it("looks up exact authenticated UID, never body UID or singleton fallback", async () => {
    h.auth.mockResolvedValue({ isCron: true, taskUid: "task_foreign" });
    const res = await callback({ taskUid: UID });
    expect(res.body).toEqual({ ok: true, safeCode: "ORPHAN" });
    expect(db.row.scheduleCronTaskUid).toBe(UID);
    expect(h.refresh).not.toHaveBeenCalled();
    expect(db.queries[0].sql).toContain("`scheduleCronTaskUid` = ?");
    expect(db.queries[0].params).toEqual(["task_foreign"]);
  });
  it("ignores hostile body getters entirely", async () => {
    const req: any = { headers: {} };
    Object.defineProperty(req, "body", {
      get() {
        throw syntheticError();
      },
    });
    const res = response();
    await scheduledContractDocusignSyncHandler(req, res);
    expect(res.body).toEqual({ ok: true, selected: 1, checked: 1, failed: 0 });
  });
  it("does not bootstrap or adopt an orphan UID", async () => {
    db.row = null;
    expect((await callback()).body.safeCode).toBe("ORPHAN");
    expect(db.row).toBeNull();
  });
  it("skips disabled and demo jobs with zero provider calls", async () => {
    db.row.enabled = false;
    expect((await callback()).body.safeCode).toBe("DISABLED");
    db.row.enabled = true;
    h.ready.environment = "demo";
    expect((await callback()).body.safeCode).toBe("NOT_PRODUCTION");
    expect(h.refresh).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
  it("requires valid production readiness and config binding", async () => {
    h.ready.configured = false;
    expect((await callback()).body.safeCode).toBe("SETTINGS_REQUIRED");
    h.ready.configured = true;
    h.config.environment = "demo";
    expect((await callback()).body.safeCode).toBe("SETTINGS_REQUIRED");
    expect(h.refresh).not.toHaveBeenCalled();
  });
  it("refreshes eligible rows outside locks and records fenced run metadata", async () => {
    const res = await callback();
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ ok: true, selected: 1, checked: 1, failed: 0 });
    expect(h.refresh).toHaveBeenCalledWith(db.rows[0].envelope.id);
    expect(db.row).toMatchObject({
      enabled: true,
      leaseToken: null,
      leaseExpiresAt: null,
      lastRunAt: NOW.getTime(),
      lastErrorCode: null,
    });
    const text = db.queries.map(q => q.sql).join("\n");
    expect(text).toContain("JSON_EXTRACT");
    expect(text).toContain("completionProfile");
    expect(text).toContain("syncCompletedAt");
    expect(text).toContain("lastCheckAttemptAt");
    expect(text).toContain("lastCheckedAt");
    expect(text).toContain("DS-DEMO%");
  });
  it("concurrent callbacks perform the batch once using a durable lease", async () => {
    let finish!: (value: any) => void;
    h.refresh.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const first = callback();
    await vi.waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
    expect((await callback()).body.safeCode).toBe("BUSY");
    finish({ errorCode: null });
    await first;
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(db.row.leaseToken).toBeNull();
  });
  it("reclaims an expired durable run lease", async () => {
    db.row.leaseToken = "expired";
    db.row.leaseExpiresAt = NOW.getTime() - 1;
    expect((await callback()).body.checked).toBe(1);
  });
  it.each([
    ["demo envelope", { environment: "demo" }, {}],
    ["wrong account", { accountId: "foreign" }, {}],
    [
      "legacy profile",
      { documentSourceSnapshot: { contractCode: "2611001" } },
      {},
    ],
    [
      "already synced",
      {
        documentSourceSnapshot: {
          contractCode: "2611001",
          completionProfile: "verified-production-v1",
          syncCompletedAt: 1,
        },
      },
      {},
    ],
    ["declined", { status: "declined" }, {}],
    ["voided", { status: "voided" }, {}],
    ["missing provider ID", { providerEnvelopeId: null }, {}],
    ["bad provider ID", { providerEnvelopeId: "DS-DEMO" }, {}],
    [
      "demo snapshot",
      {
        documentSourceSnapshot: {
          contractCode: "ds-demo-1",
          completionProfile: "verified-production-v1",
        },
      },
      {},
    ],
    ["demo contract", {}, { sourceCode: "DS-DEMO-1" }],
    ["nonpending source", {}, { sourceStatus: "signed" }],
    [
      "recent attempt",
      { lastCheckAttemptAt: new Date(NOW.getTime() - 899_999) },
      {},
    ],
    ["recent check", { lastCheckedAt: new Date(NOW.getTime() - 899_999) }, {}],
  ])(
    "excludes %s even if a broad/stale query returns it",
    async (_name, patch, source) => {
      db.rows = [candidate(patch, source)];
      expect((await callback()).body.selected).toBe(0);
      expect(h.refresh).not.toHaveBeenCalled();
    }
  );
  it("retries terminal completed rows without sync completion even after source changed", async () => {
    db.rows = [
      candidate(
        {
          status: "completed",
          lastCheckAttemptAt: new Date(NOW.getTime() - 900_000),
        },
        { sourceStatus: "signed" }
      ),
    ];
    expect((await callback()).body.checked).toBe(1);
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
  it("limits each batch to six", async () => {
    db.rows = Array.from({ length: 10 }, (_value, i) =>
      candidate({ id: `row-${i}` })
    );
    expect((await callback()).body.checked).toBe(6);
    expect(h.refresh).toHaveBeenCalledTimes(6);
  });
  it("counts service failures using fixed codes, never raw provider errors", async () => {
    db.rows = [candidate(), candidate({ id: "row-2" })];
    h.refresh
      .mockRejectedValueOnce(syntheticError())
      .mockResolvedValueOnce({ errorCode: "PRIVATE_CANARY" });
    const res = await callback();
    expect(res.body).toEqual({
      ok: true,
      safeCode: "SYNC_CHECK_FAILED",
      selected: 2,
      checked: 1,
      failed: 2,
    });
    expect(db.row.lastErrorCode).toBe("SYNC_CHECK_FAILED");
    expect(JSON.stringify(res.body)).not.toContain("PRIVATE_CANARY");
  });
  it("stops before another row if the global lease was replaced and cannot clean the new lease", async () => {
    db.rows = [candidate(), candidate({ id: "row-2" })];
    h.refresh.mockImplementation(async () => {
      db.row.leaseToken = "new-owner";
      return { errorCode: null };
    });
    const res = await callback();
    expect(res.body.safeCode).toBe("SYNC_LEASE_LOST");
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(db.row.leaseToken).toBe("new-owner");
    expect(db.row.lastRunAt).toBeNull();
  });
  it("enforces an 80-second response budget and never starts another refresh after timeout", async () => {
    db.rows = [candidate(), candidate({ id: "row-2" })];
    let finish!: (value: any) => void;
    h.refresh.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const run = callback();
    await vi.waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(80_000);
    const res = await run;
    expect(res.code).toBe(500);
    expect(res.body.safeCode).toBe("SYNC_DEADLINE_EXCEEDED");
    expect(db.row.leaseToken).toBeNull();
    expect(db.row.lastRunAt).not.toBeNull();
    finish({ errorCode: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(res.body.checked).toBe(0);
  });
  it("sanitizes DB failures and writes no raw error logs", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.failSelect = true;
    const res = await callback();
    expect(res.code).toBe(500);
    expect(res.body).toEqual({
      ok: false,
      safeCode: "SYNC_OPERATION_FAILED",
      selected: 0,
      checked: 0,
      failed: 0,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain("PRIVATE");
  });
});

describe("owner controls safety contract", () => {
  it("is explicit, owner-only, demo-disabled and never exposes environment credentials or raw error messages", () => {
    const source = readFileSync(
      new URL(
        "../client/src/components/ContractDocusignSyncControls.tsx",
        import.meta.url
      ),
      "utf8"
    );
    expect(source).toContain("Enable automatic Signed-status sync");
    expect(source).toContain("if (!canConfigure) return null");
    expect(source).toContain("enabled: canConfigure");
    expect(source).toContain("!data.canEnable");
    expect(source).toContain("configure.mutateAsync({ enabled })");
    expect(source).not.toMatch(
      /process\.env|import\.meta\.env|error\.message|setInterval|useEffect/
    );
  });
});

function uiTree(owner = true): any {
  ui.cursor = 0;
  return ContractDocusignSyncControls({ canConfigure: owner });
}
function uiNodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(uiNodes);
  if (!tree || typeof tree !== "object" || !tree.props) return [];
  return [tree, ...uiNodes(tree.props.children)];
}
function uiText(tree: any): string {
  if (Array.isArray(tree)) return tree.map(uiText).join(" ");
  if (typeof tree === "string") return tree;
  return tree?.props ? uiText(tree.props.children) : "";
}
function uiSwitch(tree: any) {
  return uiNodes(tree).find(
    node => typeof node.props.onCheckedChange === "function"
  );
}
describe("rendered owner-only automatic sync controls", () => {
  beforeEach(() => {
    ui.slots = [];
    ui.cursor = 0;
    ui.fetching = false;
    ui.isError = false;
    ui.data = {
      enabled: false,
      canEnable: true,
      environment: "production",
      busy: false,
      reconciliationRequired: false,
      lastRunAt: null,
      lastErrorCode: null,
    };
    ui.mutate.mockImplementation(async ({ enabled }: { enabled: boolean }) => ({
      ...ui.data,
      enabled,
    }));
  });
  it("renders nothing and disables status query for non-owners", () => {
    expect(uiTree(false)).toBeNull();
    expect(ui.query).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: false })
    );
    expect(ui.mutate).not.toHaveBeenCalled();
  });
  it("demo renders a disabled switch and cannot enable even via its callback", async () => {
    ui.data.environment = "demo";
    ui.data.canEnable = false;
    const tree = uiTree();
    const control = uiSwitch(tree);
    expect(control.props.disabled).toBe(true);
    expect(control.props.checked).toBe(false);
    expect(uiText(tree)).toContain("automatic Signed-status sync is disabled");
    await control.props.onCheckedChange(true);
    expect(ui.mutate).not.toHaveBeenCalled();
  });
  it("production remains off until the owner's explicit toggle", async () => {
    const control = uiSwitch(uiTree());
    expect(control.props.checked).toBe(false);
    expect(control.props.disabled).toBe(false);
    expect(ui.mutate).not.toHaveBeenCalled();
    control.props.onCheckedChange(true);
    await vi.waitFor(() => expect(ui.data.enabled).toBe(true));
    expect(ui.mutate).toHaveBeenCalledWith({ enabled: true });
    expect(uiText(uiTree())).toContain("Automatic Signed-status sync enabled");
  });
  it("disables enabling during errors, work and unresolved creation", () => {
    ui.isError = true;
    expect(uiSwitch(uiTree()).props.disabled).toBe(true);
    ui.isError = false;
    ui.data.busy = true;
    expect(uiSwitch(uiTree()).props.disabled).toBe(true);
    ui.data.busy = false;
    ui.data.reconciliationRequired = true;
    expect(uiSwitch(uiTree()).props.disabled).toBe(true);
    expect(uiText(uiTree())).toContain("Schedule creation is unresolved");
  });
  it("sanitizes mutation errors instead of showing scheduler/provider details", async () => {
    ui.mutate.mockRejectedValue(syntheticError());
    uiSwitch(uiTree()).props.onCheckedChange(true);
    await vi.waitFor(() => expect(ui.invalidate).toHaveBeenCalled());
    const text = uiText(uiTree());
    expect(text).toContain("Could not change automatic sync");
    expect(text).not.toContain("PRIVATE_CANARY");
  });
});
