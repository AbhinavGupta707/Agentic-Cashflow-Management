# H0 Full Functionality Orchestration Plan

Date: 2026-06-29

Canonical repo: `AbhinavGupta707/Agentic-Cashflow-Management`

Do not use any external legacy repository. This repository is the only project workspace.

## Product Goal

Build a production-capable agentic cash management platform for SMBs.

The live product loop:

1. User uploads invoices, customer data, obligations, PDFs, emails, and communication outcomes.
2. Aurora PostgreSQL stores source files, normalized financial state, events, approvals, provider logs, agent runs, memory, forecasts, and audit records.
3. The system forecasts cash shortages and identifies recoverable cash.
4. LangGraph orchestrates deterministic finance logic, retrieval, Fireworks structured reasoning, approval gates, execution, and learning.
5. Human approval is required before outbound conduct.
6. Approved outreach executes through Gmail/email and ElevenLabs/Twilio where configured.
7. Replies, payment events, and call transcripts write back to Aurora.
8. Fireworks extracts behaviour facts and embeds them into `pgvector`.
9. The UI shows the causal chain from source evidence to forecast to action to outcome.

## H0 Scoring Posture

Use Aurora PostgreSQL as the primary backend, not as a bolt-on. It should power:

- financial ledger and normalized rows
- event inbox and idempotency
- action queue and approval ledger
- communication and provider execution logs
- customer behaviour memory with `pgvector`
- agent runs and checkpoints
- immutable audit trail

Vercel should be used as the real full-stack runtime:

- Next.js App Router
- API route handlers
- Server Actions for approvals
- Vercel Cron for retries/processors
- Vercel OIDC into AWS
- deployment and env proof for submission

## Target Architecture

```text
Next.js on Vercel
  -> route handlers / server actions / cron
  -> Vercel OIDC assumes AWS runtime role
  -> RDS Data API
  -> Aurora PostgreSQL 17.7
  -> pgvector memory
  -> S3 source files/artifacts
  -> Fireworks / LangSmith / Gmail / ElevenLabs
```

## Established Infrastructure

```text
AWS account ID: 222634407676
AWS region: eu-west-2
Aurora cluster ARN: arn:aws:rds:eu-west-2:222634407676:cluster:h0-hackathon-aurora-pg
Aurora database: cash_management
Aurora app secret: h0/cash-management/rds/app-user
S3 bucket: h0-cash-management-assets-222634407676-eu-west-2
Vercel project: agentic-cashflow-management
Vercel project ID: prj_9bmLuB7kt2BcOOOHzHtpaJajFrWb
Vercel org ID: team_GIT6RlxBXVjXuY0g9nIeypsQ
AWS runtime role ARN: arn:aws:iam::222634407676:role/h0-cash-management-vercel-runtime-role
```

## Checkpoint Strategy

Run sequential checkpoints. Within each checkpoint, use 2 to 4 parallel lanes. Do not launch future checkpoints until the current checkpoint is merged, reviewed, verified, and documented.

## Codex Worktree Routing

Use native Codex-managed worktree sessions for checkpoint lanes when possible. The repository lives under a parent folder that is also visible in the Codex project list, so creating ordinary project threads from the parent `Cash Management` project can produce sidebar sessions without the worktree marker.

For checkpoint 2 and later:

1. Start from an existing thread whose `cwd` is exactly:

   ```text
   /Users/abhinavgupta/Desktop/H0 AWS Hack/Cash Management /Agentic-Cashflow-Management
   ```

2. Fork that thread with `environment: { type: "worktree" }`.
3. Rename the child thread to the lane name.
4. Send the lane prompt to the child thread.
5. Verify the child thread `cwd` starts with:

   ```text
   /Users/abhinavgupta/.codex/worktrees/
   ```

6. Verify `git remote -v` points only to:

   ```text
   https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git
   ```

7. Leave worker threads unpinned.
8. Do not create recurring Codex automations or extra "orchestrator" sessions
   for polling. This master thread owns status checks, merges, verification, and
   cleanup; worker sessions exist only for concrete task lanes and should be
   archived after verified merge.

Route verification completed on 2026-06-29:

```text
Source exact-root thread: 019f10a4-ebad-79a1-aa27-c9f96d86caf8
Verification worktree thread: 019f10d2-3645-7ed3-9814-1bc552776d5f
Verification worktree path: /Users/abhinavgupta/.codex/worktrees/5d35/Agentic-Cashflow-Management
Verified commit: 6cfa79c fix: support live rds data api seed parameters
```

### Checkpoint 0: Setup And Repository Boundary

Outcome:

- Canonical repo is `Agentic-Cashflow-Management`.
- External legacy repositories are not used.
- Vercel project exists and local folder is linked.
- AWS Aurora/S3/database setup is verified.
- OIDC role is created, production-scoped, attached to the runtime policy, and wired into Vercel production.

Verification:

- `git status --short --branch`
- `.vercel/project.json` exists locally and is ignored
- docs/checkpoint-0-setup.md is current
- `vercel env list production` shows encrypted AWS runtime variables

Non-goals:

- No product app implementation.
- No changes outside this repository.

### Checkpoint 1: App Scaffold, Aurora Foundation, And Data Model

User-facing outcome:

