import { and, desc, eq } from "drizzle-orm";
import { gunzipSync } from "node:zlib";
import { databaseBackupRuns } from "../drizzle/schema";
import { decryptBackupBuffer, BACKUP_ENCRYPTION_METADATA } from "../server/backupEncryption";
import { getDb } from "../server/db";
import { storageGet } from "../server/storage";

const taskUid = "ekg7Ju3tix7vfk6qaWLb7c";
const db = await getDb();
if (!db) throw new Error("Database unavailable");

const [run] = await db.select().from(databaseBackupRuns)
  .where(and(eq(databaseBackupRuns.taskUid, taskUid), eq(databaseBackupRuns.status, "success")))
  .orderBy(desc(databaseBackupRuns.completedAt))
  .limit(1);
if (!run?.artifactKey || !run.artifactSizeBytes) throw new Error("Successful backup artifact not found");

const { url } = await storageGet(run.artifactKey);
const response = await fetch(url);
if (!response.ok) throw new Error(`Artifact retrieval failed with ${response.status}`);
const encrypted = Buffer.from(await response.arrayBuffer());
const compressed = decryptBackupBuffer(encrypted);
const sql = gunzipSync(compressed).toString("utf8");

const createTableCount = (sql.match(/CREATE TABLE/gi) ?? []).length;
const [tableRows] = await (db as any).execute(
  "SELECT COUNT(*) AS tableCount FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()"
);
const liveTableCount = Number((tableRows as Array<{ tableCount: number | string }>)[0]?.tableCount ?? 0);
const containsRestoreBoundaries = sql.includes("SET FOREIGN_KEY_CHECKS=0;") && sql.includes("SET FOREIGN_KEY_CHECKS=1;");

console.log(JSON.stringify({
  artifactDownloaded: true,
  sizeMatchesLedger: encrypted.length === run.artifactSizeBytes,
  encryption: BACKUP_ENCRYPTION_METADATA.algorithm,
  authenticatedDecryptionPassed: true,
  gzipValidationPassed: true,
  containsRestoreBoundaries,
  createTableCount,
  liveTableCount,
  completeSchemaCoverage: createTableCount === liveTableCount,
}));
process.exit(0);
