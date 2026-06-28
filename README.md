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

Checkpoint 1 should scaffold the app and implement the Aurora foundation from this clean repository.

Checkpoint 1 QA and setup contracts are documented in:

- `docs/checkpoint-1-status.md`

## Fresh Clone Setup

Clone only the canonical repository:

```bash
git clone https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git
cd Agentic-Cashflow-Management
cp .env.example .env.local
```

Checkpoint 1 is expected to provide a Next.js App Router scaffold. After the app
lane lands, install dependencies and run the local app with:

```bash
npm install
npm run dev
```

The local app should use `.env.local`. Keep secrets out of Git. Production
runtime variables belong in the Vercel project `agentic-cashflow-management`.

## Checkpoint 1 Verification Contract

After all checkpoint 1 lanes are integrated, the repository should support:

```bash
npm run typecheck
npm run build
npm run db:migrate
npm run db:seed
npm run smoke
```

Live migration, seed, and smoke commands require Aurora Data API credentials.
Without local AWS credentials or required Aurora settings, scripts should fail
with clear no-key messages instead of silently falling back to fixtures.
