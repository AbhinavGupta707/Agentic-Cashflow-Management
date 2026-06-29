# Live Demo Runbook

Date: 2026-06-29

Purpose: run the H0 Agentic Cashflow Management app as a real Aurora-backed
product flow for hackathon judging and recording.

## Live Product State

Live and wired:

- Aurora PostgreSQL Data API for the primary product state.
- S3-backed ingestion provenance.
- Deterministic forecast generation from Aurora facts.
- LangGraph run/checkpoint persistence.
- Fireworks and LangSmith runtime readiness when keys are configured.
- Approval-gated action queue for email and phone actions.
- Twilio call initiation path guarded by approval, `live=true`, and
  `TWILIO_TEST_TO_NUMBER`.
- Twilio TwiML callback at `/api/product/voice/twiml`.
- Twilio webhook ingestion at `/api/product/voice/webhooks/twilio`.
- Customer, forecast, actions, overview, and agent activity product APIs.

Pre-Checkpoint 7 caveat:

- The backend action-detail route can generate a Fireworks preview when called
  directly, but the browser UI still needs to fetch selected action detail and
  wire Approve/Edit/Reject controls before the walkthrough can be treated as a
  complete clickable product flow.
- Forecast and Agent Activity screens still need one integration pass to remove
  stale static labels and show persisted timeline evidence as the primary
  user-facing story.

Intentionally gated:

- Gmail does not need to be connected for the hackathon walkthrough. The app
  should show honest unavailable/OAuth-required state rather than fake sends.
- ElevenLabs remains optional. Twilio is the live phone execution path unless
  ElevenLabs remote validation and agent wiring are explicitly enabled.
- No outbound voice call should be placed unless the target number exactly
  matches `TWILIO_TEST_TO_NUMBER` and the action has been approved.

## Local Live Check

From the canonical repository root:

```bash
aws login
npm run db:check-data-api
npm run db:migrate
npm run db:seed
npm run smoke
npm run forecast:smoke
npm run typecheck
CP6_REQUIRE_PRODUCT_ROUTES=true npm run check:cp6
npm run smoke:voice:no-key
npm run dev
```

Open:

```text
http://localhost:3000
```

The local app should read from Aurora. If `/api/product/voice/status` is
degraded only because `TWILIO_TWIML_URL` is missing, the product is still safe
for a UI walkthrough; phone execution becomes live after setting the deployed
callback URL.

## Vercel Production Setup

Set production env from `.env.local` without committing secrets.

Required for Aurora-backed deployed walkthrough:

- `AWS_REGION`
- `AWS_ROLE_ARN`
- `AURORA_CLUSTER_ARN`
- `AURORA_SECRET_ARN`
- `AURORA_DATABASE`
- `AWS_S3_BUCKET`
- `DEMO_COMPANY_ID`
- `DEMO_CASE_ID`

Recommended for live agent readiness:

- `FIREWORKS_API_KEY`
- `FIREWORKS_BASE_URL`
- `FIREWORKS_MODEL`
- `ACM_ENABLE_LIVE_LLM=1`
- `ACM_ALLOW_CACHED_LLM=0`
- `LANGSMITH_TRACING=true`
- `LANGSMITH_API_KEY`
- `LANGSMITH_PROJECT`

Required before placing a live Twilio test call:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` or `TWILIO_FROM_NUMBER`
- `TWILIO_TWIML_URL=https://<deployment-host>/api/product/voice/twiml`
- `TWILIO_STATUS_CALLBACK_URL=https://<deployment-host>/api/product/voice/webhooks/twilio`
- `TWILIO_TEST_TO_NUMBER`

Deploy:

```bash
vercel deploy --prod -y
```

Then verify these routes on the deployment:

```text
/api/current-case
/api/product/overview
/api/product/actions
/api/product/customers
/api/product/scenarios
/api/product/agent-activity
/api/product/voice/status
/api/product/voice/twiml
```

## Walkthrough Script

Use this walkthrough after Checkpoint 7 integration lands and the browser QA
checks pass. Before CP7 is complete, treat it as the target demo script rather
than proof that every button is already wired.

### Launch

Local:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Production:

```text
https://agentic-cashflow-management.vercel.app
```

The first page should be the RunwayOps-style cashflow product, not a checkpoint
or command dashboard. The live status should say that product data is connected
or clearly explain what provider/data source is unavailable.

### Quick Demo Path

1. Start on Overview. Show current cash position, runway, payroll pressure, and
   recoverable cash. The point is that this looks like a finance product, not a
   dev console.
2. Open Forecasts. Show baseline, optimistic, and conservative projections, then
   explain that the forecast is recomputed from Aurora facts.
3. Open Actions. Select the highest-impact action. Show expected impact,
   rationale, approval state, draft/call preview, and guardrails.
4. Edit, approve, or reject the action. Approval should record the human
   decision; it should not silently send Gmail or place a Twilio call.
5. Open Agent Activity. Show the persisted agent run, checkpoints, provider
   readiness, and audit trail.
6. Open Customers. Show the customer exposure, memory, outreach strategy, and
   evidence trail.
7. For a live phone demo, confirm the action is approved, set
   `TWILIO_TEST_TO_NUMBER` to your own test phone, and trigger exactly one call.
   Do not call a customer or any unapproved number during the demo.

### Step 1: Overview Story

Show the product home first.

Expected user-visible story:

- current cash position
- forecast low point or runway risk
- next major obligation such as payroll
- recoverable cash from the highest-impact customer action
- the assistant's recommended next step
- approval queue and agent status

What is happening behind the scenes:

- Deterministic: current cash, invoices, obligations, forecast low point, and
  cash impact calculations are read from Aurora-backed finance state.
- Agentic: the recommended action is backed by the persisted agent/action plan
  produced by the forecast/recommendation runtime.
- Gated: no email or phone execution happens from the overview.

Narration:

```text
RunwayOps has read the latest cash, invoices, obligations, and customer history.
It is not just showing a dashboard; it is telling us what cash risk matters
today and what action would change the outcome.
```

### Step 2: Forecasts

Open Forecasts.

Expected user-visible story:

- baseline, optimistic, and conservative projections
- scenario assumptions that can be toggled or previewed
- scenario comparison
- recommended action plan tied to forecast impact
- no stale hardcoded 2025 chart labels unless the seeded scenario explicitly
  explains that case date

What is happening behind the scenes:

- Deterministic: projection math, low point, obligations, invoice timing, and
  sensitivity calculations are computed from Aurora facts.
- Agentic: explanation/recommendation copy may be produced by Fireworks when
  available, but the cash math itself should not depend on the LLM.
- Gated: scenario previews do not send messages or place calls.

Narration:

```text
The finance calculation is deterministic. The model is used to explain and
rank the options, not to invent cash numbers.
```

### Step 3: Actions Detail

Open Actions and select the highest-impact pending approval.

Expected user-visible story:

- selected action detail loads from `/api/product/actions/[id]`
- rationale explains why this customer/action matters
- cash impact and confidence are visible
- draft email or call script is shown
- preview is labelled as Fireworks-generated or deterministic fallback
- guardrails explain that approval is required before outbound execution

What is happening behind the scenes:

- Deterministic: the selected action, customer, invoice, approval state, and
  evidence are read from Aurora.
- Fireworks: when configured, the action-detail endpoint can generate a
  structured draft or call preview using the customer context and memory facts.
- LangSmith: when tracing is configured and the runtime emits traces, trace
  metadata is available through the agent/activity surface.
- Gated: preview generation is not the same as sending an email or placing a
  call.

Narration:

```text
This is where the agent becomes useful. It has already chosen the highest impact
action, but it still pauses for the operator. We can inspect the reasoning and
the generated draft before anything leaves the system.
```

### Step 4: Edit, Approve, Or Reject

Use the action controls deliberately.

Edit expected behavior:

- opens an editor for the email body or call script
- saves through `POST /api/product/actions/[id]/edit-draft`
- refreshes the selected action detail
- keeps the action in an approval-required state

Approve expected behavior:

- records approval through `POST /api/product/actions/[id]/approve`
- refreshes the approval state in the UI
- does not silently send Gmail or place a Twilio call
- leaves provider execution to the explicit provider route/guarded live action

Reject expected behavior:

- records rejection through `POST /api/product/actions/[id]/reject`
- refreshes the action list/detail
- produces no provider execution

What is happening behind the scenes:

- Deterministic: approval decisions are persisted in Aurora approval/action
  state.
- LangGraph concept: this is the human-in-the-loop interrupt/resume point. The
  system pauses before outbound conduct, records the decision, and resumes only
  along allowed paths.
- Provider-gated: Gmail remains optional/OAuth-gated. Twilio calls remain
  guarded by approval, explicit live mode, and `TWILIO_TEST_TO_NUMBER`.

Narration:

```text
The autonomy is bounded. The agent can recommend and draft, but the human
approval record is the gate before any external action.
```

### Step 5: Agent Activity

Open Agent Activity.

Expected user-visible story:

- persisted agent run(s)
- checkpoints or workflow steps
- source/event activity
- approval decision
- provider execution entries only when real provider work exists
- LangSmith trace links only when real trace metadata exists

What is happening behind the scenes:

- Deterministic: the timeline is assembled from persisted Aurora records.
- LangGraph: runs/checkpoints represent the durable orchestration state.
- LangSmith: trace readiness or trace links prove observability when configured.
- Provider-gated: absent provider executions should be shown as absent/gated,
  not as fake success.

Narration:

```text
This is the audit trail. We can show exactly what the system read, what it
decided, where it paused, and what happened after the human decision.
```

### Step 6: Customers

Open Customers and select the customer related to the action.

Expected user-visible story:

- exposure and overdue invoices
- payment behavior
- interaction history
- learned memory facts
- outreach strategy and supporting evidence

What is happening behind the scenes:

- Deterministic: invoices, payments, exposure, and contact history are queried
  from Aurora.
- Agentic: memory facts and outreach strategy can be extracted or summarized
  from communications, replies, and call transcripts.
- Provider-gated: customer history should only show real emails/calls/replies
  that exist in provider/audit state.

Narration:

```text
The customer page explains why this was the right action. It is not just a
queue; it learns from prior behavior and keeps the evidence attached.
```

### Step 7: Optional Live Phone Test

Run this only when the demo intentionally includes a real test call.

Requirements:

- action is approved
- `TWILIO_TEST_TO_NUMBER` is your own test phone number
- Twilio env is configured
- the UI or API call explicitly requests live execution

Expected result:

- a real Twilio call SID is recorded only if Twilio returns one
- failure records a real failed/unavailable provider execution
- no customer or unapproved number is called

## Acceptance Bar

The walkthrough is live-ready when:

- Product routes return real Aurora data.
- Forecast smoke writes and replays idempotently.
- UI loads without horizontal overflow on desktop or mobile widths.
- Fireworks/LangSmith/Twilio readiness reports real configured/unavailable
  states.
- Twilio can fetch `/api/product/voice/twiml` as XML.
- No provider success, provider ID, send, call, reply, or trace is fabricated.
