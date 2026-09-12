import { asc, eq } from "drizzle-orm";
import { getDb } from "../server/db.ts";
import { ensureClientChatConversationForCase } from "../server/clientChatService.ts";
import { clientCases, clientChatConversations, users } from "../drizzle/schema.ts";

const db = await getDb();
if (!db) throw new Error("Database is not configured");

let owner = null;
if (process.env.OWNER_OPEN_ID) {
  [owner] = await db.select({ id: users.id }).from(users).where(eq(users.openId, process.env.OWNER_OPEN_ID)).limit(1);
}
if (!owner) {
  [owner] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).orderBy(asc(users.id)).limit(1);
}
if (!owner) throw new Error("No authorized staff owner or administrator is available for provisioning");

const folders = await db.select({ id: clientCases.id }).from(clientCases).orderBy(asc(clientCases.id));
const before = await db.select({ id: clientChatConversations.id }).from(clientChatConversations);
for (const folder of folders) {
  await ensureClientChatConversationForCase(folder.id, owner.id);
}

const conversations = await db.select({ id: clientChatConversations.id }).from(clientChatConversations);
const created = Math.max(0, conversations.length - before.length);
console.log(JSON.stringify({ folderCount: folders.length, created, existing: folders.length - created, conversationCount: conversations.length }));
process.exit(0);
