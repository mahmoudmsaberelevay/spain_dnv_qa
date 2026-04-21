import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// cutoff = end of April 14 Cairo time (UTC+2) = April 14 22:00 UTC = April 15 00:00 Cairo
// Using April 15 00:00:00 UTC+2 = April 14 22:00:00 UTC as millisecond timestamp
const cutoffMs = new Date("2026-04-14T22:00:00.000Z").getTime();

const [accounts] = await conn.execute(
  `SELECT id, name, currency, openingBalance FROM finAccounts ORDER BY name`
);

for (const acc of accounts) {
  const [rows] = await conn.execute(
    `SELECT 
      COALESCE(SUM(CASE WHEN type = 'income' AND accountId = ? THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN type = 'expense' AND accountId = ? THEN amount ELSE 0 END), 0) as expenses,
      COALESCE(SUM(CASE WHEN type = 'transfer' AND toAccountId = ? THEN convertedAmount ELSE 0 END), 0) as transferIn,
      COALESCE(SUM(CASE WHEN type = 'transfer' AND accountId = ? THEN amount ELSE 0 END), 0) as transferOut
     FROM finTransactions
     WHERE transactionDate < ?`,
    [acc.id, acc.id, acc.id, acc.id, cutoffMs]
  );

  const r = rows[0];
  acc.income = Number(r.income);
  acc.expenses = Number(r.expenses);
  acc.transferIn = Number(r.transferIn);
  acc.transferOut = Number(r.transferOut);
  acc.opening = Number(acc.openingBalance || 0);
  acc.balance = acc.opening + acc.income + acc.transferIn - acc.expenses - acc.transferOut;
}

await conn.end();

console.log("\n=== Account Balances — End of Day April 14, 2026 ===\n");
const pad = (s, n) => String(s).padEnd(n);
const padR = (s, n) => String(s).padStart(n);

console.log(
  pad("Account", 30) +
  pad("Currency", 10) +
  padR("Opening", 16) +
  padR("Income", 16) +
  padR("Xfer In", 14) +
  padR("Expenses", 16) +
  padR("Xfer Out", 14) +
  padR("BALANCE", 18)
);
console.log("-".repeat(134));

for (const acc of accounts) {
  const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  console.log(
    pad(acc.name, 30) +
    pad(acc.currency, 10) +
    padR(fmt(acc.opening), 16) +
    padR(fmt(acc.income), 16) +
    padR(fmt(acc.transferIn), 14) +
    padR(fmt(acc.expenses), 16) +
    padR(fmt(acc.transferOut), 14) +
    padR(fmt(acc.balance), 18)
  );
}
