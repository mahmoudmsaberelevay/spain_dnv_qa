/**
 * Migration: create modulePermissions table and seed default access for all existing users.
 * Default: contracting=full, clientDocs=full, appAnalysis=none, financial=none
 * (Financial stays restricted; contracting+clientDocs open to everyone by default)
 * Run: node scripts/migrate_module_permissions.mjs
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(DB_URL);

// 1. Create table
await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`modulePermissions\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`userId\` int NOT NULL,
    \`module\` varchar(50) NOT NULL,
    \`accessLevel\` enum('none','viewer','full') NOT NULL DEFAULT 'none',
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`modulePermissions_id\` PRIMARY KEY(\`id\`),
    UNIQUE KEY \`uq_user_module\` (\`userId\`, \`module\`)
  )
`);
console.log("✓ modulePermissions table created (or already exists)");

// 2. Get all users
const [users] = await conn.execute("SELECT id, email FROM users");
console.log(`Found ${users.length} users`);

const MODULES = ["contracting", "clientDocs", "appAnalysis", "financial"];

// Default access levels for all users
const DEFAULTS = {
  contracting: "full",
  clientDocs: "full",
  appAnalysis: "none",
  financial: "none",
};

for (const user of users) {
  for (const mod of MODULES) {
    const level = DEFAULTS[mod];
    await conn.execute(
      `INSERT INTO \`modulePermissions\` (userId, module, accessLevel)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE accessLevel = VALUES(accessLevel)`,
      [user.id, mod, level]
    );
  }
  console.log(`  ✓ Seeded defaults for user ${user.id} (${user.email})`);
}

// 3. Grant Fouad and Kirolos: contracting=full, clientDocs=full, appAnalysis=none, financial=none
// (same as default, already done above)
// But also ensure their old userPermissions rows are correct
const SPECIAL_EMAILS = ["fouad.abdo@elevay.com", "kirolos.nabil@elevay.com"];
for (const email of SPECIAL_EMAILS) {
  const [rows] = await conn.execute("SELECT id FROM users WHERE email = ?", [email]);
  if (!rows.length) { console.log(`  ⚠ User ${email} not found yet (will get defaults on first login)`); continue; }
  const userId = rows[0].id;
  // Ensure contracting+clientDocs = full
  for (const mod of ["contracting", "clientDocs"]) {
    await conn.execute(
      `INSERT INTO \`modulePermissions\` (userId, module, accessLevel) VALUES (?, ?, 'full')
       ON DUPLICATE KEY UPDATE accessLevel = 'full'`,
      [userId, mod]
    );
  }
  // Also fix legacy userPermissions for contracts+receipts
  const PAGE_KEYS = ["contracts", "receipts", "contracting"];
  for (const pageKey of PAGE_KEYS) {
    await conn.execute(
      `INSERT INTO userPermissions (userId, pageKey, canAccess, canEdit, canCreate)
       VALUES (?, ?, 1, 1, 1)
       ON DUPLICATE KEY UPDATE canAccess=1, canEdit=1, canCreate=1`,
      [userId, pageKey]
    );
  }
  console.log(`  ✓ Ensured full contracting access for ${email} (userId=${userId})`);
}

await conn.end();
console.log("Migration complete.");
