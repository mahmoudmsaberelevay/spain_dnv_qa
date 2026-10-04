import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ENV } from "./_core/env";

export const specialistOpinionSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(12_000),
  recommendation: z.string().trim().min(1).max(12_000),
  keyFindings: z.array(z.string().trim().min(1).max(2_000)).max(12),
  risks: z.array(z.string().trim().min(1).max(2_000)).max(12),
  actions: z.array(z.string().trim().min(1).max(2_000)).max(12),
  sources: z.array(z.object({ title: z.string().trim().min(1).max(500), url: z.string().trim().max(2_000) })).max(12),
});
export type SpecialistOpinion = z.infer<typeof specialistOpinionSchema>;

export const chairDecisionSchema = z.object({
  decision: z.enum(["proceed", "proceed_with_conditions", "defer", "do_not_proceed"]),
  confidence: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(12_000),
  rationale: z.string().trim().min(1).max(18_000),
  conditions: z.array(z.string().trim().min(1).max(2_000)).max(12),
  nextSteps: z.array(z.string().trim().min(1).max(2_000)).max(12),
  unresolvedConflicts: z.string().trim().max(12_000),
});
export type ChairDecision = z.infer<typeof chairDecisionSchema>;

export const specialistOpinionJsonSchema = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
    recommendation: { type: "string" },
    keyFindings: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: { type: "string" } },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, url: { type: "string" } },
        required: ["title", "url"],
        additionalProperties: false,
      },
    },
  },
  required: ["executiveSummary", "recommendation", "keyFindings", "risks", "actions", "sources"],
  additionalProperties: false,
} as const;

export const chairDecisionJsonSchema = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["proceed", "proceed_with_conditions", "defer", "do_not_proceed"] },
    confidence: { type: "integer" },
    summary: { type: "string" },
    rationale: { type: "string" },
    conditions: { type: "array", items: { type: "string" } },
    nextSteps: { type: "array", items: { type: "string" } },
    unresolvedConflicts: { type: "string" },
  },
  required: ["decision", "confidence", "summary", "rationale", "conditions", "nextSteps", "unresolvedConflicts"],
  additionalProperties: false,
} as const;

function requireProviderKey(value: string, provider: string) {
  if (!value) throw new Error(`${provider} is not configured for the Administrative AI Council.`);
  return value;
}

function safeProviderError(provider: string, response: Response) {
  return new Error(`${provider} request failed with status ${response.status}.`);
}

function providerNetworkError(provider: string, error: unknown) {
  const code = error instanceof Error && error.cause && typeof error.cause === "object" && "code" in error.cause
    ? String((error.cause as { code?: unknown }).code).slice(0, 40) : "network_unavailable";
  return new Error(`${provider} network request failed (${code}). No response body or credential is recorded.`);
}

export async function fetchCouncilWithNetworkRetries(provider: string, request: () => Promise<Response>): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await request(); }
    catch (error) {
      const cause = error instanceof Error && error.cause && typeof error.cause === "object" && "code" in error.cause
        ? String((error.cause as { code?: unknown }).code) : "";
      if (attempt === 2 || !["UND_ERR_SOCKET", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH"].includes(cause))
        throw providerNetworkError(provider, error);
      await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 600 : 1600));
    }
  }
  throw new Error(`${provider} network retries exhausted.`);
}

function anthropicResponseShape(body: { stop_reason?: unknown; content?: Array<{ type?: unknown }> }) {
  const stopReason = typeof body.stop_reason === "string" ? body.stop_reason.slice(0, 80) : "unknown";
  const contentTypes = Array.isArray(body.content)
    ? body.content.map(part => typeof part?.type === "string" ? part.type.slice(0, 40) : "unknown").join(",") || "none"
    : "none";
  return `stop_reason=${stopReason}; content_types=${contentTypes}`;
}

