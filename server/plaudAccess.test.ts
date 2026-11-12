import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { COOKIE_NAME } from "../shared/const";
import { users, leads, leadsPermissions } from "../drizzle/schema";
import type { CallActor } from "./leadCallsAccess";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
import { requirePlaudActor, requirePlaudLead, requirePlaudImportLead, requirePlaudSameOrigin, plaudSessionHash } from "./plaudAccess";
import { verifyCallSession } from "./leadCallsAccess";

const secret = "synthetic-plaud-tests-signing-key-not-a-user-credential";
const appId = "synthetic-plaud-app";
const actor: CallActor = { id: 7, name: "Synthetic Employee", email: "synthetic@example.invalid", openId: "oauth-synthetic-7", role: "user" };
const dialect = new MySqlDialect();

/** Small thenable Drizzle reader: evaluates the real equality expressions and
 * table identity rather than returning a queued answer regardless of the query. */
function dbFixture(options: { actors?: CallActor[]; permissions?: any[]; assignedId?: number | null; namedUsers?: any[] } = {}) {
  const actors = options.actors ?? [actor];
  const permissions = options.permissions ?? [];
  const tables = new Map<any, any[]>([
    [users, options.namedUsers ?? actors],
    [leads, [{ id: 42, fullName: "Restricted synthetic lead", assignedConsultantUserId: options.assignedId === undefined ? 7 : options.assignedId, assignedTo: actor.name }]],
    [leadsPermissions, permissions],
  ]);
  const reads: any[] = [];
  const db = { select: vi.fn((projection?: Record<string, any>) => {
    let table: any, predicate: any, limit = Infinity;
    const read = () => {
      reads.push(table);
      let rows = [...(tables.get(table) ?? [])];
      if (predicate) {
        const query = dialect.sqlToQuery(predicate);
        const columns = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)`\s*=\s*\?/g)].map(match => match[1]);
        rows = rows.filter(row => columns.every((column, index) => row[column] === query.params[index]));
      }
      return rows.slice(0, limit).map(row => projection ? Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column.name]])) : { ...row });
    };
    const chain: any = {
      from(value: any) { table = value; return chain; },
      where(value: any) { predicate = value; return chain; },
      limit(value: number) { limit = value; return chain; },
      then(resolve: any, reject: any) { return Promise.resolve().then(read).then(resolve, reject); },
    };
    return chain;
  }) };
  mocks.getDb.mockResolvedValue(db);
  return { db, reads, tables };
}
async function jwt(payload: Record<string, unknown> = { openId: actor.openId, appId }, signingKey = secret, expiration: string | number | null = "5m") {
  let token = new SignJWT(payload).setProtectedHeader({ alg: "HS256" });
  if (expiration !== null) token = token.setExpirationTime(expiration);
  return token.sign(new TextEncoder().encode(signingKey));
}
const request = (token?: string, extra: any = {}) => ({ headers: token ? { cookie: `${COOKIE_NAME}=${token}` } : {}, ...extra }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JWT_SECRET", secret);
  vi.stubEnv("VITE_APP_ID", appId);
});
afterEach(() => vi.unstubAllEnvs());

describe("PLAUD shared catalogue actor policy", () => {
  it.each(["user", "admin"] as const)("accepts a signed existing %s without any module or Lead permission", async role => {
    const current = { ...actor, role };
    const fixture = dbFixture({ actors: [current] });
    expect(await requirePlaudActor(request(await jwt()))).toEqual(current);
    expect(fixture.reads).toEqual([users]);
  });
  it("supports password-login numeric identities and parsed cookies, without a role grant", async () => {
    dbFixture();
    expect(await requirePlaudActor(request(undefined, { cookies: { [COOKIE_NAME]: await jwt({ openId: "7", appId }) } }))).toEqual(actor);
  });
  it("uses current database identity, not a forged decoded request user", async () => {
    const current = { ...actor, name: "Current employee", role: "user" as const };
    dbFixture({ actors: [current] });
    expect(await requirePlaudActor(request(await jwt(), { user: { id: 999, role: "admin" } }))).toEqual(current);
    await expect(requirePlaudActor(request(undefined, { user: current }))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it.each(["absent", "forged", "expired", "wrong-app", "cron", "no-expiry", "arbitrary-userId", "malformed"])("rejects %s sessions before the database lookup", async kind => {
    dbFixture();
    const token = kind === "absent" ? undefined : kind === "forged" ? await jwt(undefined, "synthetic-wrong-key")
      : kind === "expired" ? await jwt(undefined, secret, Math.floor(Date.now() / 1000) - 60)
      : kind === "wrong-app" ? await jwt({ openId: actor.openId, appId: "another-app" })
      : kind === "cron" ? await jwt({ openId: "cron_synthetic", appId })
      : kind === "no-expiry" ? await jwt(undefined, secret, null)
      : kind === "arbitrary-userId" ? await jwt({ userId: actor.id, appId }) : "not.a.jwt";
    await expect(requirePlaudActor(request(token))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("rejects deleted actors and an unavailable database even with valid signed sessions", async () => {
    dbFixture({ actors: [] });
    await expect(requirePlaudActor(request(await jwt()))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    mocks.getDb.mockResolvedValue(null);
    await expect(requirePlaudActor(request(await jwt()))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("exercises the shared verifier with a synthetic lookup and rejects invalid actor ids", async () => {
    const lookup = vi.fn(async () => actor);
    expect(await verifyCallSession(request(await jwt()), lookup, secret, appId)).toEqual(actor);
    expect(lookup).toHaveBeenCalledWith(actor.openId);
    for (const id of [0, -1, NaN, 1.5]) {
      await expect(verifyCallSession(request(await jwt()), async () => ({ ...actor, id }), secret, appId)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });
});

describe("shared catalogue policy does not bypass Lead permissions", () => {
  it("allows the actor but still denies restricted Lead reads and imports", async () => {
    dbFixture();
    const current = await requirePlaudActor(request(await jwt()));
    await expect(requirePlaudLead(current, 42)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requirePlaudImportLead(current, 42)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("requires canonical assignment, edit and import grants for an import", async () => {
    const grant = { id: 1, userId: actor.id, canView: true, canEdit: true, canImport: true };
    dbFixture({ permissions: [grant] });
    await expect(requirePlaudImportLead(actor, 42)).resolves.toMatchObject({ id: 42 });
    dbFixture({ permissions: [{ ...grant, canImport: false }] });
    await expect(requirePlaudImportLead(actor, 42)).rejects.toMatchObject({ message: "PLAUD_LEAD_IMPORT_DENIED" });
    dbFixture({ permissions: [{ ...grant, canEdit: false }] });
    await expect(requirePlaudImportLead(actor, 42)).rejects.toMatchObject({ code: "FORBIDDEN" });
    dbFixture({ permissions: [grant], assignedId: 8 });
    await expect(requirePlaudLead(actor, 42)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("fails closed for duplicate grants and duplicate legacy assignment names", async () => {
    const grant = { userId: actor.id, canView: true, canEdit: true, canImport: true };
    dbFixture({ permissions: [grant, grant] });
    await expect(requirePlaudLead(actor, 42)).rejects.toMatchObject({ code: "FORBIDDEN" });
    dbFixture({ permissions: [grant], assignedId: null, namedUsers: [actor, { ...actor, id: 8 }] });
    await expect(requirePlaudLead(actor, 42)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("keeps administrator Lead policy and denies a missing Lead", async () => {
    const fixture = dbFixture();
    await expect(requirePlaudImportLead({ ...actor, role: "admin" }, 42)).resolves.toMatchObject({ id: 42 });
    fixture.tables.set(leads, []);
    await expect(requirePlaudLead(actor, 42)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("PLAUD session binding and mutation origins", () => {
  it("hashes the same raw session identically, never returning the cookie", () => {
    const first = plaudSessionHash(request("synthetic-cookie"));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(plaudSessionHash(request(undefined, { cookies: { [COOKIE_NAME]: "synthetic-cookie" } })));
    expect(first).not.toBe(plaudSessionHash(request("another-synthetic-cookie")));
    expect(() => plaudSessionHash(request())).toThrow();
  });
  it.each([undefined, "null", "https://evil.invalid", "https://elevay.vip/", "https://elevay.vip.evil.invalid"])("rejects unapproved origin %s", origin => {
    expect(() => requirePlaudSameOrigin({ headers: { origin, host: "elevay.vip" } } as any)).toThrow();
  });
  it.each(["https://elevay.vip", "https://www.elevay.vip"])("accepts approved exact origin %s", origin => {
    expect(() => requirePlaudSameOrigin({ headers: { origin, host: "elevay.vip" } } as any)).not.toThrow();
  });
});
