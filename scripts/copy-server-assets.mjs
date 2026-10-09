import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = [
  {
    source: join(projectRoot, "server", "spain_dnv_contract_template_2026_09_23.docx"),
    destination: join(projectRoot, "dist", "spain_dnv_contract_template_2026_09_23.docx"),
  },
  {
    source: join(projectRoot, "server", "questionnaire-font-regular.ttf"),
    destination: join(projectRoot, "dist", "questionnaire-font-regular.ttf"),
  },
  {
    source: join(projectRoot, "server", "questionnaire-font-bold.ttf"),
    destination: join(projectRoot, "dist", "questionnaire-font-bold.ttf"),
  },
  {
    source: join(projectRoot, "server", "marketing-fonts", "PlusJakartaSans-Regular.ttf"),
    destination: join(projectRoot, "dist", "marketing-fonts", "PlusJakartaSans-Regular.ttf"),
  },
  {
    source: join(projectRoot, "server", "marketing-fonts", "PlusJakartaSans-Bold.ttf"),
    destination: join(projectRoot, "dist", "marketing-fonts", "PlusJakartaSans-Bold.ttf"),
  },
  // ELEVAY Command Center: approved program sources, creative direction, official logo and font.
  ...["ApexSansBook.ttf", "elevay-logo.png", "elevay-full-logo.png", "knowledge/spain-digital-nomad.md", "knowledge/malta-permanent-residence.md", "creative/brand-identity.md", "creative/brand-and-design.md", "creative/video-and-audio.md", "creative/delivery-checklist.md"].map((name) => ({
    source: join(projectRoot, "server", "commandCenter", "assets", name),
    destination: join(projectRoot, "dist", "command-center-assets", name),
  })),
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

await mkdir(join(projectRoot, "dist"), { recursive: true });

for (const asset of assets) {
  const sourceBuffer = await readFile(asset.source);
  await mkdir(dirname(asset.destination), { recursive: true });
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
