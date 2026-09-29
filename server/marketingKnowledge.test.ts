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
});
