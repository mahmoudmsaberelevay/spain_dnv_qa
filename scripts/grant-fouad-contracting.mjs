import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("No DATABASE_URL"); process.exit(1); }

const conn = await mysql.createConnection(DATABASE_URL);

// Find Fouad's user ID
const [rows] = await conn.execute(
  "SELECT id, email FROM users WHERE LOWER(email) = ?",
  ["fouad.abdo@elevay.com"]
);
console.log("Found users:", rows);

if (!rows.length) {
  console.error("Fouad not found in users table — he may not have logged in yet.");
  await conn.end();
  process.exit(1);
}

const userId = rows[0].id;
console.log("Fouad user ID:", userId);

// Check existing permissions for contracting
const [existing] = await conn.execute(
  "SELECT * FROM userPermissions WHERE userId = ? AND pageKey = 'contracting'",
  [userId]
);
console.log("Existing contracting permissions:", existing);

if (existing.length > 0) {
  // Update existing row
  await conn.execute(
    "UPDATE userPermissions SET canAccess = 1, canEdit = 1, canCreate = 1 WHERE userId = ? AND pageKey = 'contracting'",
    [userId]
  );
  console.log("Updated existing contracting permission for Fouad.");
} else {
  // Insert new row
  await conn.execute(
    "INSERT INTO userPermissions (userId, pageKey, canAccess, canEdit, canCreate) VALUES (?, 'contracting', 1, 1, 1)",
    [userId]
  );
  console.log("Inserted new contracting permission for Fouad.");
}

// Verify
const [verify] = await conn.execute(
  "SELECT * FROM userPermissions WHERE userId = ? AND pageKey = 'contracting'",
  [userId]
);
console.log("Final contracting permissions for Fouad:", verify);

await conn.end();
console.log("Done.");
