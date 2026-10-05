// Regenerates server/commandCenter/{rules,engine,demo-data,manus}.ts from the shared browser
// modules, so the dashboard and the server always run the same business rules.
// Usage: node scripts/build-command-center-modules.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shared = join(root, "client", "public", "admin-cc", "shared");
const out = join(root, "server", "commandCenter");
const header = "// @ts-nocheck\n// Generated from client/public/admin-cc/shared (or manus.src.js): edit the source there, then regenerate with scripts/build-command-center-modules.mjs.\n";
const wrap = (src, dest, imports, req) => {
  const code = readFileSync(src, "utf8");
  writeFileSync(dest, `${header}${imports}const module = { exports: {} };\n${req}\n${code}\nexport default module.exports;\n`);
};
wrap(join(shared, "rules.js"), join(out, "rules.ts"), "", "");
wrap(join(shared, "engine.js"), join(out, "engine.ts"), 'import Rules from "./rules";\n', "const require = (p) => (p.includes('rules') ? Rules : null);");
wrap(join(shared, "demo-data.js"), join(out, "demo-data.ts"), 'import Engine from "./engine";\n', "const require = (p) => (p.includes('engine') ? Engine : null);");
wrap(join(out, "manus.src.js"), join(out, "manus.ts"), "", "");
console.log("Command Center modules regenerated.");
