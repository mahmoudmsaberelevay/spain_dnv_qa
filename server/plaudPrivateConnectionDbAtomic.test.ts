import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { PlaudConnectionDb } from "./plaudConnectionDb";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
const HASH = "a".repeat(64),
  SESSION = "b".repeat(64);
const state = {
  stateHash: HASH,
  userId: 7,
  sessionHash: SESSION,
  sealedState: "v1.encrypted-pkce-client",
  expiresAt: 20_000,
  consumedAt: null,
  createdAt: 1000,
};
const row = {
  userId: 7,
  sealedCredentials: "v1.encrypted-old-credentials",
  version: 8,
  leaseToken: null,
  leaseUntil: null,
  createdAt: 1000,
  updatedAt: 1000,
};
type QueryRecord = {
  kind: string;
  table?: unknown;
  values?: Record<string, unknown>;
  set?: Record<string, unknown>;
  predicate?: SQL;
  lock?: string;
};
function fakeDb() {
  const statements: QueryRecord[] = [];
  const selects: unknown[][] = [];
  const effects: number[] = [];
  let activeTransaction = false;
  const db = {
    async transaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
      expect(activeTransaction).toBe(false);
      activeTransaction = true;
      try {
        return await work(db);
      } finally {
        activeTransaction = false;
      }
    },
    select() {
      const record: QueryRecord = { kind: "select" };
      statements.push(record);
      const results = selects.shift() ?? [];
      const query = {
        from(table: unknown) {
          record.table = table;
          return query;
        },
        where(predicate: SQL) {
          record.predicate = predicate;
          return query;
        },
        limit() {
          return Promise.resolve(results);
        },
        for(lock: string) {
          expect(activeTransaction).toBe(true);
          record.lock = lock;
          return Promise.resolve(results);
        },
      };
      return query;
    },
    insert(table: unknown) {
      const record: QueryRecord = { kind: "insert", table };
      statements.push(record);
      const query = {
        values(values: Record<string, unknown>) {
          record.values = values;
          return query;
        },
        async onDuplicateKeyUpdate({ set }: { set: Record<string, unknown> }) {
          record.set = set;
          return [{ affectedRows: 1 }];
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve([{ affectedRows: 1 }]).then(resolve);
        },
      };
      return query;
    },
    update(table: unknown) {
      const record: QueryRecord = { kind: "update", table };
      statements.push(record);
      return {
        set(set: Record<string, unknown>) {
          record.set = set;
          return {
            async where(predicate: SQL) {
              record.predicate = predicate;
              return [{ affectedRows: effects.shift() ?? 1 }];
            },
          };
        },
      };
    },
    delete(table: unknown) {
      const record: QueryRecord = { kind: "delete", table };
      statements.push(record);
      return {
        async where(predicate: SQL) {
          record.predicate = predicate;
          return [{ affectedRows: 1 }];
        },
      };
    },
  };
  mocks.getDb.mockResolvedValue(db);
  return { db, statements, selects, effects };
}
function sqlFor(record: QueryRecord) {
  expect(record.predicate).toBeDefined();
  return new MySqlDialect().sqlToQuery(record.predicate!);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("NO_NETWORK_ALLOWED");
    })
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("Plaud private connection atomic DB adapter (no database execution)", () => {
  it("atomically consumes only a live one-time state bound to hash, CRM user and signed session", async () => {
    const f = fakeDb();
    f.selects.push([state]);
    expect(
      await new PlaudConnectionDb().consumeState(7, SESSION, HASH, 10_000)
    ).toEqual(state);
    expect(f.statements).toHaveLength(2);
    expect(f.statements[0].lock).toBe("update");
    const select = sqlFor(f.statements[0]),
      update = sqlFor(f.statements[1]);
    expect(select.sql).toMatch(
      /`stateHash`.*=.*`userId`.*=.*`sessionHash`.*=.*`consumedAt` is null.*`expiresAt` >/
    );
    expect(select.params).toEqual([HASH, 7, SESSION, 10_000]);
    expect(update).toEqual(select);
    expect(f.statements[1].set).toEqual({
      consumedAt: 10_000,
      sealedState: "consumed",
    });
  });
  it("does not mutate or exchange anything when atomic state lookup misses", async () => {
    const f = fakeDb();
    f.selects.push([]);
    expect(
      await new PlaudConnectionDb().consumeState(8, SESSION, HASH, 10_000)
    ).toBeUndefined();
    expect(f.statements).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("atomically clears connected credentials with the locked authorization fence and lease", async () => {
    const f = fakeDb();
    f.selects.push([row]);
    expect(
      await new PlaudConnectionDb().beginAuthorization(
        7,
        "v1.empty-tombstone",
        2000
      )
    ).toBe(9);
    expect(f.statements.map(statement => statement.kind)).toEqual([
      "insert",
      "select",
      "update",
      "delete",
    ]);
    expect(f.statements[1].lock).toBe("update");
    expect(f.statements[2].set).toEqual({
      sealedCredentials: "v1.empty-tombstone",
      version: 9,
      leaseToken: null,
      leaseUntil: null,
      updatedAt: 2000,
    });
    expect(sqlFor(f.statements[2]).params).toEqual([7]);
    expect(sqlFor(f.statements[3]).params).toEqual([7]);
  });
  it("does not save a pending verifier after another authorization/disconnect wins the version fence", async () => {
    const f = fakeDb();
    f.selects.push([row]);
    expect(await new PlaudConnectionDb().saveState(state, 7)).toBe(false);
    expect(f.statements.map(statement => statement.kind)).toEqual(["select"]);
    expect(f.statements[0].lock).toBe("update");
  });
  it("keeps disconnect as a monotonic tombstone and clears pending authorization secrets", async () => {
    const f = fakeDb();
    await new PlaudConnectionDb().disconnect(7, "v1.sealed-disconnected", 3000);
    expect(f.statements.map(statement => statement.kind)).toEqual([
      "insert",
      "delete",
    ]);
    const update = f.statements[0].set!;
    expect(update).toMatchObject({
      sealedCredentials: "v1.sealed-disconnected",
      leaseToken: null,
      leaseUntil: null,
      updatedAt: 3000,
    });
    expect(new MySqlDialect().sqlToQuery(update.version as SQL).sql).toMatch(
      /`version` \+ 1/
    );
    expect(sqlFor(f.statements[1]).params).toEqual([7]);
  });
  it("CAS-replaces only the same user's expected callback generation", async () => {
    const f = fakeDb();
    f.effects.push(0, 1);
    const store = new PlaudConnectionDb();
    expect(await store.replace(7, 8, "v1.sealed-new-token", 4000)).toBe(false);
    expect(await store.replace(7, 8, "v1.sealed-new-token", 4000)).toBe(true);
    for (const statement of f.statements) {
      expect(statement.set).toMatchObject({
        version: 9,
        leaseToken: null,
        leaseUntil: null,
        sealedCredentials: "v1.sealed-new-token",
      });
      expect(sqlFor(statement).params).toEqual([7, 8]);
    }
  });
  it("acquires refresh only for the same connection version with no live lease", async () => {
    const f = fakeDb();
    f.effects.push(0);
    expect(
      await new PlaudConnectionDb().acquireLease(
        7,
        8,
        "lease-fence",
        4000,
        49_000
      )
    ).toBe(false);
    const query = sqlFor(f.statements[0]);
    expect(query.params).toEqual([7, 8, 4000]);
    expect(query.sql).toMatch(
      /`userId`.*=.*`version`.*=.*`leaseUntil` is null.*`leaseUntil` <=/
    );
    expect(f.statements[0].set).toEqual({
      leaseToken: "lease-fence",
      leaseUntil: 49_000,
    });
  });
  it("requires user, generation, lease-token and unexpired lease to save rotated tokens", async () => {
    const f = fakeDb();
    f.effects.push(0);
    expect(
      await new PlaudConnectionDb().saveLease(
        7,
        8,
        "lease-fence",
        "v1.sealed-rotated-token",
        5000
      )
    ).toBe(false);
    const query = sqlFor(f.statements[0]);
    expect(query.params).toEqual([7, 8, "lease-fence", 5000]);
    expect(query.sql).toMatch(
      /`userId`.*=.*`version`.*=.*`leaseToken`.*=.*`leaseUntil` >/
    );
    expect(f.statements[0].set).toMatchObject({
      version: 9,
      leaseToken: null,
      leaseUntil: null,
      sealedCredentials: "v1.sealed-rotated-token",
    });
  });
  it("never releases a successor refresh worker's lease", async () => {
    const f = fakeDb();
    await new PlaudConnectionDb().releaseLease(7, 8, "old-lease-fence");
    expect(sqlFor(f.statements[0]).params).toEqual([7, 8, "old-lease-fence"]);
    expect(f.statements[0].set).toEqual({ leaseToken: null, leaseUntil: null });
  });
  it("sanitizes adapter exceptions and unavailable database without dumping SQL/credentials", async () => {
    mocks.getDb.mockRejectedValueOnce(
      new Error(
        "mysql://private-user:private-password@private-host/private-db token=private"
      )
    );
    await expect(new PlaudConnectionDb().read(7)).rejects.toThrow(
      /^PLAUD_STORAGE_UNAVAILABLE$/
    );
    mocks.getDb.mockResolvedValueOnce(null);
    await expect(new PlaudConnectionDb().read(7)).rejects.toThrow(
      /^PLAUD_STORAGE_UNAVAILABLE$/
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
