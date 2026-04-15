import mysql from "mysql2/promise";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check if kirolos exists
const [rows] = await conn.execute("SELECT id, email FROM users WHERE email = ?", ["kirolos.nabil@elevay.com"]);
let userId;

if (rows.length === 0) {
  const openId = "manual_" + crypto.randomBytes(16).toString("hex");
  await conn.execute(
    "INSERT INTO users (openId, name, email, loginMethod, lastSignedIn) VALUES (?, ?, ?, ?, NOW())",
    [openId, "Kirolos Nabil", "kirolos.nabil@elevay.com", "manual"]
  );
  const [newRows] = await conn.execute("SELECT id FROM users WHERE openId = ?", [openId]);
  userId = newRows[0].id;
  console.log("Created Kirolos with userId:", userId);
} else {
  userId = rows[0].id;
  console.log("Kirolos already exists with userId:", userId);
}

// Set module permissions: same as Fouad
const modules = [
  ["contracting", "full"],
  ["clientDocs", "full"],
  ["appAnalysis", "none"],
  ["financial", "none"],
];
for (const [mod, level] of modules) {
  await conn.execute(
    "INSERT INTO modulePermissions (userId, module, accessLevel) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE accessLevel = VALUES(accessLevel)",
    [userId, mod, level]
  );
}

// Legacy userPermissions for contracts+receipts
for (const pageKey of ["contracts", "receipts"]) {
  await conn.execute(
    "INSERT INTO userPermissions (userId, pageKey, canAccess, canEdit, canCreate) VALUES (?, ?, 1, 1, 1) ON DUPLICATE KEY UPDATE canAccess=1, canEdit=1, canCreate=1",
    [userId, pageKey]
  );
}

console.log("Done! Kirolos: contracting=full, clientDocs=full, appAnalysis=none, financial=none");
await conn.end();