- A fresh Next.js app exists in this repo.
- App can read seeded sample company/case state from Aurora PostgreSQL through RDS Data API.
- Schema includes source, finance, event, action, memory, agent, audit, and communication primitives.

Lanes:

1. App Scaffold Lane
   - Owns: package setup, Next.js app shell, TypeScript, lint/typecheck/build scripts, base UI structure.
   - Must use this repo only.
   - Must configure Vercel-compatible build scripts.

2. Backend Schema Lane
   - Owns: `db/**`, migrations, SQL schema, env validation.
   - Include `vector(1024)` memory table and indexes.
   - Include idempotency constraints and approval/action state checks.
   - Data API client must retry `DatabaseResumingException`.

3. Seed/Repository Lane
   - Owns: seed scripts and typed repository functions.
   - Seed source files, customers, contacts, invoices, obligations, events, initial forecast, actions, memory chunks.
   - Read sample state from Aurora, not fixtures.

4. QA/Docs Lane
   - Owns: README setup, env docs, checkpoint status, smoke scripts.
   - Document migration/seed/run commands and no-key states.

Verification:

- `npm install`
- `npm run typecheck`
- `npm run build`
- migration dry run or live migration through Data API
- seed smoke against Aurora where credentials are available
- no MongoDB dependency in target code

Non-goals:

- Gmail OAuth implementation.
- Voice execution.
- Full cockpit UX polish.
- Live Fireworks reasoning beyond schema placeholders.

### Checkpoint 2: Live Ingestion And Event Inbox

Status: complete, merged, and live-Aurora/S3 verified.

- Implement CSV/manual/PDF upload routes.
- Store files in S3 and provenance in Aurora.
- Normalize invoices, obligations, customers, and payment events.
- Build event inbox with idempotent processing states.

### Checkpoint 3: Live Forecasting, LangGraph, Fireworks, LangSmith

Status: complete, merged, and live-Aurora verified without requiring optional
Fireworks or LangSmith keys.

- Implement deterministic forecast engine.
- Wire LangGraph orchestration and persisted runs/checkpoints.
- Use Fireworks for structured extraction/drafting.
- Emit LangSmith traces.

### Checkpoint 4: Approval-Gated Email And Gmail

Status: complete enough for the current H0 demo path, with Gmail live send
remaining intentionally optional/gated.

- Gmail OAuth.
- Draft/send actions only after approval.
- Store communications, provider IDs, replies, and outcomes.

### Checkpoint 5: Voice Execution And Outcome Learning

Status: integrated with Twilio-first execution readiness, approval/test-target
guardrails, and safe no-key behavior. ElevenLabs remains optional unless
explicitly enabled and verified.

- Approval-gated ElevenLabs/Twilio calls.
- Store call metadata and transcripts safely.
- Extract memory facts from transcripts.

### Checkpoint 6: Live Product Cockpit

Status: integrated as a polished product shell backed by `/api/product/*`
routes, but not yet fully wired as an end-to-end clickable demo workflow.

- Reference-style Overview, Actions, Customers, Forecasts, Agent Activity, and
  Settings screens.
- Aurora-backed product APIs.
- Provider readiness surfaces.
- Browser QA against production.

### Checkpoint 7: Live Demo Workflow Integration

Status: complete, merged, browser-QA verified locally, and deployed to
production.

This checkpoint closes the current gap between backend capability and
judge-facing product interaction:

- fetch selected action detail and show Fireworks-generated previews
- wire approve, edit, and reject controls
- remove hardcoded stale forecast dates
- make Agent Activity show persisted timeline evidence
- add a clearer Overview risk narrative
- update demo/runbook evidence after browser QA

### Checkpoint 8: Final Product And Submission Readiness

Status: planned in `docs/checkpoint-8-final-product-orchestration.md` and
`docs/h0-final-submission-readiness-plan.md`.

This is the last product checkpoint. It should turn the live cockpit into a
first-place-contender submission by proving one complete end-to-end loop:

- upload/import sample financial data through real routes
- store provenance in S3 and operational state in Aurora PostgreSQL
- process events through the inbox
- recompute deterministic forecast and agent recommendation
- generate Fireworks-backed draft/call script
- require human approval
- execute exactly one safe provider action when explicitly configured
- persist provider/audit/memory outcomes
- produce architecture, demo, and Devpost submission assets

Checkpoint 8 absorbs the old production-hardening and submission checkpoints so
there is a single final end-state product pass.

## Worker Prompt Template

```text
You are the <checkpoint> <lane> implementation lane for Agentic Cashflow Management.

Read first:
- AGENTS.md
- docs/checkpoint-0-setup.md
- docs/h0-full-functionality-orchestration-plan.md
- Parent product spec if explicitly provided by the user as product context only

Important boundary:
- Do not use or modify any external legacy repository.
- Work only in AbhinavGupta707/Agentic-Cashflow-Management.

Goal:
<specific lane outcome>

Ownership:
- You may edit: <paths>
- Avoid/coordinate: <shared paths>
- Do not edit: <paths>

Verification:
- Run: <commands>
- If unavailable, explain why and run the nearest safe check.

Handoff:
Report files changed, commands run, tests passing/failing, env/migration notes, risks, and integration instructions.
```
