import { EventEmitter } from "node:events";
import * as dns from "node:dns";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anthropicCreate = vi.hoisted(() => vi.fn());
const httpRequestMock = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: anthropicCreate };
    constructor(_options: unknown) {}
  },
}));
vi.mock("node:http", async () => ({
  ...(await vi.importActual<typeof import("node:http")>("node:http")),
  request: httpRequestMock,
}));

import {
  countNewsWords,
  extractReadableNewsArticle,
  fetchReadableNewsArticle,
  isPublicIpv4,
  isPublicIpv6,
  researchNewsArticle,
  validateDnsAnswers,
  validateNewsUrl,
  validateSummaryGrounding,
} from "./newsArticleResearch";

type FakeResponseOptions = {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
};

function fakeResponse(options: FakeResponseOptions = {}) {
  const response = new EventEmitter() as EventEmitter & {
    statusCode: number;
    headers: Record<string, string>;
    resume: () => void;
  };
  response.statusCode = options.status ?? 200;
  response.headers = options.headers ?? { "content-type": "text/html; charset=utf-8" };
  response.resume = vi.fn();
  response.emit("data", Buffer.from(options.body ?? ""));
  return response;
}

function fakeRequest(response: ReturnType<typeof fakeResponse>) {
  const request = new EventEmitter() as EventEmitter & {
    end: () => void;
    destroy: (error?: Error) => void;
  };
  request.end = vi.fn(() => {
    queueMicrotask(() => {
      response.emit("data", Buffer.from(response.headers["x-body"] ?? ""));
      response.emit("end");
    });
  });
  request.destroy = vi.fn((error?: Error) => {
    if (error) queueMicrotask(() => request.emit("error", error));
  });
  return request;
}

function installHttp(sequence: FakeResponseOptions[], seen: Array<Record<string, unknown>> = []) {
  let index = 0;
  httpRequestMock.mockImplementation(((options: Record<string, unknown>, callback: (response: unknown) => void) => {
    seen.push(options);
    const config = sequence[index++] ?? { status: 500, body: "" };
    const body = config.body ?? "";
    const response = fakeResponse({ ...config, headers: { "content-type": "text/html; charset=utf-8", ...(config.headers || {}), "x-body": body } });
    const req = fakeRequest(response);
    queueMicrotask(() => callback(response));
    return req as never;
  }) as never);
  return httpRequestMock;
}

function articleHtml(body: string, extra = "") {
  return `<!doctype html><html><head><title>Article</title>${extra}</head><body>
    <header>Site navigation and menu</header><nav>Home News Subscribe</nav>
    <main><article><h1>Spain residency article</h1>${body}</article></main>
    <aside class="related">Unrelated recommended stories</aside><footer>Newsletter and footer</footer>
  </body></html>`;
}

function paragraphWords(count: number, prefix = "Spain residency investment migration programme") {
  const words = prefix.split(" ");
  return Array.from({ length: count }, (_, index) => words[index % words.length]).join(" ");
}

function modelResult(summary: string, sourceEvidence: string, relevant = true, sufficient = true) {
  anthropicCreate.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ grounded: true, relevant: true, original: true }) }] });
  anthropicCreate.mockResolvedValueOnce({
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ relevant, summary, preview: summary.slice(0, 80), sufficient, claims: [{ claim: summary, evidence: sourceEvidence }] }) }],
  });
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only-no-network");
  vi.stubEnv("ELEVAY_CLAUDE_MODEL", "claude-test");
  vi.spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
  anthropicCreate.mockReset();
  httpRequestMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("public address and URL validation", () => {
  it("rejects private, loopback, link-local, reserved, and mapped addresses", () => {
    for (const address of ["0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1", "192.168.1.1", "198.51.100.2", "203.0.113.2", "224.0.0.1"]) {
      expect(isPublicIpv4(address), address).toBe(false);
    }
    expect(isPublicIpv4("93.184.216.34")).toBe(true);
    for (const address of ["::", "::1", "fc00::1", "fe80::1", "2001:db8::1", "2002:c000:0201::1", "::ffff:192.168.1.1"]) {
      expect(isPublicIpv6(address), address).toBe(false);
    }
    expect(isPublicIpv6("2001:4860:4860::8888")).toBe(true);
    expect(() => validateNewsUrl("file:///etc/passwd")).toThrow();
    expect(() => validateNewsUrl("https://user:pass@example.com/article")).toThrow();
    expect(() => validateNewsUrl("https://example.com:8443/article")).toThrow();
    expect(() => validateNewsUrl("https://127.0.0.1/article")).toThrow();
  });

  it("validates every DNS answer rather than trusting the first answer", () => {
    expect(() => validateDnsAnswers([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ])).toThrow(/non-public/);
    expect(validateDnsAnswers([{ address: "93.184.216.34", family: 4 }])).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });
});

