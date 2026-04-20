import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Duplicate pairs: [primaryId (keep), duplicateId (remove)]
const pairs = [
  { primary: 933743, duplicate: 1621579, email: 'madonna.adel@elevay.com' },
  { primary: 933843, duplicate: 1320006, email: 'minerva.aguilar@elevay.com' },
  { primary: 933919, duplicate: 1621880, email: 'fouad.abdo@elevay.com' },
];

// Tables that reference userId (integer FK)
const userIdTables = [
  { table: 'modulePermissions', col: 'userId' },
  { table: 'userPermissions',   col: 'userId' },
  { table: 'cases',             col: 'userId' },
];

for (const { primary, duplicate, email } of pairs) {
  console.log(`\nMerging ${email}: duplicate ${duplicate} → primary ${primary}`);

  for (const { table, col } of userIdTables) {
    // Check if primary already has a row in this table (to avoid unique constraint violations)
    const [primRows] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM \`${table}\` WHERE \`${col}\` = ?`, [primary]
    );
    const [dupRows] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM \`${table}\` WHERE \`${col}\` = ?`, [duplicate]
    );
    const primCount = primRows[0].cnt;
    const dupCount = dupRows[0].cnt;

    if (dupCount === 0) {
      console.log(`  ${table}: no rows for duplicate, skip`);
      continue;
    }

    if (table === 'modulePermissions' || table === 'userPermissions') {
      // For permissions tables: if primary already has entries, just delete the duplicate's entries
      // (primary's permissions are authoritative)
      if (primCount > 0) {
        await conn.execute(`DELETE FROM \`${table}\` WHERE \`${col}\` = ?`, [duplicate]);
        console.log(`  ${table}: deleted ${dupCount} duplicate rows (primary already has ${primCount})`);
      } else {
        await conn.execute(`UPDATE \`${table}\` SET \`${col}\` = ? WHERE \`${col}\` = ?`, [primary, duplicate]);
        console.log(`  ${table}: reassigned ${dupCount} rows to primary`);
      }
    } else {
      // For other tables: reassign all rows
      await conn.execute(`UPDATE \`${table}\` SET \`${col}\` = ? WHERE \`${col}\` = ?`, [primary, duplicate]);
      console.log(`  ${table}: reassigned ${dupCount} rows to primary`);
    }
  }

  // Delete the duplicate user
  await conn.execute(`DELETE FROM users WHERE id = ?`, [duplicate]);
  console.log(`  users: deleted duplicate id=${duplicate}`);
}

// Verify
const [remaining] = await conn.execute(`
  SELECT email, COUNT(*) as cnt, GROUP_CONCAT(id ORDER BY id ASC) as ids
  FROM users
  GROUP BY email
  HAVING cnt > 1
`);
console.log('\nRemaining duplicates:', remaining.length === 0 ? 'NONE ✓' : JSON.stringify(remaining));

// Show final user list
const [all] = await conn.execute(`SELECT id, name, email FROM users ORDER BY email, id`);
console.log('\nFinal user list:');
all.forEach(u => console.log(`  [${u.id}] ${u.name} <${u.email}>`));

await conn.end();
process.exit(0);
