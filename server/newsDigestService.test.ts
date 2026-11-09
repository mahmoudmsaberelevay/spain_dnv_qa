import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { createNewsGmailOAuthState, decryptGmailRefreshToken, encryptGmailRefreshToken, extractNewsArticlesFromDigest, filterImmigrationNewsArticles, isImmigrationNewsArticleRelevant, NEWS_MAX_ARTICLES, NEWS_SOURCE_MAILBOX, NEWS_SUBJECT_TRIGGER, verifyNewsGmailOAuthState } from "./newsDigestService";
import { isCairoNewsDigestTime } from "./scheduledNewsDigestHandler";

describe("ELEVAY News Daily Digest importer", () => {
  it("extracts Google Alerts articles, unwraps original URLs, and deduplicates canonical links", () => {
    const text = `
**Spain digital nomad visa update**
Global Mobility News
Spain has announced an update affecting qualified remote workers and their families.

<https://www.google.com/url?url=https%3A%2F%2Fexample.com%2Fspain-update%3Futm_source%3Dalerts>

**Portugal residence processing changes**
Residence Daily
The report summarizes current processing and appointment developments for applicants.

<https://example.org/portugal-processing?utm_medium=email>
`;
    const html = `<a href="https://www.google.com/url?url=https%3A%2F%2Fexample.com%2Fspain-update%3Futm_source%3Dduplicate">Spain digital nomad visa update</a>
      <a href="https://www.google.com/alerts/manage">Manage your alerts</a>`;

    const result = extractNewsArticlesFromDigest(text, html);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      title: "Spain digital nomad visa update",
      sourceName: "Global Mobility News",
      url: "https://example.com/spain-update",
    });
    expect(result[0].description).toContain("remote workers");
    expect(result[1].url).toBe("https://example.org/portugal-processing");
  });

  it("rejects local, non-http, and Google Alerts management links", () => {
    const html = `
      <a href="http://127.0.0.1/private">Private internal article title</a>
      <a href="javascript:alert(1)">Dangerous script article title</a>
      <a href="https://www.google.com/alerts/manage">Manage this Daily Digest alert</a>
    `;
    expect(extractNewsArticlesFromDigest("", html)).toEqual([]);
  });

  it("keeps only immigration, citizenship, residency, visa, and migration news for the approved countries", () => {
    const relevant = [
      { title: "Spain changes digital nomad residence rules", description: "New residency permit requirements for applicants." },
      { title: "Portugal immigration policy update", description: "The government announced new visa rules." },
      { title: "Malta citizenship programme changes", description: "The residency route and citizenship rules were revised." },
      { title: "Greece golden visa update", description: "Investors face new residence permit criteria." },
      { title: "Latvia residence permit rules", description: "Immigration applications will follow new requirements." },
      { title: "UK settlement and immigration changes", description: "New migrant visa eligibility rules." },
      { title: "U.S. citizenship and visa policy", description: "A new nationality regulation was announced." },
      { title: "Canada permanent residence update", description: "Immigration policy changes for applicants." },
      { title: "Australia migration programme update", description: "New visa eligibility requirements." },
      { title: "Argentina residency reform", description: "Residence permits and naturalization changes." },
      { title: "São Tomé visa rules", description: "Immigration entry and residency policy update." },
      { title: "Antigua and Barbuda citizenship news", description: "Citizenship by investment regulations change." },
      { title: "St. Kitts & Nevis investor visa", description: "New citizenship application rules." },
      { title: "St. Lucia residency programme", description: "Immigration permit regulation update." },
      { title: "Dominica citizenship programme", description: "Naturalization requirements are changing." },
      { title: "Grenada immigration update", description: "New visa and residency requirements." },
    ];
    expect(filterImmigrationNewsArticles(relevant)).toHaveLength(16);
    expect(isImmigrationNewsArticleRelevant({ title: "إسبانيا: تحديث قواعد الإقامة", description: "أعلنت الحكومة تغييرات على تأشيرات الهجرة." })).toBe(true);
  });

  it("excludes unrelated country stories, unrelated immigration stories, and country matches found only in the publisher name", () => {
    const candidates = [
      { title: "Spain wins international football final", description: "A dramatic match ended after extra time." },
      { title: "Immigration reform announced", description: "The government published a new visa regulation." },
      { title: "Daily immigration report", description: "A general migration report with no country-specific coverage." },
      { title: "New Canadian music album released", description: "The artist announced tour dates." },
    ];
    expect(filterImmigrationNewsArticles(candidates)).toEqual([]);
  });

  it("uses the requested mailbox, trigger, direct Gmail read-only API, and a 200-item cap", () => {
    expect(NEWS_SOURCE_MAILBOX).toBe("mahmoud.saberelevay@gmail.com");
    expect(NEWS_SUBJECT_TRIGGER).toBe("Daily Digest");
    expect(NEWS_MAX_ARTICLES).toBe(200);
    const service = readFileSync(new URL("./newsDigestService.ts", import.meta.url), "utf8");
    const handler = readFileSync(new URL("./scheduledNewsDigestHandler.ts", import.meta.url), "utf8");
    expect(service).toContain("https://www.googleapis.com/auth/gmail.readonly");
    expect(service).toContain("google.gmail({ version: \"v1\"");
    expect(service).toContain('q: `subject:"${escapedTrigger}" newer_than:30d`');
    expect(service).toContain("enforceNewsRetention(NEWS_MAX_ARTICLES)");
    expect(handler).toContain("orphan_schedule");
    expect(handler).toContain("gmail_connection_required");
  });

  it("encrypts Gmail refresh tokens at rest and signs short-lived OAuth state", () => {
    const encrypted = encryptGmailRefreshToken("test-refresh-token-never-store-plain");
    expect(encrypted).not.toContain("test-refresh-token-never-store-plain");
    expect(decryptGmailRefreshToken(encrypted)).toBe("test-refresh-token-never-store-plain");
    const state = createNewsGmailOAuthState();
    expect(verifyNewsGmailOAuthState(state)).toBe(true);
    expect(verifyNewsGmailOAuthState(`${state}tampered`)).toBe(false);
  });

  it("runs during the 09:00 Cairo hour despite routine scheduler delay, in summer and winter", () => {
    expect(isCairoNewsDigestTime(new Date("2026-09-10T06:30:00Z"))).toBe(true);
    expect(isCairoNewsDigestTime(new Date("2026-09-10T06:31:51Z"))).toBe(true);
    expect(isCairoNewsDigestTime(new Date("2026-09-10T06:59:59Z"))).toBe(true);
    expect(isCairoNewsDigestTime(new Date("2026-01-10T07:30:00Z"))).toBe(true);
    expect(isCairoNewsDigestTime(new Date("2026-01-10T07:45:00Z"))).toBe(true);
    expect(isCairoNewsDigestTime(new Date("2026-09-10T07:30:00Z"))).toBe(false);
    expect(isCairoNewsDigestTime(new Date("2026-01-10T06:30:00Z"))).toBe(false);
  });
});
