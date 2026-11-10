import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb, researchNewsArticle } = vi.hoisted(() => ({
  getDb: vi.fn(),
  researchNewsArticle: vi.fn(),
}));

vi.mock("./db", () => ({ getDb }));
vi.mock("./newsArticleResearch", () => ({ researchNewsArticle }));

import {
  isNewsEligibleForSummaryRetry,
  isNewsReadyForPublication,
  processPendingNewsArticles,
} from "./newsArticleWorkflow";

const fetchedAt = new Date("2026-11-10T08:00:00.000Z");
const summarizedAt = new Date("2026-11-10T08:01:00.000Z");

function article(id: number, publicId = `news-${id}`) {
  return {
    id,
    publicId,
    canonicalUrlHash: `hash-${id}`,
    url: `https://example.com/news/${id}`,
    title: `News article ${id}`,
    description: "An immigration policy update.",
    sourceName: "Example News",
    publicationStatus: "pending_review",
    accessStatus: "pending",
    processingAt: null,
    digestReceivedAt: new Date(`2026-11-10T0${id}:00:00.000Z`),
  };
}

function readyResult(overrides: Record<string, unknown> = {}) {
  return {
    publicationStatus: "published",
    accessStatus: "accessible",
    articleContent: "The source article content.",
    articleSummary: "A grounded summary of the source article.",
    description: "An immigration policy update.",
    sourceName: "Example News",
    fetchedAt,
    summarizedAt,
    summaryWordCount: 7,
    accessError: null,
    reviewReason: null,
    ...overrides,
  };
}

type DbHarness = {
  db: {
    select: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  selectedWhere: unknown[];
  selectedLimits: number[];
  updateWhere: unknown[];
  savedValues: Record<string, unknown>[];
};

function makeDb(candidates: unknown[], updateResults: Array<{ affectedRows: number }> = []) : DbHarness {
  const selectedWhere: unknown[] = [];
  const selectedLimits: number[] = [];
  const updateWhere: unknown[] = [];
  const savedValues: Record<string, unknown>[] = [];
  let updateIndex = 0;

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn((predicate: unknown) => {
        selectedWhere.push(predicate);
        return {
          orderBy: vi.fn(() => ({
            limit: vi.fn((value: number) => {
              selectedLimits.push(value);
              return Promise.resolve(candidates.slice(0, value));
            }),
          })),
        };
      }),
    })),
  }));

  const update = vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => {
      if (values.accessStatus !== "processing") savedValues.push(values);
      return {
        where: vi.fn((predicate: unknown) => {
          updateWhere.push(predicate);
          const result = updateResults[updateIndex++] || { affectedRows: 1 };
          return Promise.resolve([result]);
        }),
      };
    }),
  }));

  const db = { select, update };
  getDb.mockResolvedValue(db);
  return { db, selectedWhere, selectedLimits, updateWhere, savedValues };
}

