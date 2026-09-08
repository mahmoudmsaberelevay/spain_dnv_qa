import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LLM_MODEL, invokeLLM } from "./_core/llm";

const successResponse = () => new Response(JSON.stringify({
  id: "llm-test",
  created: 0,
  model: DEFAULT_LLM_MODEL,
  choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
}), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("invokeLLM model selection", () => {
  it("uses the current live-catalog default instead of the retired model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);

    await invokeLLM({ messages: [{ role: "user", content: "test" }] });
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(DEFAULT_LLM_MODEL).toBe("gemini-3-flash-preview");
    expect(payload.model).toBe(DEFAULT_LLM_MODEL);
    expect(payload.model).not.toBe("gemini-2.5-flash");
  });

  it("honours explicit model and max-token overrides", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);

    await invokeLLM({ model: "gpt-5-mini", maxTokens: 1200, messages: [{ role: "user", content: "test" }] });
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(payload.model).toBe("gpt-5-mini");
    expect(payload.max_tokens).toBe(1200);
  });
});
