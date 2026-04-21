import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config({ quiet: true });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find the 3 target users (Ziad, Mohamed Abdelfatah, Waleed/Walid)
const [users] = await conn.execute(
  `SELECT id, name, email FROM users WHERE 
   email LIKE '%abdelfattah%' OR email LIKE '%ziad%' OR email LIKE '%waleed%' OR email LIKE '%walid%'
   OR name LIKE '%Mohamed%Abdel%' OR name LIKE '%Ziad%' OR name LIKE '%Waleed%' OR name LIKE '%Walid%'`
);
console.log("Found users:", users.map(u => `${u.name} (${u.id})`));

// Grant fin_commission_receipts access to each via userPermissions
for (const u of users) {
  const [existing] = await conn.execute(
    `SELECT id FROM userPermissions WHERE userId = ? AND pageKey = 'fin_commission_receipts'`,
    [u.id]
  );
  if (existing.length > 0) {
    await conn.execute(
      `UPDATE userPermissions SET canAccess = 1, canCreate = 1, canEdit = 1 WHERE userId = ? AND pageKey = 'fin_commission_receipts'`,
      [u.id]
    );
    console.log(`Updated fin_commission_receipts for ${u.name}`);
  } else {
    await conn.execute(
      `INSERT INTO userPermissions (userId, pageKey, canAccess, canCreate, canEdit) VALUES (?, 'fin_commission_receipts', 1, 1, 1)`,
      [u.id]
    );
    console.log(`Inserted fin_commission_receipts for ${u.name}`);
  }
}

// Verify Commission category and Cash EGP account IDs
const [cats] = await conn.execute(`SELECT id, name FROM finCategories WHERE name LIKE '%Commiss%'`);
console.log("Commission categories:", cats);
const [accs] = await conn.execute(`SELECT id, name FROM finAccounts WHERE name LIKE '%Cash EGP%'`);
console.log("Cash EGP accounts:", accs);

await conn.end();
console.log("Done.");
