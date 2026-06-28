# Checkpoint 1 Orchestration

Date: 2026-06-29

Checkpoint: App Scaffold, Aurora Foundation, And Data Model

## Base State

Repository:

```text
https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git
```

Do not use or modify:

```text
https://github.com/AbhinavGupta707/RunwayOps.git
```

Checkpoint 1 base commit:

```text
25ef72d
```

Infrastructure ready:

```text
AWS region: eu-west-2
AWS account ID: 222634407676
Aurora cluster ARN: arn:aws:rds:eu-west-2:222634407676:cluster:h0-hackathon-aurora-pg
Aurora database: cash_management
Aurora secret ARN: arn:aws:secretsmanager:eu-west-2:222634407676:secret:h0/cash-management/rds/app-user-DHvZHY
S3 bucket: h0-cash-management-assets-222634407676-eu-west-2
Vercel project: agentic-cashflow-management
AWS role ARN: arn:aws:iam::222634407676:role/h0-cash-management-vercel-runtime-role
```

Known runtime requirement:

- RDS Data API calls must retry `DatabaseResumingException` because Aurora can resume from 0 ACU after idle.

## Checkpoint 1 Outcome

By the end of checkpoint 1:

- A fresh Next.js App Router app exists in this repository.
- The app has TypeScript, Tailwind styling, env validation, Vercel-compatible scripts, and a basic cash-management cockpit shell.
- Aurora schema/migrations define the primary backend primitives.
- Seed scripts can populate a sample company/case into Aurora.
- A repository/API read path can load sample case state from Aurora through RDS Data API.
- `npm run typecheck` and `npm run build` pass after integration.
- No MongoDB dependency or RunwayOps repo dependency exists.

## Lane Split

### Lane A: App Scaffold

Branch:

```text
cp1/app-scaffold
```

Worktree:

```text
/Users/abhinavgupta/Desktop/H0 AWS Hack/Cash Management /Agentic-Cashflow-Management-cp1-app
```

Owns:

- `package.json`
- `package-lock.json`
- `next.config.*`
- `tsconfig.json`
- `postcss.config.*`
- `tailwind.config.*` if used
- `src/app/**` except API routes owned by Lane C
- `src/components/**`
- `src/styles/**`
- base UI shell and no-data/loading/error states

Requirements:

- Create a production-ready Next.js App Router scaffold, not a landing page.
- Use a quiet, operational dashboard style suitable for SMB cash management.
- Include root scripts: `dev`, `build`, `start`, `typecheck`, `lint` if configured.
- Include dependencies needed by checkpoint 1 code, including `@aws-sdk/client-rds-data`, `zod`, `tsx`, TypeScript/React/Next basics, and any chosen UI utilities.
- Do not implement Gmail, voice, or Fireworks flows in this lane.

Verification:

- `npm install`
- `npm run typecheck`
- `npm run build`

### Lane B: Aurora Schema

Branch:

```text
cp1/aurora-schema
```

Worktree:

```text
/Users/abhinavgupta/Desktop/H0 AWS Hack/Cash Management /Agentic-Cashflow-Management-cp1-schema
```

Owns:

- `db/**`
- `scripts/migrate*.ts`
- `scripts/check-aurora-env*.ts`
- `docs/schema*.md`
- schema SQL and migration docs

Requirements:

- Define SQL migrations for core tables:
  - tenants/companies/users
  - customers/contacts
  - source files/import batches
  - invoices/obligations/payments/cash accounts
  - event inbox and event ledger
  - forecast runs/forecast points
  - action plans/actions/approval records
  - communication drafts/messages/provider executions
  - voice calls/transcripts
  - memory chunks with `vector(1024)`
  - agent runs/checkpoints/audit log
- Include indexes, tenant scoping, idempotency keys, timestamps, and state checks.
- Use `pgcrypto`, `pg_trgm`, and `vector`.
- Keep this lane mostly package-independent; if package changes are required, document them in handoff instead of editing `package.json`.

Verification:

- SQL syntax review.
- Migration dry-run guidance.
- If local/package scaffold is available, run the closest migration script check.

### Lane C: Data API Repository And Seed

Branch:

```text
cp1/data-api-repository
```

Worktree:

```text
/Users/abhinavgupta/Desktop/H0 AWS Hack/Cash Management /Agentic-Cashflow-Management-cp1-data
```

Owns:

- `src/server/aws/**`
- `src/server/db/**` except pure schema SQL in Lane B
- `src/server/repositories/**`
- `src/server/demo-data/**`
- `src/app/api/**`
- `scripts/seed*.ts`
- `scripts/check-data-api*.ts`

Requirements:

- Implement a typed RDS Data API client.
- Use AWS SDK credential provider chain so Vercel OIDC works in production.
- Read `AWS_ROLE_ARN`, `AWS_REGION`, `AURORA_CLUSTER_ARN`, `AURORA_SECRET_ARN`, and `AURORA_DATABASE`.
- Retry `DatabaseResumingException` with short bounded backoff.
- Build repository functions to read sample company/case state from Aurora.
- Build seed data for a demo company, customers, invoices, obligations, forecast points, actions, and memory facts.
- Add a simple API route for current case state.
- Do not use MongoDB or old RunwayOps code.
- Avoid package root edits unless absolutely required; document dependency needs in handoff.

Verification:

- Type-level/import checks where possible.
- Data API no-key/unavailable behavior is honest.
- Seed script dry-run mode if live AWS credentials are unavailable.

### Lane D: QA And Docs

Branch:

```text
cp1/qa-docs
```

Worktree:

```text
/Users/abhinavgupta/Desktop/H0 AWS Hack/Cash Management /Agentic-Cashflow-Management-cp1-qa
```

Owns:

- `docs/**` except this orchestration file after launch
- README setup/checkpoint sections
- verification checklist docs
- smoke-test documentation

Requirements:

- Document setup from fresh clone.
- Document local env and Vercel production env.
- Document migration/seed/check commands.
- Document no-key states and known unavailable provider secrets.
- Document checkpoint 1 acceptance checks and manual smoke boundaries.
- Do not edit package/app/schema code.

Verification:

- `git diff --check`
- Docs reflect actual env names and AWS/Vercel state.

## Merge Order

1. Lane A App Scaffold.
2. Lane B Aurora Schema.
3. Lane C Data API Repository And Seed.
4. Lane D QA And Docs.
5. Orchestrator integration patch for contracts, scripts, README, and verification.

## Integration Verification

Run after lane merges:

```bash
npm install
npm run typecheck
npm run build
git diff --check
rg -n "MongoDB|MONGODB|RunwayOps|runway_ops" .
```

Expected findings:

- `RunwayOps` may appear only in explicit boundary warnings, never as implementation source.
- MongoDB should not appear in runtime implementation.

Live AWS checks depend on available local AWS credentials. If unavailable locally, use dry-run scripts and verify production env in Vercel.

## Worker Handoff Requirements

Each worker must report:

- worktree path
- branch
- files changed
- commit hash if committed
- commands run
- passing/failing checks
- env/migration/package notes
- risks and integration instructions

