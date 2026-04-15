/**
 * Import missing CIB EGP transfer-out records from CIB.csv
 * Skips the one already in DB (April 15, 150,000 to Cash EGP)
 * Then recalculates balances for all affected accounts.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Account IDs
const CIB_EGP = 6;
const CASH_EGP = 1;
const IMPREST = 21; // Imprest Account

// All transfers from CSV (parsed manually)
const transfers = [
  // Already in DB — SKIP: { date: "2026-04-15", desc: "From CIb To Cash", amount: 150000, toAccountId: CASH_EGP },
  { date: "2026-04-09", desc: "from CIB to Cash", amount: 400000, toAccountId: CASH_EGP },
  { date: "2026-04-02", desc: "From Cib To Cash", amount: 100000, toAccountId: CASH_EGP },
  { date: "2026-03-31", desc: "from Cib To Cash EGP to Pay Schengen Fees", amount: 110000, toAccountId: CASH_EGP },
  { date: "2026-03-31", desc: "From CIB to Cash EgP", amount: 250000, toAccountId: CASH_EGP },
  { date: "2026-03-30", desc: "From CIB to Imperest", amount: 20000, toAccountId: IMPREST },
  { date: "2026-03-30", desc: "From Cib to Cash", amount: 30000, toAccountId: CASH_EGP },
  { date: "2026-03-29", desc: "from CIB to CAsh EGP", amount: 598000, toAccountId: CASH_EGP },
  { date: "2026-03-17", desc: "from CIB to Cash", amount: 113300, toAccountId: CASH_EGP },
  { date: "2026-03-16", desc: "from CIB to Cash", amount: 62500, toAccountId: CASH_EGP },
  { date: "2026-03-16", desc: "from CIB to Cash", amount: 60000, toAccountId: CASH_EGP },
  { date: "2026-03-15", desc: "From CIB to Cash Egp", amount: 392800, toAccountId: CASH_EGP },
  { date: "2026-03-12", desc: "FROM CIB TO CASH", amount: 370000, toAccountId: CASH_EGP },
  { date: "2026-03-09", desc: "from CIB to CASH", amount: 100000, toAccountId: CASH_EGP },
  { date: "2026-03-09", desc: "from CIB to CAsh", amount: 42240, toAccountId: CASH_EGP },
  { date: "2026-03-08", desc: "from CIb to Cash", amount: 23500, toAccountId: CASH_EGP },
  { date: "2026-03-05", desc: "FRom CIb TO Cash", amount: 65453, toAccountId: CASH_EGP },
  { date: "2026-03-03", desc: "From CIB to CASH EGP", amount: 290000, toAccountId: CASH_EGP },
  { date: "2026-03-02", desc: "from CIB to CASH", amount: 111000, toAccountId: CASH_EGP },
  { date: "2026-03-02", desc: "from CIB to Cash", amount: 65500, toAccountId: CASH_EGP },
  { date: "2026-02-25", desc: "from CIb to Cash", amount: 350000, toAccountId: CASH_EGP },
  { date: "2026-02-16", desc: "from CIB to CASH EGP", amount: 450000, toAccountId: CASH_EGP },
  { date: "2026-02-12", desc: "from CIB to cash EGP", amount: 165000, toAccountId: CASH_EGP },
  { date: "2026-02-11", desc: "From CIB to Cash", amount: 10000, toAccountId: CASH_EGP },
  { date: "2026-02-11", desc: "from CIB EGp to imperest", amount: 20000, toAccountId: IMPREST },
  { date: "2026-02-10", desc: "FROM CIB TO CASH EGP", amount: 143000, toAccountId: CASH_EGP },
  { date: "2026-02-05", desc: "From CIB to Imperest Account", amount: 20000, toAccountId: IMPREST },
  { date: "2026-02-03", desc: "From CIB to Cash", amount: 250000, toAccountId: CASH_EGP },
  { date: "2026-01-28", desc: "From cib to Cash", amount: 200000, toAccountId: CASH_EGP },
  { date: "2026-01-21", desc: "From CIB to Cash EGP", amount: 60000, toAccountId: CASH_EGP },
  { date: "2026-01-19", desc: "From Cib to Cash", amount: 67700, toAccountId: CASH_EGP },
  { date: "2026-01-15", desc: "from CIb to Cash EGp", amount: 220000, toAccountId: CASH_EGP },
  { date: "2026-01-13", desc: "from Cib To Cash EGP", amount: 210000, toAccountId: CASH_EGP },
  { date: "2026-01-08", desc: "From CIb to Cash EGP", amount: 67900, toAccountId: CASH_EGP },
  { date: "2026-01-06", desc: "From CIb to Cash EGp", amount: 120000, toAccountId: CASH_EGP },
  { date: "2026-01-05", desc: "From CIb to Cash", amount: 599250, toAccountId: CASH_EGP },
];

let totalInserted = 0;
let totalAmount = 0;

for (const t of transfers) {
  // Get current balances for both accounts
  const [[fromAcc]] = await conn.execute("SELECT balance FROM finAccounts WHERE id = ?", [CIB_EGP]);
  const [[toAcc]] = await conn.execute("SELECT balance FROM finAccounts WHERE id = ?", [t.toAccountId]);

  const balanceBefore1 = Number(fromAcc.balance);
  const balanceAfter1 = balanceBefore1 - t.amount;
  const balanceBefore2 = Number(toAcc.balance);
  const balanceAfter2 = balanceBefore2 + t.amount;

  // Insert transfer record
  await conn.execute(
    `INSERT INTO finTransactions 
     (type, description, fromAccountId, toAccountId, amount, convertedAmount, transactionDate, balanceBefore, balanceAfter, balanceBefore2, balanceAfter2, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "transfer",
      t.desc,
      CIB_EGP,
      t.toAccountId,
      t.amount,
      t.amount, // same currency (EGP → EGP), no conversion
      new Date(t.date),
      String(balanceBefore1),
      String(balanceAfter1),
      String(balanceBefore2),
      String(balanceAfter2),
      "import_cib_transfers",
    ]
  );

  // Update balances immediately so next iteration has correct values
  await conn.execute(
    "UPDATE finAccounts SET balance = ? WHERE id = ?",
    [String(balanceAfter1), CIB_EGP]
  );
  await conn.execute(
    "UPDATE finAccounts SET balance = ? WHERE id = ?",
    [String(balanceAfter2), t.toAccountId]
  );

  totalInserted++;
  totalAmount += t.amount;
  console.log(`✓ ${t.date}  ${t.desc}  ${t.amount.toLocaleString()} EGP → account ${t.toAccountId}`);
}

console.log("");
console.log(`Inserted ${totalInserted} transfer records, total: ${totalAmount.toLocaleString()} EGP`);

// Final check
const [[cib]] = await conn.execute("SELECT balance FROM finAccounts WHERE id = ?", [CIB_EGP]);
const [[cash]] = await conn.execute("SELECT balance FROM finAccounts WHERE id = ?", [CASH_EGP]);
const [[imprest]] = await conn.execute("SELECT balance FROM finAccounts WHERE id = ?", [IMPREST]);

console.log("");
console.log("Final balances after import:");
console.log("  CIB EGP:        ", Number(cib.balance).toLocaleString());
console.log("  Cash EGP:       ", Number(cash.balance).toLocaleString());
console.log("  Imprest Account:", Number(imprest.balance).toLocaleString());

await conn.end();
console.log("Done.");
