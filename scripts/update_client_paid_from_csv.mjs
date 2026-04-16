import { execSync } from 'child_process';
import mysql from 'mysql2/promise';
import fs from 'fs';

// Get DATABASE_URL from running server process
const pid = execSync('pgrep -f "node.*server" | head -1').toString().trim();
const envStr = execSync('cat /proc/' + pid + '/environ').toString();
const entry = envStr.split('\0').find(e => e.startsWith('DATABASE_URL='));
const dbUrl = entry ? entry.split('=').slice(1).join('=') : null;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await mysql.createConnection(dbUrl);

// ── Parse CSV ─────────────────────────────────────────────────────────────────
const csvPath = '/home/ubuntu/upload/ClientsDataBase031460429dd840c88e5e0cc20278d4ce.csv';
const lines = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '').split('\n');

// Parse each line: extract client code from name column, paidEgp, remainingEur
const csvClients = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // Split CSV respecting quoted fields
  const cols = [];
  let inQuote = false, cur = '';
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  cols.push(cur.trim());

  if (cols.length < 4) continue;

  const nameRaw = cols[1] || '';
  const paidEgpRaw = cols[2] || '0';
  const remainingRaw = cols[3] || '0';

  // Extract client code from name: look for pattern like (25098) or (260001) or (24001)
  const codeMatch = nameRaw.match(/\(?\s*(\d{5,6})\s*\)?/);
  const clientCode = codeMatch ? codeMatch[1] : null;

  // Parse paid EGP
  const paidEgp = parseFloat(paidEgpRaw.replace(/,/g, '')) || 0;

  // Parse remaining EUR: remove € sign, commas, spaces
  const remainingClean = remainingRaw.replace(/[€\s,]/g, '').replace('−', '-');
  const remainingEur = parseFloat(remainingClean) || 0;

  if (clientCode) {
    csvClients.push({ clientCode, paidEgp, remainingEur, nameRaw: nameRaw.replace(/\n/g, ' ').trim() });
  }
}

console.log(`Parsed ${csvClients.length} clients from CSV`);

// ── Fetch all DB clients ───────────────────────────────────────────────────────
const [dbClients] = await conn.execute(`
  SELECT id, clientCode, name, contractValueEur, paidAmountEur, paidAmountEgp, remainingAmountEur
  FROM finClients
  ORDER BY id
`);

// Build a map: clientCode -> db record
const dbMap = {};
for (const c of dbClients) {
  if (c.clientCode) dbMap[c.clientCode] = c;
}

// ── Match and update ──────────────────────────────────────────────────────────
let updated = 0, notFound = 0;
const notFoundList = [];

for (const csv of csvClients) {
  const db = dbMap[csv.clientCode];
  if (!db) {
    notFound++;
    notFoundList.push(`${csv.clientCode} - ${csv.nameRaw.substring(0, 50)}`);
    continue;
  }

  // Calculate paidAmountEur from remaining:
  // paidAmountEur = contractValueEur - remainingEur
  const contractVal = parseFloat(db.contractValueEur || 0);
  let paidEur;
  if (contractVal > 0) {
    paidEur = contractVal - csv.remainingEur;
  } else {
    // No contract value, estimate from EGP using 61.89 rate
    paidEur = csv.paidEgp / 61.89;
  }

  await conn.execute(`
    UPDATE finClients SET
      basePaidAmountEur = ?,
      paidAmountEur = ?,
      paidAmountEgp = ?,
      remainingAmountEur = ?
    WHERE id = ?
  `, [
    paidEur.toFixed(2),
    paidEur.toFixed(2),
    csv.paidEgp.toFixed(2),
    csv.remainingEur.toFixed(2),
    db.id
  ]);
  updated++;
}

console.log(`\n✅ Updated: ${updated} clients`);
console.log(`⚠️  Not found in DB: ${notFound} clients`);
if (notFoundList.length > 0) {
  console.log('\nNot found:');
  notFoundList.forEach(n => console.log('  -', n));
}

// ── Verify sample ─────────────────────────────────────────────────────────────
const [sample] = await conn.execute(`
  SELECT id, clientCode, name, basePaidAmountEur, paidAmountEur, remainingAmountEur
  FROM finClients
  WHERE paidAmountEur > 0
  ORDER BY id DESC
  LIMIT 5
`);
console.log('\nSample of updated clients:');
sample.forEach(r => {
  console.log(`  ${r.clientCode} | ${String(r.name).substring(0, 30).padEnd(30)} | paid: ${r.paidAmountEur} | remaining: ${r.remainingAmountEur}`);
});

await conn.end();
console.log('\n✅ Done!');
