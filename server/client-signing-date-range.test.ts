import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

describe("Financial Client signing-date custom range", () => {
  it("exposes Custom Range with From and To controls in the Client Database", () => {
    const source = read("client/src/pages/FinClients.tsx");
    expect(source).toContain('<SelectItem value="custom">Custom Range</SelectItem>');
    expect(source).toContain('aria-label="Signing date from"');
    expect(source).toContain('aria-label="Signing date to"');
  });

  it("sends custom bounds to list, count, totals, PDF, and CSV paths", () => {
    const source = read("client/src/pages/FinClients.tsx");
    expect(source.match(/signingDateFrom:/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source.match(/signingDateTo:/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain("const { data: total } = trpc.financial.clients.count.useQuery(countParams)");
    expect(source).toContain("const { data: grandTotals } = trpc.financial.clients.totals.useQuery(countParams)");
    expect(source).toContain("utils.financial.clients.exportCsv.fetch");
  });

  it("validates custom dates in every Financial Client API path", () => {
    const source = read("server/finRouter.ts");
    expect(source.match(/signingDateFrom: z\.string\(\)\.regex/g)?.length).toBe(4);
    expect(source.match(/signingDateTo: z\.string\(\)\.regex/g)?.length).toBe(4);
    expect(source).toContain("signingDateFrom: input?.signingDateFrom");
    expect(source).toContain("signingDateTo: input?.signingDateTo");
  });

  it("applies inclusive bounds and safely handles reversed dates", () => {
    const source = read("server/finDb.ts");
    expect(source).toContain("if (from && to && from > to) [from, to] = [to, from]");
    expect(source).toContain("DATE(${finClients.signingDate}) >= ${from}");
    expect(source).toContain("DATE(${finClients.signingDate}) <= ${to}");
    expect(source.match(/addSigningDateConditions\(conditions, opts\)/g)?.length).toBe(3);
  });

  it("calculates direct-cost and income totals only for filtered clients", () => {
    const source = read("server/finDb.ts");
    expect(source).toContain("ft.finClientId = ${finClients.id} AND ft.type = 'expense'");
    expect(source).toContain("ft.finClientId = ${finClients.id} AND ft.type = 'income'");
  });
});
