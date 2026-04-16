import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [clients] = await conn.query(
  "SELECT id, clientCode, paidAmountEur, paidAmountEgp, basePaidAmountEur, contractValueEur, remainingAmountEur FROM finClients WHERE clientCode IN ('25098','250124')"
);
console.log('Clients:', JSON.stringify(clients, null, 2));

for (const c of clients) {
  const [txs] = await conn.query(
    "SELECT ft.id, ft.amount, ft.transactionDate, ft.description, fa.currency, fa.name AS accountName FROM finTransactions ft LEFT JOIN finAccounts fa ON fa.id=ft.accountId WHERE ft.finClientId=? AND ft.type='income' ORDER BY ft.transactionDate",
    [c.id]
  );
  console.log(`\nIncome transactions for ${c.clientCode} (id=${c.id}):`, JSON.stringify(txs, null, 2));
}

await conn.end();
