import { and, eq, isNull, or } from "drizzle-orm";
import { clientPortalSessions, clientPortalUsers } from "../drizzle/schema";
import { hashPortalPassword } from "../server/clientPortalAuth";
import { getDb } from "../server/db";

const identifier = process.env.PORTAL_IDENTIFIER?.trim().toLowerCase();
const password = process.env.PORTAL_PASSWORD;
if (!identifier || !password || password.length < 10 || Buffer.byteLength(password, "utf8") > 72) throw new Error("A valid PORTAL_IDENTIFIER and 10–72 byte PORTAL_PASSWORD are required");
const db = await getDb();
if (!db) throw new Error("Database unavailable");
const [user] = await db.select().from(clientPortalUsers).where(or(eq(clientPortalUsers.username, identifier), eq(clientPortalUsers.email, identifier))).limit(1);
if (!user || user.accountType !== "client") throw new Error("Client portal account not found");
await db.update(clientPortalUsers).set({ passwordHash: await hashPortalPassword(password), mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null }).where(eq(clientPortalUsers.id, user.id));
await db.update(clientPortalSessions).set({ revokedAt: new Date() }).where(and(eq(clientPortalSessions.portalUserId, user.id), isNull(clientPortalSessions.revokedAt)));
console.log(JSON.stringify({ reset: true, username: user.username, email: user.email, mustChangePassword: true }));
process.exit(0);
