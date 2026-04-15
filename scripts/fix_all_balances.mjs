/**
 * Fix all account balances to match the provided correct values.
 * Strategy: adjust openingBalance so that:
 *   openingBalance = correctBalance - (income + transferIn - expense - transferOut)
 * This keeps the formula intact for future transactions.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Correct balances from CSV (name → correct balance)
const CORRECT_BALANCES = {
  "Cash EGP":                   80040.28,
  "ARAB African EGP":           3062.39,
  "CIB EGP":                    991262,
  "AIB EGP":                    340,
  "Cash USD":                   11.2472,
  "ARAB African  USD":          79.76,   // note: double space in CSV
  "ARAB African USD":           79.76,
  "CIB USD":                    14097.50,
  "AIB USD":                    100,
  "CIB EURO":                   0,
  "AIB EURO":                   0,
  "Z. USD Bank":                7815.05,
  "Cash Euro":                  11000,
  "Spanish Lawyer Credit Euros":-4064.89,
  "Salaries Credit":            0,
  "Spanish Translator Credit":  -4590,
  "Cash AED":                   0,
  "Credit Ziad":                -258492.60,
  "Credit Mahmoud":             0,
  "Petty Cash":                 1380,
  "ARAB African EURO":          10,
  "Imprest Account":            9394,
  "Imprest Account USD":        360,
  "Masr EGP":                   10000,
  "Masr USD":                   1200,
  "Commission Credit":          0,
  "Rent Credit":                -220000,
};

// Get all accounts
const [accounts] = await conn.execute("SELECT id, name, openingBalance FROM finAccounts");

let fixed = 0;
let skipped = 0;

for (const acc of accounts) {
  const cleanName = acc.name.trim();
  
  // Try exact match first, then trimmed
  let correctBalance = CORRECT_BALANCES[cleanName] ?? CORRECT_BALANCES[acc.name];
  
  if (correctBalance === undefined) {
    console.log(`⚠ No correct balance provided for: "${acc.name}" — skipping`);
    skipped++;
    continue;
  }

  // Calculate current net transactions for this account
  const [[incRow]] = await conn.execute(
    "SELECT COALESCE(SUM(CAST(amount AS DECIMAL(20,4))), 0) as total FROM finTransactions WHERE type = 'income' AND accountId = ?",
    [acc.id]
  );
  const [[expRow]] = await conn.execute(
    "SELECT COALESCE(SUM(CAST(amount AS DECIMAL(20,4))), 0) as total FROM finTransactions WHERE type = 'expense' AND accountId = ?",
    [acc.id]
  );
  const [[toutRow]] = await conn.execute(
    "SELECT COALESCE(SUM(CAST(amount AS DECIMAL(20,4))), 0) as total FROM finTransactions WHERE type = 'transfer' AND fromAccountId = ?",
    [acc.id]
  );
  const [[tinRow]] = await conn.execute(
    "SELECT COALESCE(SUM(CAST(COALESCE(convertedAmount, amount) AS DECIMAL(20,4))), 0) as total FROM finTransactions WHERE type = 'transfer' AND toAccountId = ?",
    [acc.id]
  );

  const net = Number(incRow.total) - Number(expRow.total) - Number(toutRow.total) + Number(tinRow.total);
  
  // New opening balance = correctBalance - net
  const newOpeningBalance = correctBalance - net;
  
  // Update both openingBalance and balance
  await conn.execute(
    "UPDATE finAccounts SET openingBalance = ?, balance = ? WHERE id = ?",
    [String(newOpeningBalance), String(correctBalance), acc.id]
  );

  console.log(`✓ ${acc.name.padEnd(30)} | net=${net.toLocaleString().padStart(15)} | newOpening=${newOpeningBalance.toFixed(2).padStart(15)} | balance=${correctBalance.toLocaleString().padStart(15)}`);
  fixed++;
}

console.log("");
console.log(`Done. Fixed: ${fixed}, Skipped: ${skipped}`);

// Verify final balances
console.log("\n=== FINAL VERIFICATION ===");
const [finalAccounts] = await conn.execute("SELECT name, openingBalance, balance FROM finAccounts ORDER BY name");
for (const a of finalAccounts) {
  const correct = CORRECT_BALANCES[a.name.trim()] ?? CORRECT_BALANCES[a.name];
  const stored = Number(a.balance);
  const match = correct !== undefined ? (Math.abs(stored - correct) < 0.01 ? "✅" : `❌ expected ${correct}`) : "⚠ not in list";
  console.log(`  ${a.name.padEnd(35)} ${stored.toLocaleString().padStart(15)}  ${match}`);
}

await conn.end();
