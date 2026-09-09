import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MARKETING_COMPARISON_PROGRAMS, getMarketingComparisonProgram } from "../shared/marketingComparisonPrograms";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Marketing Program Comparison categories", () => {
  it("offers distinct Residency and Citizenship catalogs with unique keys", () => {
    const residency = MARKETING_COMPARISON_PROGRAMS.filter(program => program.category === "residency");
    const citizenship = MARKETING_COMPARISON_PROGRAMS.filter(program => program.category === "citizenship");
    expect(residency).toHaveLength(8);
    expect(citizenship).toHaveLength(10);
    expect(new Set(MARKETING_COMPARISON_PROGRAMS.map(program => program.key)).size).toBe(MARKETING_COMPARISON_PROGRAMS.length);
    expect(getMarketingComparisonProgram("spain_dnv")?.category).toBe("residency");
    expect(getMarketingComparisonProgram("dominica")?.category).toBe("citizenship");
  });

  it("renders categorized selectors and labels comparison results by pathway", () => {
    const page = read("client/src/pages/marketing/ProgramComparison.tsx");
    expect(page).toContain('(["residency", "citizenship"] as MarketingComparisonCategory[])');
    expect(page).toContain("Residency Programs");
    expect(page).toContain("Citizenship Programs");
    expect(page).toContain("program.category === category");
    expect(page).toContain("prog.category");
  });

  it("accepts valid cross-category keys and uses a strict non-fabrication comparison prompt", () => {
    const router = read("server/marketingRouter.ts");
    expect(router).toContain("spain_dnv:");
    expect(router).toContain("portugal_d7:");
    expect(router).toContain("malta_mprp:");
    expect(router).toContain("canada_skilled_migration:");
    expect(router).toContain("Compare these residency and citizenship programs across 8 criteria");
    expect(router).toContain('type: "json_schema"');
    expect(router).toContain("additionalProperties: false");
    expect(router).toContain("Never imply guaranteed approval");
    expect(router).toContain("Use only the facts in the supplied Program Data");
    expect(router).toContain("Do not add legal timeframes, tax claims, travel counts, fees, eligibility rules, or nationality conditions from memory");
    expect(router).toContain("parsed.programs = validProgramKeys");
  });
});
