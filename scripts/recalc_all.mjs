/**
 * One-time recalculation script:
 * - Recalculates balance for ALL accounts from scratch
 * - Recalculates paidAmount/remainingAmount for ALL finClients from scratch
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL || 'mysql://root@localhost/spain_dnv_qa');

// ── 1. Recalc all account balances ──────────────────────────────────────────
const [accounts] = await conn.execute('SELECT id, openingBalance FROM finAccounts');
console.log(`Recalculating ${accounts.length} accounts...`);

for (const acc of accounts) {
  const [rows] = await conn.execute(`
    SELECT
      COALESCE(SUM(CASE WHEN type='income' AND accountId=? THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' AND accountId=? THEN amount ELSE 0 END), 0) AS expense,
      COALESCE(SUM(CASE WHEN type='transfer' AND fromAccountId=? THEN amount ELSE 0 END), 0) AS transferOut,
      COALESCE(SUM(CASE WHEN type='transfer' AND toAccountId=? THEN COALESCE(convertedAmount, amount) ELSE 0 END), 0) AS transferIn
    FROM finTransactions
  `, [acc.id, acc.id, acc.id, acc.id]);

  const r = rows[0];
  const newBalance = Number(acc.openingBalance || 0)
    + Number(r.income) + Number(r.transferIn)
    - Number(r.expense) - Number(r.transferOut);

  await conn.execute('UPDATE finAccounts SET balance=? WHERE id=?', [newBalance.toFixed(2), acc.id]);
  console.log(`  Account ${acc.id}: balance = ${newBalance.toFixed(2)}`);
}

// ── 2. Recalc all client paid/remaining amounts ──────────────────────────────
const [clients] = await conn.execute('SELECT id, contractValueEur FROM finClients');
console.log(`\nRecalculating ${clients.length} clients...`);

for (const client of clients) {
  // Get all income transactions for this client with their account currency
  const [txRows] = await conn.execute(`
    SELECT t.amount, a.currency
    FROM finTransactions t
    LEFT JOIN finAccounts a ON t.accountId = a.id
    WHERE t.finClientId = ? AND t.type = 'income'
  `, [client.id]);

  let totalEgp = 0, totalEur = 0;
  for (const tx of txRows) {
    const currency = tx.currency || 'EGP';
    const amt = Number(tx.amount);
    if (currency === 'EUR') {
      totalEur += amt;
      totalEgp += amt * 55.5;
    } else {
      totalEgp += amt;
      totalEur += amt / 55.5;
    }
  }

  const contractVal = Number(client.contractValueEur || 0);
  const newRemaining = contractVal > 0 ? contractVal - totalEur : 0;

  await conn.execute(
    'UPDATE finClients SET paidAmountEur=?, paidAmountEgp=?, remainingAmountEur=? WHERE id=?',
    [totalEur.toFixed(2), totalEgp.toFixed(2), newRemaining.toFixed(2), client.id]
  );
  if (txRows.length > 0) {
    console.log(`  Client ${client.id}: paidEur=${totalEur.toFixed(2)}, remaining=${newRemaining.toFixed(2)}`);
  }
}

await conn.end();
console.log('\n✅ All accounts and clients recalculated successfully.');
