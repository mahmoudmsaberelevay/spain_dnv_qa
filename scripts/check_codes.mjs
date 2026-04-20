import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SELECT contractCode FROM contracts ORDER BY contractCode DESC LIMIT 10");
console.log("Latest contract codes:", rows.map(r => r.contractCode));
const [count] = await conn.execute("SELECT COUNT(*) as cnt FROM contracts WHERE LEFT(contractCode,2)='26'");
console.log("Total 2026 contracts:", count[0].cnt);
await conn.end();
