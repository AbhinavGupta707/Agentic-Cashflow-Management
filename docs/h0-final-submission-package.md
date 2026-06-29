# H0 Final Submission Package

Date: 2026-06-29

Status: Draft package for final CP8 integration. Replace bracketed placeholders
with final links after production QA and recording.

## Elevator Pitch

```text
RunwayOps is an agentic cashflow operating system for SMB founders: it ingests
financial data, forecasts runway risk, recommends recovery actions, requires
human approval, executes safely, and learns from outcomes.
```

## Built With

```text
Next.js, Vercel, Aurora PostgreSQL, Amazon RDS Data API, Amazon S3, AWS IAM/OIDC,
LangGraph, LangSmith, Fireworks AI, Twilio, Gmail OAuth foundation, TypeScript,
Tailwind CSS
```

## Published Vercel Project Link

```text
https://agentic-cashflow-management.vercel.app
```

## Vercel Project And Team

```text
Project: agentic-cashflow-management
Project ID: prj_9bmLuB7kt2BcOOOHzHtpaJajFrWb
Vercel Team ID: team_GIT6RlxBXVjXuY0g9nIeypsQ
```

## AWS Database Used

```text
Aurora PostgreSQL
```

## How Aurora PostgreSQL Is Used

Aurora PostgreSQL is the operational backbone of RunwayOps, not a bolt-on data
store. It stores:

- source file provenance and import batches
- normalized cash accounts, invoices, obligations, and payments
- event inbox and append-style event ledger records
- forecast runs and daily forecast points
- action plans, recommended actions, and approval records
- communication drafts, provider execution attempts, and message/call outcomes
- voice calls, transcripts, and learned customer behavior facts
- agent runs, checkpoints, trace metadata, and audit log records
- `pgvector` memory chunks for customer behavior retrieval

The Vercel app talks to Aurora through the Amazon RDS Data API. That lets the
serverless product runtime run SQL against Aurora without managing persistent
database connections.

## Project Story

### Inspiration

Small businesses can be profitable on paper and still miss payroll because cash
risk is fragmented across invoices, obligations, customer history, and manual
follow-up. A spreadsheet can show the numbers, but it usually cannot tell a
founder which action protects runway today, why that action is likely to work,
and whether it is safe to execute.

RunwayOps is built for that moment. It turns cashflow management into an
evidence-backed operating loop.

### What It Does

RunwayOps helps an SMB founder or finance operator:

1. Upload or refresh finance data.
2. Store source provenance and normalized state in Aurora.
3. Forecast runway risk from deterministic financial facts.
4. Retrieve customer behavior memory.
5. Generate a ranked recovery plan and draft outreach with Fireworks.
6. Require human approval before any outbound conduct.
7. Execute only through gated providers.
8. Persist outcomes and learned memory for the next decision.

### The AI Factor

The LLM is not trusted to invent money. Cash, obligations, low points, runway,
and scenario math are deterministic calculations over Aurora data.

AI is used where language and judgment are load-bearing:

- explaining why a cash risk matters
- ranking recovery actions
- drafting email and call scripts
- classifying replies or call outcomes
- extracting customer behavior facts into memory
- making the agent timeline understandable to a business user

### Product Architecture

| Layer | What It Does | Why It Matters |
| --- | --- | --- |
| Vercel Next.js UI | Premium product cockpit for Overview, Forecasts, Actions, Customers, and Agent Activity | Judges can use the product directly, not inspect a console |
| Next.js API routes | Uploads, forecasts, action detail, approvals, provider readiness, activity | Keeps the full-stack workflow inside the deployed app |
| Aurora PostgreSQL | Primary operational state, audit, memory, forecasts, actions, provider logs | Demonstrates deliberate AWS database architecture |
| RDS Data API | Serverless-friendly SQL access from Vercel runtime | Avoids persistent connection management in the web runtime |
| Amazon S3 | Raw/source file provenance | Keeps uploads auditable and replayable |
| LangGraph | Durable agent orchestration/checkpoints | Makes the workflow inspectable and resumable |
| Fireworks AI | Structured reasoning, drafting, and extraction | Makes the agent useful without corrupting deterministic finance math |
| LangSmith | Trace readiness and observability | Shows how the agent can be debugged and evaluated |
| Twilio/Gmail | Approval-gated outbound channels | Turns insight into action without silent automation |

### How Vercel Is Used

Vercel hosts the public Next.js product and API route runtime. The deployed app
serves the customer-facing cockpit, action approval flows, product APIs, and
provider webhook endpoints. The architecture is designed so the front end and
back end are cohesive: every visible product surface is backed by a route or
repository contract rather than by a client-only demo state machine.

