import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// User IDs (primary accounts after merge)
const MADONNA = 933743;
const FOUAD = 933919;
const KIROLOS = 933948;

// Pages that "contracting = full" should grant
const CONTRACTING_PAGES = ['contracts', 'receipts', 'contracting'];

// For Madonna: also fix fin_upcoming (canEdit=1, canCreate=1)
// For Kirolos: fix contracts + receipts canCreate=0 → 1, add contracting entry
// For Fouad: remove duplicate contracting entry (keep id=60010, remove id=60001)

async function upsertPerm(userId, pageKey, canAccess, canEdit, canCreate) {
  const [existing] = await conn.execute(
    'SELECT id FROM userPermissions WHERE userId = ? AND pageKey = ?',
    [userId, pageKey]
  );
  if (existing.length > 0) {
    await conn.execute(
      'UPDATE userPermissions SET canAccess=?, canEdit=?, canCreate=?, updatedAt=NOW() WHERE userId=? AND pageKey=?',
      [canAccess, canEdit, canCreate, userId, pageKey]
    );
    console.log(`  UPDATED userId=${userId} pageKey=${pageKey} → access=${canAccess} edit=${canEdit} create=${canCreate}`);
  } else {
    await conn.execute(
      'INSERT INTO userPermissions (userId, pageKey, canAccess, canEdit, canCreate, updatedAt) VALUES (?,?,?,?,?,NOW())',
      [userId, pageKey, canAccess, canEdit, canCreate]
    );
    console.log(`  INSERTED userId=${userId} pageKey=${pageKey} → access=${canAccess} edit=${canEdit} create=${canCreate}`);
  }
}

console.log('\n=== Fixing KIROLOS (id=933948) ===');
// Set contracts + receipts + contracting to full (canCreate=1)
for (const page of CONTRACTING_PAGES) {
  await upsertPerm(KIROLOS, page, 1, 1, 1);
}

console.log('\n=== Fixing MADONNA (id=933743) ===');
// Add contracts + receipts + contracting with full access
for (const page of CONTRACTING_PAGES) {
  await upsertPerm(MADONNA, page, 1, 1, 1);
}
// Fix fin_upcoming to have edit + create access
await upsertPerm(MADONNA, 'fin_upcoming', 1, 1, 1);

console.log('\n=== Fixing FOUAD (id=933919) ===');
// Remove duplicate contracting entry (id=60001), keep id=60010
const [dups] = await conn.execute(
  'SELECT id FROM userPermissions WHERE userId=? AND pageKey=? ORDER BY id ASC',
  [FOUAD, 'contracting']
);
if (dups.length > 1) {
  const toDelete = dups.slice(0, dups.length - 1).map(r => r.id);
  for (const id of toDelete) {
    await conn.execute('DELETE FROM userPermissions WHERE id=?', [id]);
    console.log(`  DELETED duplicate contracting entry id=${id} for Fouad`);
  }
} else {
  console.log('  No duplicate contracting entries for Fouad');
}
// Ensure contracts + receipts are full
for (const page of CONTRACTING_PAGES) {
  await upsertPerm(FOUAD, page, 1, 1, 1);
}

console.log('\n=== Verification ===');
const ids = [MADONNA, FOUAD, KIROLOS];
const placeholders = ids.map(() => '?').join(',');
const [result] = await conn.execute(
  `SELECT userId, pageKey, canAccess, canEdit, canCreate FROM userPermissions 
   WHERE userId IN (${placeholders}) AND pageKey IN ('contracts','receipts','contracting','fin_upcoming')
   ORDER BY userId, pageKey`,
  ids
);
result.forEach(r => console.log(`  userId=${r.userId} ${r.pageKey}: access=${r.canAccess} edit=${r.canEdit} create=${r.canCreate}`));

await conn.end();
console.log('\nDone!');
