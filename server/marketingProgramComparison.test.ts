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
    const service = read("server/programComparisonService.ts");
    expect(router).toContain('comparePrograms as generateProgramComparison');
    expect(service).toContain("spain_dnv:");
    expect(service).toContain("portugal_d7:");
    expect(service).toContain("malta_mprp:");
    expect(service).toContain("canada_skilled_migration:");
    expect(service).toContain('model: "gpt-5-mini"');
    expect(service).toContain('type: "json_schema"');
    expect(service).toContain("additionalProperties: false");
    expect(service).toContain("Compare only the supplied facts");
    expect(service).toContain("do not guarantee approval");
    expect(service).toContain("Official Source:");
    expect(service).toContain("comparison_response_program_mismatch");
  });

  it("exposes comparison to the client app only through authenticated, rate-limited, audited REST routes", () => {
    const routes = read("server/clientPortalRoutes.ts");
    const authPosition = routes.indexOf('app.use("/client-api", portalAuth)');
    const optionsPosition = routes.indexOf('app.get("/client-api/program-comparisons/options"');
    const generatePosition = routes.indexOf('app.post("/client-api/program-comparisons"');
    expect(authPosition).toBeGreaterThan(-1);
    expect(optionsPosition).toBeGreaterThan(authPosition);
    expect(generatePosition).toBeGreaterThan(authPosition);
    expect(routes).toContain("comparisonLimiter");
    expect(routes).toContain("max: 8");
    expect(routes).toContain('action: "program_comparison_generated"');
    expect(routes).toContain("PROGRAM_COMPARISON_OPTIONS");
  });
});
