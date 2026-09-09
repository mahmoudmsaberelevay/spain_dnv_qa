import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  createLead: vi.fn(),
  findLeadContactMatch: vi.fn(),
}));

vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("./leadsDb", () => ({ createLead: mocks.createLead }));
vi.mock("./leadContactMatcher", () => ({ findLeadContactMatch: mocks.findLeadContactMatch }));

import {
  chatWithLayla,
  extractLaylaQualification,
  laylaChatInputSchema,
  scoreLaylaLead,
} from "./clientAppAiAdvisor";

describe("ELEVAY Client app Layla advisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: "Thank you. I can help you explore the most suitable preliminary pathways." } }] });
    mocks.findLeadContactMatch.mockResolvedValue({ status: "new", method: null, lead: null, candidateLeadIds: [] });
    mocks.createLead.mockResolvedValue(123);
  });

  it("extracts goal, budget, family size, and voluntary contact details", () => {
    const data = extractLaylaQualification([
      { role: "user", content: "I want to relocate and live abroad." },
      { role: "user", content: "My budget is 150,000 – 500,000 euros. We are 4 people." },
      { role: "user", content: "My name is Mahmoud Saber and you can contact me at mahmoud@example.com or +20 100 000 0000." },
    ]);
    expect(data).toMatchObject({
      goal: "relocate",
      budget: "150k_500k",
      familySize: 4,
      contactName: "Mahmoud Saber",
      contactEmail: "mahmoud@example.com",
      contactPhone: "+201000000000",
    });
    expect(scoreLaylaLead(data)).toBe("hot");
  });

  it("uses GPT-5 mini with bounded history and creates a non-marketing CRM inquiry after contact is volunteered", async () => {
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
      messages: expect.arrayContaining([expect.objectContaining({ role: "system", content: expect.stringContaining("Do not request passport numbers") })]),
    }));
    expect(mocks.createLead).toHaveBeenCalledWith(expect.objectContaining({
      email: "client@example.com",
      leadSource: "ELEVAY Client App — Layla AI",
      marketingOptIn: false,
      gdprConsent: false,
      isMetaTestLead: false,
      stage: "fresh",
    }));
    expect(result).toMatchObject({ message: expect.any(String), leadCaptured: true, leadScore: "hot" });
    expect(result.sessionId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("rejects oversized or malformed conversation input before invoking the model", async () => {
    expect(() => laylaChatInputSchema.parse({
      locale: "en",
      message: "Hello",
      history: Array.from({ length: 19 }, () => ({ role: "user", content: "message" })),
    })).toThrow();
    await expect(chatWithLayla({ locale: "en", message: "", history: [] })).rejects.toThrow();
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("instructs Layla to respond in Arabic for Arabic interface requests", async () => {
    const result = await chatWithLayla({ locale: "ar", message: "أريد الإقامة في أوروبا", history: [] });
    const call = mocks.invokeLLM.mock.calls[0]?.[0];
    expect(call.messages[0].content).toContain("Current interface locale: Arabic");
    expect(result.qualificationData.goal).toBe("relocate");
  });
});
