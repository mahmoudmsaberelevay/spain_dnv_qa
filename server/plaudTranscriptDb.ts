import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql, { type PoolConnection } from "mysql2/promise";
import type { Response } from "express";
import { TRPCError } from "@trpc/server";
import {
  leadNotes,
  leadActivities,
  plaudTranscriptImports,
  users,
  leadsPermissions,
  auditLogs,
} from "../drizzle/schema";
import type {
  PlaudFetchedRecording,
  PlaudCataloguePage,
  PlaudRange,
} from "../shared/plaud";
import { getDb } from "./db";
import { requirePlaudImportLead } from "./plaudAccess";
import { hasScopedLeadAccess, type CallActor } from "./leadCallsAccess";
import {
  normalizePlaudTranscript,
  createTranscriptIdentity,
  parsePlaudRange,
  resolvePlaudTimeZone,
  effectivePlaudDate,
} from "./plaudTranscriptFormat";

const fail = (code: string): never => {
  throw new TRPCError({ code: "CONFLICT", message: code });
};
export async function storePlaudImport(
  actor: CallActor,
  leadId: number,
  recording: PlaudFetchedRecording
): Promise<{ noteId: number; alreadyImported: boolean }> {
  const transcript = normalizePlaudTranscript(recording.transcript);
  if (!transcript) fail("PLAUD_TRANSCRIPT_NOT_READY");
  // MEDIUMTEXT is a physical limit, never silently truncate an import.
  if (Buffer.byteLength(transcript, "utf8") > 16_000_000)
    fail("PLAUD_TRANSCRIPT_TOO_LARGE");
  if (
    !/^[a-f0-9]{64}$/.test(recording.sourceScope) ||
    !recording.id ||
    recording.id.length > 255
  )
    fail("PLAUD_SOURCE_INVALID");
  const identityHash = createTranscriptIdentity(
    recording.sourceScope,
    recording.id
  );
  const db = await getDb();
  if (!db) fail("PLAUD_DATABASE_UNAVAILABLE");
  try {
    return await db!.transaction(async tx => {
      // Serializes imports from the same employee and rechecks a current account.
      const [current] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, actor.id))
        .for("update");
      if (!current) fail("PLAUD_ACCOUNT_UNAVAILABLE");
      await requirePlaudImportLead(actor, leadId, tx);
      const [existing] = await tx
        .select({
          id: plaudTranscriptImports.id,
          noteId: plaudTranscriptImports.noteId,
          leadId: plaudTranscriptImports.leadId,
        })
        .from(plaudTranscriptImports)
        .where(eq(plaudTranscriptImports.identityHash, identityHash))
        .limit(1);
      if (existing) {
        if (existing.leadId !== leadId)
          fail("PLAUD_RECORDING_ALREADY_IMPORTED");
        const [note] = await tx
          .select({ id: leadNotes.id })
          .from(leadNotes)
          .where(
            and(eq(leadNotes.id, existing.noteId), eq(leadNotes.leadId, leadId))
          )
          .limit(1);
        if (!note) fail("PLAUD_IMPORTED_NOTE_REMOVED");
        return { noteId: note.id, alreadyImported: true };
      }
      const now = Date.now();
      const effective = effectivePlaudDate(recording.callAt, now);
      const callAt = effective.usesImportDate ? null : recording.callAt;
      const durationMs =
        Number.isSafeInteger(recording.durationMs) && recording.durationMs! >= 0
          ? recording.durationMs
          : null;
      const [inserted] = await tx
        .insert(leadNotes)
        .values({
          leadId,
          userId: actor.id,
          userName: actor.name?.slice(0, 255) ?? undefined,
          note: transcript,
          isPinned: false,
          isImportant: false,
          createdAt: now,
          updatedAt: now,
        });
      const noteId = inserted.insertId;
      await tx
        .insert(plaudTranscriptImports)
        .values({
          identityHash,
          source: "plaud",
          sourceScope: recording.sourceScope,
          recordingId: recording.id,
          leadId,
          noteId,
          importerId: actor.id,
          importerName: (actor.name ?? "CRM employee").slice(0, 255),
          recordingTitle: recording.title.slice(0, 500),
          callAt,
          effectiveAt: effective.effectiveAt,
          durationMs,
          transcript,
          transcriptHash: createHash("sha256").update(transcript).digest("hex"),
          importedAt: now,
        });
      await tx
        .insert(leadActivities)
        .values({
          leadId,
          userId: actor.id,
          activityType: "note_added",
          description:
            "Plaud transcript imported as a Lead note and shared in Train Your AI Agent",
          createdAt: now,
        });
      return { noteId, alreadyImported: false };
    });
  } catch (error: any) {
    if (error instanceof TRPCError) throw error;
    // Another employee can race the same scoped recording. Unique identity is authoritative.
    if (
      error?.code === "ER_DUP_ENTRY" ||
      error?.cause?.code === "ER_DUP_ENTRY"
    ) {
      const [existing] = await db!
        .select()
        .from(plaudTranscriptImports)
        .where(eq(plaudTranscriptImports.identityHash, identityHash))
        .limit(1);
      if (existing?.leadId === leadId) {
        const [note] = await db!
          .select({ id: leadNotes.id })
          .from(leadNotes)
          .where(
            and(eq(leadNotes.id, existing.noteId), eq(leadNotes.leadId, leadId))
          )
          .limit(1);
        if (note) return { noteId: note.id, alreadyImported: true };
      }
      fail("PLAUD_RECORDING_ALREADY_IMPORTED");
    }
    return fail("PLAUD_IMPORT_FAILED");
  }
}

