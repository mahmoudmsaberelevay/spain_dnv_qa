import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OFFICIAL_KNOWLEDGE_ALLOWED_DOMAINS,
  OFFICIAL_KNOWLEDGE_SOURCE_SEEDS,
  normalizeOfficialKnowledgeUrl,
  stableKnowledgeHash,
} from "../shared/marketingKnowledge";

describe("ELEVAY official knowledge library policy", () => {
  it("accepts only exact allowlisted HTTPS authority domains", () => {
    expect(normalizeOfficialKnowledgeUrl("https://prie.comercio.gob.es/en-us/paginas/teletrabajadores-caracter-internacional.aspx#section")).toEqual({
      url: "https://prie.comercio.gob.es/en-us/paginas/teletrabajadores-caracter-internacional.aspx",
      domain: "prie.comercio.gob.es",
    });
    expect(() => normalizeOfficialKnowledgeUrl("http://prie.comercio.gob.es/a")).toThrow("Only HTTPS official sources are accepted");
    expect(() => normalizeOfficialKnowledgeUrl("https://lookalike-prie.com/a")).toThrow("official-source allowlist");
    expect(() => normalizeOfficialKnowledgeUrl("https://user:secret@prie.comercio.gob.es/a")).toThrow("credentials or alternate ports");
    expect(() => normalizeOfficialKnowledgeUrl("https://prie.comercio.gob.es:8443/a")).toThrow("credentials or alternate ports");
    expect(() => normalizeOfficialKnowledgeUrl("https://prie.comercio.gob.es/a\nb")).toThrow("control characters");
    expect(OFFICIAL_KNOWLEDGE_ALLOWED_DOMAINS).toContain("residencymalta.gov.mt");
  });

  it("starts from reviewed Spain and Malta authority candidates rather than marketing websites", () => {
    expect(OFFICIAL_KNOWLEDGE_SOURCE_SEEDS).toHaveLength(3);
    expect(OFFICIAL_KNOWLEDGE_SOURCE_SEEDS.map(source => source.sourceDomain)).toEqual(expect.arrayContaining([
      "prie.comercio.gob.es", "www.exteriores.gob.es", "residencymalta.gov.mt",
    ]));
    expect(OFFICIAL_KNOWLEDGE_SOURCE_SEEDS.every(source => source.sourceUrl.startsWith("https://"))).toBe(true);
  });

  it("normalizes source text deterministically before the server hashes evidence", () => {
    expect(stableKnowledgeHash("  Official\r\nsource   wording ")).toBe("Official source wording");
  });

  it("keeps owner-confirmed internal claims separate from official evidence and publication authority", () => {
    const root = resolve(import.meta.dirname, "..");
    const router = readFileSync(resolve(root, "server/marketingSystemRouter.ts"), "utf8");
    const library = readFileSync(resolve(root, "client/src/pages/marketing/KnowledgeLibrary.tsx"), "utf8");
    expect(router).toContain("marketingOwnerConfirmedInternalClaims");
    expect(router).toContain("ownerConfirmedInternalClaims");
    expect(router).toContain("not official evidence, legal advice, automatic publication authority");
    expect(library).toContain("Owner-confirmed internal claims");
    expect(library).toContain("owner confirmed · review only");
  });
});
