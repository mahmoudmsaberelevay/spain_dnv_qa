import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { createNewsGmailOAuthState, decryptGmailRefreshToken, encryptGmailRefreshToken, extractNewsArticlesFromDigest, filterImmigrationNewsArticles, isImmigrationNewsArticleRelevant, newlyPublishedDigestArticles, retainedNewsForDelivery, NEWS_MAX_ARTICLES, NEWS_SOURCE_MAILBOX, NEWS_SUBJECT_TRIGGER, verifyNewsGmailOAuthState } from "./newsDigestService";
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

  it("keeps wrapped descriptions intact and does not use a description line as the title", () => {
    const result = extractNewsArticlesFromDigest(`**Canada permanent residence rules**
Immigration Daily
New eligibility requirements affect applicants
and their dependent family members.
<https://example.com/canada>
**Spain visa application update**
Visa Daily
Applicants must follow the new filing procedure.
<https://example.com/spain>`);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ title: "Canada permanent residence rules", sourceName: "Immigration Daily", description: "New eligibility requirements affect applicants and their dependent family members." });
    expect(result[1].description).not.toContain("Canada");
  });

  it("extracts decoded HTML titles and each article's own source and excerpt without cross-story mixing", () => {
    const result = extractNewsArticlesFromDigest("", `<table>
      <tr><td><a href="https://example.com/antigua">Antigua &amp; Barbuda citizenship reform</a><div class="item_source">Mobility Daily</div><div class="item_snippet">New investment rules &amp; family eligibility requirements.</div></td></tr>
      <tr><td><a href="https://example.com/spain">Spain wins football final</a><div class="item_source">Sports Daily</div><div class="item_snippet">A dramatic victory in the final match.</div></td></tr>
    </table>`);
    expect(result[0]).toMatchObject({ title: "Antigua & Barbuda citizenship reform", sourceName: "Mobility Daily", description: "New investment rules & family eligibility requirements." });
    expect(result[1].description).not.toContain("investment");
    expect(filterImmigrationNewsArticles(result)).toHaveLength(1);
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

  it("rejects ordinary homes, construction licences, citizen bonds, medical/art residencies, legal settlements and wildlife migration", () => {
    const rejected = [
      "Spain residents protest electricity prices",
      "Portugal residence sells at auction",
      "Canada issues construction permits",
      "UK citizens buy new government bonds",
      "Australia artist residency applications open",
      "US medical residency programme for doctors",
      "UK court approves financial settlement",
      "Australia bird migration study published",
      "Turkey introduces new citizenship regulations",
      "Dominican Republic citizenship rules updated",
      "Latin American residency programmes updated",
      "South American immigration regulations updated",
    ].map(title => ({ title }));
    expect(filterImmigrationNewsArticles(rejected)).toEqual([]);
  });

  it("recognizes naturalisation, immigration authority acronyms and normalized Arabic policy terms", () => {
    expect(isImmigrationNewsArticleRelevant({ title: "UK naturalisation fees updated" })).toBe(true);
    expect(isImmigrationNewsArticleRelevant({ title: "IRCC clarifies permanent residence rules" })).toBe(true);
    expect(isImmigrationNewsArticleRelevant({ title: "USCIS green card application update" })).toBe(true);
    expect(isImmigrationNewsArticleRelevant({ title: "Grenada CBI programme regulation update" })).toBe(true);
    expect(isImmigrationNewsArticleRelevant({ title: "Antiguan citizenship application regulations" })).toBe(true);
    expect(isImmigrationNewsArticleRelevant({ title: "Saint Lucian visa application rules" })).toBe(true);
    expect(isImmigrationNewsArticleRelevant({ title: "Argentina changes South American residency programmes" })).toBe(true);
    expect(isImmigrationNewsArticleRelevant({ title: "أُستراليا تُحدّث قواعد الإقامة الدائمة" })).toBe(true);
    expect(isImmigrationNewsArticleRelevant({ title: "الولايات المتحدة: الجنسية والتجنيس" })).toBe(true);
  });

  it("only notifies for inserted articles that survive the retention cap", () => {
    const inserted = [{ publicId: "deleted-old", title: "Old" }, { publicId: "kept-new", title: "New" }];
    expect(retainedNewsForDelivery(inserted, [{ publicId: "kept-new" }, { publicId: "not-inserted" }])).toEqual([inserted[1]]);
    expect(retainedNewsForDelivery(inserted, [])).toEqual([]);
    expect(retainedNewsForDelivery([], [{ publicId: "kept-new" }])).toEqual([]);
  });

  it("never sends the current digest notification for a historical backfill row published in the same run", () => {
    const published = [{ publicId: "historic", title: "Backfill" }, { publicId: "today", title: "New digest article" }];
    const currentDigestInserted = [{ publicId: "today" }];
    const retained = [{ publicId: "historic" }, { publicId: "today" }];
    expect(newlyPublishedDigestArticles(published, currentDigestInserted, retained)).toEqual([published[1]]);
    expect(newlyPublishedDigestArticles(published, [], retained)).toEqual([]);
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