describe("readable extraction", () => {
  it("keeps article paragraphs and excludes navigation, ads, and unrelated blocks", () => {
    const html = articleHtml(`<p>Spain announced a new residency policy for eligible investors and families.</p><p>The ministry said applications will continue under the published immigration framework.</p><div class="advertisement">Buy this unrelated product now.</div><div class="newsletter">Sign up for our newsletter.</div>`);
    const text = extractReadableNewsArticle(html, "https://example.com/article");
    expect(text).toContain("Spain announced a new residency policy");
    expect(text).not.toContain("Site navigation");
    expect(text).not.toContain("Buy this unrelated product");
    expect(text).not.toContain("Sign up for our newsletter");
  });

  it("rejects explicit JSON-LD and actual subscription walls, but not ordinary subscribe footers", () => {
    const paywalled = articleHtml(`<p>${paragraphWords(120)}</p>`, `<script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false}</script>`);
    expect(extractReadableNewsArticle(paywalled, "https://example.com/article")).toBeNull();
    const wallClass = articleHtml(`<div class="metered-paywall"><p>${paragraphWords(120)}</p></div>`);
    expect(extractReadableNewsArticle(wallClass, "https://example.com/article")).toBeNull();
    const normalFooter = articleHtml(`<p>${paragraphWords(120)}</p><footer>Subscribe to the newsletter for updates.</footer>`);
    expect(extractReadableNewsArticle(normalFooter, "https://example.com/article")).not.toBeNull();
  });

  it("counts words without using a snippet or title", () => {
    expect(countNewsWords("one two three")).toBe(3);
    const text = extractReadableNewsArticle(articleHtml("<p>Only the actual article body is retained.</p>"), "https://example.com/article");
    expect(text).toBe("Spain residency article\n\nOnly the actual article body is retained.");
  });

  it("preserves short factual lines and does not repeat nested list paragraphs", () => {
    const text = extractReadableNewsArticle(articleHtml("<p>Fee: $100</p><ul><li><p>File by 1 June.</p></li></ul>"), "https://example.com/article")!;
    expect(text).toContain("Fee: $100"); expect(text).toContain("File by 1 June."); expect(text.match(/File by 1 June\./g)).toHaveLength(1);
  });
});

