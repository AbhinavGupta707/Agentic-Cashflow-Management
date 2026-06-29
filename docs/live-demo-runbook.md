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

1. Start on Overview. Show current cash position, runway, payroll pressure, and
   recoverable cash. The point is that this looks like a finance product, not a
   dev console.
2. Open Forecasts. Show baseline, optimistic, and conservative projections, then
   explain that the forecast is recomputed from Aurora facts.
3. Open Actions. Select the highest-impact action. Show expected impact,
   rationale, approval state, draft/call preview, and guardrails.
4. Approve an action only if you are ready to demonstrate execution. Otherwise,
   leave it as approval-required to emphasize safe autonomy.
5. Open Customers. Show the customer exposure, memory, outreach strategy, and
   evidence trail.
6. Open Agent Activity. Show the persisted agent run, checkpoints, provider
   readiness, and audit trail.
7. For a live phone demo, confirm the action is approved, set
   `TWILIO_TEST_TO_NUMBER` to your own test phone, and trigger exactly one call.
   Do not call a customer or any unapproved number during the demo.

## Acceptance Bar

The walkthrough is live-ready when:

- Product routes return real Aurora data.
- Forecast smoke writes and replays idempotently.
- UI loads without horizontal overflow on desktop or mobile widths.
- Fireworks/LangSmith/Twilio readiness reports real configured/unavailable
  states.
- Twilio can fetch `/api/product/voice/twiml` as XML.
- No provider success, provider ID, send, call, reply, or trace is fabricated.