let pool: mysql.Pool | undefined;
function cataloguePool() {
  if (!process.env.DATABASE_URL) fail("PLAUD_DATABASE_UNAVAILABLE");
  return (pool ??= mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 4,
    supportBigNumbers: true,
    bigNumberStrings: false,
  }));
}
export const PLAUD_ELIGIBLE_SQL = ` FROM plaud_transcript_imports p
 INNER JOIN lead_notes n ON n.id=p.noteId AND n.leadId=p.leadId
 INNER JOIN leads l ON l.id=p.leadId
 WHERE p.source='plaud' AND p.deletedAt IS NULL AND p.transcript IS NOT NULL
 AND LENGTH(TRIM(p.transcript)) > 0 AND p.sourceScope REGEXP '^[a-f0-9]{64}$'
 AND p.identityHash REGEXP '^[a-f0-9]{64}$' AND p.transcriptHash REGEXP '^[a-f0-9]{64}$'`;
export function catalogueScope(range: ReturnType<typeof parsePlaudRange>) {
  let where = PLAUD_ELIGIBLE_SQL;
  const params: number[] = [];
  if (range.fromUtc !== null) {
    where += " AND p.effectiveAt >= ?";
    params.push(range.fromUtc);
  }
  if (range.toUtcExclusive !== null) {
    where += " AND p.effectiveAt < ?";
    params.push(range.toUtcExclusive);
  }
  return { where, params };
}
export async function withPlaudSnapshot<T>(
  operation: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await cataloguePool().getConnection();
  try {
    await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await conn.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const value = await operation(conn);
    await conn.commit();
    return value;
  } catch (error) {
    await conn.rollback().catch(() => undefined);
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "PLAUD_SNAPSHOT_FAILED",
    });
  } finally {
    conn.release();
  }
}
export async function listPlaudCatalogue(
  actor: CallActor,
  input: PlaudRange & { page: number; pageSize: number }
): Promise<PlaudCataloguePage> {
  const timeZone = resolvePlaudTimeZone();
  const range = parsePlaudRange(input, timeZone);
  const { where, params } = catalogueScope(range);
  return withPlaudSnapshot(async conn => {
    const [counts]: any = await conn.query(
      "SELECT COUNT(*) total" + where,
      params
    );
    const total = Number(counts[0].total);
    const [rows]: any = await conn.query(
      `SELECT p.id,p.recordingTitle,p.callAt,p.effectiveAt,p.importedAt,p.importerName,p.durationMs,p.transcript,
      l.id leadId,l.fullName,l.assignedConsultantUserId,l.assignedTo` +
        where +
        " ORDER BY p.effectiveAt DESC,p.id DESC LIMIT ? OFFSET ?",
      [...params, input.pageSize, (input.page - 1) * input.pageSize]
    );
    const orm = drizzle(conn);
    const permissions = await orm
      .select()
      .from(leadsPermissions)
      .where(eq(leadsPermissions.userId, actor.id));
    const namedUsers =
      actor.role === "admin"
        ? []
        : await orm.select({ id: users.id, name: users.name }).from(users);
    const permission = permissions.length === 1 ? permissions[0] : null;
    return {
      items: rows.map((row: any) => ({
        id: row.id,
        title: row.recordingTitle,
        callAt: row.callAt === null ? null : Number(row.callAt),
        importedAt: Number(row.importedAt),
        effectiveAt: Number(row.effectiveAt),
        usesImportDate: row.callAt === null,
        importerName: row.importerName,
        durationMs: row.durationMs === null ? null : Number(row.durationMs),
        transcript: row.transcript,
        lead: hasScopedLeadAccess(actor, row, permission, namedUsers)
          ? {
              name: row.fullName,
              code: String(row.leadId),
              path: `/leads/${row.leadId}`,
            }
          : null,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      timeZone,
    };
  });
}

/** Stream the entire matching range in one repeatable-read snapshot, with bounded
 * batches, backpressure, no public storage and no transcript-bearing temp files. */
export async function streamPlaudExport(
  actor: CallActor,
  rangeInput: PlaudRange,
  res: Response
) {
  const timeZone = resolvePlaudTimeZone();
  const range = parsePlaudRange(rangeInput, timeZone, true);
  const { where, params } = catalogueScope(range);
  let auditId: number | undefined,
    requestedCount = 0,
    emittedCount = 0;
  const auditDb = await getDb();
  if (!auditDb) fail("PLAUD_AUDIT_UNAVAILABLE");
  const auditDetails = (status: string) =>
    JSON.stringify({
      from: range.from,
      to: range.to,
      timeZone,
      count: requestedCount,
      status,
      emittedCount,
    });
  try {
    const result = await withPlaudSnapshot(async conn => {
      const [counts]: any = await conn.query(
        "SELECT COUNT(*) total" + where,
        params
      );
      const total = Number(counts[0].total);
      if (!total)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No Plaud transcripts found for this date range",
        });
      requestedCount = total;
      // Independent autocommit path: a later snapshot rollback must not erase the
      // record of transcript bytes already disclosed to this authenticated user.
      const [audit] = await auditDb!
        .insert(auditLogs)
        .values({
          userId: actor.id,
          userEmail: actor.email,
          userName: actor.name,
          action: "export_attempt",
          resource: "plaud_transcripts",
          details: auditDetails("started"),
          createdAt: Date.now(),
        });
      auditId = audit.insertId;
      if (!Number.isSafeInteger(auditId) || auditId! < 1)
        fail("PLAUD_AUDIT_UNAVAILABLE");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="plaud_transcripts_${range.from}_to_${range.to}.txt"`
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Plaud-Transcript-Count", String(total));
      let cursorAt = Number.MIN_SAFE_INTEGER,
        cursorId = 0,
        written = 0;
      while (written < total) {
        const [rows]: any = await conn.query(
          "SELECT p.id,p.effectiveAt,p.transcript,p.transcriptHash" +
            where +
            " AND (p.effectiveAt > ? OR (p.effectiveAt=? AND p.id>?)) ORDER BY p.effectiveAt ASC,p.id ASC LIMIT 100",
          [...params, cursorAt, cursorAt, cursorId]
        );
        if (!rows.length) fail("PLAUD_EXPORT_SNAPSHOT_CHANGED");
        for (const row of rows) {
          if (res.destroyed) throw new Error("closed");
          const text = normalizePlaudTranscript(row.transcript);
          if (
            !text ||
            createHash("sha256").update(text).digest("hex") !==
              row.transcriptHash
          )
            fail("PLAUD_EXPORT_INTEGRITY_FAILED");
          const chunk = (written ? "\n\n\n" : "") + text;
          const drained = res.write(chunk, "utf8");
          emittedCount++;
          if (!drained)
            await new Promise<void>((resolve, reject) => {
              const cleanup = () => {
                res.off("drain", onDrain);
                res.off("close", onClose);
                res.off("error", onClose);
              };
              const onDrain = () => {
                cleanup();
                resolve();
              };
              const onClose = () => {
                cleanup();
                reject(new Error("closed"));
              };
              res.once("drain", onDrain);
              res.once("close", onClose);
              res.once("error", onClose);
            });
          written++;
          cursorAt = Number(row.effectiveAt);
          cursorId = row.id;
        }
      }
      if (written !== total) fail("PLAUD_EXPORT_COUNT_MISMATCH");
      return { count: total };
    });
    await auditDb!
      .update(auditLogs)
      .set({ action: "export", details: auditDetails("completed") })
      .where(eq(auditLogs.id, auditId!));
    return result;
  } catch (error) {
    // Failure to update cannot erase the independently committed attempt. It
    // remains explicitly non-completed; never log data or provider exceptions.
    if (auditId)
      await auditDb!
        .update(auditLogs)
        .set({ action: "export_failed", details: auditDetails("failed") })
        .where(eq(auditLogs.id, auditId))
        .catch(() => undefined);
    throw error;
  }
}
