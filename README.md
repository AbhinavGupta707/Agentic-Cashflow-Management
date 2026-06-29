# Agentic Cashflow Management

Production-oriented H0 hackathon build for an agentic cash management platform.

The product helps a small business ingest invoices, customer data, obligations, documents, emails, and communication outcomes; forecast cash shortages; recommend recoverable-cash actions; request human approval; execute approved outreach; and learn from customer behaviour.

## Canonical Repository

This repository is the canonical project workspace.

```text
GitHub: https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git
Vercel project: agentic-cashflow-management
AWS primary database: Aurora PostgreSQL
```

## Current Status

Checkpoint 0 setup is documented in:

- `docs/checkpoint-0-setup.md`
- `docs/h0-full-functionality-orchestration-plan.md`

Checkpoint 1 is integrated in this repository:

- Next.js App Router cockpit shell
- Aurora PostgreSQL schema and migration runner
- RDS Data API client, repository read path, API route, demo seed, and smoke script
- QA runbook and no-key provider states

Checkpoint 1 QA and setup details are documented in:

- `docs/checkpoint-1-status.md`

Checkpoint 2 is integrated, merged, and live-Aurora/S3 verified:

- `docs/checkpoint-2-orchestration.md`
- `docs/checkpoint-2-status.md`
- CP2 focuses on live upload/manual ingestion, S3 source storage, Aurora
  provenance, event inbox processing, and no-key/live smoke verification.

Checkpoint 3 is integrated, merged, and live-Aurora verified:

- `docs/checkpoint-3-orchestration.md`
- `docs/checkpoint-3-status.md`
- CP3 focuses on deterministic forecasting from Aurora facts, LangGraph
  persisted runs/checkpoints, Fireworks no-key/live provider posture, LangSmith
  trace posture, and approval-ready action handoff without Gmail or voice
  execution.

Checkpoint 4 is the next planned build slice: approval-gated Gmail OAuth,
draft/send execution, provider IDs, replies, and communication outcome capture.
The CP4 QA/docs lane adds offline contract and Gmail no-key smoke commands:

- `docs/checkpoint-4-orchestration.md`
- `docs/checkpoint-4-status.md`
- `npm run check:cp4`
- `npm run smoke:gmail:no-key`

Checkpoint 5/6 QA and setup details are documented in:

- `docs/checkpoint-5-6-orchestration.md`
- `docs/checkpoint-5-6-status.md`
- `npm run check:cp5`
- `npm run check:cp6`
- `npm run smoke:voice:no-key`
- `npm run smoke:product:no-key`

## Fresh Clone Setup

Clone only the canonical repository:

```bash
git clone https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git
cd Agentic-Cashflow-Management
cp .env.example .env.local
```

Install dependencies and run the local app with:

```bash
npm install
npm run dev
```

The local app and repository scripts load `.env.local`. Keep secrets out of Git. Production
runtime variables belong in the Vercel project `agentic-cashflow-management`.

## Checkpoint 1 Verification Contract

Checkpoint 1 supports:

```bash
npm run typecheck
npm run build
npm run db:migrate:dry
npm run db:seed:dry
npm run db:migrate
npm run db:seed
npm run smoke
```

Checkpoint 2 adds an offline contract check for the ingestion/event-inbox
foundation:

```bash
npm run check:cp2
```

Checkpoint 3 adds an offline contract check for the forecast/action/agent
handoff foundation:

```bash
npm run check:cp3
```

Checkpoint 4 adds an offline contract check for approval-gated email/Gmail
handoff plus a no-key Gmail smoke:

```bash
npm run check:cp4
npm run smoke:gmail:no-key
```

Checkpoint 5/6 adds offline checks for approval-gated voice, product API/UI
readiness, and no-key provider posture:

```bash
npm run check:cp5
npm run check:cp6
npm run smoke:voice:no-key
npm run smoke:product:no-key
```

During CP5/CP6 integration, require the product API route surface explicitly:

```bash
CP6_REQUIRE_PRODUCT_ROUTES=true npm run check:cp6
```

Live CP2 upload and processor smoke requires Aurora and S3 env. Live CP3
deterministic forecast and agent graph smokes require Aurora env. Fireworks and
LangSmith keys are optional CP3 live-provider checks; missing keys must produce
honest unavailable/tracing-disabled states instead of fake provider success.
Gmail, ElevenLabs, and Twilio keys are not required for CP3. Gmail credentials
are optional for CP4 local/no-key verification and must be configured only for
explicit live Gmail smoke.

For CP5/CP6, live Gmail OAuth linkage is not required. Fireworks, LangSmith,
Twilio, ElevenLabs, and Aurora are optional live checks: missing keys, invalid
ElevenLabs credentials, expired AWS sessions, and absent OAuth connections must
produce honest unavailable states, not fake provider success. Live Twilio voice
smoke requires configured Twilio env, an explicit `TWILIO_TEST_TO_PHONE`, and a
recorded human approval before placing exactly one test call.

CP4 Gmail env names are:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_GMAIL_SCOPES`
- `GMAIL_ENCRYPTION_KEY`
- `GMAIL_SENDER_EMAIL`
- `GMAIL_TEST_RECIPIENT` for live smoke only

Allowed CP4 Gmail scopes are
`https://www.googleapis.com/auth/gmail.compose` and
`https://www.googleapis.com/auth/gmail.send`. Do not commit, log, expose, or
store plaintext OAuth access/refresh tokens. Live Gmail smoke may create exactly
one draft or send exactly one approved test message only after credentials and
the recipient are explicit.

Live migration, seed, and smoke commands require Aurora Data API credentials.
Without local AWS credentials or required Aurora settings, scripts should fail
with clear no-key messages instead of silently falling back to fixtures.

Manual CP5/CP6 browser QA should judge the four reference-style product screens:
Overview, Actions, Customers, and Forecasts. Use `Ui References/1.png` through
`Ui References/4.png` plus `docs/checkpoint-5-6-status.md` as the checklist.
