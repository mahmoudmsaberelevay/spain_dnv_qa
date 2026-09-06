import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTemporaryPassword, hashPortalPassword, hashPortalToken, verifyPortalPassword } from "./clientPortalAuth";
import { fetchProgramsFromElevay } from "./publicContentService";

describe("client portal credential security", () => {
  it("hashes passwords with a slow one-way hash", async () => {
    const password = "Correct-Horse-42!";
    const hash = await hashPortalPassword(password);
    expect(hash).not.toContain(password);
    expect(hash.startsWith("$2")).toBe(true);
    await expect(verifyPortalPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPortalPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("creates high-entropy temporary credentials and deterministic token fingerprints", () => {
    const first = generateTemporaryPassword();
    const second = generateTemporaryPassword();
    expect(first).toHaveLength(14);
    expect(second).toHaveLength(14);
    expect(first).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(first).not.toBe(second);
    expect(hashPortalToken("secret")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPortalToken("secret")).toBe(hashPortalToken("secret"));
  });
});

describe("Elevay public program parser", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads only country-card headings and deduplicates source slugs", async () => {
    const html = (base: string, names: string[]) => `<main>${names.map((name, index) => `<h3><a href="https://elevay.com/${base}/country-${index}/">${name}</a></h3>`).join("")}<nav><a href="https://elevay.com/${base}/ignored/">Ignored navigation</a></nav></main>`;
    const responses = [html("residency-by-investment", ["Spain", "Portugal", "Greece"]), html("citizenship-by-investment", ["Dominica", "Grenada", "St. Lucia"])];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(responses.shift(), { status: 200 })));
    const programs = await fetchProgramsFromElevay();
    expect(programs).toHaveLength(6);
    expect(programs.map(program => program.nameEn)).toContain("Saint Lucia");
    expect(programs.every(program => program.sourceHash.length === 64)).toBe(true);
  });

  it("rejects a structurally invalid source so last-known-good data is retained", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<main><h3>No valid cards</h3></main>", { status: 200 })));
    await expect(fetchProgramsFromElevay()).rejects.toThrow(/parser returned/);
  });
});
