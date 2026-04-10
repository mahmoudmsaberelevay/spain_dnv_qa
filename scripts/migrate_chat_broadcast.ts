/**
 * One-time migration: create chatMessages, broadcasts, broadcastDismissals tables
 */
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const conn = await mysql.createConnection(url);

  const sqls = [
    `CREATE TABLE IF NOT EXISTS \`chatMessages\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`senderId\` int NOT NULL,
      \`receiverId\` int NOT NULL,
      \`content\` text NOT NULL,
      \`readAt\` timestamp,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`chatMessages_id\` PRIMARY KEY(\`id\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`broadcasts\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`authorId\` int NOT NULL,
      \`content\` text NOT NULL,
      \`isActive\` boolean NOT NULL DEFAULT true,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`broadcasts_id\` PRIMARY KEY(\`id\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`broadcastDismissals\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`userId\` int NOT NULL,
      \`broadcastId\` int NOT NULL,
      \`dismissedAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`broadcastDismissals_id\` PRIMARY KEY(\`id\`)
    )`,
  ];

  for (const sql of sqls) {
    try {
      await conn.execute(sql);
      console.log("OK:", sql.trim().slice(0, 60));
    } catch (e: any) {
      console.error("ERR:", e.message);
    }
  }

  await conn.end();
  console.log("Migration complete");
}

main().catch(console.error);
