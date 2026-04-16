/**
 * Fast one-time bulk recalculation using SQL aggregation.
 * Formula:
 *   paidAmountEur = basePaidAmountEur + SUM(income EUR txns) + SUM(income EGP txns)/55.5
 *   paidAmountEgp = basePaidAmountEur*55.5 + SUM(income EGP txns) + SUM(income EUR txns)*55.5
 *   remainingAmountEur = contractValueEur - paidAmountEur  (if contractValueEur > 0)
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const conn = await mysql.createConnection(DATABASE_URL);
console.log('Connected to database.');

// ─── Recalc all account balances (fast) ──────────────────────────────────────
console.log('Recalculating all account balances...');
await conn.query(`
  UPDATE finAccounts fa
  SET fa.balance = (
    CAST(fa.openingBalance AS DECIMAL(20,4))
    + COALESCE((SELECT SUM(CAST(t.amount AS DECIMAL(20,4))) FROM finTransactions t WHERE t.type='income' AND t.accountId=fa.id), 0)
    - COALESCE((SELECT SUM(CAST(t.amount AS DECIMAL(20,4))) FROM finTransactions t WHERE t.type='expense' AND t.accountId=fa.id), 0)
    - COALESCE((SELECT SUM(CAST(t.amount AS DECIMAL(20,4))) FROM finTransactions t WHERE t.type='transfer' AND t.fromAccountId=fa.id), 0)
    + COALESCE((SELECT SUM(CAST(COALESCE(t.convertedAmount, t.amount) AS DECIMAL(20,4))) FROM finTransactions t WHERE t.type='transfer' AND t.toAccountId=fa.id), 0)
  )
`);
console.log('✓ All account balances updated.');

// ─── Recalc all client paid amounts (fast, single query) ─────────────────────
console.log('Recalculating all client paid amounts...');

// Step 1: compute per-client income aggregates (split by currency)
const [aggRows] = await conn.query(`
  SELECT
    ft.finClientId,
    SUM(CASE WHEN fa.currency = 'EUR' THEN CAST(ft.amount AS DECIMAL(20,4)) ELSE 0 END) AS txEur,
    SUM(CASE WHEN fa.currency != 'EUR' OR fa.currency IS NULL THEN CAST(ft.amount AS DECIMAL(20,4)) ELSE 0 END) AS txEgp
  FROM finTransactions ft
  LEFT JOIN finAccounts fa ON fa.id = ft.accountId
  WHERE ft.type = 'income' AND ft.finClientId IS NOT NULL
  GROUP BY ft.finClientId
`);

// Build a map: clientId -> { txEur, txEgp }
const aggMap = {};
for (const r of aggRows) {
  aggMap[r.finClientId] = { txEur: Number(r.txEur ?? 0), txEgp: Number(r.txEgp ?? 0) };
}

// Step 2: fetch all clients
const [clients] = await conn.query('SELECT id, basePaidAmountEur, contractValueEur, remainingAmountEur FROM finClients');
console.log(`Processing ${clients.length} clients...`);

// Step 3: bulk update using CASE WHEN for efficiency
let updates = [];
for (const c of clients) {
  const baseEur = Number(c.basePaidAmountEur ?? 0);
  const { txEur = 0, txEgp = 0 } = aggMap[c.id] ?? {};
  const totalEur = baseEur + txEur + (txEgp / 55.5);
  const totalEgp = (baseEur * 55.5) + txEgp + (txEur * 55.5);
  const contractVal = Number(c.contractValueEur ?? 0);
  const newRemaining = contractVal > 0 ? contractVal - totalEur : Number(c.remainingAmountEur ?? 0);
  updates.push({ id: c.id, paidEur: totalEur.toFixed(2), paidEgp: totalEgp.toFixed(2), remaining: newRemaining.toFixed(2) });
}

// Execute in batches of 50
const BATCH = 50;
for (let i = 0; i < updates.length; i += BATCH) {
  const batch = updates.slice(i, i + BATCH);
  const ids = batch.map(u => u.id);
  const caseEur = batch.map(u => `WHEN id=${u.id} THEN '${u.paidEur}'`).join(' ');
  const caseEgp = batch.map(u => `WHEN id=${u.id} THEN '${u.paidEgp}'`).join(' ');
  const caseRem = batch.map(u => `WHEN id=${u.id} THEN '${u.remaining}'`).join(' ');
  await conn.query(`
    UPDATE finClients SET
      paidAmountEur = CASE ${caseEur} END,
      paidAmountEgp = CASE ${caseEgp} END,
      remainingAmountEur = CASE ${caseRem} END
    WHERE id IN (${ids.join(',')})
  `);
  process.stdout.write(`  Updated ${Math.min(i + BATCH, updates.length)}/${updates.length}\r`);
}

console.log(`\n✓ Updated ${updates.length} client paid/remaining amounts.`);
await conn.end();
console.log('Done. All calculations applied with corrected formula (base EGP + tx EGP, no date cutoff).');
