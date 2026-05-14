/**
 * One-time backfill script: adds the 3 new required documents to all existing clients
 * who don't already have them.
 *
 * New documents:
 *   - company_memorandum  (Business Owner only)
 *   - admission_not_practice (Freelancer + Business Owner)
 *   - power_of_attorney  (Freelancer + Business Owner)
 *
 * Run: node scripts/backfill-new-docs.mjs
 */

import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Parse mysql2 connection from URL
const url = new URL(DATABASE_URL);
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: url.password,
  database: url.pathname.replace("/", ""),
  ssl: { rejectUnauthorized: false },
});

console.log("Connected to database");

// Get all client cases
const [cases] = await conn.execute("SELECT id, applicationType FROM clientCases");
console.log(`Found ${cases.length} client cases`);

// Get all existing doc keys per client
const [existingDocs] = await conn.execute("SELECT clientCaseId, docKey FROM clientDocuments");
const existingMap = {};
for (const d of existingDocs) {
  if (!existingMap[d.clientCaseId]) existingMap[d.clientCaseId] = new Set();
  existingMap[d.clientCaseId].add(d.docKey);
}

const NEW_DOCS = {
  company_memorandum: {
    docName: "Company Memorandum of Association",
    category: "main",
    expirationMonths: null,
    requiresMofa: 1,
    requiresEmbassy: 1,
    applicableTypes: ["business_owner"],
  },
  admission_not_practice: {
    docName: "Admission of Not Practice the Job",
    category: "main",
    expirationMonths: 6,
    requiresMofa: 1,
    requiresEmbassy: 1,
    applicableTypes: ["freelancer", "business_owner"],
  },
  power_of_attorney: {
    docName: "Power of Attorney for Document Attestation",
    category: "main",
    expirationMonths: null,
    requiresMofa: 0,
    requiresEmbassy: 0,
    applicableTypes: ["freelancer", "business_owner"],
  },
};

let inserted = 0;
let skipped = 0;

for (const c of cases) {
  const existing = existingMap[c.id] ?? new Set();
  for (const [docKey, docDef] of Object.entries(NEW_DOCS)) {
    if (!docDef.applicableTypes.includes(c.applicationType)) continue;
    if (existing.has(docKey)) { skipped++; continue; }
    await conn.execute(
      `INSERT INTO clientDocuments
        (clientCaseId, docKey, docName, category, expirationMonths, requiresMofa, requiresEmbassy, received, mofaAttested, embassyAttested)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`,
      [c.id, docKey, docDef.docName, docDef.category, docDef.expirationMonths, docDef.requiresMofa, docDef.requiresEmbassy]
    );
    console.log(`  + Added "${docDef.docName}" to client ${c.id} (${c.applicationType})`);
    inserted++;
  }
}

console.log(`\nBackfill complete: ${inserted} documents inserted, ${skipped} already existed.`);
await conn.end();
