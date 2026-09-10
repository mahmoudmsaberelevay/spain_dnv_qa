import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  createLead: vi.fn(),
  findLeadContactMatch: vi.fn(),
  getDb: vi.fn(),
  notifyOwner: vi.fn(),
}));

vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("./_core/notification", () => ({ notifyOwner: mocks.notifyOwner }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./leadsDb", () => ({ createLead: mocks.createLead }));
vi.mock("./leadContactMatcher", () => ({ findLeadContactMatch: mocks.findLeadContactMatch }));

import * as laylaService from "./clientAppAiAdvisor";
import {
  chatWithLayla,
  extractLaylaQualification,
  laylaChatInputSchema,
  scoreLaylaLead,
} from "./clientAppAiAdvisor";
import { laylaConversations } from "../drizzle/schema";

type StoredRow = Record<string, unknown> & { sessionId: string; notified: boolean };

function makeDb(rows: StoredRow[] = []) {
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => rows.slice(0, 1)) })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: StoredRow) => { rows.push(value); }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((value: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          const target = rows[0];
          if (target) Object.assign(target, value);
        }),
      })),
    })),
  };
  return { db, rows };
}

function structuredReply(message = "Thank you. I can help you explore suitable preliminary pathways.") {
  return JSON.stringify({
    message,
    goal: null,
    budget: null,
    familySize: null,
    employmentStatus: null,
    destinationPreference: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    timezone: null,
  });
}

