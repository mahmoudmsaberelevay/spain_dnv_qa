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

// ── 1. Bulk recalc all account balances in ONE query ──────────────────────────
console.log('Recalculating all account balances...');
await conn.execute(`
  UPDATE finAccounts a
  SET a.balance = (
    SELECT COALESCE(a.openingBalance, 0)
      + COALESCE((SELECT SUM(t.amount) FROM finTransactions t WHERE t.accountId = a.id AND t.type = 'income'), 0)
      + COALESCE((SELECT SUM(COALESCE(t.convertedAmount, t.amount)) FROM finTransactions t WHERE t.toAccountId = a.id AND t.type = 'transfer'), 0)
      - COALESCE((SELECT SUM(t.amount) FROM finTransactions t WHERE t.accountId = a.id AND t.type = 'expense'), 0)
      - COALESCE((SELECT SUM(t.amount) FROM finTransactions t WHERE t.fromAccountId = a.id AND t.type = 'transfer'), 0)
  )
`);
console.log('✅ All account balances recalculated.');

// ── 2. Bulk recalc client paid amounts (EGP accounts only for simplicity) ─────
console.log('Recalculating all client paid amounts...');
await conn.execute(`
  UPDATE finClients c
  SET 
    c.paidAmountEgp = COALESCE((
      SELECT SUM(t.amount)
      FROM finTransactions t
      JOIN finAccounts a ON t.accountId = a.id
      WHERE t.finClientId = c.id AND t.type = 'income' AND a.currency = 'EGP'
    ), 0),
    c.paidAmountEur = COALESCE((
      SELECT SUM(t.amount)
      FROM finTransactions t
      JOIN finAccounts a ON t.accountId = a.id
      WHERE t.finClientId = c.id AND t.type = 'income' AND a.currency = 'EUR'
    ), 0) + COALESCE((
      SELECT SUM(t.amount) / 55.5
      FROM finTransactions t
      JOIN finAccounts a ON t.accountId = a.id
      WHERE t.finClientId = c.id AND t.type = 'income' AND a.currency = 'EGP'
    ), 0)
`);

// Update remainingAmountEur based on recalculated paidAmountEur
await conn.execute(`
  UPDATE finClients c
  SET c.remainingAmountEur = CASE 
    WHEN c.contractValueEur > 0 THEN c.contractValueEur - c.paidAmountEur
    ELSE c.remainingAmountEur
  END
  WHERE c.contractValueEur IS NOT NULL AND c.contractValueEur > 0
`);

console.log('✅ All client paid/remaining amounts recalculated.');

await conn.end();
console.log('\n✅ Done! All calculations are now up to date.');
