/**
 * Merges duplicate user accounts.
 * For each pair: reassigns all data from the duplicate (remove) to the primary (keep),
 * then deletes the duplicate user row.
 *
 * Pairs (keep → remove):
 *   Fouad:   933919 ← 1080516
 *   Kirolos: 933948 ← 1082257  (different email: kirolos.nabil vs kirlos.nabil)
 *   Madonna: 933743 ← 1083516
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('Connected.');

const merges = [
  { name: 'Fouad',   keep: 933919, remove: 1080516 },
  { name: 'Kirolos', keep: 933948, remove: 1082257 },
  { name: 'Madonna', keep: 933743, remove: 1083516 },
];

// Tables and their userId column names
const tables = [
  { table: 'broadcastDismissals', col: 'userId' },
  { table: 'cases',               col: 'userId' },
  { table: 'clientCases',         col: 'userId' },
  { table: 'documents',           col: 'userId' },
  // finTransactions.createdBy stores email strings, not user IDs — skip
  // { table: 'finTransactions', col: 'createdBy' },
];

// Permission tables — handled separately (avoid duplicate key conflicts)
const permTables = [
  { table: 'modulePermissions', col: 'userId', uniqueKey: 'module' },
  { table: 'userPermissions',   col: 'userId', uniqueKey: 'pageKey' },
];

for (const { name, keep, remove } of merges) {
  console.log(`\n── Merging ${name}: remove id=${remove} → keep id=${keep} ──`);

  // 1. Reassign regular data tables
  for (const { table, col } of tables) {
    const [res] = await conn.query(
      `UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`,
      [keep, remove]
    );
    if (res.affectedRows > 0) console.log(`  ✓ ${table}.${col}: reassigned ${res.affectedRows} rows`);
  }

  // 2. Handle permission tables — skip rows that already exist on keep (avoid duplicate key)
  for (const { table, col, uniqueKey } of permTables) {
    // Get keys already owned by keep
    const [keepRows] = await conn.query(
      `SELECT ${uniqueKey} FROM ${table} WHERE ${col} = ?`, [keep]
    );
    const keepKeys = new Set(keepRows.map(r => r[uniqueKey]));

    // Get rows from remove
    const [removeRows] = await conn.query(
      `SELECT * FROM ${table} WHERE ${col} = ?`, [remove]
    );

    for (const row of removeRows) {
      if (keepKeys.has(row[uniqueKey])) {
        // Already exists on keep — delete the duplicate row
        await conn.query(`DELETE FROM ${table} WHERE id = ?`, [row.id]);
        console.log(`  ✓ ${table}: deleted duplicate ${uniqueKey}=${row[uniqueKey]} (already on keep)`);
      } else {
        // Reassign to keep
        await conn.query(`UPDATE ${table} SET ${col} = ? WHERE id = ?`, [keep, row.id]);
        console.log(`  ✓ ${table}: reassigned ${uniqueKey}=${row[uniqueKey]} to keep`);
      }
    }
  }

  // 3. Delete the duplicate user row
  const [del] = await conn.query(`DELETE FROM users WHERE id = ?`, [remove]);
  console.log(`  ✓ Deleted user id=${remove} (${del.affectedRows} row)`);
}

// Final verification
console.log('\n── Final user list ──');
const [final] = await conn.query(`
  SELECT u.id, u.name, u.email, mp.module, mp.accessLevel
  FROM users u
  LEFT JOIN modulePermissions mp ON mp.userId = u.id
  WHERE u.email IN ('fouad.abdo@elevay.com','kirlos.nabil@elevay.com','kirolos.nabil@elevay.com','madonna.adel@elevay.com','ziad.elshurafa@elevay.com')
  ORDER BY u.email, mp.module
`);
for (const r of final) {
  console.log(`  ${r.name} (${r.id}) | ${r.module}: ${r.accessLevel}`);
}

await conn.end();
console.log('\nDone.');
