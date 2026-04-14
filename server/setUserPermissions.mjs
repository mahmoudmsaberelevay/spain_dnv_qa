/**
 * setUserPermissions.mjs
 * Sets the correct page-level permissions for the 4 named users.
 *
 * User access rules:
 * 1. mahmoud.saber@elevay.com + mahmoud.saberelevay@gmail.com → Super Admin (handled by code, no DB rows needed)
 * 2. ziad.elshurafa@elevay.com → View-only all pages
 * 3. walid.mammdouh@gmail.com → View-only all pages
 * 4. mohamed.abdelfatah@elevay.com → View all pages + Edit (canEdit=true) for fin_income, fin_expenses, fin_transfers
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const ALL_PAGE_KEYS = [
  "contracts", "receipts",
  "analysis_dashboard", "cases",
  "client_docs",
  "fin_dashboard", "fin_accounts", "fin_income", "fin_expenses", "fin_transfers",
  "fin_reports", "fin_employees", "fin_categories", "fin_commissions", "fin_clients", "fin_bulk_upload",
  "settings", "chat", "broadcast",
];

// Pages where Mohamed can also edit
const MOHAMED_EDIT_KEYS = ["fin_income", "fin_expenses", "fin_transfers"];

const USER_CONFIGS = [
  {
    email: "ziad.elshurafa@elevay.com",
    viewAll: true,
    editKeys: [],
  },
  {
    email: "walid.mammdouh@gmail.com",
    viewAll: true,
    editKeys: [],
  },
  {
    email: "mohamed.abdelfatah@elevay.com",
    viewAll: true,
    editKeys: MOHAMED_EDIT_KEYS,
  },
];

async function run() {
  const conn = await mysql.createConnection(DATABASE_URL);

  for (const config of USER_CONFIGS) {
    // Find user by email
    const [rows] = await conn.execute("SELECT id FROM users WHERE email = ?", [config.email]);
    if (!rows.length) {
      console.log(`⚠️  User not found: ${config.email} — skipping (they will get permissions when they first log in)`);
      continue;
    }
    const userId = rows[0].id;
    console.log(`Setting permissions for ${config.email} (id=${userId})...`);

    // Delete existing individual permissions
    await conn.execute("DELETE FROM userPermissions WHERE userId = ?", [userId]);

    // Insert new permissions
    for (const key of ALL_PAGE_KEYS) {
      const canAccess = config.viewAll ? 1 : 0;
      const canEdit = config.editKeys.includes(key) ? 1 : 0;
      const canCreate = config.editKeys.includes(key) ? 1 : 0;
      await conn.execute(
        "INSERT INTO userPermissions (userId, pageKey, canAccess, canEdit, canCreate) VALUES (?, ?, ?, ?, ?)",
        [userId, key, canAccess, canEdit, canCreate]
      );
    }
    console.log(`  ✅ Done: canAccess=all, canEdit=[${config.editKeys.join(", ") || "none"}]`);
  }

  await conn.end();
  console.log("\nAll permissions set successfully.");
}

run().catch((e) => { console.error(e); process.exit(1); });
