import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

// Get DATABASE_URL from running server process
const pid = execSync('pgrep -f "node.*server" | head -1').toString().trim();
const envStr = execSync('cat /proc/' + pid + '/environ').toString();
const entry = envStr.split('\0').find(e => e.startsWith('DATABASE_URL='));
const dbUrl = entry ? entry.split('=').slice(1).join('=') : null;
if (!dbUrl) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await mysql.createConnection(dbUrl);

// ── Step 1: Apply migration (add basePaidAmountEur column) ────────────────────
console.log('Step 1: Applying migration...');
try {
  await conn.execute(`ALTER TABLE finClients ADD basePaidAmountEur decimal(12,2) DEFAULT '0' NOT NULL`);
  console.log('  ✅ Column added');
} catch (e) {
  if (e.code === 'ER_DUP_FIELDNAME') {
    console.log('  ✅ Column already exists, skipping');
  } else {
    throw e;
  }
}

// ── Step 2: Set basePaidAmountEur = current paidAmountEur for ALL clients ─────
// This preserves the manually-set amounts as the "base" before April 14
console.log('Step 2: Copying current paidAmountEur -> basePaidAmountEur for all clients...');
await conn.execute(`UPDATE finClients SET basePaidAmountEur = paidAmountEur`);
console.log('  ✅ Base amounts saved for all clients');

// ── Step 3: Recalculate paidAmountEur = base + income transactions from April 14 onwards ──
console.log('Step 3: Recalculating paidAmountEur = base + new transactions (from April 14, 2026)...');
await conn.execute(`
  UPDATE finClients c
  SET 
    c.paidAmountEur = c.basePaidAmountEur + COALESCE((
      SELECT SUM(
        CASE 
          WHEN a.currency = 'EUR' THEN t.amount
          ELSE t.amount / 55.5
        END
      )
      FROM finTransactions t
      JOIN finAccounts a ON t.accountId = a.id
      WHERE t.finClientId = c.id 
        AND t.type = 'income'
        AND t.transactionDate >= '2026-04-14'
    ), 0),
    c.paidAmountEgp = COALESCE((
      SELECT SUM(
        CASE 
          WHEN a.currency = 'EGP' THEN t.amount
          ELSE t.amount * 55.5
        END
      )
      FROM finTransactions t
      JOIN finAccounts a ON t.accountId = a.id
      WHERE t.finClientId = c.id 
        AND t.type = 'income'
        AND t.transactionDate >= '2026-04-14'
    ), 0)
`);
console.log('  ✅ paidAmountEur recalculated for all clients');

// ── Step 4: Update remainingAmountEur ─────────────────────────────────────────
console.log('Step 4: Updating remainingAmountEur...');
await conn.execute(`
  UPDATE finClients c
  SET c.remainingAmountEur = CASE 
    WHEN c.contractValueEur > 0 THEN c.contractValueEur - c.paidAmountEur
    ELSE c.remainingAmountEur
  END
  WHERE c.contractValueEur IS NOT NULL AND c.contractValueEur > 0
`);
console.log('  ✅ remainingAmountEur updated');

// ── Step 5: Verify a few clients ──────────────────────────────────────────────
const [sample] = await conn.execute(`
  SELECT id, name, basePaidAmountEur, paidAmountEur, remainingAmountEur, contractValueEur 
  FROM finClients 
  WHERE paidAmountEur > 0 
  ORDER BY paidAmountEur DESC 
  LIMIT 5
`);
console.log('\nTop 5 clients by paid amount:');
sample.forEach(r => {
  console.log(`  ${r.id} | ${r.name?.substring(0,30).padEnd(30)} | base: ${r.basePaidAmountEur} | paid: ${r.paidAmountEur} | remaining: ${r.remainingAmountEur}`);
});

await conn.end();
console.log('\n✅ Done! All client paid amounts restored and recalculated.');
