import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find Cash EGP account and Salary category IDs
const [accounts] = await conn.query("SELECT id, name FROM finAccounts WHERE name LIKE '%Cash%EGP%' OR name LIKE '%Cash EGP%' LIMIT 5");
const [categories] = await conn.query("SELECT id, name FROM finCategories WHERE name LIKE '%Salary%' OR name LIKE '%salary%' LIMIT 5");
console.log("Cash EGP accounts:", accounts);
console.log("Salary categories:", categories);

// Find the 3 target users
const emails = [
  "mohamed.abdelfatah@elevay.com",
  "ziad.elshurafa@elevay.com",
  "walid.mammdouh@elevay.com",
  "walid.mamdouh@elevay.com",
];
const [users] = await conn.query(
  `SELECT id, name, email FROM users WHERE email IN (${emails.map(() => "?").join(",")})`,
  emails
);
console.log("Target users:", users);

// Check column names in userPermissions
const [cols] = await conn.query("DESCRIBE userPermissions");
console.log("userPermissions columns:", cols.map(c => c.Field));

// Grant fin_salary_receipts access to each user
for (const user of users) {
  // Check if entry exists
  const [existing] = await conn.query(
    "SELECT id FROM userPermissions WHERE userId = ? AND pageKey = ?",
    [user.id, "fin_salary_receipts"]
  );
  if (existing.length > 0) {
    await conn.query(
      "UPDATE userPermissions SET canAccess = 1, canCreate = 1, canEdit = 1 WHERE userId = ? AND pageKey = ?",
      [user.id, "fin_salary_receipts"]
    );
    console.log(`Updated fin_salary_receipts for ${user.name} (${user.email})`);
  } else {
    await conn.query(
      "INSERT INTO userPermissions (userId, pageKey, canAccess, canCreate, canEdit) VALUES (?, ?, 1, 1, 1)",
      [user.id, "fin_salary_receipts"]
    );
    console.log(`Granted fin_salary_receipts to ${user.name} (${user.email})`);
  }
}

await conn.end();
console.log("Done.");
