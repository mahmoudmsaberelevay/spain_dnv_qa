import "dotenv/config";
import mysql from "mysql2/promise";

const sql = `
CREATE TABLE IF NOT EXISTS \`userPermissions\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`userId\` int NOT NULL,
  \`pageKey\` varchar(100) NOT NULL,
  \`canAccess\` boolean NOT NULL DEFAULT false,
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`userPermissions_id\` PRIMARY KEY(\`id\`)
);

CREATE TABLE IF NOT EXISTS \`pendingInvites\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`email\` varchar(320) NOT NULL,
  \`token\` varchar(64) NOT NULL,
  \`invitePermissions\` json NOT NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`usedAt\` timestamp,
  \`usedByUserId\` int,
  CONSTRAINT \`pendingInvites_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`pendingInvites_token_unique\` UNIQUE(\`token\`)
);
`;

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await conn.execute(stmt);
    console.log("✓", stmt.slice(0, 60));
  }
  await conn.end();
  console.log("Migration complete.");
}

run().catch(e => { console.error(e); process.exit(1); });
