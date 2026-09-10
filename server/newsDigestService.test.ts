import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { createNewsGmailOAuthState, decryptGmailRefreshToken, encryptGmailRefreshToken, extractNewsArticlesFromDigest, NEWS_MAX_ARTICLES, NEWS_SOURCE_MAILBOX, NEWS_SUBJECT_TRIGGER, verifyNewsGmailOAuthState } from "./newsDigestService";
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

  it("runs at 09:30 Cairo in both summer and winter UTC offsets", () => {
    expect(isCairoNewsDigestTime(new Date("2026-09-10T06:30:00Z"))).toBe(true);
    expect(isCairoNewsDigestTime(new Date("2026-01-10T07:30:00Z"))).toBe(true);
    expect(isCairoNewsDigestTime(new Date("2026-09-10T07:30:00Z"))).toBe(false);
    expect(isCairoNewsDigestTime(new Date("2026-01-10T06:30:00Z"))).toBe(false);
  });
});
