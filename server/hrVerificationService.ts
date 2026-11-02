import { desc, eq } from "drizzle-orm";
import { hrPunchAttempts, hrSettings } from "../drizzle/schema";
import { getDb } from "./db";
import { isHrAdministrator } from "../shared/hrAccess";
import {
  DEFAULT_HR_VERIFICATION,
  describeHrVerification,
  HrLocation,
  verifyHrPunchLocation,
} from "../shared/hrVerification";

export async function getHrVerificationSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .select()
    .from(hrSettings)
    .where(eq(hrSettings.id, 1))
    .limit(1);
  return row
    ? {
        verificationMethod: row.verificationMethod,
        officeLatitude: Number(row.officeLatitude),
        officeLongitude: Number(row.officeLongitude),
        radiusMeters: row.radiusMeters,
        maxAccuracyMeters: row.maxAccuracyMeters,
      }
    : { ...DEFAULT_HR_VERIFICATION };
}
export async function getHrVerificationStatus() {
  return describeHrVerification(await getHrVerificationSettings());
}
export async function validateHrPunch(
  location: HrLocation | undefined,
  now = new Date()
) {
  return verifyHrPunchLocation(
    await getHrVerificationSettings(),
    location,
    now.getTime()
  );
}
export async function recordHrPunchAttempt(
  userId: number,
  action: "in" | "out",
  accepted: boolean,
  reason: string,
  location: HrLocation | undefined,
  distanceMeters: number | null,
  userAgent?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(hrPunchAttempts).values({
    userId,
    action,
    accepted,
    reason: reason.slice(0, 300),
    latitude: location ? String(location.latitude) : null,
    longitude: location ? String(location.longitude) : null,
    accuracyMeters: location ? String(location.accuracy) : null,
    distanceMeters:
      distanceMeters === null ? null : String(distanceMeters.toFixed(2)),
    userAgent: userAgent?.slice(0, 500) ?? null,
  });
}
export async function saveHrVerificationSettings(
  actorId: number,
  input: {
    verificationMethod: "pending" | "geofence" | "strict_wifi" | "both";
    officeLatitude: number;
    officeLongitude: number;
    radiusMeters: number;
    maxAccuracyMeters: number;
    reason: string;
  }
) {
  if (!isHrAdministrator({ id: actorId }))
    throw new Error("HR Admin access required");
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { reason: _reason, ...values } = input;
  const data = {
    ...values,
    officeLatitude: String(values.officeLatitude),
    officeLongitude: String(values.officeLongitude),
    changedByUserId: actorId,
  };
  await db
    .insert(hrSettings)
    .values({ id: 1, ...data })
    .onDuplicateKeyUpdate({ set: data });
  return getHrVerificationStatus();
}
export async function getHrRecentPunchAttempts() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(hrPunchAttempts)
    .orderBy(desc(hrPunchAttempts.createdAt))
    .limit(100);
}
