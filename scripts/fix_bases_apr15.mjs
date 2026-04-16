/**
 * Set basePaidAmountEur for clients 25098 and 250124 to their full paid amount as of April 15, 2026.
 * The base absorbs ALL existing transactions (including the April 12 and April 14 entries).
 * Going forward, only transactions dated April 16, 2026 onwards will be added on top.
 *
 * Client 25098:  base EGP = 232,580  → base EUR = 232580 / 55.5 = 4190.63
 * Client 250124: base EGP = 464,076  → base EUR = 464076 / 55.5 = 8361.73
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const RATE = 55.5;
const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('Connected.');

const targets = [
  { clientCode: '25098',  baseEgp: 232580 },
  { clientCode: '250124', baseEgp: 464076 },
];

for (const { clientCode, baseEgp } of targets) {
  const [[client]] = await conn.query(
    "SELECT id, contractValueEur FROM finClients WHERE clientCode=?",
    [clientCode]
  );
  if (!client) { console.log(`Client ${clientCode} not found`); continue; }

  const baseEur = baseEgp / RATE;

  // Update basePaidAmountEur to the full amount as of April 15
  await conn.query(
    "UPDATE finClients SET basePaidAmountEur=? WHERE id=?",
    [baseEur.toFixed(4), client.id]
  );

  // Now recalculate: base + transactions from April 16 onwards
  const cutoff = '2026-04-16 00:00:00';
  const [txRows] = await conn.query(
    "SELECT ft.amount, fa.currency FROM finTransactions ft LEFT JOIN finAccounts fa ON fa.id=ft.accountId WHERE ft.finClientId=? AND ft.type='income' AND ft.transactionDate >= ?",
    [client.id, cutoff]
  );

  let txEgp = 0, txEur = 0;
  for (const r of txRows) {
    const currency = r.currency ?? 'EGP';
    const amt = Number(r.amount);
    if (currency === 'EUR') { txEur += amt; txEgp += amt * RATE; }
    else { txEgp += amt; txEur += amt / RATE; }
  }

  const totalEur = baseEur + txEur;
  const totalEgp = baseEgp + txEgp;
  const contractVal = Number(client.contractValueEur ?? 0);
  const newRemaining = contractVal > 0 ? contractVal - totalEur : 0;

  await conn.query(
    "UPDATE finClients SET paidAmountEur=?, paidAmountEgp=?, remainingAmountEur=? WHERE id=?",
    [totalEur.toFixed(2), totalEgp.toFixed(2), newRemaining.toFixed(2), client.id]
  );

  console.log(`✓ Client ${clientCode}: paidEgp=${totalEgp.toFixed(2)}, paidEur=${totalEur.toFixed(2)}, remaining=${newRemaining.toFixed(2)}`);
}

await conn.end();
console.log('Done.');
