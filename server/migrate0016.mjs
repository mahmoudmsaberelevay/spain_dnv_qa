import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("No DATABASE_URL"); process.exit(1); }

const conn = await mysql.createConnection(DATABASE_URL);
console.log("Connected. Running migration 0016...");

const statements = [
  "ALTER TABLE `invoices` MODIFY COLUMN `contractId` int",
  "ALTER TABLE `invoices` MODIFY COLUMN `contractCode` varchar(32)",
  "ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `isLegacyReceipt` boolean DEFAULT false NOT NULL",
  "ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `legacyFinClientId` int",
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 60));
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("Already exists, skipping:", sql.slice(0, 60));
    } else {
      console.error("Error:", e.message, "SQL:", sql);
    }
  }
}

await conn.end();
console.log("Migration 0016 complete.");
