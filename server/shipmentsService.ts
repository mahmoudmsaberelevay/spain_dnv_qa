import {
  and,
  asc,
  desc,
  eq,
  gte,
  lte,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import type { z } from "zod";
import { crmShipments } from "../drizzle/schema";
import {
  EMPTY_SHIPMENT_FILTERS,
  type ShipmentEntry,
  type ShipmentFilters,
  type ShipmentRecord,
  shipmentCreateSchema,
  shipmentListSchema,
  shipmentReportSchema,
} from "../shared/shipments";
import { getDb } from "./db";
import { notifyShipmentCreated } from "./shipmentNotifications";

export const SHIPMENT_REPORT_LIMIT = 5000;
export type ShipmentCreateInput = z.infer<typeof shipmentCreateSchema>;
export type ShipmentListInput = z.infer<typeof shipmentListSchema>;
export type ShipmentReportInput = z.infer<typeof shipmentReportSchema>;
export type ShipmentListResult = {
  rows: ShipmentRecord[];
  total: number;
  fromCount: number;
  toCount: number;
};
export type ShipmentCreateResult = { row: ShipmentRecord; created: boolean };

export class ShipmentError extends Error {
  constructor(
    public readonly reason: "NOT_FOUND" | "CONFLICT" | "REPORT_TOO_LARGE",
    message: string
  ) {
    super(message);
    this.name = "ShipmentError";
  }
}

// No joins to users, and no replay key or creator identity in read responses.
const shipmentProjection = {
  id: crmShipments.id,
  shipmentDate: crmShipments.shipmentDate,
  companyName: crmShipments.companyName,
  shipmentNumber: crmShipments.shipmentNumber,
  direction: crmShipments.direction,
  partyName: crmShipments.partyName,
  driveUrl: crmShipments.driveUrl,
  createdAt: crmShipments.createdAt,
  recordedByName: crmShipments.recordedByName,
  notificationEmail: crmShipments.notificationEmail,
  notificationStatus: crmShipments.notificationStatus,
  notificationSentAt: crmShipments.notificationSentAt,
};
const replayProjection = {
  ...shipmentProjection,
  createdByUserId: crmShipments.createdByUserId,
};

function safeRow(row: ShipmentRecord): ShipmentRecord {
  return {
    id: row.id,
    shipmentDate: row.shipmentDate,
    companyName: row.companyName,
    shipmentNumber: row.shipmentNumber,
    direction: row.direction,
    partyName: row.partyName,
    driveUrl: row.driveUrl,
    createdAt: row.createdAt,
    recordedByName: row.recordedByName ?? null,
    notificationEmail: row.notificationEmail ?? null,
    notificationStatus: row.notificationStatus ?? "not_requested",
    notificationSentAt: row.notificationSentAt ?? null,
  };
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Shipment database unavailable");
  return db;
}

/** Explicit non-backslash ESCAPE is independent of MySQL backslash SQL modes.
 * User text, including literal %, _ and !, is always a bound parameter. */
function literalContains(column: SQLWrapper, value: string): SQL {
  const pattern = `%${value.replace(/[!%_]/g, "!$&")}%`;
  return sql`${column} like ${pattern} escape '!'`;
}

function shipmentWhere(filters: ShipmentFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.from)
    conditions.push(gte(crmShipments.shipmentDate, filters.from));
  if (filters.to) conditions.push(lte(crmShipments.shipmentDate, filters.to));
  if (filters.direction !== "all")
    conditions.push(eq(crmShipments.direction, filters.direction));
  for (const field of [
    "companyName",
    "shipmentNumber",
    "partyName",
    "driveUrl",
  ] as const) {
    if (filters[field])
      conditions.push(literalContains(crmShipments[field], filters[field]));
  }
  if (filters.search) {
    // Search the visible direction label as well as every editable text field.
    const label = sql`case when ${crmShipments.direction} = 'from' then 'Shipment from' else 'Shipment to' end`;
    conditions.push(
      or(
        literalContains(crmShipments.companyName, filters.search),
        literalContains(crmShipments.shipmentNumber, filters.search),
        literalContains(crmShipments.partyName, filters.search),
        literalContains(crmShipments.driveUrl, filters.search),
        literalContains(label, filters.search)
      )!
    );
  }
  return and(...conditions);
}

const sortColumns = {
  shipmentDate: crmShipments.shipmentDate,
  companyName: crmShipments.companyName,
  shipmentNumber: crmShipments.shipmentNumber,
  direction: crmShipments.direction,
  partyName: crmShipments.partyName,
} as const;

