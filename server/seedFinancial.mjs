import mysql from "mysql2/promise";
import fs from "fs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("No DATABASE_URL"); process.exit(1); }

const url = new URL(DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname, port: Number(url.port) || 3306,
  user: url.username, password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: true },
});

// Read and execute migration SQL
const migrationSql = fs.readFileSync("drizzle/0007_spotty_grandmaster.sql", "utf8");
const statements = migrationSql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
for (const stmt of statements) {
  try { await conn.execute(stmt); console.log("✓ Table created"); }
  catch (e) { if (e.code === "ER_TABLE_EXISTS_ERROR") console.log("⊘ Table already exists"); else throw e; }
}

// Seed accounts
const accounts = [
  ["Cash EGP","EGP"],["Cash AED","AED"],["Cash USD","USD"],["Cash Euro","EUR"],
  ["ARAB African EGP","EGP"],["CIB EGP","EGP"],["AIB EGP","EGP"],
  ["ARAB African USD","USD"],["CIB USD","USD"],["AIB USD","USD"],
  ["CIB EURO","EUR"],["AIB EURO","EUR"],["ARAB EURO","EUR"],
  ["Z. USD Bank","USD"],
  ["Spanish Lawyer Credit Euros","EUR"],["Salaries Credit","EGP"],
  ["Spanish Translator Credit","EUR"],
  ["Credit Ziad","EGP"],["Credit Mahmoud","EGP"],
  ["Petty Cash","EGP"],
  ["Imprest Account","EGP"],["Imprest Account USD","USD"],
  ["Masr EGP","EGP"],["Masr USD","USD"],
  ["Commission Credit","EGP"],["Rent Credit","EGP"],
];
for (const [name, currency] of accounts) {
  try {
    await conn.execute("INSERT INTO finAccounts (name, currency) VALUES (?, ?)", [name, currency]);
  } catch (e) { /* duplicate */ }
}
console.log(`✓ ${accounts.length} accounts seeded`);

// Seed expense categories
const expenseCats = [
  "Commissions","Salaries","Office Rent","Utility Bills","Transportation",
  "Office Supplies","Internet & Phone","Software Subscriptions","Maintenance",
  "Insurance","Training & Development","Travel Expenses","Meals & Entertainment",
  "Marketing","Facebook Ads","Google Ads","Legal Fees","Accounting Fees",
  "Bank Fees","Client Refund","Courier & Shipping","Printing & Stationery",
  "Government Fees","Taxes","Donations","Miscellaneous Expenses","Depreciation",
];
for (const name of expenseCats) {
  await conn.execute("INSERT INTO finCategories (name, type) VALUES (?, 'expense')", [name]);
}
console.log(`✓ ${expenseCats.length} expense categories seeded`);

// Seed income categories
const incomeCats = [
  "Gov Commission","Real Estate Commission","Sales","Currency Exchange","Refund from Expenses",
];
for (const name of incomeCats) {
  await conn.execute("INSERT INTO finCategories (name, type) VALUES (?, 'income')", [name]);
}
console.log(`✓ ${incomeCats.length} income categories seeded`);

// Seed employees
const employees = [
  "Mahmoud Saber","Ziad El Shurafa","Fouad Abdo","Kirolos Nabil",
  "Madonna Adel","Monica Sobhy","Marina Kamel",
  "Mohamed Abdelfatah","Walid Mammdouh",
  "Ahmed Hassan","Sara Mohamed","Nour El Din","Hana Youssef",
  "Omar Khaled","Layla Ibrahim","Tarek Mansour","Dina Farouk",
  "Youssef Ali","Mona Gamal","Karim Mostafa","Rania Samir",
  "Amr Tawfik","Heba Nasser","Sherif Adel","Mariam Fathy",
  "Bassem Wagdy","Nada Ezzat","Hesham Lotfy",
];
for (const name of employees) {
  await conn.execute("INSERT INTO finEmployees (name) VALUES (?)", [name]);
}
console.log(`✓ ${employees.length} employees seeded`);

await conn.end();
console.log("✓ Financial module seed complete");
