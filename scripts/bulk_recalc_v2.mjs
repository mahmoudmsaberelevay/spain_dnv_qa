/**
 * One-time bulk recalculation script.
 * Applies corrected formula to ALL clients and ALL accounts:
 *   - Client paidAmountEur = basePaidAmountEur + ALL income transactions linked to client (no date cutoff)
 *   - Account balance = openingBalance + income + transferIn - expenses - transferOut
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const conn = await mysql.createConnection(DATABASE_URL);
console.log('Connected to database.');

// ─── Recalc all account balances ─────────────────────────────────────────────
const [accounts] = await conn.query('SELECT id, openingBalance FROM finAccounts');
console.log(`Recalculating ${accounts.length} account balances...`);
let accountsUpdated = 0;
for (const acc of accounts) {
  const [[income]] = await conn.query(
    "SELECT COALESCE(SUM(CAST(amount AS DECIMAL(20,4))), 0) AS total FROM finTransactions WHERE type='income' AND accountId=?",
    [acc.id]
  );
  const [[expense]] = await conn.query(
    "SELECT COALESCE(SUM(CAST(amount AS DECIMAL(20,4))), 0) AS total FROM finTransactions WHERE type='expense' AND accountId=?",
    [acc.id]
  );
  const [[transferOut]] = await conn.query(
    "SELECT COALESCE(SUM(CAST(amount AS DECIMAL(20,4))), 0) AS total FROM finTransactions WHERE type='transfer' AND fromAccountId=?",
    [acc.id]
  );
  const [[transferIn]] = await conn.query(
    "SELECT COALESCE(SUM(CAST(COALESCE(convertedAmount, amount) AS DECIMAL(20,4))), 0) AS total FROM finTransactions WHERE type='transfer' AND toAccountId=?",
    [acc.id]
  );
  const net = Number(income.total) - Number(expense.total) - Number(transferOut.total) + Number(transferIn.total);
  const newBalance = Number(acc.openingBalance) + net;
  await conn.query('UPDATE finAccounts SET balance=? WHERE id=?', [String(newBalance), acc.id]);
  accountsUpdated++;
}
console.log(`✓ Updated ${accountsUpdated} account balances.`);

// ─── Recalc all client paid amounts ──────────────────────────────────────────
const [clients] = await conn.query('SELECT id, basePaidAmountEur, contractValueEur, remainingAmountEur FROM finClients');
console.log(`Recalculating ${clients.length} client paid amounts...`);
let clientsUpdated = 0;
for (const client of clients) {
  const baseEur = Number(client.basePaidAmountEur ?? 0);

  // Get ALL income transactions linked to this client (no date cutoff)
  const [txRows] = await conn.query(
    "SELECT ft.amount, ft.accountId, fa.currency FROM finTransactions ft LEFT JOIN finAccounts fa ON fa.id = ft.accountId WHERE ft.finClientId=? AND ft.type='income'",
    [client.id]
  );

  let txEgp = 0, txEur = 0;
  for (const r of txRows) {
    const currency = r.currency ?? 'EGP';
    const amt = Number(r.amount);
    if (currency === 'EUR') { txEur += amt; txEgp += amt * 55.5; }
    else { txEgp += amt; txEur += amt / 55.5; }
  }

  const totalEur = baseEur + txEur;
  // EGP total = base EUR converted to EGP + transaction EGP amounts
  const baseEgp = baseEur * 55.5;
  const totalEgp = baseEgp + txEgp;
  const contractVal = Number(client.contractValueEur ?? 0);
  const newRemaining = contractVal > 0 ? contractVal - totalEur : Number(client.remainingAmountEur ?? 0);

  await conn.query(
    'UPDATE finClients SET paidAmountEur=?, paidAmountEgp=?, remainingAmountEur=? WHERE id=?',
    [totalEur.toFixed(2), totalEgp.toFixed(2), newRemaining.toFixed(2), client.id]
  );
  clientsUpdated++;
}
console.log(`✓ Updated ${clientsUpdated} client paid/remaining amounts.`);

await conn.end();
console.log('Done. All calculations applied with corrected formula (no date cutoff).');