### Challenges

The hardest part was balancing agentic autonomy with financial safety. A cash
assistant should act, but it should not silently send messages or place calls.
RunwayOps solves that with explicit approval records, provider readiness states,
test-number guardrails, and audit logs.

Another challenge was making the backend sophistication legible. The final UI
keeps the main experience simple, while Agent Activity exposes the durable
evidence: events, forecast snapshots, checkpoints, drafts, approvals, provider
gates, and outcome memory.

### Accomplishments

- Built a full-stack Vercel app backed by Aurora PostgreSQL.
- Designed a relational cash management schema with source, finance, event,
  forecast, action, approval, communication, voice, memory, agent, and audit
  primitives.
- Wired S3 provenance and Aurora normalization paths.
- Built deterministic forecasting and scenario planning.
- Added Fireworks-backed recommendation/draft generation with honest fallback.
- Added approval-gated action workflows.
- Added Twilio-first voice readiness and guarded call execution path.
- Built a premium product cockpit rather than a proof dashboard.
- Created a final submission path with architecture, proof, QA, and demo assets.

### What We Learned

The strongest product boundary is also the strongest technical boundary: the
deterministic layer owns money, while the agentic layer owns explanation,
ranking, drafting, and learning. Aurora makes that boundary durable because the
facts, decisions, checkpoints, approvals, and outcomes all land in one
operational model.

### What's Next

- Connect real accounting and banking sources.
- Complete production Gmail OAuth onboarding for customer-owned mailboxes.
- Expand outcome learning across suppliers as well as customers.
- Add team accounts, permissions, and production billing.
- Add deeper evaluation dashboards over LangSmith traces and action outcomes.

## Safety, Privacy, And Boundaries

- RunwayOps is not a bank and does not move money.
- The app does not send emails or place calls without explicit approval.
- Provider IDs are only shown after real providers return them.
- Gmail is OAuth/connection-gated.
- Twilio live calls require approval, `live=true`, and a target matching
  `TWILIO_TEST_TO_NUMBER`.
- Demo data is seeded Aurora product data unless explicitly connected to live
  customer systems.
- Secrets belong in `.env.local` locally and Vercel environment variables in
  production, never in Git.

## Public Content Draft

Title:

```text
Building RunwayOps for H0: Agentic Cashflow Management on Vercel and Aurora PostgreSQL
```

Draft:

```markdown
I created this piece of content for the purposes of entering the H0 Hackathon.
#H0Hackathon

For H0, I built RunwayOps: an agentic cashflow operating system for SMB
founders.

The product starts from a simple problem: a business can look profitable on
paper and still miss payroll because invoices, obligations, customer behavior,
and follow-up live in separate tools.

RunwayOps turns that into one operating loop:

1. A user uploads or refreshes finance data.
2. Source provenance is stored in Amazon S3.
3. Normalized operational state is written to Aurora PostgreSQL.
4. Deterministic forecasting identifies cash risk and runway.
5. LangGraph coordinates the agent workflow and persists checkpoints.
6. Fireworks AI drafts and explains the recommended recovery action.
7. A human approves before any outbound action.
8. Twilio/Gmail providers execute only when configured and gated.
9. Outcomes write back to Aurora as audit, provider, and memory records.

The key architecture choice is that Aurora PostgreSQL is the source of truth:
cash accounts, invoices, obligations, events, forecasts, actions, approvals,
provider attempts, memory chunks, agent checkpoints, and audit records all live
in the database.

The Vercel app uses Next.js API routes and the Amazon RDS Data API so the
frontend and backend stay cohesive while still using production-grade data
infrastructure. The LLM does not invent financial totals; deterministic code
does the cash math, while Fireworks handles explanation, drafting, ranking, and
outcome extraction.

That is the H0 idea in product form: a fast, polished Vercel product on top of
a deliberate AWS database architecture that could actually become a shippable
B2B workflow.
```

Recommended publication targets:

- LinkedIn article
- dev.to post
- Medium post
- public YouTube description attached to the demo video

## Required Links To Fill Before Submission

```text
Demo video: [paste public YouTube link]
Public content: [paste public LinkedIn/dev.to/Medium/YouTube link]
Architecture diagram: docs/h0-architecture-diagram.md
AWS proof screenshot: [paste local path or uploaded asset link]
Production app: https://agentic-cashflow-management.vercel.app
Vercel Project Link: [paste Vercel project URL]
Vercel Team ID: team_GIT6RlxBXVjXuY0g9nIeypsQ
```
