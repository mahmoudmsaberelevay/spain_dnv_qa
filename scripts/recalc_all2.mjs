import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  const pid = execSync('pgrep -f "node.*server" | head -1').toString().trim();
  const envStr = execSync('cat /proc/' + pid + '/environ').toString();
  const entry = envStr.split('\0').find(e => e.startsWith('DATABASE_URL='));
  if (entry) dbUrl = entry.split('=').slice(1).join('=');
}
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await mysql.createConnection(dbUrl);

// ── 1. Recalc all account balances ──────────────────────────────────────────
const [accounts] = await conn.execute('SELECT id, openingBalance, name FROM finAccounts');
console.log('Recalculating', accounts.length, 'accounts...');
for (const acc of accounts) {
  const [rows] = await conn.execute(
    `SELECT
      COALESCE(SUM(CASE WHEN type='income' AND accountId=? THEN amount ELSE 0 END),0) AS inc,
      COALESCE(SUM(CASE WHEN type='expense' AND accountId=? THEN amount ELSE 0 END),0) AS exp,
      COALESCE(SUM(CASE WHEN type='transfer' AND fromAccountId=? THEN amount ELSE 0 END),0) AS tout,
      COALESCE(SUM(CASE WHEN type='transfer' AND toAccountId=? THEN COALESCE(convertedAmount,amount) ELSE 0 END),0) AS tin
    FROM finTransactions`,
    [acc.id, acc.id, acc.id, acc.id]
  );
  const r = rows[0];
  const bal = Number(acc.openingBalance || 0) + Number(r.inc) + Number(r.tin) - Number(r.exp) - Number(r.tout);
  await conn.execute('UPDATE finAccounts SET balance=? WHERE id=?', [bal.toFixed(2), acc.id]);
  console.log(' ', acc.name, '->', bal.toFixed(2));
}

// ── 2. Recalc all client paid/remaining amounts ──────────────────────────────
const [clients] = await conn.execute('SELECT id, contractValueEur FROM finClients');
console.log('Recalculating', clients.length, 'clients...');
let n = 0;
for (const c of clients) {
  const [txs] = await conn.execute(
    `SELECT t.amount, a.currency FROM finTransactions t
     LEFT JOIN finAccounts a ON t.accountId = a.id
     WHERE t.finClientId = ? AND t.type = 'income'`,
    [c.id]
  );
  let egp = 0, eur = 0;
  for (const t of txs) {
    const cur = t.currency || 'EGP';
    const a = Number(t.amount);
    if (cur === 'EUR') { eur += a; egp += a * 55.5; }
    else { egp += a; eur += a / 55.5; }
  }
  const cv = Number(c.contractValueEur || 0);
  const rem = cv > 0 ? cv - eur : 0;
  await conn.execute(
    'UPDATE finClients SET paidAmountEur=?, paidAmountEgp=?, remainingAmountEur=? WHERE id=?',
    [eur.toFixed(2), egp.toFixed(2), rem.toFixed(2), c.id]
  );
  if (txs.length > 0) n++;
}
console.log(' Updated', n, 'clients with linked income transactions');

await conn.end();
console.log('\n✅ All accounts and clients recalculated successfully.');
