/**
 * Migration: create userGroups and groupPermissions tables
 * Also adds groupId column to users table
 */
import { createConnection } from "mysql2/promise";

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL!);
  console.log("Connected to database");

  // Create userGroups table
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`userGroups\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`name\` varchar(100) NOT NULL,
      \`description\` text,
      \`color\` varchar(20) NOT NULL DEFAULT '#6366f1',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`userGroups_id\` PRIMARY KEY(\`id\`)
    )
  `);
  console.log("✓ userGroups table created");

  // Create groupPermissions table
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`groupPermissions\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`groupId\` int NOT NULL,
      \`pageKey\` varchar(100) NOT NULL,
      \`canAccess\` boolean NOT NULL DEFAULT false,
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`groupPermissions_id\` PRIMARY KEY(\`id\`)
    )
  `);
  console.log("✓ groupPermissions table created");

  // Add groupId column to users table (nullable FK)
  try {
    await conn.execute(`
      ALTER TABLE \`users\` ADD COLUMN \`groupId\` int NULL DEFAULT NULL
    `);
    console.log("✓ groupId column added to users table");
  } catch (e: any) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("→ groupId column already exists on users table, skipping");
    } else {
      throw e;
    }
  }

  await conn.end();
  console.log("Migration complete!");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
