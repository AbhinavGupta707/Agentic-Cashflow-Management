# Live Product UI And Agentic Runtime Plan

Date: 2026-06-29

Status: Execution baseline for the CP5/CP6 live product build.

## Current Reality

The app has strong backend foundations but the product experience still feels
like an internal proof dashboard. That is the wrong final surface for a live
customer-facing H0 demo.

Already built:

- Aurora-backed source, finance, forecast, action, approval, communication,
  voice, memory, provider execution, agent run, checkpoint, and audit tables.
- Live ingestion and event inbox through Aurora/S3.
- Forecast/action planning with persisted runs and checkpoints.
- Fireworks/LangSmith no-key posture and deterministic fallback.
- Gmail OAuth/provider connection foundation and approval-gated email runtime.
- Basic cockpit panels for ingestion, forecasts, actions, approval, providers,
  and email handoff.

Not yet good enough:

- The UI exposes implementation detail instead of a simple product story.
- The main screen reads like a checkpoint/control dashboard, not a polished
  cashflow assistant.
- Agent progress is not shown as a natural workflow.
- Live provider setup is hidden in env/docs rather than surfaced as a readiness
  experience.
- Browser-visible state is too raw: errors, missing env, provider status, and
  route names are useful for engineers but not for customers.

## UI Reference Analysis

Reference assets now exist in `Ui References/`:

- `1.png`: Overview dashboard.
- `2.png`: Action Queue and selected action detail.
- `3.png`: Customer profile and outreach strategy.
- `4.png`: Scenario Planner.

All four references share a coherent product system:

- desktop-first app shell at `1448x1086`
- dark premium fintech palette
- persistent left nav
- top company selector and active case indicator
- "last updated" live status and notification affordance
- large but restrained KPI rows
- glassy dark cards with 6-8px radius and thin borders
- purple/indigo primary action color
- green positive/cash values, red risk/outflows, amber watch state
- compact operational cards rather than proof-dashboard panels
- no checkpoint language and no env-name/debug language

The references are not just styling inspiration. They define the core product
information architecture we should build.

### Reference 1: Overview

Purpose:

- the executive home screen for daily cash management
- communicates current cash, runway, payroll due, and risk immediately
- shows a single dominant cashflow/runway visualization
- shows critical actions and approvals without overwhelming the user
- shows agent health as simple status tiles

Build implication:

- replace the current proof cockpit home with this overview
- add a consolidated dashboard API that returns KPIs, chart series, critical
  actions, approvals, and agent status in one shape
- keep technical proof in Activity, not on the home screen

### Reference 2: Action Queue

Purpose:

- make approvals feel like a product workflow
- list pending approvals on the left
- show selected action details on the right
- expose "why this action", draft/call preview, history, and guardrails
- make approve/edit/reject the primary interaction

Build implication:

- build a first-class Actions page
- unify email and phone actions under one approval interaction model
- use `approval_records`, `actions`, `communication_drafts`,
  `provider_executions`, `voice_calls`, and `memory_chunks` behind the screen
- allow Fireworks-generated content to be edited before approval

### Reference 3: Customer Profile

Purpose:

- make memory and outcome learning visible to the business user
- show customer status, exposure, lateness, reliability, behavior summary,
  interaction history, learned facts, outreach strategy, call script, and
  supporting evidence

Build implication:

- CP5 voice and memory extraction should target this screen
- add customer detail APIs that join customers, invoices, communications,
  voice calls, transcripts, memory facts, and recommended actions
- show learned facts as simple cards with confidence, not raw embeddings
- show evidence files/messages/transcripts as downloadable/supporting records

### Reference 4: Scenario Planner

Purpose:

- make forecasting interactive and understandable
- compare baseline, optimistic, and conservative scenarios
- let the user toggle assumptions such as payment arrival and supplier deferral
- translate scenarios into a recommended action plan

Build implication:

- extend the forecast engine/API to accept scenario assumptions
- add optimistic/conservative projections in addition to baseline
- render sensitivity analysis from actual forecast inputs
- connect scenario changes to action recommendations

## Product Direction

Build a live working product, not a walkthrough demo.

The first screen should answer a business user's questions:

- How much cash do I have?
- What will happen over the next few weeks?
- What is threatening cashflow?
- What should the assistant do?
- What is waiting for my approval?
- What happened after the assistant acted?

