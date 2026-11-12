import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import PizZip from "pizzip";
import axios from "axios";
import { storageGet, storagePut } from "./storage";
import {
  calculateContractValue,
  generateContractDoc,
  SPAIN_DNV_TEMPLATE_PATH,
  SPAIN_DNV_TEMPLATE_VERSION,
} from "./contractGenerator";

vi.mock("./storage", () => ({ storageGet: vi.fn(), storagePut: vi.fn() }));
vi.mock("axios", () => ({ default: { get: vi.fn() } }));

afterEach(() => {
  expect(storageGet).not.toHaveBeenCalled();
  expect(storagePut).not.toHaveBeenCalled();
  expect(axios.get).not.toHaveBeenCalled();
});

function documentXml(buffer: Buffer) {
  const zip = new PizZip(buffer.toString("binary"), { base64: false });
  return zip.file("word/document.xml")?.asText() ?? "";
}

describe("Spain Digital Nomad approved contract template", () => {
  it("stores the approved versioned template with only the three intended variables", () => {
    const template = readFileSync(SPAIN_DNV_TEMPLATE_PATH);
    const xml = documentXml(template);

    expect(SPAIN_DNV_TEMPLATE_VERSION).toBe("2026-11-12");
    expect(template.length).toBeGreaterThan(100_000);
    expect(xml.match(/\{\{CLIENT_NAME_AR\}\}/g)).toHaveLength(2);
    expect(xml.match(/\{\{FAMILY_MEMBERS\}\}/g)).toHaveLength(1);
    expect(xml.match(/\{\{CONTRACT_VALUE\}\}/g)).toHaveLength(1);
    expect(xml).not.toContain("جورج صبحى جوده سلامه");
    expect(xml).not.toContain('<w:highlight w:val="yellow"/>');
  });

  it("fills both Arabic-name locations, family size, and the exact total contract value", async () => {
    const clientName = "أحمد & محمد علي";
    const { buffer, filename } = await generateContractDoc(
      clientName,
      4,
      "26999",
      "spain",
      14_500.75,
    );
    const xml = documentXml(buffer);

    expect(filename).toBe("Contract_26999_أحمد_محمد_علي.docx");
    expect(xml.match(/أحمد &amp; محمد علي/g)).toHaveLength(2);
    expect(xml).toContain(">4<");
    expect(xml).toContain("14,500.75");
    expect(xml).toContain("EUR");
    expect(xml).not.toContain("{{CLIENT_NAME_AR}}");
    expect(xml).not.toContain("{{FAMILY_MEMBERS}}");
    expect(xml).not.toContain("{{CONTRACT_VALUE}}");
    expect(xml).not.toContain("جورج صبحى جوده سلامه");
    expect(xml).not.toContain('<w:highlight w:val="yellow"/>');
  });

  it("keeps TES# unchanged in both legal-name locations while making its filename safe", async () => {
    const { buffer, filename } = await generateContractDoc("TES#", 2, "26999", "spain", 13_000);
    const templateXml = documentXml(readFileSync(SPAIN_DNV_TEMPLATE_PATH));
    const xml = documentXml(buffer);

    expect(filename).toBe("Contract_26999_TES.docx");
    expect(xml.match(/TES#/g)).toHaveLength(2);
    expect(xml).toBe(
      templateXml
        .split("{{CLIENT_NAME_AR}}").join("TES#")
        .replace("{{FAMILY_MEMBERS}}", "2")
        .replace("{{CONTRACT_VALUE}}", "13,000"),
    );
  });

  it("retains the established Spain family pricing ladder for new contracts", () => {
    expect(calculateContractValue(1, "spain")).toBe(12_000);
    expect(calculateContractValue(2, "spain")).toBe(13_000);
    expect(calculateContractValue(3, "spain")).toBe(14_000);
    expect(calculateContractValue(4, "spain")).toBe(14_000);
    expect(calculateContractValue(5, "spain")).toBe(15_000);
  });

  it("regenerates documents from the stored country and authoritative contract value", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const regenerationBlock = routerSource.slice(
      routerSource.indexOf("regenerateDoc: protectedProcedure"),
      routerSource.indexOf("getPaymentSummary: protectedProcedure"),
    );

    expect(regenerationBlock).toContain('contract.country ?? "spain"');
    expect(regenerationBlock).toContain("Number(contract.contractValue)");
  });
});
