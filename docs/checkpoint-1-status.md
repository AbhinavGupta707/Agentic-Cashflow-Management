# Checkpoint 1 QA And Runbook

Date: 2026-06-29

Checkpoint: App Scaffold, Aurora Foundation, And Data Model

This document records the checkpoint 1 setup, verification, and smoke-test
status for the canonical Agentic Cashflow Management repository after lane
integration.

## Repository Boundary

Use only:

```text
https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git
```

Do not use external legacy repositories. Do not copy env, code, migrations, or
URLs from another public repository.

## Fresh Clone Setup

From a clean machine or folder:

```bash
git clone https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git
cd Agentic-Cashflow-Management
cp .env.example .env.local
npm install
```

Expected checkpoint 1 local commands:

```bash
npm run dev
npm run typecheck
npm run build
```

The development server should read local env from `.env.local`. Local developer
state such as `.vercel/project.json`, `.env.local`, and generated build output
must remain untracked.

## Environment Variables

Local env file:

```text
.env.local
```

Vercel project:

```text
agentic-cashflow-management
```

Vercel production env names expected by checkpoint 1:

- `AWS_ROLE_ARN`
- `AWS_REGION`
- `AWS_ACCOUNT_ID`
- `AURORA_CLUSTER_ARN`
- `AURORA_SECRET_ARN`
- `AURORA_DATABASE`
- `AWS_S3_BUCKET`
- `DEMO_COMPANY_ID`
- `DEMO_CASE_ID`

Known production values from checkpoint 0:

```text
AWS_REGION=eu-west-2
AWS_ACCOUNT_ID=222634407676
AURORA_CLUSTER_ARN=arn:aws:rds:eu-west-2:222634407676:cluster:h0-hackathon-aurora-pg
AURORA_DATABASE=cash_management
AWS_S3_BUCKET=h0-cash-management-assets-222634407676-eu-west-2
AWS_ROLE_ARN=arn:aws:iam::222634407676:role/h0-cash-management-vercel-runtime-role
```

The Aurora app-user secret exists in AWS Secrets Manager and is configured in
Vercel production as `AURORA_SECRET_ARN`. Local `.env.local` may leave it blank
unless the developer is intentionally running live Aurora commands. Local scripts
load `.env.local` and `.env` automatically. `AWS_ROLE_ARN` is configured in
production for Vercel OIDC, but local AWS CLI/SSO credentials can work without
that variable.

Provider env names reserved for later checkpoints:

- `FIREWORKS_API_KEY`
- `FIREWORKS_BASE_URL`
- `FIREWORKS_MODEL`
- `FIREWORKS_EMBEDDING_MODEL`
- `FIREWORKS_EMBEDDING_DIMENSIONS`
- `ACM_ENABLE_LIVE_LLM`
- `ACM_ALLOW_CACHED_LLM`
- `LANGSMITH_TRACING`
- `LANGSMITH_API_KEY`
- `LANGSMITH_PROJECT`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GMAIL_ENCRYPTION_KEY`
- `ACM_EMAIL_PROVIDER`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`
- `ELEVENLABS_AGENT_PHONE_NUMBER_ID`
- `ELEVENLABS_MODEL_ID`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

Checkpoint 1 should not require Gmail, voice, LangSmith, or live Fireworks keys
for build, migration, seed, or read-only Aurora smoke tests.

## Migration And Seed Contract

Checkpoint 1 should provide scripts with these behaviors:

```bash
npm run db:migrate:dry
npm run db:seed:dry
npm run db:migrate
npm run db:seed
npm run smoke
```

Expected migration behavior:

- Uses Aurora PostgreSQL through the RDS Data API.
- Reads `AWS_REGION`, `AURORA_CLUSTER_ARN`, `AURORA_SECRET_ARN`, and
  `AURORA_DATABASE`.
- `npm run db:migrate:dry` parses and checksums SQL without requiring AWS env.
- Retries `DatabaseResumingException` with bounded backoff because Aurora can
  resume from 0 ACU.
- Creates or validates extensions required by checkpoint 1 schema:
  `pgcrypto`, `pg_trgm`, and `vector`.
- Applies schema for tenant, source, finance, event, action, communication,
  memory, agent, and audit primitives.
