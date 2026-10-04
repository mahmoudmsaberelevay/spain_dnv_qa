import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projectRoot = new URL("../", import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const copyScript = readFileSync(new URL("../scripts/copy-server-assets.mjs", import.meta.url), "utf8");
const sourceTemplate = readFileSync(new URL("./spain_dnv_contract_template_2026_09_23.docx", import.meta.url));
const questionnaireRegularFont = readFileSync(new URL("./questionnaire-font-regular.ttf", import.meta.url));
const questionnaireBoldFont = readFileSync(new URL("./questionnaire-font-bold.ttf", import.meta.url));
const elevayRegularFont = readFileSync(new URL("./marketing-fonts/PlusJakartaSans-Regular.ttf", import.meta.url));
const elevayBoldFont = readFileSync(new URL("./marketing-fonts/PlusJakartaSans-Bold.ttf", import.meta.url));
const elevayFontLicense = readFileSync(new URL("./marketing-fonts/OFL.txt", import.meta.url), "utf8");

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

describe("production server runtime assets", () => {
  it("copies the approved Spain template beside dist/index.js after every production build", () => {
    expect(projectRoot.pathname).toContain("spain_dnv_qa");
    expect(packageJson.scripts.build).toContain("node scripts/copy-server-assets.mjs");
    expect(copyScript).toContain('"server", "spain_dnv_contract_template_2026_09_23.docx"');
    expect(copyScript).toContain('"dist", "spain_dnv_contract_template_2026_09_23.docx"');
    expect(copyScript).toContain("sourceHash !== destinationHash");
    expect(sourceTemplate.length).toBeGreaterThan(100_000);
    expect(sha256(sourceTemplate)).toBe("2445f48c8cbade8dff11ba8577b3288287ba049cb2e326f883ccbfe4379bae14");
  });

  it("copies hash-verified Unicode fonts required by questionnaire PDFs", () => {
    expect(copyScript).toContain('"server", "questionnaire-font-regular.ttf"');
    expect(copyScript).toContain('"dist", "questionnaire-font-regular.ttf"');
    expect(copyScript).toContain('"server", "questionnaire-font-bold.ttf"');
    expect(copyScript).toContain('"dist", "questionnaire-font-bold.ttf"');
    expect(questionnaireRegularFont.length).toBeGreaterThan(500_000);
    expect(questionnaireBoldFont.length).toBeGreaterThan(500_000);
    expect(sha256(questionnaireRegularFont)).toBe("ae7b7855e115a5966d8b1b3f80f254ccc117ec86f9965e202ee2940453837280");
    expect(sha256(questionnaireBoldFont)).toBe("5c1247acef7f2b8522a31742c76d6adcb5569bacc0be7ceaa4dc39dd252ce895");
  });
  it("bundles the owner-approved Plus Jakarta Sans fallback, not a substituted Apex Sans file", () => {
    expect(copyScript).toContain('"dist", "marketing-fonts", "PlusJakartaSans-Regular.ttf"');
    expect(copyScript).toContain('"dist", "marketing-fonts", "PlusJakartaSans-Bold.ttf"');
    expect(elevayRegularFont.length).toBeGreaterThan(100_000);
    expect(elevayBoldFont.length).toBeGreaterThan(100_000);
    expect(elevayFontLicense).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(sha256(elevayRegularFont)).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256(elevayBoldFont)).toMatch(/^[a-f0-9]{64}$/);
  });
});
