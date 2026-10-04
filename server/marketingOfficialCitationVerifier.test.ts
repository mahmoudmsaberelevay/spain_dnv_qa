import { describe, expect, it, vi } from "vitest";
import { verifyOfficialNewsCitation } from "./marketingOfficialCitationVerifier";

const input = {
  sourceUrl: "https://residencymalta.gov.mt/legal-framework-mprp-2/#updates",
  evidenceQuote: "The legal framework sets out the application process for the programme.",
};
const page = `<!doctype html><html><head><title>Government guidance</title></head><body><article><p>${input.evidenceQuote}</p></article></body></html>`;
const html = (text: string) => new Response(text, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

describe("allowlisted official news-citation verification (read only)", () => {
  it("retrieves a fresh official HTML page and records evidence without approval or publication", async () => {
    const request = vi.fn(async (_url: string, _init?: RequestInit) => html(page));
    const result = await verifyOfficialNewsCitation(input, request as typeof fetch);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0]).toBe("https://residencymalta.gov.mt/legal-framework-mprp-2/");
    expect(request.mock.calls[0]![1]).toMatchObject({ method: "GET", redirect: "manual", cache: "no-store" });
    expect(result).toMatchObject({ authorityDomain: "residencymalta.gov.mt", evidenceQuote: input.evidenceQuote, verificationMethod: "literal_quote_in_allowlisted_official_html", publicationAuthority: false });
    expect(result.sourceSnapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("never fetches lookalike, credential-bearing or insecure URLs", async () => {
    const request = vi.fn();
    for (const sourceUrl of ["https://fake-residencymalta.gov.mt/news", "https://user:key@residencymalta.gov.mt/news", "http://residencymalta.gov.mt/news"]) {
      await expect(verifyOfficialNewsCitation({ ...input, sourceUrl }, request as typeof fetch)).rejects.toThrow();
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects redirects, misleading types, quoted script-only text and absent quotes", async () => {
    const redirect = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/news" } }));
    await expect(verifyOfficialNewsCitation(input, redirect as typeof fetch)).rejects.toThrow("HTTP 302");
    await expect(verifyOfficialNewsCitation(input, (async () => new Response(page, { headers: { "content-type": "application/pdf" } })) as typeof fetch)).rejects.toThrow("HTML page");
    await expect(verifyOfficialNewsCitation(input, (async () => html(`<script>${input.evidenceQuote}</script>`)) as typeof fetch)).rejects.toThrow("not found");
    await expect(verifyOfficialNewsCitation(input, (async () => html("Unrelated content")) as typeof fetch)).rejects.toThrow("not found");
  });

  it("bounds the body and quote length before considering the citation verified", async () => {
    await expect(verifyOfficialNewsCitation({ ...input, evidenceQuote: "short" }, vi.fn() as typeof fetch)).rejects.toThrow("bounded");
    await expect(verifyOfficialNewsCitation(input, (async () => html(`a${"x".repeat(512_100)}`)) as typeof fetch)).rejects.toThrow("size limit");
  });
});