- Keeps memory embeddings compatible with `vector(1024)`.

Expected seed behavior:

- Seeds a demo company/case using `DEMO_COMPANY_ID` and `DEMO_CASE_ID`.
- Inserts source provenance, customers, contacts, invoices, obligations, payment
  or event facts, forecast points, action candidates, approval-ready records, and
  memory facts.
- Is idempotent or safely repeatable for the demo identifiers.
- Does not read from hard-coded runtime fixtures when Aurora credentials are
  present.

Expected smoke behavior:

- Reads the seeded sample case from Aurora through the same repository/API path
  used by the app.
- Verifies a dashboard or API response contains the demo company/case,
  receivables, obligations, forecast points, actions, and memory-backed facts.
- Reports missing credentials separately from schema or data failures.

## No-Key And Missing Provider States

The local app should remain useful without optional provider secrets.

Required for live Aurora commands:

- AWS credentials in the developer environment, or production Vercel OIDC.
- `AWS_REGION`
- `AURORA_CLUSTER_ARN`
- `AURORA_SECRET_ARN`
- `AURORA_DATABASE`

If those are missing, migration, seed, and live smoke scripts should stop with a
clear configuration error. They should not claim success against placeholder
data.

Optional for checkpoint 1:

- Fireworks keys and model IDs.
- LangSmith API key.
- Google/Gmail OAuth credentials and encryption key.
- ElevenLabs and Twilio credentials.

When optional provider secrets are missing, checkpoint 1 UI and API surfaces
should show unavailable or not-configured states for those future workflows. They
should not expose send, call, or live reasoning execution as active controls.

## Acceptance Checks

Run after all checkpoint 1 lanes are merged:

```bash
npm install
npm run typecheck
npm run build
npm run db:migrate:dry
npm run db:seed:dry
npm run db:migrate
npm run db:seed
npm run smoke
git diff --check
rg -n "RunwayOps|runwayops|mongodb\\+srv|MongoDB|MONGODB|mongodb" src scripts db package.json README.md
```

Passing criteria:

- App scaffold builds with TypeScript.
- Migration succeeds or fails only because live Aurora credentials are absent.
- Seed succeeds against Aurora when credentials are present.
- Smoke reads seeded data from Aurora, not static fixtures.
- No target implementation depends on MongoDB.
- The orchestrator-provided legacy repository denylist returns no matches.
- No secrets are committed.

## Manual Smoke Boundaries

Checkpoint 1 manual smoke should cover:

- Fresh clone setup using the canonical repository URL.
- Local development startup.
- App no-key state when `.env.local` does not include Aurora credentials.
- Successful migration and seed when live credentials are provided.
- App/API read path showing the seeded demo case from Aurora.
- Production env presence in Vercel for AWS and Aurora names listed above.

Checkpoint 1 manual smoke should not require:

- Gmail OAuth.
- Sending email.
- ElevenLabs or Twilio voice execution.
- Live Fireworks reasoning.
- LangSmith traces.
- Full cockpit UX polish beyond a basic operational shell.

## Current Lane Status

Integrated status:

- Lane A, B, C, and D branches are merged into `main`.
- The cockpit shell calls `/api/current-case` instead of rendering only static fixtures.
- Aurora schema includes tenant-scoped external IDs for deterministic demo upserts.
- Demo seed writes tenant, company, cash account, source/import provenance, customers, contacts, invoices, obligations, forecast points, action approvals, and memory facts.
- Repository scripts load `.env.local` automatically.
- Verified in the orchestration shell: `npm install`, `npm run typecheck`, `npm run build`, `npm run db:migrate:dry-run`, `npm run db:seed:dry-run`, and `git diff --check` all passed.
- `npm run db:check-data-api` and `npm run smoke` both stop with a clear missing-env error until `AWS_REGION`, `AURORA_CLUSTER_ARN`, `AURORA_SECRET_ARN`, and `AURORA_DATABASE` are provided.
- Runtime denylist scan `rg -n "RunwayOps|runwayops|mongodb\\+srv|MongoDB|MONGODB|mongodb" src scripts db package.json README.md` returned no matches.
- Checkpoint 2 remains paused until live `db:migrate`, `db:seed`, and `smoke` are run and recorded.
