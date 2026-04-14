import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const sql = `CREATE TABLE IF NOT EXISTS \`settlementPayments\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`clientName\` varchar(255),
  \`finClientId\` int,
  \`amountAed\` decimal(12,2) NOT NULL,
  \`amountEur\` decimal(12,2) NOT NULL,
  \`serviceDate\` date NOT NULL,
  \`notes\` text,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`settlementPayments_id\` PRIMARY KEY(\`id\`)
)`;

const conn = await mysql.createConnection(process.env.DATABASE_URL);
await conn.execute(sql);
console.log("✅ settlementPayments table created");
await conn.end();
