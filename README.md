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

Checkpoint 2 QA/runbook coverage is in progress on the CP2 lanes:

- `docs/checkpoint-2-orchestration.md`
- `docs/checkpoint-2-status.md`
- CP2 focuses on live upload/manual ingestion, S3 source storage, Aurora
  provenance, event inbox processing, and no-key/live smoke verification.

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

Live CP2 upload and processor smoke requires Aurora and S3 env. Fireworks,
LangSmith, Gmail, ElevenLabs, and Twilio keys are not required for CP2.

Live migration, seed, and smoke commands require Aurora Data API credentials.
Without local AWS credentials or required Aurora settings, scripts should fail
with clear no-key messages instead of silently falling back to fixtures.