describe("news article workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows retry only for accessible pending rows held by the summary verifier", () => {
    expect(isNewsEligibleForSummaryRetry({ publicationStatus: "pending_review", accessStatus: "accessible", reviewReason: "summary_unverified" })).toBe(true);
    expect(isNewsEligibleForSummaryRetry({ publicationStatus: "pending_review", accessStatus: "fetch_failed", reviewReason: "summary_unverified" })).toBe(false);
    expect(isNewsEligibleForSummaryRetry({ publicationStatus: "pending_review", accessStatus: "inaccessible", reviewReason: "article_paywalled" })).toBe(false);
    expect(isNewsEligibleForSummaryRetry({ publicationStatus: "rejected", accessStatus: "accessible", reviewReason: "summary_unverified" })).toBe(false);
    expect(isNewsEligibleForSummaryRetry({ publicationStatus: "pending_review", accessStatus: "accessible", reviewReason: "article_unreadable" })).toBe(false);
  });

  describe("isNewsReadyForPublication", () => {
    it.each([
      ["pending publication", { publicationStatus: "pending_review" }],
      ["rejected publication", { publicationStatus: "rejected" }],
      ["inaccessible source", { accessStatus: "inaccessible" }],
      ["missing fetchedAt", { fetchedAt: null }],
      ["missing summarizedAt", { summarizedAt: null }],
      ["missing fetchedAt property", { fetchedAt: undefined }],
      ["missing summarizedAt property", { summarizedAt: undefined }],
      ["empty summary", { articleSummary: "" }],
      ["whitespace-only summary", { articleSummary: "  \n\t" }],
    ] as const)("fails closed for $0", (_label, change) => {
      expect(isNewsReadyForPublication({
        publicationStatus: "published",
        accessStatus: "accessible",
        articleSummary: "A valid summary",
        fetchedAt,
        summarizedAt,
        ...change,
      })).toBe(false);
    });

    it("requires every publication invariant", () => {
      expect(isNewsReadyForPublication({
        publicationStatus: "published",
        accessStatus: "accessible",
        articleSummary: "A valid summary",
        fetchedAt,
        summarizedAt,
      })).toBe(true);
    });
  });

  it("uses a pending-status SQL selector with the requested limit and does not process a complete row returned by the mocked builder", async () => {
    const complete = {
      ...article(1),
      publicationStatus: "published",
      accessStatus: "accessible",
      articleSummary: "Already published",
      fetchedAt,
      summarizedAt,
    };
    const harness = makeDb([complete], [{ affectedRows: 0 }]);

    const result = await processPendingNewsArticles(vi.fn(() => true), { limit: 1 });

    expect(harness.selectedWhere).toHaveLength(1);
    expect(harness.selectedLimits).toEqual([1]);
    expect(harness.db.update).toHaveBeenCalledTimes(1);
    expect(researchNewsArticle).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 0, flagged: 0, rejected: 0, published: [] });
  });

  it("atomically claims rows and skips the model when an overlapping job loses the claim", async () => {
    const queued = article(1);
    const harness = makeDb([queued], [
      { affectedRows: 1 },
      { affectedRows: 0 },
      { affectedRows: 1 },
    ]);
    let releaseResearch!: (value: ReturnType<typeof readyResult>) => void;
    researchNewsArticle.mockReturnValue(new Promise(resolve => {
      releaseResearch = resolve;
    }));
    const relevance = vi.fn(() => true);

    const first = processPendingNewsArticles(relevance, { limit: 1 });
    const second = processPendingNewsArticles(relevance, { limit: 1 });
    await vi.waitFor(() => expect(researchNewsArticle).toHaveBeenCalledTimes(1));
    expect(harness.db.update).toHaveBeenCalledTimes(2);
    expect(harness.updateWhere).toHaveLength(2);
    releaseResearch(readyResult());

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.published).toEqual([{ publicId: queued.publicId, title: queued.title }]);
    expect(secondResult.published).toEqual([]);
    expect(researchNewsArticle).toHaveBeenCalledWith(queued, relevance);
    expect(harness.savedValues).toHaveLength(1);
  });

  it("saves a complete result as published with its summary", async () => {
    const queued = article(2);
    const harness = makeDb([queued], [{ affectedRows: 1 }, { affectedRows: 1 }]);
    const relevance = vi.fn(() => true);
    researchNewsArticle.mockResolvedValue(readyResult());

    const result = await processPendingNewsArticles(relevance, { limit: 1 });

    expect(result).toEqual({
      checked: 1,
      flagged: 0,
      rejected: 0,
      published: [{ publicId: queued.publicId, title: queued.title }],
    });
    expect(harness.savedValues[0]).toMatchObject({
      publicationStatus: "published",
      accessStatus: "accessible",
      articleSummary: "A grounded summary of the source article.",
      processingAt: null,
      reviewReason: null,
    });
  });

  it("downgrades a claimed published result with missing dates to pending_review and clears the summary", async () => {
    const queued = article(3);
    const harness = makeDb([queued], [{ affectedRows: 1 }, { affectedRows: 1 }]);
    researchNewsArticle.mockResolvedValue(readyResult({
      fetchedAt: null,
      summarizedAt: null,
    }));

    const result = await processPendingNewsArticles(vi.fn(() => true), { limit: 1 });

    expect(result).toEqual({ checked: 1, flagged: 1, rejected: 0, published: [] });
    expect(harness.savedValues[0]).toMatchObject({
      publicationStatus: "pending_review",
      articleSummary: null,
      reviewReason: "summary_validation_failed",
      processingAt: null,
    });
  });

  it("converts an unexpected model failure into a safe review code without persisting raw error text or a snippet summary", async () => {
    const queued = article(4);
    const harness = makeDb([queued], [{ affectedRows: 1 }, { affectedRows: 1 }]);
    researchNewsArticle.mockRejectedValue(new Error("provider secret token; source snippet: private article text"));

    const result = await processPendingNewsArticles(vi.fn(() => true), { limit: 1 });

    expect(result).toEqual({ checked: 1, flagged: 1, rejected: 0, published: [] });
    expect(harness.savedValues[0]).toMatchObject({
      publicationStatus: "pending_review",
      accessStatus: "fetch_failed",
      accessError: "article_processing_failed",
      reviewReason: "article_processing_failed",
      articleSummary: null,
      processingAt: null,
    });
    expect(JSON.stringify(harness.savedValues[0])).not.toContain("provider secret token");
    expect(JSON.stringify(harness.savedValues[0])).not.toContain("private article text");
  });

  it("does not report publication when the final conditional save loses its lease", async () => {
    const queued = article(5);
    const harness = makeDb([queued], [{ affectedRows: 1 }, { affectedRows: 0 }]);
    researchNewsArticle.mockResolvedValue(readyResult());

    const result = await processPendingNewsArticles(vi.fn(() => true), { limit: 1 });

    expect(result).toEqual({ checked: 0, flagged: 0, rejected: 0, published: [] });
    expect(researchNewsArticle).toHaveBeenCalledTimes(1);
    expect(harness.savedValues).toHaveLength(1);
  });

  it("passes the relevance callback through and bounds active research by concurrency while honoring limit", async () => {
    const queued = [article(6), article(7), article(8), article(9)];
    const harness = makeDb(queued);
    const relevance = vi.fn(() => true);
    let active = 0;
    let maximumActive = 0;
    researchNewsArticle.mockImplementation(async () => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active--;
      return readyResult();
    });

    const result = await processPendingNewsArticles(relevance, { limit: 3, concurrency: 2 });

    expect(harness.selectedLimits).toEqual([3]);
    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(researchNewsArticle).toHaveBeenCalledTimes(3);
    expect(researchNewsArticle.mock.calls.every(call => call[1] === relevance)).toBe(true);
    expect(result.published).toHaveLength(3);
    expect(result.checked).toBe(3);
  });
});
