import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.execute(`
  SELECT email, COUNT(*) as cnt, 
         GROUP_CONCAT(id ORDER BY id ASC) as ids, 
         GROUP_CONCAT(name ORDER BY id ASC SEPARATOR ' | ') as names
  FROM users
  GROUP BY email
  HAVING cnt > 1
  ORDER BY cnt DESC
`);

console.log('Duplicate accounts found:', rows.length);
console.log(JSON.stringify(rows, null, 2));

// Also show all users for reference
const [all] = await conn.execute(`SELECT id, name, email, role, createdAt FROM users ORDER BY email, id`);
console.log('\nAll users:');
console.log(JSON.stringify(all, null, 2));

await conn.end();
process.exit(0);
