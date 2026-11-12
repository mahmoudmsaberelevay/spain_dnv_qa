import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  contracts,
  contractDocusignEnvelopes,
  contractDocusignSyncSettings,
  type ContractDocusignSyncSetting,
} from "../drizzle/schema";
import { getDb } from "./db";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { sdk } from "./_core/sdk";
import {
  configReadiness,
  DocusignError,
  getDocusignConfig,
  UUID,
} from "./contractDocusignConfig";
import {
  getContractDocusignService,
  POLL_INTERVAL_MS,
} from "./contractDocusignService";

const SINGLETON_ID = 1;
const JOB = {
  name: "elevay-docusign-contract-status",
  cron: "0 */15 * * * *",
  path: "/api/scheduled/contract-docusign-sync",
};
const LEASE_MS = 120_000;
const RUN_MS = 80_000;
const BATCH_LIMIT = 6;
const CREATE_PENDING = "SCHEDULE_CREATE_PENDING";
const CREATE_UNCERTAIN = "SCHEDULE_CREATE_UNCERTAIN";
const SAFE_CODES = new Set([
  "SYNC_OPERATION_FAILED",
  "DATABASE_UNAVAILABLE",
  "PRODUCTION_REQUIRED",
  "SETTINGS_REQUIRED",
  "OWNER_SESSION_REQUIRED",
  "SYNC_BUSY",
  "SCHEDULE_RECONCILIATION_REQUIRED",
  CREATE_PENDING,
  CREATE_UNCERTAIN,
  "SCHEDULE_UPDATE_FAILED",
  "SYNC_CHECK_FAILED",
  "SYNC_DEADLINE_EXCEEDED",
  "SYNC_LEASE_LOST",
  "CRON_ONLY",
  "ORPHAN",
  "DISABLED",
  "NOT_PRODUCTION",
  "BUSY",
]);
const safeCode = (error: unknown, fallback = "SYNC_OPERATION_FAILED") =>
  error instanceof DocusignError && SAFE_CODES.has(error.safeCode)
    ? error.safeCode
    : fallback;
const fail = (code: string): never => {
  throw new DocusignError(code);
};
const token = () => randomBytes(32).toString("hex");
const hasLiveLease = (row: ContractDocusignSyncSetting, now: number) =>
  !!row.leaseToken && (row.leaseExpiresAt ?? 0) > now;
const uncertainCreate = (row: ContractDocusignSyncSetting) =>
  !row.scheduleCronTaskUid &&
  [CREATE_PENDING, CREATE_UNCERTAIN].includes(row.lastErrorCode ?? "");
async function database() {
  const db = await getDb();
  if (!db) throw new DocusignError("DATABASE_UNAVAILABLE");
  return db;
}

/** Read-only local status; no provider, scheduler calls, key material or task credentials. */
export async function getContractDocusignSyncStatus() {
  try {
    const ready = configReadiness();
    const db = await database();
    const [row] = await db
      .select()
      .from(contractDocusignSyncSettings)
      .where(eq(contractDocusignSyncSettings.id, SINGLETON_ID))
      .limit(1);
    const canEnable = ready.configured && ready.environment === "production";
    return {
      enabled: canEnable && row?.enabled === true,
      environment: ready.environment,
      canEnable,
      scheduleExists: !!row?.scheduleCronTaskUid,
      busy: !!row && hasLiveLease(row, Date.now()),
      reconciliationRequired: !!row && uncertainCreate(row),
      lastRunAt: row?.lastRunAt ?? null,
      lastErrorCode:
        row?.lastErrorCode && SAFE_CODES.has(row.lastErrorCode)
          ? row.lastErrorCode
          : row?.lastErrorCode
            ? "SYNC_OPERATION_FAILED"
            : null,
    };
  } catch (error) {
    throw new DocusignError(safeCode(error));
  }
}

/** The router MUST independently require a signed, real project-owner session.
 * No bootstrap/deploy/environment transition ever opts the owner in.
 * SDK calls happen after the reservation transaction has committed.
 */
