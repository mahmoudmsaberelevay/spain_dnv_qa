/**
 * One-time script: upload the 4 citizenship contract DOCX templates to S3
 * via the same storagePut helper the server uses, so they are accessible
 * via storageGet at runtime.
 *
 * Run from the project root:
 *   node scripts/upload-contract-templates.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "dotenv";

// Load .env so BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY are available
config({ path: join(dirname(fileURLToPath(import.meta.url)), "../.env") });

const BASE_URL = process.env.BUILT_IN_FORGE_API_URL?.replace(/\/+$/, "");
const API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!BASE_URL || !API_KEY) {
  console.error("Missing BUILT_IN_FORGE_API_URL or BUILT_IN_FORGE_API_KEY");
  process.exit(1);
}

async function uploadFile(localPath, storageKey) {
  const data = readFileSync(localPath);
  const uploadUrl = new URL("v1/storage/upload", BASE_URL + "/");
  uploadUrl.searchParams.set("path", storageKey);

  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const form = new FormData();
  form.append("file", blob, storageKey.split("/").pop());

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Upload failed (${res.status}): ${msg}`);
  }
  const json = await res.json();
  console.log(`✅ ${storageKey} → ${json.url}`);
  return json.url;
}

const templates = [
  {
    local: "/home/ubuntu/webdev-static-assets/contracts/egypt.docx",
    key: "contract-templates/egypt.docx",
  },
  {
    local: "/home/ubuntu/webdev-static-assets/contracts/dominica.docx",
    key: "contract-templates/dominica.docx",
  },
  {
    local: "/home/ubuntu/webdev-static-assets/contracts/saint_kitts.docx",
    key: "contract-templates/saint_kitts.docx",
  },
  {
    local: "/home/ubuntu/webdev-static-assets/contracts/grenada.docx",
    key: "contract-templates/grenada.docx",
  },
];

for (const t of templates) {
  await uploadFile(t.local, t.key);
}
console.log("\nDone. Update TEMPLATE_REGISTRY storageKey values to use these keys.");
