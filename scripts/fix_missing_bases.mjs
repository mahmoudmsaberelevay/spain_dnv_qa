/**
 * fix_missing_bases.mjs
 * Sets basePaidAmountEur for the 6 legacy clients that were missing from the original CSV.
 * Then triggers a full bulk recalculation via recalcClientPaidAmount for ALL clients.
 *
 * Legacy EGP amounts as of April 15, 2026 (provided by Mahmoud Saber on Apr 21, 2026):
 *   26012 → 110,000 EGP
 *   26021 → 142,700 EGP
 *   26022 →  62,326 EGP
 *   26023 →  93,630 EGP
 *   26024 → 182,340 EGP
 *   26025 →  50,000 EGP
 */

import mysql from 'mysql2/promise';

const RATE = 55.5;
const CUTOFF = '2026-04-16 00:00:00';

const MISSING_BASES = [
  { clientCode: '26012', baseEgp: 110000 },
  { clientCode: '26021', baseEgp: 142700 },
  { clientCode: '26022', baseEgp: 62326  },
  { clientCode: '26023', baseEgp: 93630  },
  { clientCode: '26024', baseEgp: 182340 },
  { clientCode: '26025', baseEgp: 50000  },
];

const db = await mysql.createConnection(process.env.DATABASE_URL);
console.log('Connected to database.');

// ─── Step 1: Get all clients from DB ─────────────────────────────────────────
const [dbClients] = await db.query('SELECT id, clientCode, contractValueEur, remainingAmountEur FROM finClients');
const clientMap = {};
for (const c of dbClients) clientMap[c.clientCode] = c;

// ─── Step 2: Get income transactions from April 16 onwards per client ─────────
const [aggRows] = await db.query(`
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

// ─── Step 3: Apply base fixes for the 6 missing clients ──────────────────────
console.log('\n--- Fixing 6 missing legacy clients ---');
for (const { clientCode, baseEgp } of MISSING_BASES) {
  const client = clientMap[clientCode];
  if (!client) {
    console.warn(`  ⚠ Client code ${clientCode} not found in DB — skipping`);
    continue;
  }
  const baseEur = baseEgp / RATE;
  const { txEur = 0, txEgp = 0 } = aggMap[client.id] ?? {};
  const totalEur = baseEur + txEur + (txEgp / RATE);
  const totalEgp = baseEgp + txEgp + (txEur * RATE);
  const contractVal = Number(client.contractValueEur ?? 0);
  const newRemaining = contractVal > 0 ? contractVal - totalEur : Number(client.remainingAmountEur ?? 0);

  await db.query(`
    UPDATE finClients SET
      basePaidAmountEur  = ?,
      paidAmountEur      = ?,
      paidAmountEgp      = ?,
      remainingAmountEur = ?
    WHERE id = ?
  `, [baseEur.toFixed(4), totalEur.toFixed(2), totalEgp.toFixed(2), newRemaining.toFixed(2), client.id]);

  console.log(`  ✓ ${clientCode}: baseEgp=${baseEgp} → baseEur=${baseEur.toFixed(4)}, paidEgp=${totalEgp.toFixed(2)}, paidEur=${totalEur.toFixed(2)}, remaining=${newRemaining.toFixed(2)}`);
}

// ─── Step 4: Full bulk recalculation for ALL clients ─────────────────────────
console.log('\n--- Running full bulk recalculation for ALL clients ---');

// Re-fetch updated client list with basePaidAmountEur
const [allClients] = await db.query('SELECT id, clientCode, basePaidAmountEur, contractValueEur, remainingAmountEur FROM finClients WHERE clientCode IS NOT NULL');

// Re-fetch ALL income transactions from April 16 onwards
const [allAgg] = await db.query(`
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

const allAggMap = {};
for (const r of allAgg) {
  allAggMap[r.finClientId] = { txEur: Number(r.txEur ?? 0), txEgp: Number(r.txEgp ?? 0) };
}

const updates = [];
for (const client of allClients) {
  const baseEur = Number(client.basePaidAmountEur ?? 0);
  const baseEgp = baseEur * RATE;
  const { txEur = 0, txEgp = 0 } = allAggMap[client.id] ?? {};
  const totalEur = baseEur + txEur + (txEgp / RATE);
  const totalEgp = baseEgp + txEgp + (txEur * RATE);
  const contractVal = Number(client.contractValueEur ?? 0);
  const newRemaining = contractVal > 0 ? contractVal - totalEur : Number(client.remainingAmountEur ?? 0);
  updates.push({
    id: client.id,
    paidEur: totalEur.toFixed(2),
    paidEgp: totalEgp.toFixed(2),
    remaining: newRemaining.toFixed(2),
  });
}

// Batch update in groups of 50
const BATCH = 50;
let done = 0;
for (let i = 0; i < updates.length; i += BATCH) {
  const batch = updates.slice(i, i + BATCH);
  const ids = batch.map(u => u.id);
  const caseEur  = batch.map(u => `WHEN id=${u.id} THEN '${u.paidEur}'`).join(' ');
  const caseEgp  = batch.map(u => `WHEN id=${u.id} THEN '${u.paidEgp}'`).join(' ');
  const caseRem  = batch.map(u => `WHEN id=${u.id} THEN '${u.remaining}'`).join(' ');
  await db.query(`
    UPDATE finClients SET
      paidAmountEur      = CASE ${caseEur}  END,
      paidAmountEgp      = CASE ${caseEgp}  END,
      remainingAmountEur = CASE ${caseRem}  END
    WHERE id IN (${ids.join(',')})
  `);
  done += batch.length;
  process.stdout.write(`  Recalculated ${done}/${updates.length} clients\r`);
}
console.log(`\n✓ Bulk recalculation complete for ${done} clients.`);

// ─── Step 5: Verify the 6 fixed clients ──────────────────────────────────────
console.log('\n--- Verification ---');
const codes = MISSING_BASES.map(b => `'${b.clientCode}'`).join(',');
const [verify] = await db.query(
  `SELECT clientCode, basePaidAmountEur, paidAmountEur, paidAmountEgp, remainingAmountEur FROM finClients WHERE clientCode IN (${codes}) ORDER BY clientCode`
);
for (const r of verify) {
  console.log(`  ${r.clientCode}: base=${r.basePaidAmountEur} EUR | paidEgp=${r.paidAmountEgp} | paidEur=${r.paidAmountEur} | remaining=${r.remainingAmountEur}`);
}

// Also verify 25098 and 250124 haven't changed
const [v2] = await db.query(
  "SELECT clientCode, basePaidAmountEur, paidAmountEur, paidAmountEgp FROM finClients WHERE clientCode IN ('25098','250124')"
);
console.log('\n--- Sanity check for 25098 and 250124 ---');
for (const r of v2) {
  console.log(`  ${r.clientCode}: base=${r.basePaidAmountEur} EUR | paidEgp=${r.paidAmountEgp} | paidEur=${r.paidAmountEur}`);
}

await db.end();
console.log('\nDone.');