The complex agent machinery should exist behind the scenes and be available in a
secondary "Activity" or "Why" layer, not as the main dashboard.

## Recommended UI Model

### Primary Experience: Cashflow Command Home

Use a polished app shell:

- left navigation with 7 sections: Overview, Cases, Actions, Customers,
  Forecasts, Agent Activity, Settings
- top bar with company switcher, live status, and "Run analysis"
- main content with the dark premium RunwayOps-style product feel
- restrained cards, clear hierarchy, few colors, no proof-dashboard language

Home should show:

- cash today
- forecasted low point
- recoverable cash
- upcoming obligations
- assistant recommendation summary
- approval queue
- recent outcomes

### Main Hero Panel

One primary narrative card:

```text
You are projected to dip below your cash target on July 12.
Recovering £8,000 from Northstar this week keeps payroll safe.
```

Actions:

- Review plan
- Approve outreach
- Call customer
- Upload data

This gives the demo a product center of gravity. The command-line/test details
become supporting proof, not the experience.

### Agent Timeline

Show the agent as a readable sequence:

1. Read new source data
2. Updated forecast
3. Found recoverable cash
4. Drafted outreach
5. Waiting for approval
6. Executed provider action
7. Learned from outcome

Each step should be backed by real `agent_runs`, `agent_checkpoints`,
`event_ledger`, `provider_executions`, `communication_messages`,
`voice_calls`, and `memory_chunks`.

### Action Detail Drawer

When a user clicks a recommended action, show a focused drawer:

- action recommendation
- expected cash impact
- customer context
- invoice evidence
- generated email/call script
- approval controls
- execution history
- "why this action" explanation

This is where Fireworks output can be shown in a product-safe way.

### Activity / Audit View

Keep the technical proof, but make it optional:

- source events
- forecast run
- agent checkpoints
- provider executions
- trace link
- audit records

This becomes the "show your work" screen for judges and technical demos.

## Visual Direction

Assumption until UI reference images are visible:

- consumer fintech / premium productivity
- simple, warm, and trustworthy
- less dense than an admin table dashboard
- more like a polished cash assistant than a BI cockpit

Recommended style from references:

- dark navy/black background with subtle card gradients
- thin low-contrast borders and soft inner highlights
- purple/indigo primary buttons and active nav states
- green for cash/inflows/safe state
- red for overdue/outflow/high risk
- amber for watch/medium-risk state
- large readable numbers and compact labels
- 6-8px card/control radii
- charts with annotations rather than dense tables
- subtle motion for agent progress, not decorative animation

Avoid:

- static checkpoint cards as the primary experience
- showing env names or route names to normal users
- huge tables on the landing screen
- fake "sent" or fake provider IDs
- demo-only cached flows that bypass Aurora/provider state

## Live Agentic Architecture

### Agent Runtime

The live agent loop should be:

1. Ingest source files/events into Aurora.
2. Run deterministic forecast from Aurora facts.
3. Retrieve customer/payment memory from `memory_chunks`.
4. Ask Fireworks for structured recommendations, message drafts, and outcome
   extraction.
5. Persist `agent_runs` and `agent_checkpoints` through LangGraph.
6. Emit LangSmith traces when configured.
7. Require human approval through `approval_records`.
8. Execute Gmail or voice providers only after approval.
9. Persist provider results in `provider_executions`,
   `communication_messages`, `voice_calls`, and `voice_transcripts`.
10. Extract behavior facts from replies/transcripts into memory.

The UI should read from this live state. It should not operate as a separate
scripted demo state machine.

### Fireworks Usage

Fireworks should be used for:

- structured action recommendation ranking
- email draft generation
- call script generation
- customer reply classification
- transcript summarization
- behavior memory extraction
- natural-language explanation of forecast/action causality

Provider requirements:

- keep deterministic fallback when no key is present
- use structured JSON outputs rather than freeform parsing where possible
- store prompt/input/output summaries in `agent_checkpoints`, not secrets
- never mark provider work as successful without a real provider response

Suggested model strategy:

- default fast model for low-risk extraction/drafting
- stronger model for multi-step reasoning and transcript/action synthesis
- keep model ID env-driven via `FIREWORKS_MODEL`
- add `FIREWORKS_REASONING_MODEL` and `FIREWORKS_EXTRACT_MODEL` if separate
  model tiers are useful after keys are configured