export async function configureContractDocusignSync(
  enabled: boolean,
  sessionToken: string
) {
  let reservation:
    | {
        lease: string;
        uid: string | null;
        create: boolean;
        unresolvedCreate: boolean;
      }
    | undefined;
  try {
    if (!sessionToken?.trim()) fail("OWNER_SESSION_REQUIRED");
    const ready = configReadiness();
    if (enabled && ready.environment !== "production")
      fail("PRODUCTION_REQUIRED");
    if (enabled && !ready.configured) fail("SETTINGS_REQUIRED");
    const db = await database();
    // Only configuration initializes the singleton. Status and callbacks never adopt a UID.
    await db
      .insert(contractDocusignSyncSettings)
      .values({ id: SINGLETON_ID, enabled: false })
      .onDuplicateKeyUpdate({ set: { id: SINGLETON_ID } });
    reservation = await db.transaction(async tx => {
      const [row] = await tx
        .select()
        .from(contractDocusignSyncSettings)
        .where(eq(contractDocusignSyncSettings.id, SINGLETON_ID))
        .limit(1)
        .for("update");
      if (!row) fail("DATABASE_UNAVAILABLE");
      if (hasLiveLease(row, Date.now())) fail("SYNC_BUSY");
      if (enabled && uncertainCreate(row))
        fail("SCHEDULE_RECONCILIATION_REQUIRED");
      const lease = token();
      const create = enabled && !row.scheduleCronTaskUid;
      // Pause locally first. A failed remote pause can never authorize callback work.
      await tx
        .update(contractDocusignSyncSettings)
        .set({
          enabled: false,
          leaseToken: lease,
          leaseExpiresAt: Date.now() + LEASE_MS,
          ...(create ? { lastErrorCode: CREATE_PENDING } : {}),
        })
        .where(eq(contractDocusignSyncSettings.id, SINGLETON_ID));
      return {
        lease,
        uid: row.scheduleCronTaskUid,
        create,
        unresolvedCreate: uncertainCreate(row),
      };
    });
    let uid = reservation.uid;
    if (ready.environment === "production") {
      if (reservation.create) {
        const job = await createHeartbeatJob(JOB, sessionToken);
        if (
          typeof job.taskUid !== "string" ||
          !/^[A-Za-z0-9_-]{1,65}$/.test(job.taskUid)
        )
          fail(CREATE_UNCERTAIN);
        uid = job.taskUid; // Only a fresh, authenticated SDK response supplies the initial UID.
      } else if (uid) {
        await updateHeartbeatJob(
          uid,
          {
            ...(!enabled ? {} : { cron: JOB.cron, path: JOB.path }),
            enable: enabled,
          },
          sessionToken
        );
      }
    } // DEMO always stays disabled and makes zero scheduler/provider calls, including pause.
    const owned = await db.transaction(async tx => {
      const [row] = await tx
        .select()
        .from(contractDocusignSyncSettings)
        .where(
          and(
            eq(contractDocusignSyncSettings.id, SINGLETON_ID),
            eq(contractDocusignSyncSettings.leaseToken, reservation!.lease)
          )
        )
        .limit(1)
        .for("update");
      if (!row) return false;
      // Do not clear an unresolved create marker merely because the owner pauses locally.
      await tx
        .update(contractDocusignSyncSettings)
        .set({
          scheduleCronTaskUid: uid,
          enabled: enabled && ready.environment === "production",
          leaseToken: null,
          leaseExpiresAt: null,
          lastErrorCode: !uid && uncertainCreate(row) ? CREATE_UNCERTAIN : null,
        })
        .where(
          and(
            eq(contractDocusignSyncSettings.id, SINGLETON_ID),
            eq(contractDocusignSyncSettings.leaseToken, reservation!.lease)
          )
        );
      return true;
    });
    if (!owned) fail("SYNC_LEASE_LOST");
    return await getContractDocusignSyncStatus();
  } catch (error) {
    if (reservation) {
      try {
        const db = await database();
        await db
          .update(contractDocusignSyncSettings)
          .set({
            enabled: false,
            leaseToken: null,
            leaseExpiresAt: null,
            lastErrorCode:
              reservation.create || reservation.unresolvedCreate
                ? CREATE_UNCERTAIN
                : "SCHEDULE_UPDATE_FAILED",
          })
          .where(
            and(
              eq(contractDocusignSyncSettings.id, SINGLETON_ID),
              eq(contractDocusignSyncSettings.leaseToken, reservation.lease)
            )
          );
      } catch {
        /* A persisted CREATE_PENDING reservation also blocks blind re-creation. */
      }
    }
    throw new DocusignError(
      reservation?.create
        ? CREATE_UNCERTAIN
        : safeCode(
            error,
            reservation ? "SCHEDULE_UPDATE_FAILED" : "SYNC_OPERATION_FAILED"
          )
    );
  }
}

