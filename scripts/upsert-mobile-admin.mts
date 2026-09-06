import { randomUUID } from "crypto";
import { eq, or } from "drizzle-orm";
import { clientPortalSessions, clientPortalUsers } from "../drizzle/schema";
import { hashPortalPassword } from "../server/clientPortalAuth";
import { getDb } from "../server/db";

const email = process.env.MOBILE_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.MOBILE_ADMIN_PASSWORD;
if (!email || !password) throw new Error("MOBILE_ADMIN_EMAIL and MOBILE_ADMIN_PASSWORD are required");

const db = await getDb();
if (!db) throw new Error("Database unavailable");
const passwordHash = await hashPortalPassword(password);
const [existing] = await db.select().from(clientPortalUsers).where(or(eq(clientPortalUsers.email, email), eq(clientPortalUsers.username, email))).limit(1);

if (existing) {
  await db.update(clientPortalUsers).set({ username: email, email, passwordHash, accountType: "admin", primaryClientCaseId: null, status: "active", mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null }).where(eq(clientPortalUsers.id, existing.id));
  await db.update(clientPortalSessions).set({ revokedAt: new Date() }).where(eq(clientPortalSessions.portalUserId, existing.id));
  console.log(JSON.stringify({ updated: true, email, publicId: existing.publicId }));
} else {
  const publicId = randomUUID();
  await db.insert(clientPortalUsers).values({ publicId, primaryClientCaseId: null, username: email, email, passwordHash, accountType: "admin", status: "active", mustChangePassword: false, locale: "en", notificationPreferences: { push: false, email: true }, createdBy: 0 });
  console.log(JSON.stringify({ created: true, email, publicId }));
}

process.exit(0);
