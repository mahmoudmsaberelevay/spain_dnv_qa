import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { users, leads, leadNotes, leadActivities, leadsPermissions, plaudTranscriptImports, auditLogs } from "../drizzle/schema";
import type { CallActor } from "./leadCallsAccess";
import type { PlaudFetchedRecording } from "../shared/plaud";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), createPool: vi.fn(), drizzle: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("mysql2/promise", () => ({ default: { createPool: mocks.createPool } }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
import { storePlaudImport, listPlaudCatalogue, streamPlaudExport, withPlaudSnapshot, catalogueScope } from "./plaudTranscriptDb";
import { createTranscriptIdentity, normalizePlaudTranscript, parsePlaudRange } from "./plaudTranscriptFormat";

const actor: CallActor = { id: 7, name: "Synthetic employee", email: "employee@example.invalid", openId: "synthetic-openid", role: "user" };
const scope = "a".repeat(64);
const NOW = Date.parse("2026-11-12T12:00:00Z");
const start = Date.parse("2026-10-31T22:00:00Z");
const end = Date.parse("2026-11-12T22:00:00Z");
const range = { from: "2026-11-01", to: "2026-11-12" };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const dialect = new MySqlDialect();
const recording = (patch: Partial<PlaudFetchedRecording> = {}): PlaudFetchedRecording => ({ id: "synthetic-recording-1", sourceScope: scope, title: "Synthetic call title", transcript: "[00:01] أحمد: مرحباً Hello\n\nSpeaker 2: original content.", callAt: NOW - 3600000, durationMs: 60000, ...patch });

type Tables = Map<any, any[]>;
const copyTables = (tables: Tables): Tables => new Map([...tables].map(([table, rows]) => [table, structuredClone(rows)]));
function matches(row: any, predicate: any) {
  if (!predicate) return true;
  const query = dialect.sqlToQuery(predicate);
  const columns = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)`\s*=\s*\?/g)].map(match => match[1]);
  if (columns.length !== query.params.length) throw new Error(`Unsupported test predicate: ${query.sql}`);
  return columns.every((column, index) => row[column] === query.params[index]);
}
/** Real Drizzle tables + compiled predicates, transactional copy-on-write state.
 * Unknown operations fail rather than returning permissive canned results. */
function importFixture() {
  let tables: Tables = new Map([
    [users, [{ ...actor }]],
    [leads, [42, 43].map(id => ({ id, fullName: `Synthetic lead ${id}`, assignedConsultantUserId: actor.id, assignedTo: actor.name }))],
    [leadsPermissions, [{ id: 1, userId: actor.id, canView: true, canEdit: true, canImport: true }]],
    [leadNotes, [{ id: 90, leadId: 42, userId: actor.id, note: "Existing manual note mentions Plaud but is NOT an import" }]],
    [plaudTranscriptImports, []], [leadActivities, []],
  ]);
  let failTable: any = null, failure: any = new Error("synthetic SQL failure");
  let queue = Promise.resolve();
  const locks: any[] = [];
  const orm = (getTables: () => Tables): any => ({
    select: (projection?: Record<string, any>) => {
      let table: any, predicate: any, limit = Infinity;
      const read = () => (getTables().get(table) ?? []).filter(row => matches(row, predicate)).slice(0, limit)
        .map(row => projection ? Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column.name]])) : { ...row });
      const chain: any = { from(value: any) { table = value; return chain; }, where(value: any) { predicate = value; return chain; },
        limit(value: number) { limit = value; return chain; }, for(value: string) { locks.push({ table, value }); return chain; },
        then(resolve: any, reject: any) { return Promise.resolve().then(read).then(resolve, reject); } };
      return chain;
    },
    insert: (table: any) => ({ values: async (values: any) => {
      if (table === failTable) throw failure;
      const rows = getTables().get(table)!;
      if (table === plaudTranscriptImports && rows.some(row => row.identityHash === values.identityHash || row.noteId === values.noteId)) throw Object.assign(new Error("synthetic unique constraint"), { code: "ER_DUP_ENTRY" });
      const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
      rows.push({ ...values, id });
      return [{ insertId: id }];
    } }),
  });
  const db = orm(() => tables);
  db.transaction = vi.fn((operation: any) => {
    const task = queue.then(async () => {
      const working = copyTables(tables);
      const result = await operation(orm(() => working));
      tables = working;
      return result;
    });
    queue = task.catch(() => undefined);
    return task;
  });
  mocks.getDb.mockResolvedValue(db);
  return { db, locks, get tables() { return tables; }, failOn(table: any, error = new Error("synthetic SQL failure")) { failTable = table; failure = error; } };
}

function catalogueRow(id: number, patch: Record<string, any> = {}) {
  const transcript = `Speaker ${id}: synthetic original — أهلاً بالعالم\n\nSecond paragraph ${id}.`;
  return { id, source: "plaud", sourceScope: scope, identityHash: createTranscriptIdentity(scope, `recording-${id}`), recordingId: `recording-${id}`,
    transcript, transcriptHash: hash(transcript), deletedAt: null, noteId: id + 1000, leadId: 42, recordingTitle: `Metadata title ${id}`,
    callAt: NOW, effectiveAt: NOW, importedAt: NOW + 10, importerName: "Another employee", durationMs: 1000,
    fullName: "Restricted Lead metadata", assignedConsultantUserId: 8, assignedTo: "Other employee", ...patch };
}
type SnapshotFixture = ReturnType<typeof sqlFixture>;
let activeSql: SnapshotFixture;
const getConnection = vi.fn(async () => activeSql.connection());

/** Evaluates the SQL actually received, including joins, bounds, keyset cursor,
 * order and LIMIT/OFFSET, over a copy captured at START TRANSACTION. This is not
 * MySQL integration: driver behavior/real isolation still needs deployment QA. */
function sqlFixture(initial: any[] = [], options: { permissions?: any[]; failBatch?: number; disappear?: boolean; ignoreSnapshot?: boolean; failAudit?: boolean } = {}) {
  let live = structuredClone(initial);
  let noteRows = initial.map(row => ({ id: row.noteId, leadId: row.leadId, note: "Edited display note (not canonical transcript)" }));
  let leadRows = [{ id: 42 }];
  const queries: { sql: string; params: any[] }[] = [];
  const audits: any[] = [];
  const auditHistory: any[] = [];
  const auditDb = {
    insert: vi.fn((table: any) => ({ values: async (values: any) => {
      if (table !== auditLogs) throw Error("Unexpected autocommit insert");
      if (options.failAudit) throw Error("synthetic unavailable audit");
      const row = { ...values, id: audits.length + 1 };
      audits.push(row);
      auditHistory.push(structuredClone(row));
      return [{ insertId: row.id }];
    } })),
    update: vi.fn((table: any) => ({ set: (patch: any) => ({ where: async (predicate: any) => {
      if (table !== auditLogs) throw Error("Unexpected autocommit update");
      for (const row of audits.filter(row => matches(row, predicate))) {
        Object.assign(row, patch);
        auditHistory.push(structuredClone(row));
      }
      return [{ affectedRows: 1 }];
    } }) })),
  };
  mocks.getDb.mockResolvedValue(auditDb);
  const connections: any[] = [];
  const fixture = {
    queries, audits, auditHistory, auditDb, connections,
    get live() { return live; }, set live(rows: any[]) { live = rows; },
    get notes() { return noteRows; }, set notes(rows: any[]) { noteRows = rows; },
    set leads(rows: any[]) { leadRows = rows; },
    connection() {
      let snapshot: any[] = [], notesSnapshot: any[] = [], leadsSnapshot: any[] = [], batches = 0;
      const conn: any = {
        commit: vi.fn(async () => undefined), rollback: vi.fn(async () => undefined), release: vi.fn(),
        orm: { select: () => {
          let table: any;
          const read = () => table === leadsPermissions ? options.permissions ?? [] : table === users ? [actor, { ...actor, id: 8, name: "Other employee" }] : (() => { throw Error("Unknown table"); })();
          const chain: any = { from(value: any) { table = value; return chain; }, where() { return chain; }, then(resolve: any, reject: any) { return Promise.resolve().then(read).then(resolve, reject); } };
          return chain;
        } },
        query: vi.fn(async (sql: string, params: any[] = []) => {
          queries.push({ sql, params: [...params] });
          if (sql.startsWith("SET SESSION")) return [[], []];
          if (sql.startsWith("START TRANSACTION")) { snapshot = structuredClone(live); notesSnapshot = structuredClone(noteRows); leadsSnapshot = structuredClone(leadRows); return [[], []]; }
          if (!sql.startsWith("SELECT ")) throw Error(`Unsupported SQL ${sql}`);
          let rows = structuredClone(options.ignoreSnapshot ? live : snapshot);
          if (sql.includes("INNER JOIN lead_notes")) rows = rows.filter(row => notesSnapshot.some(note => note.id === row.noteId && note.leadId === row.leadId));
          if (sql.includes("INNER JOIN leads")) rows = rows.filter(row => leadsSnapshot.some(lead => lead.id === row.leadId));
          if (sql.includes("p.source='plaud'")) rows = rows.filter(row => row.source === "plaud");
          if (sql.includes("p.deletedAt IS NULL")) rows = rows.filter(row => row.deletedAt == null);
          if (sql.includes("p.transcript IS NOT NULL")) rows = rows.filter(row => row.transcript != null);
          if (sql.includes("LENGTH(TRIM(p.transcript)) > 0")) rows = rows.filter(row => (row.transcript ?? "").trim().length > 0);
          for (const field of ["sourceScope", "identityHash", "transcriptHash"]) {
            if (sql.includes(`p.${field} REGEXP`)) rows = rows.filter(row => /^[a-f0-9]{64}$/.test(row[field]));
          }
          let param = 0;
          if (sql.includes("p.effectiveAt >= ?")) { const bound = params[param++]; rows = rows.filter(row => row.effectiveAt >= bound); }
          if (sql.includes("p.effectiveAt < ?")) { const bound = params[param++]; rows = rows.filter(row => row.effectiveAt < bound); }
          if (sql.startsWith("SELECT COUNT")) {
            if (options.disappear) live = [];
            return [[{ total: rows.length }], []];
          }
          const cursor = sql.includes("p.effectiveAt > ? OR");
          if (cursor) {
            batches++;
            if (options.failBatch === batches) throw Error("synthetic fetch failure, private provider body must not leak");
            const [at, sameAt, id] = params.slice(param);
            rows = rows.filter(row => row.effectiveAt > at || row.effectiveAt === sameAt && row.id > id);
          }
          rows.sort((a: any, b: any) => a.effectiveAt - b.effectiveAt || a.id - b.id);
          if (sql.includes("ORDER BY p.effectiveAt DESC")) rows.reverse();
          if (sql.includes("LIMIT ? OFFSET ?")) rows = rows.slice(params[param + 1], params[param + 1] + params[param]);
          else if (sql.includes("LIMIT 100")) rows = rows.slice(0, 100);
          return [rows, []];
        }),
        execute: vi.fn(async () => { throw Error("Read snapshot must never write an audit that can be rolled back"); }),
      };
      connections.push(conn);
      return conn;
    },
  };
  return fixture;
}
function response() {
  const res: any = new EventEmitter();
  const chunks: string[] = [];
  const headers: Record<string, string> = {};
  res.destroyed = false;
  res.setHeader = vi.fn((key: string, value: string) => { headers[key.toLowerCase()] = value; });
  res.write = vi.fn((chunk: string, encoding: string) => { expect(encoding).toBe("utf8"); chunks.push(chunk); return true; });
  return { res, chunks, headers, get text() { return chunks.join(""); } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "mysql://synthetic:synthetic@invalid.invalid/never-connected");
  vi.stubEnv("ELEVAY_BUSINESS_TIME_ZONE", "Africa/Cairo");
  vi.stubEnv("TZ", "America/Los_Angeles");
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  mocks.createPool.mockReturnValue({ getConnection });
  mocks.drizzle.mockImplementation(conn => conn.orm);
  activeSql = sqlFixture();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("storePlaudImport atomic canonical provenance", () => {
  it("creates one existing-system note, linked canonical provenance and one activity in a transaction", async () => {
    const fixture = importFixture();
    const source = recording({ transcript: " \r\nأحمد: Hello\r\n\r\nSpeaker 2: yes.\r\n " });
    const result = await storePlaudImport(actor, 42, source);
    expect(result).toEqual({ noteId: 91, alreadyImported: false });
    expect(fixture.db.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.locks).toContainEqual({ table: users, value: "update" });
    expect(fixture.tables.get(leadNotes)).toHaveLength(2);
    expect(fixture.tables.get(leadNotes)![0].note).toMatch(/^Existing manual/);
    const imported = fixture.tables.get(plaudTranscriptImports)!;
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ noteId: result.noteId, leadId: 42, importerId: actor.id, source: "plaud", sourceScope: scope,
      recordingId: source.id, transcript: "أحمد: Hello\n\nSpeaker 2: yes.", transcriptHash: hash("أحمد: Hello\n\nSpeaker 2: yes."),
      identityHash: createTranscriptIdentity(scope, source.id), callAt: source.callAt, effectiveAt: source.callAt, importedAt: NOW });
    expect(fixture.tables.get(leadActivities)).toEqual([expect.objectContaining({ leadId: 42, userId: actor.id, activityType: "note_added" })]);
  });
  it("keeps different recordings with identical text/timestamps separate, also across account scope", async () => {
    const fixture = importFixture();
    const first = await storePlaudImport(actor, 42, recording());
    const second = await storePlaudImport(actor, 42, recording({ id: "genuine-other-recording" }));
    const third = await storePlaudImport(actor, 42, recording({ sourceScope: "b".repeat(64) }));
    expect(new Set([first.noteId, second.noteId, third.noteId]).size).toBe(3);
    expect(fixture.tables.get(plaudTranscriptImports)).toHaveLength(3);
    expect(fixture.tables.get(leadActivities)).toHaveLength(3);
  });
  it("admits repeated clicks once and rejects reassignment to a different Lead without duplicates", async () => {
    const fixture = importFixture();
    const results = await Promise.all(Array.from({ length: 5 }, () => storePlaudImport(actor, 42, recording())));
    expect(results.filter(result => !result.alreadyImported)).toHaveLength(1);
    expect(new Set(results.map(result => result.noteId)).size).toBe(1);
    await expect(storePlaudImport(actor, 43, recording())).rejects.toMatchObject({ message: "PLAUD_RECORDING_ALREADY_IMPORTED" });
    expect(fixture.tables.get(leadNotes)).toHaveLength(2);
    expect(fixture.tables.get(plaudTranscriptImports)).toHaveLength(1);
    expect(fixture.tables.get(leadActivities)).toHaveLength(1);
  });
  it.each(["direct", "wrapped"])("resolves a cross-employee unique-identity race after rollback (%s driver error)", async kind => {
    const fixture = importFixture();
    const winner = await storePlaudImport(actor, 42, recording());
    const duplicate = Object.assign(Error("synthetic concurrent unique failure"), { code: "ER_DUP_ENTRY" });
    const error = kind === "wrapped" ? Object.assign(Error("synthetic driver wrapper"), { cause: duplicate }) : duplicate;
    const winnerState = copyTables(fixture.tables);
    fixture.db.transaction.mockRejectedValueOnce(error);
    expect(await storePlaudImport({ ...actor, id: 8 }, 42, recording())).toEqual({ noteId: winner.noteId, alreadyImported: true });
    expect(fixture.tables).toEqual(winnerState);
    fixture.db.transaction.mockRejectedValueOnce(error);
    await expect(storePlaudImport({ ...actor, id: 8 }, 43, recording())).rejects.toMatchObject({ message: "PLAUD_RECORDING_ALREADY_IMPORTED" });
    expect(fixture.tables).toEqual(winnerState);
  });
  it("does not overwrite canonical text or edit-history notes when a transcript is regenerated", async () => {
    const fixture = importFixture();
    const first = await storePlaudImport(actor, 42, recording());
    fixture.tables.get(leadNotes)!.find(note => note.id === first.noteId)!.note = "A later authorized CRM note edit";
    const before = structuredClone(fixture.tables.get(plaudTranscriptImports));
    expect(await storePlaudImport(actor, 42, recording({ transcript: "Regenerated changed text", title: "Changed title" }))).toEqual({ noteId: first.noteId, alreadyImported: true });
    expect(fixture.tables.get(plaudTranscriptImports)).toEqual(before);
    expect(fixture.tables.get(leadNotes)!.find(note => note.id === first.noteId)!.note).toBe("A later authorized CRM note edit");
  });
  it("does not resurrect a deleted note on repeated import", async () => {
    const fixture = importFixture();
    await storePlaudImport(actor, 42, recording());
    fixture.tables.set(leadNotes, []);
    await expect(storePlaudImport(actor, 42, recording())).rejects.toMatchObject({ message: "PLAUD_IMPORTED_NOTE_REMOVED" });
    expect(fixture.tables.get(leadNotes)).toEqual([]);
    expect(fixture.tables.get(plaudTranscriptImports)).toHaveLength(1);
  });
  it("preserves a valid pre-epoch integer timestamp without changing its meaning", async () => {
    const fixture = importFixture();
    await storePlaudImport(actor, 42, recording({ callAt: -1 }));
    expect(fixture.tables.get(plaudTranscriptImports)![0]).toMatchObject({ callAt: -1, effectiveAt: -1, importedAt: NOW });
  });
  it.each([null, NaN, 8_640_000_000_000_001, 1.5])("stores explicit import-time fallback for invalid call timestamp %s", async callAt => {
    const fixture = importFixture();
    await storePlaudImport(actor, 42, recording({ callAt }));
    expect(fixture.tables.get(plaudTranscriptImports)![0]).toMatchObject({ callAt: null, effectiveAt: NOW, importedAt: NOW });
  });
  it.each([leadNotes, plaudTranscriptImports, leadActivities])("rolls back all three writes when a storage stage fails", async table => {
    const fixture = importFixture();
    const before = copyTables(fixture.tables);
    fixture.failOn(table);
    await expect(storePlaudImport(actor, 42, recording())).rejects.toMatchObject({ message: "PLAUD_IMPORT_FAILED" });
    expect(fixture.tables).toEqual(before);
  });
  it("rechecks current actor and import permission inside the transaction", async () => {
    const fixture = importFixture();
    fixture.tables.set(users, []);
    await expect(storePlaudImport(actor, 42, recording())).rejects.toMatchObject({ message: "PLAUD_ACCOUNT_UNAVAILABLE" });
    fixture.tables.set(users, [actor]);
    fixture.tables.set(leadsPermissions, []);
    await expect(storePlaudImport(actor, 42, recording())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fixture.tables.get(leadNotes)).toHaveLength(1);
  });
  it.each([{ transcript: " \r\n " }, { transcript: "bad\0text" }, { sourceScope: "untrusted-account" }, { id: "" }])("rejects unsafe/non-ready import before any transaction: %j", async patch => {
    const fixture = importFixture();
    await expect(storePlaudImport(actor, 42, recording(patch))).rejects.toBeDefined();
    expect(fixture.db.transaction).not.toHaveBeenCalled();
  });
});

describe("PLAUD shared catalogue SQL and lifecycle", () => {
  it("lists another employee's canonical transcript without Lead grants, redacting restricted metadata", async () => {
    activeSql = sqlFixture([catalogueRow(1)]);
    const page = await listPlaudCatalogue(actor, { ...range, page: 1, pageSize: 20 });
    expect(page).toMatchObject({ total: 1, timeZone: "Africa/Cairo", items: [{ transcript: catalogueRow(1).transcript, importerName: "Another employee", lead: null }] });
    const text = JSON.stringify(page);
    for (const privateField of ["Restricted Lead metadata", "recordingId", "sourceScope", "identityHash", "assignedTo", "accessToken", "refreshToken"]) expect(text).not.toContain(privateField);
  });
  it("uses scoped Lead access for optional links, not for filtering the shared catalogue", async () => {
    const rows = [catalogueRow(1), catalogueRow(2, { assignedConsultantUserId: 7 })];
    activeSql = sqlFixture(rows, { permissions: [{ canView: true, canEdit: false }] });
    const page = await listPlaudCatalogue(actor, { ...range, page: 1, pageSize: 20 });
    expect(page.total).toBe(2);
    expect(page.items.find(item => item.id === 1)!.lead).toBeNull();
    expect(page.items.find(item => item.id === 2)!.lead).toEqual({ name: "Restricted Lead metadata", code: "42", path: "/leads/42" });
    const adminPage = await listPlaudCatalogue({ ...actor, role: "admin" }, { ...range, page: 1, pageSize: 20 });
    expect(adminPage.items.every(item => item.lead !== null)).toBe(true);
  });
  it("excludes ordinary/failed/empty/untrusted/deleted/orphan imports using the actual SQL predicate", async () => {
    activeSql = sqlFixture([
      catalogueRow(1), catalogueRow(2, { source: "manual" }), catalogueRow(3, { transcript: "   " }),
      catalogueRow(4, { transcript: null }), catalogueRow(5, { deletedAt: NOW }), catalogueRow(6, { sourceScope: "bad" }),
      catalogueRow(7, { identityHash: "bad" }), catalogueRow(8, { transcriptHash: "bad" }), catalogueRow(9), catalogueRow(10, { leadId: 999 }),
      catalogueRow(11),
    ]);
    activeSql.notes = activeSql.notes.filter(note => note.id !== 1009);
    activeSql.notes.find(note => note.id === 1011)!.leadId = 123;
    expect((await listPlaudCatalogue(actor, { ...range, page: 1, pageSize: 50 })).items.map(item => item.id)).toEqual([1]);
  });
  it("makes a committed import immediately listable without any provider call and ignores later note edits", async () => {
    const fixture = importFixture();
    await storePlaudImport(actor, 42, recording());
    const imported = fixture.tables.get(plaudTranscriptImports)![0];
    activeSql = sqlFixture([{ ...catalogueRow(imported.id), ...imported }]);
    activeSql.notes = fixture.tables.get(leadNotes)!;
    activeSql.notes.find(note => note.id === imported.noteId)!.note = "Edited wrapper: never scrape this";
    const page = await listPlaudCatalogue(actor, { ...range, page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
    expect(page.items[0].transcript).toBe(recording().transcript);
    const download = response();
    await streamPlaudExport(actor, range, download.res);
    expect(download.text).toBe(page.items[0].transcript);
  });
  it("uses a single predicate and identical inclusive/exclusive UTC bound parameters for list, count and export", async () => {
    const expectedScope = catalogueScope(parsePlaudRange(range, "Africa/Cairo"));
    expect(expectedScope.params).toEqual([start, end]);
    activeSql = sqlFixture([catalogueRow(1, { effectiveAt: start - 1 }), catalogueRow(2, { effectiveAt: start }),
      catalogueRow(3, { effectiveAt: end - 1 }), catalogueRow(4, { effectiveAt: end })]);
    const page = await listPlaudCatalogue(actor, { ...range, page: 1, pageSize: 1 });
    expect(page).toMatchObject({ total: 2, items: [{ id: 3 }] });
    const out = response();
    expect(await streamPlaudExport(actor, range, out.res)).toEqual({ count: 2 });
    expect(out.text).toBe([catalogueRow(2).transcript, catalogueRow(3).transcript].join("\n\n\n"));
    const selects = activeSql.queries.filter(query => query.sql.startsWith("SELECT"));
    expect(selects).toHaveLength(4);
    for (const query of selects) {
      expect(query.sql).toContain(expectedScope.where);
      expect(query.params.slice(0, 2)).toEqual(expectedScope.params);
      expect(query.sql).not.toContain(range.from);
    }
  });
  it.each([
    ["2026-04-24", "2026-04-23T22:00:00Z", "2026-04-24T21:00:00Z"],
    ["2026-10-29", "2026-10-28T21:00:00Z", "2026-10-29T22:00:00Z"],
  ])("queries correct Cairo DST bounds for %s, including import-date fallback", async (day, from, to) => {
    const lower = Date.parse(from), upper = Date.parse(to);
    activeSql = sqlFixture([catalogueRow(1, { callAt: null, importedAt: lower, effectiveAt: lower }),
      catalogueRow(2, { effectiveAt: upper - 1 }), catalogueRow(3, { effectiveAt: upper })]);
    const selected = { from: day, to: day };
    const page = await listPlaudCatalogue(actor, { ...selected, page: 1, pageSize: 20 });
    expect(page.total).toBe(2);
    expect(page.items.find(item => item.id === 1)).toMatchObject({ usesImportDate: true, effectiveAt: lower });
    const out = response();
    expect(await streamPlaudExport(actor, selected, out.res)).toEqual({ count: 2 });
    for (const query of activeSql.queries.filter(query => query.sql.startsWith("SELECT"))) expect(query.params.slice(0, 2)).toEqual([lower, upper]);
  });
  it("supports cleared list filters without hidden UTC bounds", async () => {
    activeSql = sqlFixture([catalogueRow(1, { effectiveAt: start - 1000000 }), catalogueRow(2)]);
    expect((await listPlaudCatalogue(actor, { page: 1, pageSize: 10 })).total).toBe(2);
    const count = activeSql.queries.find(query => query.sql.startsWith("SELECT COUNT"))!;
    expect(count.params).toEqual([]);
    expect(count.sql).not.toContain("p.effectiveAt >=");
  });
});

describe("PLAUD streaming export snapshot, privacy and failures", () => {
  it("exports all 301 long mixed-language blocks over keyset batches with stable chronological/id order and exact LF boundaries", async () => {
    const rows = Array.from({ length: 301 }, (_, index) => {
      const transcript = `[00:01] المتحدث ${index}: ${"تفاصيل الإقامة original content 😀 ".repeat(180)}\n\nSpeaker 2: done ${index}.`;
      return catalogueRow(index + 1, { effectiveAt: start + Math.floor(index / 3), transcript, transcriptHash: hash(transcript) });
    }).reverse();
    activeSql = sqlFixture(rows);
    const out = response();
    const logs = [vi.spyOn(console, "log").mockImplementation(() => undefined), vi.spyOn(console, "warn").mockImplementation(() => undefined), vi.spyOn(console, "error").mockImplementation(() => undefined)];
    expect(await streamPlaudExport(actor, range, out.res)).toEqual({ count: 301 });
    const expected = [...rows].sort((a, b) => a.effectiveAt - b.effectiveAt || a.id - b.id).map(row => row.transcript).join("\n\n\n");
    expect(out.text).toBe(expected);
    expect(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(out.text, "utf8"))).toBe(expected);
    expect(out.text.split("\n\n\n")).toHaveLength(301);
    expect(out.text).not.toContain("\r");
    expect(out.headers).toMatchObject({ "content-type": "text/plain; charset=utf-8", "content-disposition": 'attachment; filename="plaud_transcripts_2026-11-01_to_2026-11-12.txt"', "cache-control": "private, no-store", "x-plaud-transcript-count": "301" });
    expect(activeSql.queries.filter(query => query.sql.includes("ORDER BY p.effectiveAt ASC,p.id ASC"))).toHaveLength(4);
    expect(getConnection).toHaveBeenCalledTimes(1);
    expect(activeSql.connections[0].commit).toHaveBeenCalledTimes(1);
    expect(activeSql.connections[0].rollback).not.toHaveBeenCalled();
    expect(activeSql.connections[0].release).toHaveBeenCalledTimes(1);
    expect(activeSql.audits).toHaveLength(1);
    expect(activeSql.audits[0]).toMatchObject({ userId: actor.id, userEmail: actor.email, userName: actor.name, action: "export", resource: "plaud_transcripts", createdAt: NOW });
    expect(JSON.parse(activeSql.audits[0].details)).toEqual({ ...range, timeZone: "Africa/Cairo", count: 301, status: "completed", emittedCount: 301 });
    expect(activeSql.auditHistory[0]).toMatchObject({ action: "export_attempt" });
    expect(JSON.parse(activeSql.auditHistory[0].details)).toEqual({ ...range, timeZone: "Africa/Cairo", count: 301, status: "started", emittedCount: 0 });
    for (const log of logs) expect(JSON.stringify(log.mock.calls)).not.toContain("تفاصيل الإقامة");
    expect(JSON.stringify(activeSql.audits)).not.toContain("original content");
    expect(out.headers).not.toHaveProperty("location");
    expect(activeSql.connections[0].execute).not.toHaveBeenCalled();
    expect(activeSql.auditDb.insert).toHaveBeenCalledTimes(1);
    expect(activeSql.auditDb.update).toHaveBeenCalledTimes(1);
  });
  it("normalizes CRLF and only outer blank space without adding metadata or rewriting source text", async () => {
    const raw = " \r\n[00:01] أحمد: Hello\r\n\r\nSpeaker 2: keep <client> & # literal.\r\n ";
    const canonical = normalizePlaudTranscript(raw);
    activeSql = sqlFixture([catalogueRow(2, { transcript: "Second", transcriptHash: hash("Second") }), catalogueRow(1, { transcript: raw, transcriptHash: hash(canonical) })]);
    const out = response();
    await streamPlaudExport(actor, range, out.res);
    expect(out.text).toBe(canonical + "\n\n\nSecond");
    for (const metadata of ["Restricted Lead", "Metadata title", "Another employee", "Train Your AI", "Note 1", "---"]) expect(out.text).not.toContain(metadata);
  });
  it("uses consistent snapshot if all live records disappear after count", async () => {
    activeSql = sqlFixture([catalogueRow(1), catalogueRow(2)], { disappear: true });
    const out = response();
    expect(await streamPlaudExport(actor, range, out.res)).toEqual({ count: 2 });
    expect(activeSql.live).toEqual([]);
    expect(out.text).toBe([catalogueRow(1).transcript, catalogueRow(2).transcript].join("\n\n\n"));
    expect(activeSql.queries[0].sql).toBe("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    expect(activeSql.queries[1].sql).toBe("START TRANSACTION WITH CONSISTENT SNAPSHOT");
  });
  it("fails clearly and rolls back if the snapshot unexpectedly loses records", async () => {
    activeSql = sqlFixture([catalogueRow(1)], { disappear: true, ignoreSnapshot: true });
    const out = response();
    await expect(streamPlaudExport(actor, range, out.res)).rejects.toMatchObject({ message: "PLAUD_EXPORT_SNAPSHOT_CHANGED" });
    expect(activeSql.connections[0].commit).not.toHaveBeenCalled();
    expect(activeSql.connections[0].rollback).toHaveBeenCalledTimes(1);
    expect(activeSql.connections[0].release).toHaveBeenCalledTimes(1);
  });
  it("rejects empty result without attachment, misleading audit, or body", async () => {
    const out = response();
    await expect(streamPlaudExport(actor, range, out.res)).rejects.toMatchObject({ code: "NOT_FOUND", message: "No Plaud transcripts found for this date range" });
    expect(out.text).toBe("");
    expect(out.headers).not.toHaveProperty("content-disposition");
    expect(activeSql.audits).toEqual([]);
    expect(activeSql.connections[0].rollback).toHaveBeenCalledTimes(1);
    expect(activeSql.connections[0].release).toHaveBeenCalledTimes(1);
  });
  it("rolls back and releases when retrieval fails after the first 100 streamed rows", async () => {
    activeSql = sqlFixture(Array.from({ length: 101 }, (_, index) => catalogueRow(index + 1)), { failBatch: 2 });
    const out = response();
    await expect(streamPlaudExport(actor, range, out.res)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "PLAUD_SNAPSHOT_FAILED" });
    expect(out.chunks).toHaveLength(100);
    expect(activeSql.connections[0].commit).not.toHaveBeenCalled();
    expect(activeSql.connections[0].rollback).toHaveBeenCalledTimes(1);
    expect(activeSql.connections[0].release).toHaveBeenCalledTimes(1);
    expect(activeSql.audits).toHaveLength(1);
    expect(activeSql.audits[0].action).toBe("export_failed");
    expect(JSON.parse(activeSql.audits[0].details)).toEqual({ ...range, timeZone: "Africa/Cairo", count: 101, status: "failed", emittedCount: 100 });
    expect(activeSql.auditHistory.map(row => row.action)).toEqual(["export_attempt", "export_failed"]);
    expect(activeSql.connections[0].execute).not.toHaveBeenCalled();
  });
  it("does not begin sensitive output if metadata-only auditing is unavailable", async () => {
    activeSql = sqlFixture([catalogueRow(1)], { failAudit: true });
    const out = response();
    await expect(streamPlaudExport(actor, range, out.res)).rejects.toMatchObject({ message: "PLAUD_SNAPSHOT_FAILED" });
    expect(out.chunks).toEqual([]);
    expect(out.headers).not.toHaveProperty("content-disposition");
    expect(activeSql.audits).toEqual([]);
    expect(activeSql.connections[0].rollback).toHaveBeenCalledTimes(1);
    expect(activeSql.connections[0].release).toHaveBeenCalledTimes(1);
  });
  it("does not acquire a snapshot or disclose bytes when the independent audit database is unavailable", async () => {
    activeSql = sqlFixture([catalogueRow(1)]);
    mocks.getDb.mockResolvedValueOnce(null);
    const out = response();
    await expect(streamPlaudExport(actor, range, out.res)).rejects.toMatchObject({ message: "PLAUD_AUDIT_UNAVAILABLE" });
    expect(out.chunks).toEqual([]);
    expect(getConnection).not.toHaveBeenCalled();
    expect(activeSql.audits).toEqual([]);
  });
  it("rejects a corrupted canonical transcript rather than silently exporting it", async () => {
    activeSql = sqlFixture([catalogueRow(1, { transcriptHash: "b".repeat(64) })]);
    const out = response();
    await expect(streamPlaudExport(actor, range, out.res)).rejects.toMatchObject({ message: "PLAUD_EXPORT_INTEGRITY_FAILED" });
    expect(out.text).toBe("");
    expect(activeSql.connections[0].rollback).toHaveBeenCalledTimes(1);
  });
  it("honors stream backpressure and removes drain/close/error listeners", async () => {
    activeSql = sqlFixture([catalogueRow(1)]);
    const out = response();
    out.res.write.mockImplementationOnce((chunk: string) => { out.chunks.push(chunk); setImmediate(() => out.res.emit("drain")); return false; });
    await expect(streamPlaudExport(actor, range, out.res)).resolves.toEqual({ count: 1 });
    for (const event of ["drain", "close", "error"]) expect(out.res.listenerCount(event)).toBe(0);
  });
  it("rolls back on client disconnect while waiting for backpressure", async () => {
    activeSql = sqlFixture([catalogueRow(1)]);
    const out = response();
    out.res.write.mockImplementationOnce(() => { setImmediate(() => out.res.emit("close")); return false; });
    await expect(streamPlaudExport(actor, range, out.res)).rejects.toMatchObject({ message: "PLAUD_SNAPSHOT_FAILED" });
    expect(activeSql.connections[0].rollback).toHaveBeenCalledTimes(1);
    expect(activeSql.connections[0].release).toHaveBeenCalledTimes(1);
    expect(activeSql.audits).toHaveLength(1);
    expect(activeSql.audits[0].action).toBe("export_failed");
    expect(JSON.parse(activeSql.audits[0].details)).toEqual({ ...range, timeZone: "Africa/Cairo", count: 1, status: "failed", emittedCount: 1 });
    expect(activeSql.auditHistory.map(row => row.action)).toEqual(["export_attempt", "export_failed"]);
    for (const event of ["drain", "close", "error"]) expect(out.res.listenerCount(event)).toBe(0);
  });
  it("acquires/releases an independent connection per export", async () => {
    activeSql = sqlFixture([catalogueRow(1)]);
    await streamPlaudExport(actor, range, response().res);
    await streamPlaudExport(actor, range, response().res);
    expect(getConnection).toHaveBeenCalledTimes(2);
    expect(activeSql.connections).toHaveLength(2);
    expect(activeSql.connections[0]).not.toBe(activeSql.connections[1]);
    for (const conn of activeSql.connections) { expect(conn.commit).toHaveBeenCalledTimes(1); expect(conn.release).toHaveBeenCalledTimes(1); }
  });
  it("preserves a non-completed attempt if both independent audit finalization updates fail", async () => {
    activeSql = sqlFixture([catalogueRow(1)]);
    activeSql.auditDb.update.mockImplementation(() => ({ set: () => ({ where: async () => { throw Error("synthetic audit update failure"); } }) }));
    const out = response();
    await expect(streamPlaudExport(actor, range, out.res)).rejects.toThrow("synthetic audit update failure");
    expect(out.text).toBe(catalogueRow(1).transcript);
    expect(activeSql.audits).toHaveLength(1);
    expect(activeSql.audits[0].action).toBe("export_attempt");
    expect(JSON.parse(activeSql.audits[0].details)).toMatchObject({ status: "started", count: 1, emittedCount: 0 });
    expect(activeSql.connections[0].commit).toHaveBeenCalledTimes(1);
    expect(activeSql.connections[0].release).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid audit insert identity before disclosing bytes", async () => {
    activeSql = sqlFixture([catalogueRow(1)]);
    activeSql.auditDb.insert.mockImplementationOnce(() => ({ values: async () => [{ insertId: 0 }] }));
    const out = response();
    await expect(streamPlaudExport(actor, range, out.res)).rejects.toMatchObject({ message: "PLAUD_AUDIT_UNAVAILABLE" });
    expect(out.text).toBe("");
    expect(out.headers).not.toHaveProperty("content-disposition");
    expect(activeSql.connections[0].rollback).toHaveBeenCalledTimes(1);
  });
  it("rolls back and releases if snapshot setup fails before the operation", async () => {
    const conn = activeSql.connection();
    conn.query.mockRejectedValueOnce(Error("synthetic isolation setup failure"));
    getConnection.mockResolvedValueOnce(conn);
    const operation = vi.fn(async () => "never executed");
    await expect(withPlaudSnapshot(operation)).rejects.toMatchObject({ message: "PLAUD_SNAPSHOT_FAILED" });
    expect(operation).not.toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1);
  });
  it("releases on snapshot commit failure even if rollback also fails", async () => {
    const conn = activeSql.connection();
    conn.commit.mockRejectedValueOnce(Error("synthetic commit failure"));
    conn.rollback.mockRejectedValueOnce(Error("synthetic rollback failure"));
    getConnection.mockResolvedValueOnce(conn);
    await expect(withPlaudSnapshot(async () => "result")).rejects.toMatchObject({ message: "PLAUD_SNAPSHOT_FAILED" });
    expect(conn.release).toHaveBeenCalledTimes(1);
  });
});