describe("ELEVAY Client app Layla advisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockResolvedValue(undefined);
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: structuredReply() } }] });
    mocks.findLeadContactMatch.mockResolvedValue({ status: "new", method: null, lead: null, candidateLeadIds: [] });
    mocks.createLead.mockResolvedValue(123);
    mocks.notifyOwner.mockResolvedValue(true);
  });

  it("extracts English goal, budget, family size, and voluntary contact details", () => {
    const data = extractLaylaQualification([
      { role: "user", content: "I want to relocate and live abroad." },
      { role: "user", content: "My budget is 150,000 – 500,000 euros. We are 4 people." },
      { role: "user", content: "My name is Mahmoud Saber and you can contact me at mahmoud@example.com or +20 100 000 0000." },
    ]);
    expect(data).toMatchObject({ goal: "relocate", budget: "150k_500k", familySize: 4, contactName: "Mahmoud Saber", contactEmail: "mahmoud@example.com", contactPhone: "+201000000000" });
    expect(scoreLaylaLead(data)).toBe("hot");
  });

  it("extracts Arabic qualification and Arabic-Indic numbers", () => {
    const data = extractLaylaQualification([
      { role: "user", content: "أريد الإقامة والعيش في الخارج" },
      { role: "user", content: "ميزانيتي أكثر من ٥٠٠ ألف ونحن ٤ أفراد" },
      { role: "user", content: "اسمي محمود صابر والبريد mahmoud@example.com ورقم +20 100 000 0000" },
    ]);
    expect(data).toMatchObject({ goal: "relocate", budget: "over_500k", familySize: 4, contactEmail: "mahmoud@example.com", contactPhone: "+201000000000" });
  });

  it("implements every lead-score threshold and high-budget bonus", () => {
    expect(scoreLaylaLead({})).toBe("cold");
    expect(scoreLaylaLead({ goal: "relocate" })).toBe("cold");
    expect(scoreLaylaLead({ goal: "relocate", budget: "under_20k" })).toBe("warm");
    expect(scoreLaylaLead({ goal: "relocate", budget: "under_20k", familySize: 3 })).toBe("warm");
    expect(scoreLaylaLead({ goal: "relocate", budget: "over_250k" })).toBe("warm");
    expect(scoreLaylaLead({ goal: "relocate", contactEmail: "a@example.com" })).toBe("warm");
    expect(scoreLaylaLead({ goal: "relocate", budget: "150k_500k", contactPhone: "+201000000000" })).toBe("hot");
  });

  it("uses GPT-5 mini, strict structured output, and creates a non-marketing CRM inquiry after contact is volunteered", async () => {
    const result = await chatWithLayla({
      locale: "en",
      message: "My email is client@example.com and we are 3 people.",
      history: [
        { role: "user", content: "I want to expand my business internationally." },
        { role: "assistant", content: "What broad budget range are you considering?" },
        { role: "user", content: "My budget is over €500,000." },
      ],
      ipAddress: "127.0.0.1",
      userAgent: "Vitest",
    });
    expect(mocks.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5-mini",
      outputSchema: expect.objectContaining({ name: "layla_chat_response", strict: true }),
      messages: expect.arrayContaining([expect.objectContaining({ role: "system", content: expect.stringContaining("Do not request passport numbers") })]),
    }));
    expect(mocks.createLead).toHaveBeenCalledWith(expect.objectContaining({ email: "client@example.com", leadSource: "ELEVAY Client App — Layla AI", marketingOptIn: false, gdprConsent: false, isMetaTestLead: false, stage: "fresh" }));
    expect(result).toMatchObject({ message: expect.any(String), leadCaptured: true, leadScore: "hot", qualificationData: expect.objectContaining({ contactEmail: "client@example.com" }) });
    expect(result.sessionId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("rejects empty, oversized, and over-bounded history before invoking the model", async () => {
    expect(() => laylaChatInputSchema.parse({ locale: "en", message: "Hello", history: Array.from({ length: 19 }, () => ({ role: "user", content: "message" })) })).toThrow();
    expect(() => laylaChatInputSchema.parse({ locale: "en", message: "x".repeat(2_001), history: [] })).toThrow();
    await expect(chatWithLayla({ locale: "en", message: "   ", history: [] })).rejects.toThrow();
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("matches the latest Arabic message language and never returns the server prompt", async () => {
    const result = await chatWithLayla({ locale: "en", message: "أريد الإقامة في أوروبا", history: [] });
    const call = mocks.invokeLLM.mock.calls[0]?.[0];
    expect(call.messages[0].content).toContain("Current interface locale: Arabic");
    expect(result.qualificationData.goal).toBe("relocate");
    expect(result.message).not.toContain("You are Layla");
    expect((laylaService as Record<string, unknown>).LAYLA_SYSTEM_PROMPT).toBeUndefined();
  });

  it("creates one opaque session and restores its server-side context when client history is absent", async () => {
    const state = makeDb();
    mocks.getDb.mockResolvedValue(state.db);
    const first = await chatWithLayla({ locale: "en", message: "I want to relocate.", history: [] });
    expect(state.rows).toHaveLength(1);
    expect(first.sessionId).toBe(state.rows[0].sessionId);
    await chatWithLayla({ sessionId: first.sessionId, locale: "en", message: "My budget is under €20,000.", history: [] });
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].sessionId).toBe(first.sessionId);
    expect(state.rows[0].budget).toBe("under_20k");
  });

  it("notifies once when hot or contact is captured and remains idempotent", async () => {
    const state = makeDb();
    mocks.getDb.mockResolvedValue(state.db);
    const first = await chatWithLayla({ locale: "en", message: "I want to relocate with budget over €250,000.", history: [] });
    await chatWithLayla({ sessionId: first.sessionId, locale: "en", message: "Please email me at hot@example.com.", history: [{ role: "user", content: "I want to relocate with budget over €250,000." }] });
    await chatWithLayla({ sessionId: first.sessionId, locale: "en", message: "Thanks.", history: [] });
    expect(mocks.notifyOwner).toHaveBeenCalledTimes(1);
    expect(state.rows[0].notified).toBe(true);
  });

  it("returns a localized safe fallback on LLM failure without creating notifications", async () => {
    mocks.invokeLLM.mockRejectedValue(new Error("secret upstream stack trace"));
    const result = await chatWithLayla({ locale: "ar", message: "مرحبا", history: [] });
    expect(result.message).toContain("مشكلة تقنية مؤقتة");
    expect(result.message).not.toContain("secret");
    expect(mocks.notifyOwner).not.toHaveBeenCalled();
  });

  it("persists the user turn and localized safe fallback when the model fails", async () => {
    const state = makeDb();
    mocks.getDb.mockResolvedValue(state.db);
    mocks.invokeLLM.mockRejectedValue(new Error("upstream failure"));
    const result = await chatWithLayla({ locale: "ar", message: "أريد الإقامة", history: [] });
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].messages).toContain("أريد الإقامة");
    expect(state.rows[0].messages).toContain(result.message);
  });

  it("returns the LLM result when persistence fails and does not leak database errors", async () => {
    mocks.getDb.mockRejectedValue(new Error("SQL password and secret table details"));
    const result = await chatWithLayla({ locale: "en", message: "I want to travel.", history: [] });
    expect(result.message).toBe("Thank you. I can help you explore suitable preliminary pathways.");
    expect(result.message).not.toContain("SQL");
  });

  it("exposes the durable schema fields needed by native Layla", () => {
    expect(laylaConversations.sessionId).toBeDefined();
    expect(laylaConversations.messages).toBeDefined();
    expect(laylaConversations.leadScore).toBeDefined();
    expect(laylaConversations.handedOff).toBeDefined();
    expect(laylaConversations.notified).toBeDefined();
    expect(laylaConversations.createdAt).toBeDefined();
    expect(laylaConversations.updatedAt).toBeDefined();
  });
});
