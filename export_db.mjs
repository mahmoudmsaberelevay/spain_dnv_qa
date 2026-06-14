import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const DB_URL = process.env.DATABASE_URL;
const url = new URL(DB_URL);

const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port) || 4000,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log('Connected to database');

// Get all tables
const [tables] = await conn.query("SHOW TABLES");
const tableNames = tables.map(r => Object.values(r)[0]);
console.log('Tables found:', tableNames);

const backup = {};
const sqlLines = [];
sqlLines.push('-- ELEVAY Full Database Backup');
sqlLines.push(`-- Date: ${new Date().toISOString()}`);
sqlLines.push('-- Database: ELEVAY CRM System');
sqlLines.push('');
sqlLines.push('SET FOREIGN_KEY_CHECKS=0;');
sqlLines.push('');

for (const table of tableNames) {
  console.log(`Exporting table: ${table}`);
  
  // Get CREATE TABLE
  const [createResult] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
  const createSQL = createResult[0]['Create Table'];
  sqlLines.push(`-- Table: ${table}`);
  sqlLines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
  sqlLines.push(createSQL + ';');
  sqlLines.push('');

  // Get data
  const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
  backup[table] = rows;
  
  if (rows.length > 0) {
    const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ');
    const chunks = [];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const values = chunk.map(row => {
        const vals = Object.values(row).map(v => {
          if (v === null) return 'NULL';
          if (typeof v === 'number' || typeof v === 'bigint') return v.toString();
          if (v instanceof Date) return `'${v.toISOString()}'`;
          return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
        }).join(', ');
        return `(${vals})`;
      }).join(',\n  ');
      chunks.push(`INSERT INTO \`${table}\` (${cols}) VALUES\n  ${values};`);
    }
    sqlLines.push(...chunks);
    sqlLines.push('');
  }
  
  console.log(`  → ${rows.length} rows`);
}

sqlLines.push('SET FOREIGN_KEY_CHECKS=1;');

// Write SQL backup
fs.writeFileSync('/home/ubuntu/elevay_backup/elevay_db_backup.sql', sqlLines.join('\n'));
console.log('SQL backup written');

// Write JSON backup
fs.writeFileSync('/home/ubuntu/elevay_backup/elevay_db_backup.json', JSON.stringify(backup, null, 2));
console.log('JSON backup written');

await conn.end();
console.log('Done!');