type Counts = { selected: number; checked: number; failed: number };
const nonDemoCode = (value: string) => !/^DS-DEMO/i.test(value);

/** HTTP response contains fixed codes and aggregates only, never raw exceptions or context. */
export async function scheduledContractDocusignSyncHandler(
  req: Request,
  res: Response
) {
  res.setHeader("Cache-Control", "no-store, private");
  let taskUid: string;
  try {
    const user = await sdk.authenticateRequest(req);
    if (
      user.isCron !== true ||
      typeof user.taskUid !== "string" ||
      !/^[A-Za-z0-9_-]{1,65}$/.test(user.taskUid)
    )
      return res.status(403).json({ ok: false, safeCode: "CRON_ONLY" });
    taskUid = user.taskUid;
  } catch {
    return res.status(403).json({ ok: false, safeCode: "CRON_ONLY" });
  }

  let lease: string | undefined;
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const counts: Counts = { selected: 0, checked: 0, failed: 0 };
  let runError: string | null = null;
  let responseCode = 200;
  try {
    const db = await database();
    // Never read req.body, task names or singleton fallback to bind authenticated cron calls.
    const [settings] = await db
      .select()
      .from(contractDocusignSyncSettings)
      .where(eq(contractDocusignSyncSettings.scheduleCronTaskUid, taskUid))
      .limit(1);
    if (!settings || settings.id !== SINGLETON_ID)
      return res.json({ ok: true, safeCode: "ORPHAN" });
    if (!settings.enabled) return res.json({ ok: true, safeCode: "DISABLED" });
    const ready = configReadiness();
    if (ready.environment !== "production")
      return res.json({ ok: true, safeCode: "NOT_PRODUCTION" });
    if (!ready.configured) fail("SETTINGS_REQUIRED");
    const { accountId, environment } = getDocusignConfig();
    if (environment !== "production" || !UUID.test(accountId))
      fail("SETTINGS_REQUIRED");
    const acquired = await db.transaction(async tx => {
      const [row] = await tx
        .select()
        .from(contractDocusignSyncSettings)
        .where(eq(contractDocusignSyncSettings.scheduleCronTaskUid, taskUid))
        .limit(1)
        .for("update");
      if (
        !row ||
        row.id !== SINGLETON_ID ||
        !row.enabled ||
        hasLiveLease(row, Date.now())
      )
        return null;
      const lease = token();
      await tx
        .update(contractDocusignSyncSettings)
        .set({ leaseToken: lease, leaseExpiresAt: Date.now() + LEASE_MS })
        .where(
          and(
            eq(contractDocusignSyncSettings.scheduleCronTaskUid, taskUid),
            eq(contractDocusignSyncSettings.id, SINGLETON_ID)
          )
        );
      return lease;
    });
    if (!acquired) return res.json({ ok: true, safeCode: "BUSY" });
    lease = acquired;
    const deadline = Date.now() + RUN_MS;
    const operation = async () => {
      const cutoff = new Date(Date.now() - POLL_INTERVAL_MS);
      const rows = await db
        .select({
          envelope: contractDocusignEnvelopes,
          sourceStatus: contracts.status,
          sourceCode: contracts.contractCode,
        })
        .from(contractDocusignEnvelopes)
        .innerJoin(
          contracts,
          eq(contracts.id, contractDocusignEnvelopes.contractId)
        )
        .where(
          and(
            eq(contractDocusignEnvelopes.environment, "production"),
            eq(contractDocusignEnvelopes.accountId, accountId),
            isNotNull(contractDocusignEnvelopes.providerEnvelopeId),
            inArray(contractDocusignEnvelopes.status, [
              "draft",
              "sent",
              "delivered",
              "completed",
              "error",
              "uncertain",
            ]),
            sql`JSON_UNQUOTE(JSON_EXTRACT(${contractDocusignEnvelopes.documentSourceSnapshot}, '$.completionProfile')) = 'verified-production-v1'`,
            sql`(JSON_EXTRACT(${contractDocusignEnvelopes.documentSourceSnapshot}, '$.syncCompletedAt') IS NULL OR JSON_TYPE(JSON_EXTRACT(${contractDocusignEnvelopes.documentSourceSnapshot}, '$.syncCompletedAt')) = 'NULL')`,
            or(
              eq(contracts.status, "pending"),
              eq(contractDocusignEnvelopes.status, "completed")
            ),
            sql`UPPER(${contracts.contractCode}) NOT LIKE 'DS-DEMO%'`,
            sql`UPPER(JSON_UNQUOTE(JSON_EXTRACT(${contractDocusignEnvelopes.documentSourceSnapshot}, '$.contractCode'))) NOT LIKE 'DS-DEMO%'`,
            or(
              isNull(contractDocusignEnvelopes.lastCheckAttemptAt),
              lte(contractDocusignEnvelopes.lastCheckAttemptAt, cutoff)
            ),
            or(
              isNull(contractDocusignEnvelopes.lastCheckedAt),
              lte(contractDocusignEnvelopes.lastCheckedAt, cutoff)
            )
          )
        )
        .orderBy(
          asc(contractDocusignEnvelopes.lastCheckAttemptAt),
          asc(contractDocusignEnvelopes.createdAt)
        )
        .limit(BATCH_LIMIT);
      // Defense in depth: never rely on an overly broad/mock/stale query to authorize work.
      const eligible = rows
        .slice(0, BATCH_LIMIT)
        .filter(
          ({ envelope: row, sourceStatus, sourceCode }) =>
            row.environment === "production" &&
            row.accountId === accountId &&
            UUID.test(row.providerEnvelopeId ?? "") &&
            row.documentSourceSnapshot.completionProfile ===
              "verified-production-v1" &&
            row.documentSourceSnapshot.syncCompletedAt == null &&
            [
              "draft",
              "sent",
              "delivered",
              "completed",
              "error",
              "uncertain",
            ].includes(row.status) &&
            (sourceStatus === "pending" || row.status === "completed") &&
            nonDemoCode(sourceCode) &&
            nonDemoCode(row.documentSourceSnapshot.contractCode) &&
            (!row.lastCheckAttemptAt ||
              row.lastCheckAttemptAt.getTime() <= cutoff.getTime()) &&
            (!row.lastCheckedAt ||
              row.lastCheckedAt.getTime() <= cutoff.getTime())
        );
      counts.selected = eligible.length;
      for (const { envelope: row } of eligible) {
        if (!active || Date.now() >= deadline) fail("SYNC_DEADLINE_EXCEEDED");
        const [owned] = await db
          .select({ id: contractDocusignSyncSettings.id })
          .from(contractDocusignSyncSettings)
          .where(
            and(
              eq(contractDocusignSyncSettings.scheduleCronTaskUid, taskUid),
              eq(contractDocusignSyncSettings.leaseToken, lease!),
              eq(contractDocusignSyncSettings.enabled, true),
              sql`${contractDocusignSyncSettings.leaseExpiresAt} > ${Date.now()}`
            )
          )
          .limit(1);
        if (!owned) fail("SYNC_LEASE_LOST");
        if (!active || Date.now() >= deadline) fail("SYNC_DEADLINE_EXCEEDED");
        // refresh owns its own durable per-envelope reservation and strict completion proof.
        // Scheduler never marks contracts Signed or changes financial records directly.
        try {
          const result = await getContractDocusignService().refresh(row.id);
          if (!active) return;
          counts.checked++;
          if (result.errorCode) {
            counts.failed++;
            runError = "SYNC_CHECK_FAILED";
          }
        } catch {
          if (!active) return;
          counts.failed++;
          runError = "SYNC_CHECK_FAILED";
        }
      }
    };
    // Hard response budget. A refresh already reserved may finish safely in the service;
    // active=false and fencing prohibit this timed-out runner from starting another row.
    await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          active = false;
          reject(new DocusignError("SYNC_DEADLINE_EXCEEDED"));
        }, RUN_MS);
      }),
    ]);
  } catch (error) {
    runError = safeCode(error);
    responseCode = 500;
  } finally {
    active = false;
    clearTimeout(timer);
    if (lease) {
      try {
        const db = await database();
        await db
          .update(contractDocusignSyncSettings)
          .set({
            leaseToken: null,
            leaseExpiresAt: null,
            lastRunAt: Date.now(),
            lastErrorCode: runError,
          })
          .where(
            and(
              eq(contractDocusignSyncSettings.scheduleCronTaskUid, taskUid),
              eq(contractDocusignSyncSettings.leaseToken, lease)
            )
          );
      } catch {
        runError = "SYNC_OPERATION_FAILED";
        responseCode = 500;
      }
    }
  }
  return res.status(responseCode).json({
    ok: responseCode === 200,
    ...(runError ? { safeCode: runError } : {}),
    ...counts,
  });
}
