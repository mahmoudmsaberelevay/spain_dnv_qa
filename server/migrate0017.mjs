import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);
const sqls = [
  "ALTER TABLE `groupPermissions` ADD `canEdit` boolean DEFAULT false NOT NULL",
  "ALTER TABLE `groupPermissions` ADD `canCreate` boolean DEFAULT false NOT NULL",
  "ALTER TABLE `userPermissions` ADD `canEdit` boolean DEFAULT false NOT NULL",
  "ALTER TABLE `userPermissions` ADD `canCreate` boolean DEFAULT false NOT NULL",
];
for (const sql of sqls) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 60));
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("Already exists, skipping:", sql.slice(0, 60));
    } else {
      throw e;
    }
  }
}
await conn.end();
console.log("Migration 0017 complete.");