describe("bounded pinned fetching", () => {
  it("pins the socket lookup to a validated public address and sends no cookies or compression request", async () => {
    const seen: Array<Record<string, unknown>> = [];
    installHttp([{ body: articleHtml(`<p>${paragraphWords(100)}</p>`) }], seen);
    const result = await fetchReadableNewsArticle("http://example.com/article");
    expect(result.finalUrl).toBe("http://example.com/article");
    expect(result.wordCount).toBeGreaterThan(80);
    expect(seen[0].hostname).toBe("example.com");
    expect((seen[0].headers as Record<string, string>).cookie).toBeUndefined();
    expect((seen[0].headers as Record<string, string>)["accept-encoding"]).toBe("identity");
    const lookup = seen[0].lookup as (...args: any[]) => void;
    const callback = vi.fn();
    lookup("example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    const allCallback = vi.fn();
    lookup("example.com", { all: true }, allCallback);
    expect(allCallback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("validates every redirect and rejects rebinding to a private answer", async () => {
    vi.mocked(dns.promises.lookup).mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never).mockResolvedValueOnce([{ address: "10.0.0.8", family: 4 }] as never);
    installHttp([{ status: 302, headers: { location: "http://redirect.example/article" } }]);
    await expect(fetchReadableNewsArticle("http://example.com/article")).rejects.toThrow(/non-public/);
    expect(dns.promises.lookup).toHaveBeenCalledTimes(2);
  });

  it("rejects non-identity encoding, non-article content, and excessive redirects", async () => {
    installHttp([{ headers: { "content-type": "application/pdf" }, body: "%PDF" }]);
    await expect(fetchReadableNewsArticle("http://example.com/article")).rejects.toThrow(/not readable/);
    vi.restoreAllMocks();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    installHttp([{ headers: { "content-encoding": "gzip" }, body: "compressed" }]);
    await expect(fetchReadableNewsArticle("http://example.com/article")).rejects.toThrow(/Compressed/);
    vi.restoreAllMocks();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    installHttp(Array.from({ length: 6 }, () => ({ status: 302, headers: { location: "http://example.com/next" } })));
    await expect(fetchReadableNewsArticle("http://example.com/article")).rejects.toThrow(/redirects/);
  });
});

describe("research publication gates", () => {
  const article = { title: "Spain residency changes", url: "http://example.com/article", description: "A feed snippet that must never inflate the source", sourceName: "Example" };

  it("publishes only a grounded 200-350 word summary for a genuine long source", async () => {
    const evidence = "Spain residency investment migration programme";
    const source = paragraphWords(500, evidence);
    const summary = paragraphWords(200, evidence);
    modelResult(summary, evidence);
    installHttp([{ body: articleHtml(`<p>${source}</p>`) }]);
    const result = await researchNewsArticle(article, () => true);
    expect(result.publicationStatus).toBe("published");
    expect(result.accessStatus).toBe("accessible");
    expect(result.articleSummary).toBe(summary);
    expect(result.summaryWordCount).toBe(200);
    expect(result.description).toBe(summary.slice(0, 80));
    expect(anthropicCreate).toHaveBeenCalledTimes(2);
    expect(anthropicCreate.mock.calls[0][0].output_config.format.type).toBe("json_schema");
    const system = anthropicCreate.mock.calls[0][0].system;
    expect(system).toContain("Latvia"); expect(system).toContain("Argentina");
    expect(system).not.toContain("Nauru"); expect(system).not.toContain("Vanuatu");
    expect(anthropicCreate.mock.calls[1][0].system).toContain("ALL claims");
  });

  it("allows a shorter summary for a genuine short article but never calls the model below 80 words", async () => {
    const evidence = "Spain residency investment migration programme";
    const shortSource = paragraphWords(110, evidence);
    modelResult(paragraphWords(55, evidence), evidence);
    installHttp([{ body: articleHtml(`<p>${shortSource}</p>`) }]);
    const result = await researchNewsArticle(article, () => true);
    expect(result.publicationStatus).toBe("published");
    expect(result.summaryWordCount).toBe(55);

    anthropicCreate.mockReset();
    vi.restoreAllMocks();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    installHttp([{ body: articleHtml(`<p>${paragraphWords(40, evidence)}</p>`) }]);
    const insufficient = await researchNewsArticle({ ...article, description: "A very long misleading feed snippet" }, () => true);
    expect(insufficient.publicationStatus).toBe("pending_review");
    expect(insufficient.reviewReason).toBe("article_text_insufficient");
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("does not use a description/snippet when the original article is inaccessible or model configuration is unavailable", async () => {
    installHttp([{ status: 403, body: "Subscribe to read" }]);
    const inaccessible = await researchNewsArticle(article, () => true);
    expect(inaccessible.publicationStatus).toBe("pending_review");
    expect(inaccessible.accessStatus).toBe("fetch_failed");
    expect(inaccessible.articleSummary).toBeNull();

    vi.restoreAllMocks();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    installHttp([{ body: articleHtml(`<p>${paragraphWords(100)}</p>`) }]);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const noKey = await researchNewsArticle(article, () => true);
    expect(noKey.publicationStatus).toBe("pending_review");
    expect(noKey.articleSummary).toBeNull();
    expect(noKey.reviewReason).toBe("summary_model_unavailable");
  });

  it.each([
    { reason: "article_paywalled", html: articleHtml(`<p>${paragraphWords(100)}</p>`, '<script type="application/ld+json">{"isAccessibleForFree":false}</script>') },
    { reason: "article_unreadable", html: "<html><body><nav>Navigation only</nav><div>No article body</div></body></html>" },
  ])("labels a 2xx but blocked/unreadable source inaccessible: $reason", async ({ reason, html }) => {
    installHttp([{ body: html }]);
    const result = await researchNewsArticle(article, () => true);
    expect(result.publicationStatus).toBe("pending_review");
    expect(result.accessStatus).toBe("inaccessible");
    expect(result.reviewReason).toBe(reason);
    expect(result.articleSummary).toBeNull();
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("fails closed when the model invents a number or supplies non-source evidence", async () => {
    const evidence = "Spain residency investment migration programme";
    const source = paragraphWords(500, evidence) + " The article reports 2026 as the current year.";
    modelResult(`${paragraphWords(199, evidence)} 9999`, evidence);
    installHttp([{ body: articleHtml(`<p>${source}</p>`) }]);
    const result = await researchNewsArticle(article, () => true);
    expect(result.publicationStatus).toBe("pending_review");
    expect(result.articleSummary).toBeNull();
    expect(result.reviewReason).toBe("summary_unverified");

    expect(validateSummaryGrounding("The cost is 9999.", source, [{ claim: "The cost is 9999.", evidence }])).toMatch(/numeric/);
    expect(validateSummaryGrounding("Spain policy", source, [{ claim: "Spain policy", evidence: "not present" }])).toMatch(/evidence/);
  });

  it("accepts ordered sentence-level evidence claims only when they reconstruct every paragraph exactly", () => {
    const source = "Canada introduced a permanent rural immigration pathway. The pathway targets eligible applicants and employers. More details will follow.";
    const summary = "Canada introduced a permanent rural immigration pathway. The pathway targets eligible applicants and employers.\n\nMore details will follow.";
    const sentenceClaims = [
      { claim: "Canada introduced a permanent rural immigration pathway.", evidence: "Canada introduced a permanent rural immigration pathway." },
      { claim: "The pathway targets eligible applicants and employers.", evidence: "The pathway targets eligible applicants and employers." },
      { claim: "More details will follow.", evidence: "More details will follow." },
    ];
    expect(validateSummaryGrounding(summary, source, sentenceClaims)).toBeNull();
    expect(validateSummaryGrounding(summary, source, sentenceClaims.slice(0, 2))).toMatch(/claims/);
    expect(validateSummaryGrounding(summary, source, [sentenceClaims[1], sentenceClaims[0], sentenceClaims[2]])).toMatch(/claims/);
    expect(validateSummaryGrounding(summary, source, [...sentenceClaims, { claim: "An extra unsupported sentence.", evidence: "Canada introduced a permanent rural immigration pathway." }])).toMatch(/claims/);
  });

  it("validates grouped year ranges and amounts while allowing source line-wraps in exact evidence", () => {
    const source = "The 2027–2029 plan targets 5,500 admission spaces.\n\nThe programme continues.";
    const summary = "The 2027–2029 plan targets 5,500 admission spaces. The programme continues.";
    expect(validateSummaryGrounding(summary, source, [
      { claim: "The 2027–2029 plan targets 5,500 admission spaces.", evidence: "The 2027–2029 plan\ntargets 5,500 admission spaces." },
      { claim: "The programme continues.", evidence: "The programme continues." },
    ])).toBeNull();
    expect(validateSummaryGrounding("The 2027–2029 plan targets 6,500 admission spaces.", source, [
      { claim: "The 2027–2029 plan targets 6,500 admission spaces.", evidence: "The 2027–2029 plan targets 5,500 admission spaces." },
    ])).toMatch(/numeric/);
  });

  it("rejects relevance after fetching the original body and marks rejected articles separately", async () => {
    const request = installHttp([{ body: articleHtml(`<p>${paragraphWords(100)}</p>`) }]);
    const result = await researchNewsArticle(article, () => false);
    expect(result.publicationStatus).toBe("rejected");
    expect(result.reviewReason).toBe("relevance_rejected");
    expect(request).toHaveBeenCalled();
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("uses the extracted body rather than Alert title or snippet for its relevance predicate", async () => {
    const evidence = "Spain residency investment migration programme";
    const source = paragraphWords(500, evidence); const summary = paragraphWords(200, evidence);
    modelResult(summary, evidence); installHttp([{ body: articleHtml(`<p>${source}</p>`) }]);
    const gate = vi.fn(() => true);
    const result = await researchNewsArticle({ ...article, title: "Daily news", description: "Misleading football snippet" }, gate);
    expect(gate).toHaveBeenCalledWith({ title: "", description: `Spain residency article\n\n${source}` });
    expect(result.publicationStatus).toBe("published");
    expect(anthropicCreate.mock.calls[0][0].messages[0].content).not.toContain("Misleading football snippet");
  });

  it.each([{ grounded: false, relevant: true, original: true }, { grounded: true, relevant: true, original: false }])("flags unsupported or copied summaries even if numbers/evidence exist: %j", async verdict => {
    const evidence = "Spain residency investment migration programme";
    modelResult(paragraphWords(200, evidence), evidence);
    anthropicCreate.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(verdict) }] });
    installHttp([{ body: articleHtml(`<p>${paragraphWords(500, evidence)}</p>`) }]);
    const result = await researchNewsArticle(article, () => true);
    expect(result.publicationStatus).toBe("pending_review"); expect(result.articleSummary).toBeNull(); expect(result.reviewReason).toBe("summary_unverified");
  });

  it("reads JSON-LD publisher before script removal and excludes a second unrelated article body", async () => {
    const html = articleHtml(`<p>${paragraphWords(100)}</p>`, '<script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","publisher":{"name":"Original Publisher"}}]}</script>').replace("</main>", '<article><p>Unrelated Germany sports news and football results should not be included.</p></article></main>');
    installHttp([{ body: html }]); const result = await fetchReadableNewsArticle("http://example.com/article");
    expect(result.publisher).toBe("Original Publisher"); expect(result.content).not.toContain("Unrelated Germany");
    expect(extractReadableNewsArticle(articleHtml(`<p>${paragraphWords(100)}</p>`, '<script type="application/ld+json">{"@graph":[{"isAccessibleForFree":false}]}</script>'), "https://example.com/article")).toBeNull();
  });

  it("uses an explicit publisher instead of SEO site metadata and strips only an exact appended article heading", async () => {
    installHttp([{ body: articleHtml(`<p>${paragraphWords(100)}</p>`, '<meta property="og:site_name" content="Example Publisher - Spain residency article">') }]);
    expect((await fetchReadableNewsArticle("http://example.com/article")).publisher).toBe("Example Publisher");
    installHttp([{ body: articleHtml(`<p>${paragraphWords(100)}</p>`, '<meta property="og:site_name" content="SEO title"><script type="application/ld+json">{"@type":"NewsArticle","publisher":{"name":"Actual Publisher"}}</script>') }]);
    expect((await fetchReadableNewsArticle("http://example.com/article")).publisher).toBe("Actual Publisher");
  });

  it("never persists raw provider errors or unsupported snippet summaries", async () => {
    installHttp([{ body: articleHtml(`<p>${paragraphWords(100)}</p>`) }]);
    anthropicCreate.mockRejectedValue(new Error("secret-test-credential with provider payload"));
    const result = await researchNewsArticle(article, () => true);
    expect(result.articleSummary).toBeNull(); expect(result.reviewReason).toBe("summary_unverified"); expect(JSON.stringify(result)).not.toContain("secret-test-credential");
  });
});