### LangGraph And LangSmith Usage

LangGraph should become the real orchestration layer, not just a linear smoke:

- nodes: ingest delta, forecast, retrieve memory, reason, draft, approval wait,
  execute provider, learn outcome
- checkpoints: one durable state per node
- interrupts: approval gates before email/call execution
- replay: idempotency key per case/action/provider operation

LangSmith should provide:

- trace per agent run
- metadata for tenant/company/case/action
- tags by checkpoint and provider
- links surfaced in the Activity view for demos

### CP5 Voice Runtime

The schema already includes voice primitives:

- `voice_calls`
- `voice_transcripts`
- `communication_messages` with `voice`
- `provider_executions`
- `memory_chunks` source types for voice calls/transcripts

CP5 should add:

- voice provider status contract for Twilio/ElevenLabs
- call script generation with Fireworks
- approval-gated call execution route
- Twilio outbound call adapter or ElevenLabs/Twilio bridge
- webhook routes for call status and transcript events
- transcript persistence
- transcript-to-memory extraction
- no-key smoke that proves no fake calls are placed
- live smoke guarded by explicit test phone number and approval

Do not copy legacy RunwayOps code directly. The old code can only be useful as
conceptual reference if the user explicitly relaxes the current repository
guardrails. This repo must stay Aurora/Postgres-first and canonical.

### CP6 Cockpit Replacement

CP6 should be a product UI and live state integration checkpoint.

It should replace the current proof cockpit with:

- customer-facing Home dashboard
- Action detail drawer
- Approval queue
- Upload/import experience
- Customer profile with behavior memory
- Activity/audit view
- provider readiness/setup page

It will still need backend glue:

- consolidated live dashboard API
- action detail API
- agent timeline API
- customer memory API
- provider readiness API

So CP6 is mostly UI, but it is not only UI. It is the point where the live
backend becomes understandable to a customer.

## Concrete Build Breakdown

### UI Foundation Lane

Build reusable product shell and components:

- `AppShell`
- `SidebarNav`
- `TopCaseBar`
- `KpiStrip`
- `MetricCard`
- `RiskBadge`
- `ActionCard`
- `ApprovalCard`
- `AgentStatusTile`
- `EvidenceList`
- `Timeline`
- `ScenarioToggle`
- `PrimaryChartCard`

Design tokens:

- dark surfaces
- accent colors
- type scale
- spacing scale
- shadows/borders
- focus states
- reduced-motion states

### Live Dashboard API Lane

Create a consolidated overview endpoint:

```text
GET /api/product/overview
```

Response should include:

- company and active case
- current cash
- runway
- payroll/obligation due
- cash risk
- cashflow chart series
- critical actions
- approvals needed
- agent statuses
- last updated timestamp

This endpoint should read real Aurora state, not fixtures.

### Actions And Approvals Lane

Create:

```text
GET /api/product/actions
GET /api/product/actions/:id
POST /api/product/actions/:id/approve
POST /api/product/actions/:id/reject
POST /api/product/actions/:id/edit-draft
```

Backed by:

- `actions`
- `approval_records`
- `communication_drafts`
- `communication_messages`
- `provider_executions`
- `voice_calls`

The UI should support:

- email action
- phone action
- portal/manual action if present
- approve/edit/reject
- "why this action"
- draft/call script preview
- compliance guardrails

### Customer Intelligence Lane

Create:

```text
GET /api/product/customers
GET /api/product/customers/:id
```

Backed by:

- customers and contacts
- invoices and payments
- communication messages
- voice calls and transcripts
- memory chunks
- recommended actions

The page should match reference 3:

- outstanding invoices
- exposure
- lateness
- promise reliability
- behavior summary
- interaction history
- learned facts
- recommended outreach
- supporting evidence

### Scenario Planner Lane

Create:

```text
GET /api/product/scenarios
POST /api/product/scenarios/preview
```

Backed by:

- current deterministic forecast engine
- scenario assumptions
- forecast runs/points, either persisted or preview-only with clear state
- action recommendation derivation

The page should match reference 4:

- baseline/optimistic/conservative projections
- assumption toggles
- scenario comparison cards
- recommended action plan
- sensitivity analysis

### Agent Activity Lane

Create:

```text
GET /api/product/agent-activity
```

Backed by:

- `agent_runs`
- `agent_checkpoints`
- `event_ledger`
- `provider_executions`
- `audit_log`
- LangSmith trace URL when present

This is where the demo can explain the complex backend without cluttering the
primary user workflow.

### Voice Runtime Lane

Build CP5 as the runtime that powers the phone elements in references 2 and 3:

- Twilio/ElevenLabs provider status
- Fireworks call script generation
- approval-gated call execution
- live call state updates
- transcript ingestion
- transcript summarization
- behavior memory extraction
- supporting evidence attachment

## Provider Setup UX

Do not require the user to understand env names from the dashboard.

Build a "Connections" or "Readiness" screen:

- Fireworks: configured / missing
- LangSmith: tracing enabled / disabled
- Gmail: OAuth configured / not connected
- Voice: Twilio/ElevenLabs configured / missing
- Aurora/S3: connected / unavailable

For normal users, show:

```text
AI reasoning is ready.
Email is not connected yet.
Voice calling is not connected yet.
```

For demo/operator mode, reveal exact env names and smoke commands.

## Execution Sequence

### Phase A: UI Reference And Product Design Lock

- Make the `UI references` folder visible in the repo.
- Inspect each image.
- Extract visual patterns: layout, spacing, palette, navigation, card shape,
  charts, motion, density.
- Create a short design brief and component inventory.

### Phase B: Live Agent Runtime Upgrade

- Upgrade Fireworks provider from single email draft to multi-task structured
  agent outputs.
- Add model routing env names.
- Expand LangGraph into a durable approval/execution/learning graph.
- Add live provider smoke with real Fireworks/LangSmith keys once available.

### Phase C: CP5 Voice

- Build approval-gated voice runtime and no-key smokes.
- Wire Twilio/ElevenLabs providers.
- Persist call status/transcripts/memory.
- Add live test mode with explicit test number.

### Phase D: CP6 Product UI

- Replace current cockpit with the consumer product shell.
- Build Home, Actions, Inbox, Customers, Activity, Connections.
- Keep technical proof available but secondary.
- Run responsive/browser QA.

### Phase E: End-To-End Live Demo

- Upload/ingest real test data.
- Run forecast.
- Generate agent recommendation through Fireworks.
- Show LangSmith trace.
- Approve email or voice action.
- Persist provider outcome.
- Extract behavior memory.
- Refresh UI and show learned state.

## Official Docs To Use During Implementation

- Fireworks text model querying:
  `https://docs.fireworks.ai/guides/querying-text-models`
- Fireworks function calling:
  `https://docs.fireworks.ai/guides/function-calling`
- Fireworks structured response formatting:
  `https://docs.fireworks.ai/structured-responses/structured-response-formatting`
- LangGraph JS persistence:
  `https://docs.langchain.com/oss/javascript/langgraph/persistence`
- LangGraph interrupts / human-in-the-loop:
  `https://docs.langchain.com/oss/javascript/langgraph/interrupts`
- LangSmith tracing:
  `https://docs.langchain.com/langsmith/trace-with-langchain`
- Twilio outbound calls with Node:
  `https://www.twilio.com/docs/voice/tutorials/how-to-make-outbound-phone-calls/node`
- Twilio call resource and status callbacks:
  `https://www.twilio.com/docs/voice/api/call-resource`
- ElevenLabs text-to-speech:
  `https://elevenlabs.io/docs/api-reference/text-to-speech/convert`
- ElevenLabs Twilio phone integration:
  `https://elevenlabs.io/docs/conversational-ai/phone-numbers/twilio`

## Execution Decisions

1. Build CP5 voice/runtime and CP6 product UI together, but keep worker lanes
   separated by ownership. The visible product shell should be ready to display
   voice/customer intelligence as soon as the runtime lands.
2. Use Twilio-first for live outbound call plumbing because the configured
   ElevenLabs key currently fails validation. Keep ElevenLabs as an optional
   readiness provider with honest unavailable/invalid states until a valid key
   is configured.
3. Support email and voice in the approval model, but do not require live Gmail
   OAuth linkage for this pass.
4. Treat `Ui References/` as the visual target. The implementation should match
   the premium dark shell, density, hierarchy, and customer-facing language from
   those images as closely as practical.
5. Fireworks, LangSmith, and Twilio may be live-tested by the master session
   when local keys are present. Worker lanes should keep no-key behavior
   deterministic and should never print or commit secrets.
