import {
  COUNCIL_ROLES,
  createCouncilDecision,
  createCouncilOpinion,
  getCouncilCaseWorkspace,
  getCouncilOpinionByExternalTaskId,
  getLatestCouncilOpinion,
  getNextCouncilOpinionAttempt,
  type CouncilRole,
  updateCouncilCase,
  updateCouncilOpinion,
} from "./aiCouncilDb";
import {
  chairDecisionJsonSchema,
  chairDecisionSchema,
  createManusCouncilTask,
  formatSpecialistOpinion,
  getManusTaskEvents,
  requestAnthropicJson,
  requestOpenAiJson,
  specialistOpinionJsonSchema,
  specialistOpinionSchema,
  type SpecialistOpinion,
} from "./aiCouncilProviders";

export const SPECIALIST_ROLES = ["strategy", "critical_review", "research_execution", "financial", "opposition"] as const;
export type SpecialistRole = (typeof SPECIALIST_ROLES)[number];

const ROLE_CONFIG: Record<SpecialistRole, { provider: "OpenAI" | "Anthropic" | "Manus"; system: string; brief: string }> = {
  strategy: {
    provider: "OpenAI",
    brief: "Develop the strategy and integrated solution.",
    system: "You are the ELEVAY Administrative AI Council Strategy Advisor. Produce a practical strategic analysis. Identify options, assumptions, sequencing, success measures, and implementation priorities. Do not claim guarantees. Treat all case information as unverified unless the case itself supplies evidence.",
  },
  critical_review: {
    provider: "Anthropic",
    brief: "Challenge logic and identify contract, operational, regulatory, and commercial risk.",
    system: "You are the ELEVAY Administrative AI Council Critical Review Advisor. Examine the proposal skeptically for flawed logic, missing evidence, contractual exposure, regulatory uncertainty, execution risks, and mitigations. Do not provide legal conclusions or guarantees. State assumptions explicitly.",
  },
  research_execution: {
    provider: "Manus",
    brief: "Research the issue and propose an evidence-led execution plan and file deliverables.",
    system: "You are the ELEVAY Administrative AI Council Research and Execution Advisor. Research the council issue using credible sources where appropriate and return an evidence-led execution plan. You may prepare recommendations for reports or files, but you must not contact people, submit forms, make purchases, deploy systems, change external data, or take any irreversible action. Clearly label evidence gaps and source links.",
  },
  financial: {
    provider: "OpenAI",
    brief: "Evaluate costs, benefits, scenarios, and financial downside.",
    system: "You are the ELEVAY Administrative AI Council Financial Advisor. Assess cost, benefit, scenarios, break-even observations, and financial downside using only supplied assumptions. Never invent numbers; when inputs are missing, list the information required. This is decision support, not investment, accounting, tax, or legal advice.",
  },
  opposition: {
    provider: "Anthropic",
    brief: "Build the strongest evidence-led argument against proceeding.",
    system: "You are the ELEVAY Administrative AI Council Opposition Advisor. Attempt to show why the proposal could fail. Identify disconfirming evidence, failure modes, stop criteria, and safeguards. Be rigorous but fair; do not fabricate facts or make legal guarantees.",
  },
};

function buildSpecialistPrompt(councilCase: { title: string; brief: string; language: string; financialAssumptions: string | null }, config: { brief: string }) {
  return [
    `Council role: ${config.brief}`,
    `Working language: ${councilCase.language === "both" ? "Arabic and English" : councilCase.language === "ar" ? "Arabic" : "English"}.`,
    `Decision title: ${councilCase.title}`,
    "Case brief:", councilCase.brief,
    "Financial assumptions:", councilCase.financialAssumptions || "No financial assumptions were supplied.",
    "Return the requested structured opinion. Sources must be genuine links when you relied on external research; otherwise return an empty sources list.",
  ].join("\n\n");
}

function safeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "Provider request failed";
  if (message.includes("status 401") || message.includes("status 403")) return "provider_authorization";
  if (message.includes("status 429")) return "provider_rate_limit";
  if (message.includes("Zod")) return "invalid_provider_output";
  return "provider_request_failed";
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "The provider review could not be completed.";
  return message.length > 300 ? "The provider review could not be completed." : message;
}

async function recordCompletedOpinion(opinionId: number, opinion: SpecialistOpinion) {
  return updateCouncilOpinion(opinionId, {
    status: "completed",
    content: formatSpecialistOpinion(opinion),
    structuredContent: opinion,
    sourceLinks: opinion.sources,
    completedAt: new Date(),
  });
}