export async function listShipments(
  input: ShipmentListInput
): Promise<ShipmentListResult> {
  const db = await requireDb();
  const where = shipmentWhere(input.filters);
  const order = input.sortOrder === "asc" ? asc : desc;
  const rows = await db
    .select(shipmentProjection)
    .from(crmShipments)
    .where(where)
    .orderBy(order(sortColumns[input.sortBy]), order(crmShipments.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const [totals] = await db
    .select({
      total: sql<number>`count(*)`,
      fromCount: sql<number>`coalesce(sum(case when ${crmShipments.direction} = 'from' then 1 else 0 end), 0)`,
      toCount: sql<number>`coalesce(sum(case when ${crmShipments.direction} = 'to' then 1 else 0 end), 0)`,
    })
    .from(crmShipments)
    .where(where);
  return {
    rows: rows.map(safeRow),
    total: Number(totals?.total ?? 0),
    fromCount: Number(totals?.fromCount ?? 0),
    toCount: Number(totals?.toCount ?? 0),
  };
}

export async function getShipmentReportRows(
  input: ShipmentReportInput
): Promise<ShipmentRecord[]> {
  const db = await requireDb();
  const where =
    input.shipmentId !== undefined
      ? eq(crmShipments.id, input.shipmentId)
      : shipmentWhere(input.filters ?? EMPTY_SHIPMENT_FILTERS);
  const rows = await db
    .select(shipmentProjection)
    .from(crmShipments)
    .where(where)
    .orderBy(asc(crmShipments.shipmentDate), asc(crmShipments.id))
    .limit(input.shipmentId !== undefined ? 1 : SHIPMENT_REPORT_LIMIT + 1);
  if (input.shipmentId !== undefined && rows.length === 0) {
    throw new ShipmentError("NOT_FOUND", "This shipment could not be found.");
  }
  if (rows.length > SHIPMENT_REPORT_LIMIT) {
    throw new ShipmentError(
      "REPORT_TOO_LARGE",
      "This report exceeds 5,000 shipments. Please narrow the date range or filters and try again."
    );
  }
  return rows.map(safeRow);
}

const payloadFields = [
  "shipmentDate",
  "companyName",
  "shipmentNumber",
  "direction",
  "partyName",
  "driveUrl",
  "recordedByName",
  "notificationEmail",
] as const;
type ReplayRow = ShipmentRecord & { createdByUserId: number };
function replayResult(
  row: ReplayRow,
  input: ShipmentCreateInput,
  creatorId: number
): ShipmentCreateResult {
  if (
    row.createdByUserId !== creatorId ||
    payloadFields.some(field => row[field] !== input[field])
  ) {
    throw new ShipmentError(
      "CONFLICT",
      "This request key has already been used. Submit this shipment with a new request key."
    );
  }
  return { row: safeRow(row), created: false };
}

// Drizzle wraps driver errors in .cause. Do not inspect/return SQL or error messages.
function isDuplicateKey(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      code?: unknown;
      errno?: unknown;
      cause?: unknown;
    };
    if (candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062)
      return true;
    current = candidate.cause;
  }
  return false;
}

export async function createShipment(
  input: ShipmentCreateInput,
  creatorId: number
): Promise<ShipmentCreateResult> {
  const db = await requireDb();
  const findReplay = async () => {
    const [row] = await db
      .select(replayProjection)
      .from(crmShipments)
      .where(eq(crmShipments.requestKey, input.requestKey))
      .limit(1);
    return row;
  };
  const previous = await findReplay();
  if (previous) return replayResult(previous, input, creatorId);

  // Explicit payload whitelist: creator and timestamps cannot come from input.
  const entry: ShipmentEntry = {
    shipmentDate: input.shipmentDate,
    companyName: input.companyName,
    shipmentNumber: input.shipmentNumber,
    direction: input.direction,
    partyName: input.partyName,
    driveUrl: input.driveUrl,
    recordedByName: input.recordedByName,
    notificationEmail: input.notificationEmail,
  };
  let id: number;
  try {
    // A plain INSERT plus the unique requestKey is the race arbiter. Never update,
    // replace or insert-ignore: another creator's/payload's shipment stays intact.
    const [inserted] = await db
      .insert(crmShipments)
      .values({
        ...entry,
        requestKey: input.requestKey,
        createdByUserId: creatorId,
        notificationStatus: "sending",
      })
      .$returningId();
    if (!inserted) throw new Error("Shipment insert returned no ID");
    id = inserted.id;
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const winner = await findReplay();
    if (!winner) throw error;
    return replayResult(winner, input, creatorId);
  }
  const [created] = await db
    .select(shipmentProjection)
    .from(crmShipments)
    .where(eq(crmShipments.id, id))
    .limit(1);
  if (!created) throw new Error("Created shipment could not be read");
  // Only this winning insert can reach mail. Replays, failed sends and lost
  // responses never retry mail; no transaction/outbox can roll back the save.
  const row = safeRow(created);
  let sent = false;
  try {
    sent = await notifyShipmentCreated(row);
  } catch {
    console.warn("[Shipments] Notification could not be completed.");
  }
  const notificationStatus = sent ? "sent" : "failed";
  const notificationSentAt = sent ? new Date() : null;
  try {
    const [updated] = await db.update(crmShipments)
      .set({ notificationStatus, notificationSentAt })
      .where(and(eq(crmShipments.id, id), eq(crmShipments.notificationStatus, "sending")));
    if (updated.affectedRows !== 1) throw new Error("Notification state not confirmed");
    return { row: { ...row, notificationStatus, notificationSentAt }, created: true };
  } catch {
    console.warn("[Shipments] Notification status could not be confirmed.");
    // Best effort to make uncertainty durable. This is a state write only,
    // never a second email; a DB outage may leave the stored state as sending.
    try {
      await db.update(crmShipments)
        .set({ notificationStatus: "unknown", notificationSentAt: null })
        .where(eq(crmShipments.id, id));
    } catch {
      // Intentionally omit raw DB/provider details.
    }
    return {
      row: { ...row, notificationStatus: "unknown", notificationSentAt: null },
      created: true,
    };
  }
}
