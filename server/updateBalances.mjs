import mysql from "mysql2/promise";
import fs from "fs";
import "dotenv/config";

const csv = fs.readFileSync("/home/ubuntu/upload/AccountsCurrentBalance.csv", "utf-8");
const lines = csv.trim().split("\n").slice(1); // skip header

// Parse CSV: handle quoted values with commas and multi-line fields
const accounts = [];
let i = 0;
while (i < lines.length) {
  let line = lines[i].trim();
  // Handle multi-line field (e.g., "Imprest Account\n")
  if (line.includes('"') && (line.match(/"/g) || []).length % 2 !== 0) {
    i++;
    if (i < lines.length) {
      line = line + lines[i].trim();
    }
  }
  
  // Parse name and balance
  let name, balanceStr;
  if (line.startsWith('"')) {
    // Quoted name
    const endQuote = line.indexOf('"', 1);
    name = line.substring(1, endQuote).replace(/\n/g, " ").trim();
    balanceStr = line.substring(endQuote + 2).trim(); // skip ","
  } else {
    const firstComma = line.indexOf(",");
    name = line.substring(0, firstComma).trim();
    balanceStr = line.substring(firstComma + 1).trim();
  }
  
  // Clean balance: remove quotes and commas
  balanceStr = balanceStr.replace(/"/g, "").replace(/,/g, "").trim();
  const balance = parseFloat(balanceStr);
  
  if (name && !isNaN(balance)) {
    accounts.push({ name, balance });
  }
  i++;
}

console.log("Parsed accounts from CSV:");
accounts.forEach(a => console.log(`  ${a.name}: ${a.balance}`));

// Connect to database
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get existing accounts
const [rows] = await conn.execute("SELECT id, name, balance FROM finAccounts");
console.log(`\nFound ${rows.length} accounts in database`);

let updated = 0;
let notFound = [];

for (const csvAccount of accounts) {
  // Fuzzy match: trim and case-insensitive
  const csvNameClean = csvAccount.name.toLowerCase().trim();
  const dbMatch = rows.find(r => {
    const dbName = r.name.toLowerCase().trim();
    return dbName === csvNameClean || 
           dbName.replace(/\s+/g, " ") === csvNameClean.replace(/\s+/g, " ");
  });
  
  if (dbMatch) {
    await conn.execute(
      "UPDATE finAccounts SET balance = ? WHERE id = ?",
      [csvAccount.balance, dbMatch.id]
    );
    console.log(`✓ Updated "${dbMatch.name}" (id=${dbMatch.id}): ${dbMatch.balance} → ${csvAccount.balance}`);
    updated++;
  } else {
    notFound.push(csvAccount.name);
    console.log(`✗ Not found in DB: "${csvAccount.name}"`);
  }
}

console.log(`\nDone: ${updated} accounts updated, ${notFound.length} not found`);
if (notFound.length > 0) {
  console.log("Not found:", notFound);
}

// Verify final balances
const [final] = await conn.execute("SELECT name, balance, currency FROM finAccounts ORDER BY id");
console.log("\nFinal account balances:");
final.forEach(r => console.log(`  ${r.name} (${r.currency}): ${r.balance}`));

await conn.end();
