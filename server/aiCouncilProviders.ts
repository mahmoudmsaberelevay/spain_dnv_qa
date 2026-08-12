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
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requireProviderKey(ENV.openAiApiKey, "OpenAI")}` },
    body: JSON.stringify({
      model: "gpt-5.6-terra",
      input: [
        { role: "developer", content: params.system },
        { role: "user", content: params.prompt },
      ],
      text: { format: { type: "json_schema", name: params.schemaName, strict: true, schema: params.schema } },
    }),
  });
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
  validator: T;
}): Promise<z.infer<T>> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": requireProviderKey(ENV.anthropicApiKey, "Anthropic"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 2_800,
      system: `${params.system}\n\nReturn only one valid JSON object. Do not wrap the JSON in Markdown or commentary.`,
      messages: [{ role: "user", content: params.prompt }],
    }),
  });
  if (!response.ok) throw safeProviderError("Anthropic", response);
  const body = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const outputText = body.content?.find((part) => part.type === "text")?.text;
  if (!outputText) throw new Error("Anthropic returned no usable council output.");
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