export async function recomputeCouncilCaseStatus(councilCaseId: number) {
  const workspace = await getCouncilCaseWorkspace(councilCaseId);
  if (!workspace || workspace.councilCase.status === "finalized") return workspace;
  const latest = new Map<CouncilRole, any>();
  for (const role of COUNCIL_ROLES) {
    const opinion = await getLatestCouncilOpinion(councilCaseId, role);
    if (opinion) latest.set(role, opinion);
  }
  const specialistOpinions = SPECIALIST_ROLES.map((role) => latest.get(role));
  const hasRunningManus = latest.get("research_execution")?.status === "running" || latest.get("research_execution")?.status === "queued";
  const allDecisionReady = specialistOpinions.every((opinion) => opinion && ["completed", "unavailable"].includes(opinion.status));
  const hasFailure = specialistOpinions.some((opinion) => opinion?.status === "failed" || opinion?.status === "needs_input");
  const status = allDecisionReady ? "ready_for_decision" : hasRunningManus ? "awaiting_manus" : hasFailure ? "failed" : "running";
  await updateCouncilCase(councilCaseId, { status });
  return getCouncilCaseWorkspace(councilCaseId);
}

export async function runCouncilSpecialistReview(councilCaseId: number, role: SpecialistRole) {
  const workspace = await getCouncilCaseWorkspace(councilCaseId);
  if (!workspace) throw new Error("Council case not found.");
  if (workspace.councilCase.status === "finalized") throw new Error("Finalized council cases cannot be rerun.");
  const config = ROLE_CONFIG[role];
  const previous = await getLatestCouncilOpinion(councilCaseId, role);
  if (role === "research_execution" && previous && ["queued", "running", "needs_input"].includes(previous.status)) return previous;
  const attempt = await getNextCouncilOpinionAttempt(councilCaseId, role);
  const opinion = await createCouncilOpinion({
    councilCaseId,
    role,
    provider: config.provider,
    status: "running",
    attempt,
    startedAt: new Date(),
  });
  if (!opinion) throw new Error("Could not initialize the council opinion.");
  const prompt = buildSpecialistPrompt(workspace.councilCase, config);
  try {
    if (role === "research_execution") {
      const task = await createManusCouncilTask(`${config.system}\n\n${prompt}`);
      return updateCouncilOpinion(opinion.id, { status: "running", externalTaskId: task.taskId, externalTaskUrl: task.taskUrl });
    }
    const result = config.provider === "OpenAI"
      ? await requestOpenAiJson({ system: config.system, prompt, schemaName: `council_${role}`, schema: specialistOpinionJsonSchema, validator: specialistOpinionSchema })
      : await requestAnthropicJson({ system: config.system, prompt: `${prompt}\n\nJSON schema:\n${JSON.stringify(specialistOpinionJsonSchema)}`, validator: specialistOpinionSchema });
    return recordCompletedOpinion(opinion.id, result);
  } catch (error) {
    return updateCouncilOpinion(opinion.id, { status: "failed", errorCode: safeErrorCode(error), errorMessage: safeErrorMessage(error), completedAt: new Date() });
  }
}

export async function startCouncilReviews(councilCaseId: number) {
  const workspace = await getCouncilCaseWorkspace(councilCaseId);
  if (!workspace) throw new Error("Council case not found.");
  if (workspace.councilCase.status === "finalized") throw new Error("Finalized council cases cannot be rerun.");
  await updateCouncilCase(councilCaseId, { status: "running", startedAt: workspace.councilCase.startedAt ?? new Date() });
  await Promise.allSettled(SPECIALIST_ROLES.map((role) => runCouncilSpecialistReview(councilCaseId, role)));
  return recomputeCouncilCaseStatus(councilCaseId);
}

export async function syncManusCouncilOpinion(councilCaseId: number) {
  const opinion = await getLatestCouncilOpinion(councilCaseId, "research_execution");
  if (!opinion?.externalTaskId) throw new Error("No active Manus council task was found.");
  const events = await getManusTaskEvents(opinion.externalTaskId);
  const structuredEvent = events.find((event: any) => event?.type === "structured_output_result")?.structured_output_result;
  const statusUpdate = [...events].reverse().find((event: any) => event?.type === "status_update")?.status_update;
  const assistantMessage = [...events].reverse().find((event: any) => event?.type === "assistant_message");
  if (structuredEvent?.success) {
    const parsed = specialistOpinionSchema.parse(structuredEvent.value);
    await recordCompletedOpinion(opinion.id, parsed);
  } else if (statusUpdate?.agent_status === "waiting") {
    await updateCouncilOpinion(opinion.id, { status: "needs_input", content: assistantMessage?.assistant_message?.content ?? opinion.content, errorCode: "manus_needs_input", errorMessage: "Manus requires a user response or confirmation before continuing." });
  } else if (statusUpdate?.agent_status === "error") {
    await updateCouncilOpinion(opinion.id, { status: "failed", errorCode: "manus_task_failed", errorMessage: "The Manus research task reported an error.", completedAt: new Date() });
  } else if (statusUpdate?.agent_status === "stopped" && structuredEvent?.success === false) {
    await updateCouncilOpinion(opinion.id, { status: "failed", errorCode: "manus_output_invalid", errorMessage: "Manus completed but did not return a usable structured council opinion.", completedAt: new Date() });
  } else {
    await updateCouncilOpinion(opinion.id, { status: "running" });
  }
  return recomputeCouncilCaseStatus(councilCaseId);
}