export function readJsonPayload(value: string | unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

export function formatSpecialistOpinion(opinion: SpecialistOpinion) {
  const list = (items: string[]) => items.length ? items.map((item) => `• ${item}`).join("\n") : "• None stated";
  return [
    opinion.executiveSummary,
    "Recommendation", opinion.recommendation,
    "Key findings", list(opinion.keyFindings),
    "Risks", list(opinion.risks),
    "Actions", list(opinion.actions),
  ].join("\n\n");
}

export async function requestOpenAiJson<T extends z.ZodTypeAny>(params: {
  system: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  validator: T;
}): Promise<z.infer<T>> {
  const response = await fetchCouncilWithNetworkRetries("OpenAI", () => fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(180_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireProviderKey(ENV.openAiApiKey, "OpenAI")}` },
    body: JSON.stringify({
      model: "gpt-5.6-terra",
      input: [
        { role: "developer", content: params.system },
        { role: "user", content: params.prompt },
      ],
      text: { format: { type: "json_schema", name: params.schemaName, strict: true, schema: params.schema } },
    }),
  }));
  if (!response.ok) throw safeProviderError("OpenAI", response);
  const body = await response.json() as Record<string, unknown>;
  const outputText = typeof body.output_text === "string"
    ? body.output_text
    : Array.isArray(body.output)
      ? body.output.flatMap((item: any) => item?.content ?? []).find((part: any) => part?.type === "output_text")?.text
      : undefined;
  if (typeof outputText !== "string") throw new Error("OpenAI returned no usable council output.");
  return params.validator.parse(readJsonPayload(outputText));
}

export async function requestAnthropicJson<T extends z.ZodTypeAny>(params: {
  system: string;
  prompt: string;
  schema?: Record<string, unknown>;
  validator: T;
}): Promise<z.infer<T>> {
  const client = new Anthropic({ apiKey: requireProviderKey(ENV.anthropicApiKey, "Anthropic"), timeout: 180_000, maxRetries: 1 });
  let body: { stop_reason?: string | null; content?: Array<{ type: string; text?: string }> };
  try {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4_096,
      system: `${params.system}\n\nReturn concise findings: summaries and recommendations under 700 characters; each list item under 280 characters; maximum five list items and four sources. Return only one valid JSON object. Do not wrap the JSON in Markdown or commentary.`,
      messages: [{ role: "user", content: params.prompt }],
      output_config: {
        format: {
          type: "json_schema",
          schema: params.schema ?? specialistOpinionJsonSchema,
        },
      },
    });
    body = await stream.finalMessage();
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) : NaN;
    if (Number.isFinite(status)) throw new Error(`Anthropic request failed with status ${status}.`);
    throw providerNetworkError("Anthropic", error);
  }
  const outputText = body.content?.find((part) => part.type === "text")?.text;
  if (!outputText) throw new Error(`Anthropic returned no usable council output (${anthropicResponseShape(body)}).`);
  return params.validator.parse(readJsonPayload(outputText));
}

export async function createManusCouncilTask(prompt: string) {
  const response = await fetch("https://api.manus.ai/v2/task.create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-manus-api-key": requireProviderKey(ENV.manusApiKey, "Manus"),
    },
    body: JSON.stringify({
      message: { content: prompt },
      agent_profile: "standard",
      structured_output_schema: specialistOpinionJsonSchema,
    }),
  });
  if (!response.ok) throw safeProviderError("Manus", response);
  const body = await response.json() as any;
  const detail = body.task_detail ?? body.task ?? body.data ?? body;
  const taskId = detail.task_id ?? detail.id;
  if (typeof taskId !== "string" || !taskId) throw new Error("Manus did not return a task identifier.");
  return { taskId, taskUrl: typeof detail.task_url === "string" ? detail.task_url : null };
}

export async function getManusTaskEvents(taskId: string) {
  const response = await fetch(`https://api.manus.ai/v2/task.listMessages?task_id=${encodeURIComponent(taskId)}&order=asc&limit=100`, {
    headers: { "x-manus-api-key": requireProviderKey(ENV.manusApiKey, "Manus") },
  });
  if (!response.ok) throw safeProviderError("Manus", response);
  const body = await response.json() as any;
  return Array.isArray(body.messages) ? body.messages : Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [];
}
