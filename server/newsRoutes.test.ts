import express from "express";
import { createServer, type Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), authenticateRequest: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./newsDigestService", async () => {
  const actual = await vi.importActual<typeof import("./newsDigestService")>("./newsDigestService");
  return { ...actual, connectNewsGmail: vi.fn(), createNewsGmailOAuthState: vi.fn(() => "test-state"),
    getNewsGmailAuthorizationUrl: vi.fn(() => "https://accounts.example.test/oauth"),
    getNewsGmailConnectionStatus: vi.fn(), verifyNewsGmailOAuthState: vi.fn() };
});
import { registerNewsRoutes } from "./newsRoutes";
import { renderNewsReviewPage } from "./newsReviewPage";

type PublicNewsRow = {
  publicId: string; title: string; description: string | null; sourceName: string;
  url: string; publishedAt: Date; digestReceivedAt: Date; articleSummary: string | null;
  publicationStatus: string; accessStatus: string; fetchedAt: Date | null; summarizedAt: Date | null;
};
function createReadOnlyDb(rows: PublicNewsRow[], detailRows = rows) {
  const listLimit = vi.fn().mockResolvedValue(rows);
  const detailLimit = vi.fn().mockResolvedValue(detailRows);
  const ordered = () => ({ limit: listLimit });
  const from = vi.fn(() => ({ orderBy: vi.fn(ordered), where: vi.fn(() => ({ limit: detailLimit, orderBy: vi.fn(ordered) })) }));
  return { select: vi.fn(() => ({ from })), listLimit, detailLimit };
}
const approvedSpain: PublicNewsRow = {
  publicId: "news-spain", title: "Spain expands residency options for digital nomads",
  description: "A short preview of Spain's digital nomad changes.", sourceName: "Spain Daily",
  url: "https://news.example.test/spain-residency", publishedAt: new Date("2026-11-08T08:00:00Z"),
  digestReceivedAt: new Date("2026-11-08T09:00:00Z"),
  articleSummary: "Spain has updated its residency permit requirements for eligible digital nomads. The original accessible article explains who is affected and the filing changes.",
  publicationStatus: "published", accessStatus: "accessible", fetchedAt: new Date(), summarizedAt: new Date(),
};
const approvedPortugal: PublicNewsRow = { ...approvedSpain, publicId: "news-portugal",
  title: "Portugal clarifies citizenship application rules", description: "A short preview of Portugal's citizenship guidance.",
  articleSummary: "Portugal published updated citizenship guidance for applicants. The article explains the application process and requirements without stating a new fee.",
  sourceName: "Portugal News", url: "https://news.example.test/portugal-citizenship",
  digestReceivedAt: new Date("2026-11-07T09:00:00Z") };
const offTopicCountry: PublicNewsRow = { ...approvedSpain, publicId: "news-spain-sports",
  title: "Spain wins an important football match", description: "The national team celebrated.", articleSummary: "Spain celebrated a football victory." };
const offTopicImmigration: PublicNewsRow = { ...approvedSpain, publicId: "news-germany",
  title: "Germany debates a new immigration policy", description: "The parliament discussed visa rules.", articleSummary: "Germany announced new immigration visa rules." };
