# Checkpoint 8 Final Product Orchestration Plan

Date: 2026-06-29

Status: Planning complete. Do not launch worker lanes until the user explicitly
approves execution.

## Objective

Checkpoint 8 is the last product checkpoint. Its job is to turn the already
live Aurora-backed cockpit into a first-place-contender submission:

```text
upload real sample finance data
  -> store provenance in S3 and Aurora
  -> process events into normalized cash state
  -> recompute forecast and agent plan
  -> generate Fireworks-backed outreach
  -> require human approval
  -> execute exactly one safe provider action when explicitly enabled
  -> persist provider/audit/memory evidence
  -> present a polished story judges can follow in under 3 minutes
```

This checkpoint should not add random integrations. It should make one complete
loop undeniable.

## Hackathon Alignment

The official H0 Devpost page rewards:

- **Technological Implementation**: real software craftsmanship, deliberate AWS
  Database data model and architecture, Vercel beyond basics.
- **Design**: cohesive front-end/back-end product thinking.
- **Impact & Real-world Applicability**: a meaningful problem for a real
  audience and scalable infrastructure that makes it shippable.
- **Originality**: a genuine insight about what the stack enables.

The page also requires:

- full-stack application
- one designated AWS Database: Aurora PostgreSQL, Aurora DSQL, or DynamoDB
- frontend deployed on Vercel or v0.app
- text description naming the AWS Database
- less than 3-minute demo video
- explanation of AWS Database usage
- published Vercel project link and Vercel Team ID
- architecture diagram
- screenshot proving AWS Database usage
- public content piece about the build, with H0 entry language and hashtag

Source: https://h01.devpost.com/

## Research Notes

- Aurora Data API is appropriate for the Vercel runtime because AWS documents it
  as a secure HTTP endpoint for running SQL against Aurora without managing
  persistent database connections. It uses credentials stored in Secrets Manager.
  Source: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html
- Fireworks exposes OpenAI-compatible chat completions and JavaScript usage,
  which fits the existing provider adapter and lets us keep model selection
  env-driven. Source: https://docs.fireworks.ai/guides/querying-text-models
- LangSmith tracing can be enabled with `LANGSMITH_TRACING=true`,
  `LANGSMITH_API_KEY`, and `LANGSMITH_PROJECT`, with serverless guidance to
  finish traces before the function ends. Source:
  https://docs.langchain.com/langsmith/trace-with-langchain
- Twilio's Call resource supports outbound calls via `POST /Calls`, TwiML, call
  status callbacks, and real provider SIDs. This is the safest high-drama live
  execution path because the repo already has Twilio runtime, TwiML, webhook,
  approval, and test-target guardrails. Source:
  https://www.twilio.com/docs/voice/api/call-resource

## Critical Product Decision

Prioritize **one complete live loop** over breadth.

Recommended live execution path:

- Primary: Twilio call-to-self after approval and explicit test number.
- Secondary: Gmail remains available/gated but should not be made the core demo
  dependency unless OAuth is already stable.
- Do not add Resend, SES, or another email provider unless Gmail blocks the demo
  and Twilio cannot be used. Extra providers dilute the story and add setup
  risk.

Recommended data loop:

- Use a visible upload/import workflow that writes files to S3 and normalized
  state/events to Aurora.
- Include a "sample pack" affordance for judges so the flow is reproducible, but
  route it through the same ingestion/event/forecast machinery. It must not be a
  separate client-side demo script.

Recommended agent loop:

- Use deterministic math for cash, runway, and forecast values.
- Use Fireworks for structured recommendation explanation, draft generation,
  call script generation, reply/outcome classification, and memory extraction.
- Use LangGraph/agent checkpoint persistence as the durable orchestration story.
- Surface LangSmith trace readiness/link where available, without requiring a
  judge to leave the product to understand it.

## Scope

### 1. Live Intake And Demo Reset

Build or polish a user-facing intake flow:

- "Upload finance pack" screen or modal from the Overview top bar.
- Accept invoices/customers/obligations/payment CSVs and supported manual rows.
- Show file provenance: stored in S3, normalized in Aurora, event inbox processed.
- Provide a deterministic "reset demo case" script for recording and judging.
- Provide a "load sample pack" action only if it uses real server routes and
  Aurora writes, not client-only state.

Acceptance:

- A judge can start from a clean case and create/refresh the visible cash-risk
  state through a live route.
- Agent Activity shows the import, normalization, forecast, recommendation, and
  audit events.
- `npm run db:seed` still resets the canonical demo state.

### 2. Event-Driven Cash Risk Story

Make the demo show adaptation, not just a static dashboard:

- Event A: customer promise or reply lands.
- Event B: bank/payment event lands.
- Event C: forecast/action plan changes.

Each event should write to Aurora and then update the product screens.

Acceptance:

- Overview changes visibly after the event.
- Forecast low point/runway changes from deterministic data.
- Recommended action queue updates.
- Agent Activity shows which graph/checkpoints ran and why.

### 3. Fireworks Agentic Reasoning Upgrade

Make Fireworks output feel load-bearing but bounded:

- structured action recommendation summary
- structured email draft or call script
- structured "why this action" explanation
- structured reply/outcome classification
- structured memory fact extraction

Acceptance:

- Provider-unavailable state remains honest.
- Successful live generation shows `source: "fireworks"` or equivalent provider
  evidence.
- Raw prompts, secrets, tokens, and hidden env values are not exposed.
- Deterministic finance math never depends on LLM output.

### 4. Approval-Gated Execution

Make the final action loop concrete:

- Approve/edit/reject remains fully interactive.
- Add or expose a separate "execute approved test call" path for phone actions.
- Require:
  - approved action
  - explicit `live=true`
  - configured Twilio env
  - `TWILIO_TEST_TO_NUMBER`
  - destination exactly matching the test number
