# Project TODO

- [x] Document the connected-provider council workflow, role prompts, provider boundaries, and decision lifecycle.
- [x] Add a secure `OPENAI_API_KEY` configuration path for ChatGPT reviews without exposing credentials to the browser.
- [x] Add a secure `ANTHROPIC_API_KEY` configuration path for Claude reviews without exposing credentials to the browser.
- [x] Define and validate the permitted Manus integration mechanism for independent Manus research and execution reviews.
- [x] Add database schema and migration for council cases, role opinions, processing status, and immutable decision audit history.
- [x] Add server-side council procedures with authentication, authorization, provider isolation, and structured result validation.
- [x] Add council module permissions and an Administrative AI Council navigation entry in the existing ELEVAY dashboard.
- [x] Build responsive case intake, case list, opinion workspace, and chairperson decision views using existing ELEVAY components and visual language.
- [x] Implement the specialized ChatGPT, Claude, Manus, financial-advisor, opposition-advisor, and chairperson prompts with source attribution and error states.
- [x] Add case status transitions, retry handling, and clear separation between provider output and chairperson decision.
- [x] Write and run Vitest coverage for authorization, role orchestration, input validation, and decision persistence.
- [x] Verify desktop and mobile council views, review runtime logs, and save a published checkpoint.
- [x] Add authorization tests covering no-access, viewer-only, and full-access council users for read, start, and finalize actions.
- [x] Add orchestration and decision-persistence tests covering status transitions, Manus pending flows, decision creation, duplicate-decision prevention, and opinion-decision separation.
- [x] Add a service test for Manus needs-input synchronization and resulting opinion and case status updates.
- [x] Add a finalization test proving a separate decision record is created without overwriting any specialist opinion record.
