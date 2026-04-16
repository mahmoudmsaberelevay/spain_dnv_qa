/**
 * One-time recalculation: all account balances + all client paid/remaining
 * Reads DATABASE_URL from the running server process environment
 */
const { execSync } = require('child_process');
const mysql = require('mysql2/promise');

async function main() {
  // Get DATABASE_URL from running server process
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    try {
      const pid = execSync('pgrep -f "node.*server" | head -1').toString().trim();
      const envStr = execSync('cat /proc/' + pid + '/environ').toString();
      const entry = envStr.split('\0').find(e => e.startsWith('DATABASE_URL='));
      if (entry) dbUrl = entry.split('=').slice(1).join('=');
    } catch(e) {}
  }
  if (!dbUrl) { console.error('No DATABASE_URL found'); process.exit(1); }

  const conn = await mysql.createConnection(dbUrl);

  // ── 1. Recalc all account balances ──────────────────────────────────────────
  const [accounts] = await conn.execute('SELECT id, openingBalance, name FROM finAccounts');
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
    console.log(`  [${acc.name}] balance = ${newBalance.toFixed(2)}`);
  }

  // ── 2. Recalc all client paid/remaining amounts ──────────────────────────────
  const [clients] = await conn.execute('SELECT id, contractValueEur, name FROM finClients');
  console.log(`\nRecalculating ${clients.length} clients...`);

  let updated = 0;
  for (const client of clients) {
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
      if (currency === 'EUR') { totalEur += amt; totalEgp += amt * 55.5; }
      else { totalEgp += amt; totalEur += amt / 55.5; }
    }

    const contractVal = Number(client.contractValueEur || 0);
    const newRemaining = contractVal > 0 ? contractVal - totalEur : 0;

    await conn.execute(
      'UPDATE finClients SET paidAmountEur=?, paidAmountEgp=?, remainingAmountEur=? WHERE id=?',
      [totalEur.toFixed(2), totalEgp.toFixed(2), newRemaining.toFixed(2), client.id]
    );
    if (txRows.length > 0) updated++;
  }
  console.log(`  Updated ${updated} clients with linked income transactions.`);

  await conn.end();
  console.log('\n✅ All accounts and clients recalculated successfully.');
}

main().catch(e => { console.error(e); process.exit(1); });
