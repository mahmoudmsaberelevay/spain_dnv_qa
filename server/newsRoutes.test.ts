import express from "express";
import { createServer, type Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  authenticateRequest: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: mocks.authenticateRequest,
  },
}));

vi.mock("./newsDigestService", async () => {
  const actual = await vi.importActual<typeof import("./newsDigestService")>("./newsDigestService");
  return {
    ...actual,
    connectNewsGmail: vi.fn(),
    createNewsGmailOAuthState: vi.fn(() => "test-state"),
    getNewsGmailAuthorizationUrl: vi.fn(() => "https://accounts.example.test/oauth"),
    getNewsGmailConnectionStatus: vi.fn(),
    verifyNewsGmailOAuthState: vi.fn(),
  };
});

import { registerNewsRoutes } from "./newsRoutes";

type PublicNewsRow = {
  publicId: string;
  title: string;
  description: string | null;
  sourceName: string;
  url: string;
  publishedAt: Date;
  digestReceivedAt: Date;
};

function createReadOnlyDb(rows: PublicNewsRow[], detailRows = rows) {
  const listLimit = vi.fn().mockResolvedValue(rows);
  const detailLimit = vi.fn().mockResolvedValue(detailRows);
  const from = vi.fn(() => ({
    orderBy: vi.fn(() => ({ limit: listLimit })),
    where: vi.fn(() => ({ limit: detailLimit })),
  }));

  return {
    select: vi.fn(() => ({ from })),
    listLimit,
    detailLimit,
  };
}

const approvedSpain: PublicNewsRow = {
  publicId: "news-spain",
  title: "Spain expands residency options for digital nomads",
  description: "Spain has updated its residency requirements for eligible digital nomads.",
  sourceName: "Spain Daily",
  url: "https://news.example.test/spain-residency",
  publishedAt: new Date("2026-11-08T08:00:00.000Z"),
  digestReceivedAt: new Date("2026-11-08T09:00:00.000Z"),
};

const approvedPortugal: PublicNewsRow = {
  publicId: "news-portugal",
  title: "Portugal clarifies citizenship application rules",
  description: "Portugal published updated citizenship guidance for applicants.",
  sourceName: "Portugal News",
  url: "https://news.example.test/portugal-citizenship",
  publishedAt: new Date("2026-11-07T08:00:00.000Z"),
  digestReceivedAt: new Date("2026-11-07T09:00:00.000Z"),
};

const offTopicCountry: PublicNewsRow = {
  publicId: "news-spain-sports",
  title: "Spain wins an important football match",
  description: "The national team celebrated a dramatic victory in Madrid.",
  sourceName: "Sports Daily",
  url: "https://news.example.test/spain-sports",
  publishedAt: new Date("2026-11-06T08:00:00.000Z"),
  digestReceivedAt: new Date("2026-11-06T09:00:00.000Z"),
};

const offTopicImmigration: PublicNewsRow = {
  publicId: "news-germany-immigration",
  title: "Germany debates a new immigration policy",
  description: "The parliament discussed changes to immigration policy.",
  sourceName: "World News",
  url: "https://news.example.test/germany-immigration",
  publishedAt: new Date("2026-11-05T08:00:00.000Z"),
  digestReceivedAt: new Date("2026-11-05T09:00:00.000Z"),
};

let server: Server | undefined;

async function startServer() {
  const app = express();
  registerNewsRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server address");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (!server) return;
  const openServer = server;
  server = undefined;
  await new Promise<void>(resolve => openServer.close(() => resolve()));
});

describe("public news routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockReset();
    mocks.authenticateRequest.mockReset();
  });

  it("lists only relevant country/topic articles in the database order and copies description to content", async () => {
    const db = createReadOnlyDb([approvedSpain, offTopicCountry, approvedPortugal, offTopicImmigration]);
    mocks.getDb.mockResolvedValue(db);
    const base = await startServer();

    const response = await fetch(`${base}/public-api/news`);
    expect(response.status).toBe(200);
    const articles = await response.json();

    expect(articles).toEqual([
      {
        ...approvedSpain,
        publishedAt: approvedSpain.publishedAt.toISOString(),
        digestReceivedAt: approvedSpain.digestReceivedAt.toISOString(),
        content: approvedSpain.description,
      },
      {
        ...approvedPortugal,
        publishedAt: approvedPortugal.publishedAt.toISOString(),
        digestReceivedAt: approvedPortugal.digestReceivedAt.toISOString(),
        content: approvedPortugal.description,
      },
    ]);
    expect(articles.map((article: { publicId: string }) => article.publicId)).toEqual(["news-spain", "news-portugal"]);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.listLimit).toHaveBeenCalledTimes(1);
    expect(articles.every((article: Record<string, unknown>) => !("sourceMailbox" in article) && !("sourceMessageId" in article) && !("tokens" in article))).toBe(true);
  });

  it("returns the relevant article detail with its description as content and preserves its URL", async () => {
    const db = createReadOnlyDb([], [approvedPortugal]);
    mocks.getDb.mockResolvedValue(db);
    const base = await startServer();

    const response = await fetch(`${base}/public-api/news/news-portugal`);
    expect(response.status).toBe(200);
    const article = await response.json();

    expect(article).toEqual({
      ...approvedPortugal,
      publishedAt: approvedPortugal.publishedAt.toISOString(),
      digestReceivedAt: approvedPortugal.digestReceivedAt.toISOString(),
      content: approvedPortugal.description,
    });
    expect(article.url).toBe(approvedPortugal.url);
    expect(article).not.toHaveProperty("sourceMailbox");
    expect(article).not.toHaveProperty("sourceMessageId");
    expect(article).not.toHaveProperty("tokens");
    expect(db.detailLimit).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for an off-topic article and for a missing article", async () => {
    const db = createReadOnlyDb([], [offTopicCountry]);
    mocks.getDb.mockResolvedValue(db);
    const base = await startServer();

    const offTopicResponse = await fetch(`${base}/public-api/news/news-spain-sports`);
    expect(offTopicResponse.status).toBe(404);
    expect(await offTopicResponse.json()).toEqual({ error: "not_found" });

    db.detailLimit.mockResolvedValueOnce([]);
    const missingResponse = await fetch(`${base}/public-api/news/does-not-exist`);
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual({ error: "not_found" });
  });

  it("returns 503 when the database is unavailable for list and detail requests", async () => {
    mocks.getDb.mockResolvedValue(null);
    const base = await startServer();

    const listResponse = await fetch(`${base}/public-api/news`);
    expect(listResponse.status).toBe(503);
    expect(await listResponse.json()).toEqual({ error: "service_unavailable" });

    const detailResponse = await fetch(`${base}/public-api/news/news-spain`);
    expect(detailResponse.status).toBe(503);
    expect(await detailResponse.json()).toEqual({ error: "service_unavailable" });
  });
});