function expectedPublic(row: PublicNewsRow) {
  return { publicId: row.publicId, title: row.title, description: row.description, sourceName: row.sourceName,
    url: row.url, publishedAt: row.publishedAt.toISOString(), digestReceivedAt: row.digestReceivedAt.toISOString(), content: row.articleSummary };
}
let server: Server | undefined;
async function startServer() {
  const app = express(); app.use(express.json()); registerNewsRoutes(app); server = createServer(app);
  await new Promise<void>(resolve => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing server address");
  return `http://127.0.0.1:${address.port}`;
}
afterEach(async () => { if (!server) return; const open = server; server = undefined; await new Promise<void>(resolve => open.close(() => resolve())); });
beforeEach(() => { vi.clearAllMocks(); mocks.getDb.mockReset(); mocks.authenticateRequest.mockReset(); });

describe("public news routes", () => {
  it("lists published relevant originals only, in database order, with full summary rather than Alert description", async () => {
    const pending = { ...approvedSpain, publicId: "legacy-snippet", publicationStatus: "pending_review" };
    const db = createReadOnlyDb([approvedSpain, offTopicCountry, pending, approvedPortugal, offTopicImmigration]);
    mocks.getDb.mockResolvedValue(db); const base = await startServer(); const response = await fetch(`${base}/public-api/news`);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const articles = await response.json(); expect(articles).toEqual([expectedPublic(approvedSpain), expectedPublic(approvedPortugal)]);
    expect(articles[0].content).not.toBe(articles[0].description);
    for (const row of articles) for (const name of ["sourceMailbox", "sourceMessageId", "tokens", "articleContent", "articleSummary", "publicationStatus", "accessError", "fetchedAt"]) expect(row).not.toHaveProperty(name);
    expect(db.select).toHaveBeenCalledTimes(1); expect(db.listLimit).toHaveBeenCalledTimes(1);
  });
  it("returns a source-grounded detail and preserves short preview, publisher and original URL", async () => {
    const db = createReadOnlyDb([], [approvedPortugal]); mocks.getDb.mockResolvedValue(db); const base = await startServer();
    const response = await fetch(`${base}/public-api/news/news-portugal`); expect(response.status).toBe(200);
    const article = await response.json(); expect(article).toEqual(expectedPublic(approvedPortugal)); expect(article.content).not.toBe(article.description);
    expect(response.headers.get("cache-control")).toBe("no-store"); expect(db.detailLimit).toHaveBeenCalledTimes(1);
  });
  it.each([
    { publicationStatus: "pending_review" }, { publicationStatus: "rejected" }, { accessStatus: "inaccessible" },
    { accessStatus: "pending" }, { articleSummary: "" }, { articleSummary: null }, { fetchedAt: null }, { summarizedAt: null },
  ])("hides an unvalidated article from feed and details even if its snippet is relevant: %j", async override => {
    const row = { ...approvedSpain, ...override }; mocks.getDb.mockResolvedValue(createReadOnlyDb([row])); const base = await startServer();
    expect(await (await fetch(`${base}/public-api/news`)).json()).toEqual([]);
    const response = await fetch(`${base}/public-api/news/news-spain`); expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "not_found" });
  });
  it("does not use a relevant Alert snippet to override unrelated extracted article content", async () => {
    const row = { ...approvedSpain, title: "Daily news", description: "Spain immigration visa rules", articleSummary: "Canada's national team won the football match." };
    mocks.getDb.mockResolvedValue(createReadOnlyDb([row])); const base = await startServer();
    expect(await (await fetch(`${base}/public-api/news`)).json()).toEqual([]);
  });
  it("returns 404 for off-topic and missing articles", async () => {
    const db = createReadOnlyDb([], [offTopicCountry]); mocks.getDb.mockResolvedValue(db); const base = await startServer();
    expect((await fetch(`${base}/public-api/news/news-spain-sports`)).status).toBe(404); db.detailLimit.mockResolvedValueOnce([]);
    expect((await fetch(`${base}/public-api/news/missing`)).status).toBe(404);
  });
  it("returns safe database-unavailable errors", async () => {
    mocks.getDb.mockResolvedValue(null); const base = await startServer();
    for (const path of ["/public-api/news", "/public-api/news/news-spain"]) { const response = await fetch(base + path); expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "service_unavailable" }); }
  });
});

describe("private News review", () => {
  it("requires authenticated admin access", async () => {
    mocks.authenticateRequest.mockRejectedValue(new Error("missing")); const base = await startServer();
    expect((await fetch(`${base}/api/admin/news/review`)).status).toBe(401);
    mocks.authenticateRequest.mockResolvedValue({ role: "user" }); expect((await fetch(`${base}/api/admin/news/review?format=json`)).status).toBe(403);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("shows source-access reasons privately and escapes unsafe titles and link protocols", () => {
    const html = renderNewsReviewPage([{ publicId: "review", title: '<script>alert("x")</script>', url: "javascript:alert(1)", sourceName: "Publisher",
      publicationStatus: "pending_review", accessStatus: "inaccessible", accessError: "http_403", reviewReason: "source_blocked",
      digestReceivedAt: new Date(), summaryWordCount: null }]);
    expect(html).toContain("source_blocked"); expect(html).toContain("Review required"); expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>"); expect(html).not.toContain("javascript:"); expect(html).toContain('href="#"');
  });
  it("serves a private no-store review queue to administrators", async () => {
    mocks.authenticateRequest.mockResolvedValue({ role: "admin" }); mocks.getDb.mockResolvedValue(createReadOnlyDb([])); const base = await startServer();
    const response = await fetch(`${base}/api/admin/news/review`); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("News source review");
  });
});
