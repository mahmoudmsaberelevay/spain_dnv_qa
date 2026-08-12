# Administrative AI Council — Product Design

The Administrative AI Council is an internal ELEVAY decision workspace. Each council case contains a business question, context, optional financial assumptions, and an operating language. It produces clearly separated specialist opinions before a Chairperson records a final decision. Provider outputs remain attributable to their originating service and are never represented as human or external-client advice.

## Role model

| Council role | Provider | Mandate | Required output |
|---|---|---|---|
| ChatGPT — Strategy | OpenAI Responses API | Develop the strategic framing, options, execution path, and success measures. | Recommendation, assumptions, options, execution plan, open questions. |
| Claude — Critical Review | Anthropic Messages API | Challenge logic, identify contractual, operational, regulatory, and commercial risks. | Risk register, weak assumptions, constraints, mitigation actions. |
| Manus — Research & Execution | Manus API v2 Task API | Research relevant facts and produce actionable implementation or file-delivery recommendations. | Evidence-led findings, source links, execution steps, deliverables, blockers. |
| Financial Advisor | OpenAI Responses API | Evaluate the financial lens using only supplied assumptions and explicitly label unknown inputs. | Costs, benefits, scenarios, break-even observations, financial risks. |
| Opposition Advisor | Anthropic Messages API | Construct the strongest evidence-based case that the proposal should not proceed. | Failure thesis, disconfirming evidence needed, stop criteria, safeguards. |
| Chairperson | OpenAI Responses API | Compare the completed opinions without inventing missing evidence and record the final governance decision. | Decision, confidence, rationale, conditions, accountable next steps. |

The Financial Advisor and Opposition Advisor use distinct prompts and must be labelled as separate role perspectives even though they reuse the connected OpenAI and Anthropic providers. The interface will disclose the provider assigned to every opinion and will not imply that the six roles are six independently owned external services.

## Decision lifecycle

| Status | Meaning | Permitted transition |
|---|---|---|
| Draft | Case is being prepared. | Start council review or edit case. |
| Running | Required specialist reviews have been requested. | Completed, Needs input, or Failed. |
| Awaiting Manus | ChatGPT and Claude perspectives are saved while the Manus task is still active. | Running, Needs input, or Failed. |
| Ready for decision | All required opinions are complete or explicitly unavailable with a recorded reason. | Finalized or Reopened. |
| Finalized | Chairperson decision has been recorded and is preserved in the audit trail. | Reopened only through an explicit new review. |
| Failed | One or more critical reviews could not be obtained. | Retry only the failed role or edit and restart. |

## Data and access model

`aiCouncilCases` will retain the case brief, language, financial assumptions, status, initiator, and timestamps. `aiCouncilOpinions` will retain a single immutable output per role and attempt, including provider identity, external task identifier where relevant, normalized status, raw structured content, user-visible summary, error category, and completion timestamp. `aiCouncilDecisions` will preserve the Chairperson’s decision separately from opinions so an approved decision cannot be overwritten by a later provider retry. Lifecycle events will also be written to the existing ELEVAY audit log.

The council will be a dedicated permission module named `aiCouncil`, defaulting to no access for non-owner users. Users with `viewer` access can read completed cases; users with `full` access can draft, run, and finalize cases. Provider credentials exist only on the server. The browser receives normalized content, role status, and safe error messages—never request headers, credentials, raw provider debugging payloads, or webhook verification data.

## Provider execution model

ChatGPT and Claude review requests run server-side and return structured opinion data. Manus work begins as an asynchronous API v2 task, whose external task ID is saved against the Manus opinion. The application includes a verified webhook endpoint for immediate status updates and a manual refresh action as an operational fallback. A Manus task requesting an action or clarification is surfaced as `Needs input`; it is never auto-confirmed by the council.

The Chairperson runs only after the required opinions are complete or marked unavailable. It receives the original case and the role outputs as evidence, not as unrestricted instructions. Its decision prompt requires it to name unresolved conflicts, state a confidence level, avoid creating legal or financial guarantees, and list conditions that must be met before action.
