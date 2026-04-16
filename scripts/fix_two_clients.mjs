/**
 * Fix base paid amounts for clients 25098 and 250124.
 *
 * Formula: paidAmountEgp = (basePaidAmountEur * 55.5) + SUM(all income tx EGP equiv)
 *
 * Client 25098:  target EGP = 232,580  |  has tx = 120,000 EGP  |  base EGP = 112,580  |  base EUR = 112580/55.5 = 2028.47
 * Client 250124: target EGP = 464,076  |  has tx = 124,000 EGP  |  base EGP = 340,076  |  base EUR = 340076/55.5 = 6127.50
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('Connected.');

const RATE = 55.5;

const targets = [
  { clientCode: '25098',  targetEgp: 232580 },
  { clientCode: '250124', targetEgp: 464076 },
];

for (const { clientCode, targetEgp } of targets) {
  // Get client
  const [[client]] = await conn.query(
    "SELECT id, contractValueEur FROM finClients WHERE clientCode=?",
    [clientCode]
  );
  if (!client) { console.log(`Client ${clientCode} not found`); continue; }

  // Sum all existing income transactions for this client (in EGP equivalent)
  const [txRows] = await conn.query(
    "SELECT ft.amount, fa.currency FROM finTransactions ft LEFT JOIN finAccounts fa ON fa.id=ft.accountId WHERE ft.finClientId=? AND ft.type='income'",
    [client.id]
  );

  let txEgp = 0, txEur = 0;
  for (const r of txRows) {
    const currency = r.currency ?? 'EGP';
    const amt = Number(r.amount);
    if (currency === 'EUR') { txEur += amt; txEgp += amt * RATE; }
    else { txEgp += amt; txEur += amt / RATE; }
  }

  // base EGP = targetEgp - txEgp
  const baseEgp = targetEgp - txEgp;
  const baseEur = baseEgp / RATE;

  console.log(`Client ${clientCode} (id=${client.id}):`);
  console.log(`  txEgp=${txEgp.toFixed(2)}, txEur=${txEur.toFixed(4)}`);
  console.log(`  baseEgp=${baseEgp.toFixed(2)}, baseEur=${baseEur.toFixed(4)}`);

  // Update basePaidAmountEur
  await conn.query(
    "UPDATE finClients SET basePaidAmountEur=? WHERE id=?",
    [baseEur.toFixed(4), client.id]
  );

  // Now recalculate final paid amounts using the formula
  const totalEur = baseEur + txEur;
  const totalEgp = baseEgp + txEgp; // = targetEgp exactly
  const contractVal = Number(client.contractValueEur ?? 0);
  const newRemaining = contractVal > 0 ? contractVal - totalEur : 0;

  await conn.query(
    "UPDATE finClients SET paidAmountEur=?, paidAmountEgp=?, remainingAmountEur=? WHERE id=?",
    [totalEur.toFixed(2), totalEgp.toFixed(2), newRemaining.toFixed(2), client.id]
  );

  console.log(`  ✓ paidAmountEur=${totalEur.toFixed(2)}, paidAmountEgp=${totalEgp.toFixed(2)}, remaining=${newRemaining.toFixed(2)}`);
}

await conn.end();
console.log('\nDone. Both clients corrected.');