export async function applyManusCouncilWebhook(payload: any) {
  if (payload?.event_type !== "task_stopped") return;
  const task = payload.task_detail;
  if (!task?.task_id) return;
  const opinion = await getCouncilOpinionByExternalTaskId(task.task_id);
  if (!opinion) return;
  const structured = task.structured_output;
  if (task.stop_reason === "ask") {
    await updateCouncilOpinion(opinion.id, { status: "needs_input", content: task.message ?? null, errorCode: "manus_needs_input", errorMessage: "Manus requires a user response or confirmation before continuing." });
  } else if (structured?.success) {
    const parsed = specialistOpinionSchema.parse(structured.value);
    await recordCompletedOpinion(opinion.id, parsed);
  } else {
    await updateCouncilOpinion(opinion.id, { status: "failed", content: task.message ?? null, errorCode: "manus_output_invalid", errorMessage: structured?.error || "Manus did not return a usable structured council opinion.", completedAt: new Date() });
  }
  await recomputeCouncilCaseStatus(opinion.councilCaseId);
}

export async function finalizeCouncilDecision(councilCaseId: number, userId: number) {
  const workspace = await getCouncilCaseWorkspace(councilCaseId);
  if (!workspace) throw new Error("Council case not found.");
  if (workspace.decision) throw new Error("A final council decision already exists for this case.");
  const opinions = SPECIALIST_ROLES.map((role) => workspace.opinions.find((opinion) => opinion.role === role && opinion.status === "completed"));
  if (opinions.some((opinion) => !opinion)) throw new Error("All required specialist opinions must be completed before the Chairperson decision can be issued.");
  const evidence = opinions.map((opinion) => ({ role: opinion!.role, provider: opinion!.provider, opinion: opinion!.structuredContent ?? opinion!.content }));
  const system = "You are the ELEVAY Administrative AI Council Chairperson. Compare the supplied specialist opinions and issue a governance decision. Do not invent evidence. Explicitly acknowledge meaningful conflicts and conditions. Do not provide legal, tax, financial, or immigration guarantees. Return only the required structured JSON decision.";
  const prompt = [
    `Decision title: ${workspace.councilCase.title}`,
    `Case brief: ${workspace.councilCase.brief}`,
    `Financial assumptions: ${workspace.councilCase.financialAssumptions || "None supplied"}`,
    "Specialist opinions:", JSON.stringify(evidence),
  ].join("\n\n");
  const chair = await createCouncilOpinion({ councilCaseId, role: "chairperson", provider: "OpenAI", status: "running", attempt: await getNextCouncilOpinionAttempt(councilCaseId, "chairperson"), startedAt: new Date() });
  if (!chair) throw new Error("Could not initialize the Chairperson opinion.");
  try {
    const result = await requestOpenAiJson({ system, prompt, schemaName: "council_chair_decision", schema: chairDecisionJsonSchema, validator: chairDecisionSchema });
    const completedChair = await updateCouncilOpinion(chair.id, { status: "completed", content: `${result.summary}\n\n${result.rationale}`, structuredContent: result, completedAt: new Date() });
    const decision = await createCouncilDecision({
      councilCaseId,
      chairOpinionId: completedChair?.id ?? chair.id,
      decision: result.decision,
      confidence: result.confidence,
      summary: result.summary,
      rationale: result.rationale,
      conditions: result.conditions,
      nextSteps: result.nextSteps,
      unresolvedConflicts: result.unresolvedConflicts,
      finalizedByUserId: userId,
    });
    await updateCouncilCase(councilCaseId, { status: "finalized" });
    return decision;
  } catch (error) {
    await updateCouncilOpinion(chair.id, { status: "failed", errorCode: safeErrorCode(error), errorMessage: safeErrorMessage(error), completedAt: new Date() });
    throw error;
  }
}
