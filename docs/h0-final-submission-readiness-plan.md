# H0 Final Submission Readiness Plan

Date: 2026-06-29

Status: Planning complete. This document defines what must exist before
submission, independent of code completeness.

## Submission Goal

Position RunwayOps as a first-place contender for H0 by making the submission
look and feel like a shipped product:

- live public Vercel app
- Aurora PostgreSQL as the obvious operational backbone
- polished end-to-end demo video under 3 minutes
- visible agentic workflow with human approval and auditability
- proof assets that remove any ambiguity for AWS/Vercel judges

## Official Requirements Checklist

From the H0 Devpost page:

- full-stack application
- use Aurora PostgreSQL, Aurora DSQL, or DynamoDB
- deploy frontend on Vercel or v0.app
- text description naming the AWS Database used
- less than 3-minute demo video, YouTube preferred
- explain the AWS Database used in the submission
- published Vercel Project Link and Vercel Team ID
- architecture diagram showing application/backend components
- screenshot proving AWS Database usage
- public content piece about the build using the database and Vercel, with H0
  entry language and `#H0Hackathon`

Source: https://h01.devpost.com/

## Current Evidence Inventory

Already strong:

- Vercel production URL:
  `https://agentic-cashflow-management.vercel.app`
- Vercel project:
  `agentic-cashflow-management`
- Vercel project ID:
  `prj_9bmLuB7kt2BcOOOHzHtpaJajFrWb`
- Vercel Team ID:
  `team_GIT6RlxBXVjXuY0g9nIeypsQ`
- AWS database:
  Aurora PostgreSQL
- AWS region:
  `eu-west-2`
- Aurora cluster:
  `h0-hackathon-aurora-pg`
- Aurora database:
  `cash_management`
- S3 source asset bucket:
  `h0-cash-management-assets-222634407676-eu-west-2`
- Core product APIs:
  `/api/product/overview`, `/api/product/actions`,
  `/api/product/scenarios`, `/api/product/customers`,
  `/api/product/agent-activity`, `/api/product/voice/status`
- Provider/agent stack:
  Fireworks, LangGraph, LangSmith, Twilio, optional Gmail.

Still needed:

- final architecture diagram image
- AWS proof screenshot
- production browser QA evidence after final checkpoint
- sub-3-minute video script and recording
- public content draft and published link
- final Devpost copy package

## Judge-Facing Story

Opening claim:

```text
RunwayOps is an agentic cashflow operating system for SMB founders. It turns
invoices, obligations, customer behavior, and payment events into forecasted
cash risk, recommended recovery actions, human-approved execution, and learned
customer memory.
```

The important distinction:

```text
It is not a dashboard and not one hidden mega-prompt. Aurora stores the
operational truth. Deterministic finance logic computes the risk. LangGraph,
Fireworks, and LangSmith power the reasoning and traceability. Human approval
gates every outbound action. Twilio/Gmail execution is recorded only when real
providers return real IDs.
```

## Demo Video Spine

Target: 2:30 to 2:50.

### 0:00 to 0:20: Pain And Product

Use the previous RunwayOps script pattern:

```text
Late payments can turn a timing issue into a payroll crisis. RunwayOps is built
for that moment: it helps a founder understand cash risk, decide the highest
leverage recovery action, and execute safely with approval.
```

### 0:20 to 0:45: Overview

Show:

- current cash
- runway/risk
- payroll or major obligation
- recoverable cash
- recommended next action

Say:

```text
The numbers come from Aurora-backed financial state. The product is not asking
the model to invent cash. The model helps explain and prioritize what action
matters.
```

### 0:45 to 1:15: Live Intake Or Event

Show:

- upload sample pack or process a new event
- import/normalization status
- Overview/Forecast change

Say:

```text
This file or event is stored with S3 provenance and normalized into Aurora.
The event inbox makes the workflow replayable and idempotent.
```

### 1:15 to 1:45: Forecast And Recommendation

Show:

- forecast chart
- scenario comparison
- recommended action plan

Say:

```text
The forecast is deterministic. The agent layer retrieves customer history,
generates a recommendation, and stores checkpoints so the decision path is
auditable.
```

### 1:45 to 2:20: Action Approval And Execution

Show:

- selected action
- Fireworks draft/call script
- edit/approve
- optional safe Twilio call-to-self

Say:

```text
The agent can draft and prepare execution, but it cannot act silently. The
founder approves first. If I trigger the phone path, it can only call my
configured test number and records the real provider result.
```

### 2:20 to 2:50: Agent Activity And Close

Show:

- timeline: ingestion, forecast, Fireworks, approval, provider gate/execution,
  outcome learning
- architecture/proof briefly if needed

Say:

```text
Every step writes back to Aurora: source data, forecast, action, approval,
provider result, and learned memory. That is the zero-stack idea applied to a
real business workflow: fast frontend, deliberate database architecture, and a
product that could actually ship.
```

## Architecture Diagram Content

The diagram should show:

```text
User browser
  -> Vercel Next.js product UI
  -> Next.js API route handlers/server actions
  -> AWS IAM role / OIDC runtime identity
  -> Aurora PostgreSQL through RDS Data API
  -> S3 source file provenance
  -> LangGraph orchestration
  -> Fireworks structured generation/extraction
  -> LangSmith trace project
  -> Twilio/Gmail provider adapters
  -> Aurora audit, provider, memory, forecast, and event tables
```

Submission-safe labels:

- no secrets
- no raw ARNs if screenshot will be public and we decide to redact
- include table groups, not every table
- use Aurora PostgreSQL as the central data backbone

## Devpost Copy Draft Skeleton

### Elevator Pitch

```text
RunwayOps is an agentic cashflow operating system for SMB founders: ingest
financial data, forecast runway risk, recommend recovery actions, require human
approval, and learn from outcomes.
```

### Built With

```text
Next.js, Vercel, Aurora PostgreSQL, RDS Data API, AWS S3, AWS IAM/OIDC,
LangGraph, LangSmith, Fireworks AI, Twilio, TypeScript, Tailwind CSS
```

### Project Story Sections

- Inspiration
- What it does
- The AI factor
- Product architecture
- How Aurora PostgreSQL is used
- How Vercel is used
- Challenges
- Accomplishments
- What we learned
- What's next
- Safety, privacy, and approval boundaries

## Public Content Piece

Required by H0. Recommended format:

- LinkedIn article or dev.to post because it is quick to publish publicly.
- Title:
  `Building RunwayOps for H0: Agentic Cashflow Management on Vercel and Aurora PostgreSQL`
- Include:
  - "I created this piece of content for the purposes of entering the H0
    Hackathon."
  - `#H0Hackathon`
  - architecture diagram
  - short product walkthrough
  - why Aurora Data API matters for Vercel/serverless
  - human approval and provider safety boundaries

## Proof Assets To Capture

1. Vercel production project page showing deployed app.
2. Vercel project ID and Team ID.
3. AWS RDS/Aurora console showing the Aurora PostgreSQL cluster.
4. Optional Aurora query editor/Data API proof showing core table names or row
   counts with secrets hidden.
5. Product screenshot of Overview.
6. Product screenshot of Actions with generated preview and approval gate.
7. Product screenshot of Agent Activity timeline.
8. Optional LangSmith trace screenshot.
9. Optional Twilio call log screenshot after safe call-to-self.

## Submission Risks

- A stale or static-looking UI will hurt Design and Technological
  Implementation. CP8 must foreground live state changes.
- A missing public content piece is a hard submission gap.
- Fake provider success or fake provider IDs would damage trust. Keep gated
  states honest.
- Full Gmail OAuth is lower ROI than one safe Twilio live execution.
- If the demo video spends too much time explaining backend internals before
  showing the product, Design and Impact will feel weaker.

## Final Submission Gate

Do not submit until:

- production app is deployed and smoke-tested
- architecture diagram is complete
- AWS proof screenshot is captured
- Vercel Project Link and Team ID are ready
- public content link is live
- video is under 3 minutes
- Devpost copy is proofread
- final demo has been rehearsed from a clean reset

