import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projectRoot = new URL("../", import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const copyScript = readFileSync(new URL("../scripts/copy-server-assets.mjs", import.meta.url), "utf8");
const sourceTemplate = readFileSync(new URL("./spain_dnv_contract_template_2026_09_22.docx", import.meta.url));

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

describe("production server runtime assets", () => {
  it("copies the approved Spain template beside dist/index.js after every production build", () => {
    expect(projectRoot.pathname).toContain("spain_dnv_qa");
    expect(packageJson.scripts.build).toContain("node scripts/copy-server-assets.mjs");
    expect(copyScript).toContain('"server", "spain_dnv_contract_template_2026_09_22.docx"');
    expect(copyScript).toContain('"dist", "spain_dnv_contract_template_2026_09_22.docx"');
    expect(copyScript).toContain("sourceHash !== destinationHash");
    expect(sourceTemplate.length).toBeGreaterThan(100_000);
    expect(sha256(sourceTemplate)).toBe("d753f9b43c4f3f5783056e3b4a7a72760c6b9ef8155ac36e99a740eee9542cce");
  });
});
