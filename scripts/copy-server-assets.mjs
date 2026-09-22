import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = [
  {
    source: join(projectRoot, "server", "spain_dnv_contract_template_2026_09_22.docx"),
    destination: join(projectRoot, "dist", "spain_dnv_contract_template_2026_09_22.docx"),
  },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

await mkdir(join(projectRoot, "dist"), { recursive: true });

for (const asset of assets) {
  const sourceBuffer = await readFile(asset.source);
  await copyFile(asset.source, asset.destination);
  const destinationBuffer = await readFile(asset.destination);
  const sourceHash = sha256(sourceBuffer);
  const destinationHash = sha256(destinationBuffer);

  if (sourceHash !== destinationHash) {
    throw new Error(`Server asset verification failed for ${asset.destination}`);
  }

  console.log(
    `[ServerAssets] Copied ${asset.source.replace(`${projectRoot}/`, "")} -> ${asset.destination.replace(`${projectRoot}/`, "")} (${sourceBuffer.length} bytes, sha256 ${sourceHash})`,
  );
}
