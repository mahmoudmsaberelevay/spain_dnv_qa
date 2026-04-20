import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [users] = await conn.execute(
  "SELECT id, name, email, role FROM users WHERE LOWER(name) LIKE '%madonna%' OR LOWER(name) LIKE '%fouad%' OR LOWER(name) LIKE '%kirolos%' OR LOWER(name) LIKE '%kirlos%'"
);
console.log('USERS:');
users.forEach(u => console.log(`  id=${u.id} name="${u.name}" email="${u.email}" role=${u.role}`));

if (users.length > 0) {
  const ids = users.map(u => u.id);
  const placeholders = ids.map(() => '?').join(',');
  const [perms] = await conn.execute(
    `SELECT * FROM module_permissions WHERE user_id IN (${placeholders})`,
    ids
  );
  console.log('\nPERMISSIONS:');
  perms.forEach(p => console.log(`  user_id=${p.user_id}`, JSON.stringify(p)));
}

await conn.end();
