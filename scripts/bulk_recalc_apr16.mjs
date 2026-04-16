/**
 * Bulk recalculation with April 16 cutoff.
 * Formula: paidAmountEur = basePaidAmountEur + income transactions from April 16, 2026 onwards
 *          paidAmountEgp = (basePaidAmountEur * 55.5) + income tx from April 16 onwards (EGP equiv)
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const RATE = 55.5;
const CUTOFF = '2026-04-16 00:00:00';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('Connected.');

// Step 1: aggregate income transactions per client from April 16 onwards
const [aggRows] = await conn.query(`
  SELECT
    ft.finClientId,
    SUM(CASE WHEN fa.currency = 'EUR' THEN CAST(ft.amount AS DECIMAL(20,4)) ELSE 0 END) AS txEur,
    SUM(CASE WHEN fa.currency != 'EUR' OR fa.currency IS NULL THEN CAST(ft.amount AS DECIMAL(20,4)) ELSE 0 END) AS txEgp
  FROM finTransactions ft
  LEFT JOIN finAccounts fa ON fa.id = ft.accountId
  WHERE ft.type = 'income'
    AND ft.finClientId IS NOT NULL
    AND ft.transactionDate >= ?
  GROUP BY ft.finClientId
`, [CUTOFF]);

const aggMap = {};
for (const r of aggRows) {
  aggMap[r.finClientId] = { txEur: Number(r.txEur ?? 0), txEgp: Number(r.txEgp ?? 0) };
}

// Step 2: fetch all clients
const [clients] = await conn.query('SELECT id, basePaidAmountEur, contractValueEur, remainingAmountEur FROM finClients');
console.log(`Processing ${clients.length} clients...`);

const updates = [];
for (const c of clients) {
  const baseEur = Number(c.basePaidAmountEur ?? 0);
  const baseEgp = baseEur * RATE;
  const { txEur = 0, txEgp = 0 } = aggMap[c.id] ?? {};

  const totalEur = baseEur + txEur + (txEgp / RATE);
  const totalEgp = baseEgp + txEgp + (txEur * RATE);
  const contractVal = Number(c.contractValueEur ?? 0);
  const newRemaining = contractVal > 0 ? contractVal - totalEur : Number(c.remainingAmountEur ?? 0);
  updates.push({ id: c.id, paidEur: totalEur.toFixed(2), paidEgp: totalEgp.toFixed(2), remaining: newRemaining.toFixed(2) });
}

// Step 3: batch update
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
  process.stdout.write(`  ${Math.min(i + BATCH, updates.length)}/${updates.length}\r`);
}

console.log(`\n✓ Updated ${updates.length} clients.`);
await conn.end();
console.log('Done.');
