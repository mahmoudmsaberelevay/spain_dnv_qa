import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const yearPrefix = 26; // 2026
const prefixStr = String(yearPrefix);

// Simulate the new MAX logic
const [rows] = await conn.execute(
  `SELECT MAX(contractCode) as maxCode FROM contracts WHERE LEFT(contractCode, ?) = ? AND contractCode REGEXP '^[0-9]+$'`,
  [prefixStr.length, prefixStr]
);
const maxCode = rows[0].maxCode;
console.log("Max code found:", maxCode);
const suffix = Number(maxCode.slice(prefixStr.length));
const nextSeq = suffix + 1;
const nextCode = `${yearPrefix}${String(nextSeq).padStart(3, '0')}`;
console.log("Next contract code will be:", nextCode);
await conn.end();
