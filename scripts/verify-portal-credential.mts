import { eq, or } from "drizzle-orm";
import { clientPortalUsers } from "../drizzle/schema";
import { verifyPortalPassword } from "../server/clientPortalAuth";
import { getDb } from "../server/db";

const identifier = process.env.PORTAL_IDENTIFIER?.trim().toLowerCase();
const password = process.env.PORTAL_PASSWORD;
if (!identifier || !password) throw new Error("PORTAL_IDENTIFIER and PORTAL_PASSWORD are required");
const db = await getDb();
if (!db) throw new Error("Database unavailable");
const [user] = await db.select().from(clientPortalUsers).where(or(eq(clientPortalUsers.username, identifier), eq(clientPortalUsers.email, identifier))).limit(1);
console.log(JSON.stringify(user ? { found: true, username: user.username, email: user.email, accountType: user.accountType, status: user.status, mustChangePassword: user.mustChangePassword, failedLoginAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil, passwordMatches: await verifyPortalPassword(password, user.passwordHash) } : { found: false }));
process.exit(0);
