/**
 * Sets basePaidAmountEur for ALL clients from the CSV.
 * CSV column "Income From IN EGP" = full paid amount as of end of April 15, 2026.
 * After setting the base, recalculates paidAmountEur/EGP using:
 *   paidAmountEgp = baseEgp + income transactions from April 16, 2026 onwards (EGP equiv)
 *   paidAmountEur = baseEur + income transactions from April 16, 2026 onwards (EUR equiv)
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const RATE = 55.5;
const CUTOFF = '2026-04-16 00:00:00';
const CSV_PATH = '/home/ubuntu/upload/ClientsDataBase031460429dd840c88e5e0cc20278d4ce.csv';

// ─── Parse CSV ────────────────────────────────────────────────────────────────
const raw = fs.readFileSync(CSV_PATH, 'utf-8').replace(/^\uFEFF/, ''); // strip BOM
const lines = raw.split('\n').filter(l => l.trim());
// Skip header
const csvData = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // Parse CSV row (handle quoted fields)
  const cols = [];
  let cur = '', inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  cols.push(cur.trim());

  const nameField = cols[1] ?? '';
  const egpField = cols[2] ?? '0';

  // Extract client code from name field — pattern: (XXXXXX) or ( XXXXXX )
  const codeMatch = nameField.match(/\(\s*(\d+)\s*\)/);
  if (!codeMatch) continue;
  const clientCode = codeMatch[1].trim();

  // Parse EGP amount — remove commas, spaces
  const baseEgp = parseFloat(egpField.replace(/[,\s]/g, '')) || 0;

  csvData.push({ clientCode, baseEgp });
}

console.log(`Parsed ${csvData.length} clients from CSV.`);

// ─── Connect to DB ────────────────────────────────────────────────────────────
const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('Connected to database.');

// ─── Get all income transactions from April 16 onwards (grouped by client) ───
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

// ─── Get all clients from DB ──────────────────────────────────────────────────
const [dbClients] = await conn.query('SELECT id, clientCode, contractValueEur, remainingAmountEur FROM finClients');
const clientMap = {};
for (const c of dbClients) clientMap[c.clientCode] = c;

// ─── Apply updates ────────────────────────────────────────────────────────────
let updated = 0, notFound = 0;
const updates = [];

for (const { clientCode, baseEgp } of csvData) {
  const client = clientMap[clientCode];
  if (!client) {
    console.warn(`  ⚠ Client code ${clientCode} not found in DB`);
    notFound++;
    continue;
  }

  const baseEur = baseEgp / RATE;
  const { txEur = 0, txEgp = 0 } = aggMap[client.id] ?? {};

  const totalEur = baseEur + txEur + (txEgp / RATE);
  const totalEgp = baseEgp + txEgp + (txEur * RATE);
  const contractVal = Number(client.contractValueEur ?? 0);
  const newRemaining = contractVal > 0 ? contractVal - totalEur : Number(client.remainingAmountEur ?? 0);

  updates.push({
    id: client.id,
    baseEur: baseEur.toFixed(4),
    paidEur: totalEur.toFixed(2),
    paidEgp: totalEgp.toFixed(2),
    remaining: newRemaining.toFixed(2),
    clientCode,
    baseEgp,
  });
}

// Batch update in groups of 50
const BATCH = 50;
for (let i = 0; i < updates.length; i += BATCH) {
  const batch = updates.slice(i, i + BATCH);
  const ids = batch.map(u => u.id);
  const caseBase = batch.map(u => `WHEN id=${u.id} THEN '${u.baseEur}'`).join(' ');
  const caseEur  = batch.map(u => `WHEN id=${u.id} THEN '${u.paidEur}'`).join(' ');
  const caseEgp  = batch.map(u => `WHEN id=${u.id} THEN '${u.paidEgp}'`).join(' ');
  const caseRem  = batch.map(u => `WHEN id=${u.id} THEN '${u.remaining}'`).join(' ');
  await conn.query(`
    UPDATE finClients SET
      basePaidAmountEur  = CASE ${caseBase} END,
      paidAmountEur      = CASE ${caseEur}  END,
      paidAmountEgp      = CASE ${caseEgp}  END,
      remainingAmountEur = CASE ${caseRem}  END
    WHERE id IN (${ids.join(',')})
  `);
  updated += batch.length;
  process.stdout.write(`  Updated ${updated}/${updates.length}\r`);
}

console.log(`\n✓ Updated ${updated} clients from CSV.`);
if (notFound > 0) console.warn(`⚠ ${notFound} client codes from CSV not found in DB.`);

// ─── Verify the two specific clients ─────────────────────────────────────────
const [verify] = await conn.query(
  "SELECT clientCode, paidAmountEur, paidAmountEgp, basePaidAmountEur, remainingAmountEur FROM finClients WHERE clientCode IN ('25098','250124')"
);
console.log('\nVerification for 25098 and 250124:');
for (const r of verify) {
  console.log(`  ${r.clientCode}: paidEgp=${r.paidAmountEgp}, paidEur=${r.paidAmountEur}, base=${r.basePaidAmountEur}, remaining=${r.remainingAmountEur}`);
}

await conn.end();
console.log('\nDone.');
