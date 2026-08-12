# Administrative AI Council — Integration Findings

## Provider interfaces reviewed

The official OpenAI response-creation reference confirms that the Responses API supports text inputs and structured JSON outputs, as well as optional tools. The connected-provider council should invoke this interface only from the ELEVAY server, never from the browser, so the provider credential remains protected.

The official Anthropic documentation identifies the Messages API as the supported Claude message-creation interface. The detailed documentation page did not fully render in the browsing session, so its exact request-header and response-shape requirements will be cross-checked from the official text reference before implementation.

The official Manus API v2 documentation confirms that a council research task runs asynchronously. The module must save the returned task identifier, receive completion through a verified webhook where configured, and preserve task-state updates. Manus webhook payloads require RSA-SHA256 signature verification over the timestamp, webhook URL, and raw-body hash; requests older than five minutes must be rejected.

## Implementation consequence

The initial connected-provider design will use server-only provider adapters, a persisted per-role run record, explicit `queued`/`running`/`completed`/`needs_input`/`failed` statuses, and independent outputs. The Chairperson must not begin synthesis until the required role outputs have completed or are explicitly marked unavailable.

## Current provider model selections

The OpenAI model catalog identifies `gpt-5.6-terra` as the model intended to balance intelligence and cost, so the strategy, financial, and chairperson roles will use it through the Responses API. The Anthropic model catalog identifies `claude-sonnet-5` as the balanced Claude option, so the critical-review and opposition roles will use it through the Messages API. Both selections are kept in one server-side adapter module for transparent replacement if a provider changes its catalog or the ELEVAY account does not expose the selected model.

### Official references

- OpenAI, [Models](https://developers.openai.com/api/docs/models).
- Anthropic, [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview).