- Persist real Twilio SID/status only when Twilio returns one.
- Never show fake provider IDs.

Acceptance:

- One approved call-to-self can be placed in local/production live smoke when the
  user intentionally enables it.
- Call/webhook status writes to `provider_executions` and `voice_calls`.
- If the live call is skipped, the UI clearly shows "ready/gated", not "sent".

### 5. Outcome Learning

Make the product "learns from outcomes" claim demonstrable:

- Allow a call/email/manual outcome to be recorded.
- Fireworks extracts memory facts from the outcome/transcript where configured.
- Store learned facts in Aurora `memory_chunks`.
- Show learned facts on Customer and Agent Activity screens.

Acceptance:

- Customer profile updates with a new learned behavior fact.
- Future recommendation copy can reference the new fact.
- Agent Activity shows outcome capture and memory write.

### 6. Product UI Polish

Tighten the judge-facing screens around one story:

- Overview: clear current risk, immediate action, and post-event change.
- Forecasts: scenario chart plus "what changed after upload/event".
- Actions: approval/execution controls with plain guardrails.
- Customers: memory/evidence/outcome learning.
- Agent Activity: beautiful timeline, not raw logs.
- Settings: live systems readiness and submission-safe architecture proof.

Acceptance:

- No checkpoint/debug/env jargon in primary user surfaces.
- No stale 2025 dates unless tied to source evidence.
- No inert buttons.
- Desktop and mobile screenshots are clean.

### 7. Submission Proof Assets

Create and verify:

- architecture diagram
- AWS Aurora proof screenshot checklist
- Vercel project link and Team ID reference
- Devpost field draft
- public content draft for blog/LinkedIn/dev.to/YouTube
- under-3-minute demo script
- final browser QA checklist

Acceptance:

- The repo contains copy/paste-ready submission docs.
- The final demo path can be rehearsed reliably from a clean seed.

## Proposed Worker Lanes

Use exactly three isolated worktree lanes if execution is approved:

### Lane 1: Live Intake, Event Loop, And Agent Graph

Ownership:

- upload/sample-pack/reset flow
- event inbox processor improvements
- event-driven forecast/action refresh
- Fireworks structured recommendation/outcome extraction
- LangGraph/checkpoint evidence

Acceptance commands:

```bash
npm run typecheck
npm run check:cp2
npm run check:cp3
npm run smoke:product:no-key
```

### Lane 2: Execution, Memory, And Product UI Polish

Ownership:

- Twilio approved test-call execution path and UI affordance
- provider readiness and execution history polish
- outcome capture to memory
- Overview/Actions/Customers/Forecasts/Agent Activity story polish
- mobile/desktop layout fixes

Acceptance commands:

```bash
npm run typecheck
npm run check:cp5
CP6_REQUIRE_PRODUCT_ROUTES=true npm run check:cp6
CP7_REQUIRE_LIVE_WORKFLOW=true npm run check:cp7
npm run smoke:voice:no-key
```

### Lane 3: QA, Submission Package, And Demo Evidence

Ownership:

- `check:cp8` contract script
- final runbook
- demo reset/rehearsal checklist
- architecture diagram
- Devpost copy package
- public content draft
- browser QA evidence template

Acceptance commands:

```bash
npm run typecheck
npm run build
npm run check:cp8
git diff --check
```

## Master Integration Duties

The master session must:

- launch only these task lanes after explicit approval
- create no orchestrator/monitor/review sessions
- poll workers manually from this master thread
- review each lane diff before merge
- resolve integration conflicts in master
- run the full acceptance suite
- run local browser QA
- deploy to Vercel production
- run production browser QA
- archive worker lanes after merge and verification

## Final Acceptance Suite

Minimum commands:

```bash
npm run typecheck
npm run build
npm run check:cp2
npm run check:cp3
npm run check:cp4
npm run check:cp5
CP6_REQUIRE_PRODUCT_ROUTES=true npm run check:cp6
CP7_REQUIRE_LIVE_WORKFLOW=true npm run check:cp7
npm run check:cp8
npm run smoke:product:no-key
npm run smoke:voice:no-key
npm run db:seed
git diff --check
```

Live checks with configured env:

```text
/api/current-case
/api/product/overview
/api/product/actions
/api/product/actions/:id
/api/product/scenarios
/api/product/agent-activity
/api/product/customers
/api/product/voice/status
/api/product/voice/twiml
/api/product/voice/webhooks/twilio
```

Optional live execution check:

```text
Approve one phone action -> execute with live=true -> call only
TWILIO_TEST_TO_NUMBER -> persist real Twilio SID/status -> reseed demo.
```

Browser checks:

- upload/sample pack creates or refreshes live Aurora-backed state
- Overview tells the risk story in one glance
- Forecast changes after the event/import
- Fireworks-generated preview appears or honest fallback appears
- approve/edit/reject work
- approved test call path is clearly gated or executes exactly one safe call
- Agent Activity proves every step
- Customer memory updates after an outcome
- Settings/architecture proof is submission-safe
- no console errors
- no horizontal overflow at desktop and mobile widths

## Out Of Scope Unless Explicitly Requested

- Full Gmail OAuth completion as the primary demo path.
- Adding SES, Resend, Stripe, Plaid, QuickBooks, or Xero.
- True bank-account connection.
- Multi-tenant auth/account management polish.
- Production billing, invoices, or subscriptions.
- Voice calls to real customers.

## Launch Decision

Ready to launch after user approval.

Recommended instruction:

```text
Launch Checkpoint 8 final product execution with the three planned worker lanes.
```

