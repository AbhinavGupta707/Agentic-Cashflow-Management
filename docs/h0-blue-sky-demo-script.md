# H0 Blue Sky Demo Script

Date: 2026-06-29

Target length: under 3 minutes.

Product framing: blue-sky operating-system story, grounded in the current live
repo state. The demo should sell the full loop while showing the shipped proof:
Vercel app, Aurora-backed read model, Fireworks action preview, LangGraph
checkpoints, approval gates, and honest provider readiness.

## Setup Tabs

1. Product: `https://agentic-cashflow-management.vercel.app`
2. Optional proof fallback:
   `https://agentic-cashflow-management.vercel.app/api/product/actions/act_northstar_cfo_email`
3. Optional Devpost requirement proof assets:
   - architecture diagram
   - AWS Aurora usage screenshot
   - Vercel project link and Team ID

Before recording, reset the demo case if you have changed approval state. Keep
the Northstar action pending unless the recording intentionally shows approval.

## Demo Path

1. Start on Overview.
2. Open Forecasts.
3. Open Actions.
4. Select `Send payment-link reminder to Northstar`.
5. Show the Fireworks-generated draft/call preview, evidence, memory, and
   guardrails.
6. Open Agent Activity.
7. Briefly show Customers or Settings only if time remains.

## Main Script

**0:00-0:20 - Hook**

Hello everyone, my name is Abhinav, and this is RunwayOps: an agentic cashflow
operating system for small business finance teams.

H0 asks for front-end in minutes and back-end designed for scale. RunwayOps
applies that to a painful SMB workflow: a business can look profitable on paper
and still miss payroll when invoices, obligations, customer behavior, and
follow-up sit in separate tools.

**0:20-0:40 - Blue-Sky Product Thesis**

The blue-sky product is not another dashboard. It is one operating loop: finance
data comes in, Aurora becomes the source of truth, deterministic forecasting
finds the risk, agents recommend a recovery action, a human approves it, and the
outcome becomes memory for the next decision.

Let's see how it works.

**0:40-1:10 - Overview**

Here we are in the Vercel-deployed Next.js product. This demo case is Marlow &
Finch Studio with a payroll-week cash squeeze.

The overview is reading from Aurora PostgreSQL, not local UI state. It shows GBP
41,250 cash, GBP 38,000 payroll due, and a projected low point of negative GBP
6,350. But it does not stop at reporting the problem. It points to recoverable
cash: a GBP 18,600 Northstar reminder.

**1:10-1:35 - Forecasts And Architecture**

On Forecasts, the important technical point is that the model is not inventing
money. Aurora stores the cash accounts, invoices, obligations, forecast runs,
and forecast points. The cash math is deterministic and persisted.

The AI layer is load-bearing in a different place: explaining the risk, ranking
actions, drafting outreach, and turning outcomes into memory. The LLM explains
and drafts; the deterministic layer carries the money.

**1:35-2:20 - Actions**

Now I open Actions and select Northstar.

This is where RunwayOps becomes agentic. It has identified the customer, invoice
NS-1048, expected cash impact, and rationale. The detail view calls the live
action API and generates a Fireworks-backed preview: email draft, call script,
evidence, and guardrails.

The memory is the key product move. Northstar pays fastest when reminders
include a payment link and the final snagging list, so the agent is not writing
a generic collection email. It is using customer behavior stored in Aurora.

Autonomy is bounded. Nothing is sent just because the AI wrote a draft. Approval
is explicit, Gmail is connection-gated, and Twilio requires approval, live mode,
and a test number.

**2:20-2:45 - Agent Activity**

In Agent Activity, you can see the evidence: graph started, forecast snapshot,
recommendation plan, draft generated, and graph completed. This is the technical
implementation: Aurora as the primary data model, S3 for source provenance,
Vercel route handlers as the runtime, LangGraph for persisted orchestration, and
Fireworks for structured generation.

**2:45-3:00 - Close**

The original insight is that cash management should not be a passive BI report.
It should be an evidence-backed operating loop.

RunwayOps is a shippable B2B cashflow assistant: Vercel on the front end, Aurora
and S3 on the back end, deterministic finance for the numbers, agents for the
judgment work, human approval for external action, and memory after every
outcome.

## Shorter Emergency Version

Hello everyone, my name is Abhinav, and this is RunwayOps: an agentic cashflow
operating system for small business finance teams.

The problem is that cash risk is usually hidden across invoices, obligations,
customer history, and follow-up tools. RunwayOps turns that into one loop:
ingest the evidence, forecast the risk, recommend the recovery action, require
approval, execute only through gated providers, and learn from the outcome.

This Vercel app is reading the Marlow & Finch demo case from Aurora PostgreSQL.
The overview shows GBP 41,250 cash, a GBP 38,000 payroll obligation, a projected
low point of negative GBP 6,350, and the top recoverable action: GBP 18,600 from
Northstar.

The cash math is deterministic. Aurora stores invoices, obligations, forecasts,
actions, approvals, memory, provider logs, and agent checkpoints. Fireworks is
used where language and judgment help: explaining the action, drafting outreach,
and generating a call script.

When I open the Northstar action, the system shows invoice evidence, customer
memory, a Fireworks-generated preview, and guardrails. Nothing is sent just
because the AI generated text. Approval is explicit, Gmail is connection-gated,
and Twilio execution requires approval, live mode, and a test number.

Agent Activity shows the run evidence: forecast snapshot, recommendation plan,
draft generated, and graph completed. That is the H0 story: a designed product
surface on Vercel, with a deliberate Aurora data model underneath, built for a
real B2B cashflow workflow.

## Fallback Lines

- If Fireworks is slow: "Live generation can take a few seconds. The important
  product behavior is that the app shows a real provider preview when available
  and an honest deterministic fallback when it is not."
- If the seeded case date looks old: "This is a seeded payroll-week case. The
  scoring proof is that the forecast, actions, and evidence are read from
  Aurora, not a client-side script."
- If Gmail is unavailable: "For this recording, external email is intentionally
  gated. I am showing the approval and draft review path without fabricating a
  Gmail message ID."
- If Twilio is mentioned but not executed: "Twilio is configured, but live calls
  require an approved action, explicit live mode, and the configured test
  number. That prevents accidental calls during judging."

## Judging Criteria Map

- Technological Implementation: Aurora PostgreSQL is the primary backend for
  finance state, forecasts, actions, approvals, memory, checkpoints, audit, and
  provider logs. Vercel hosts the Next.js app and API route runtime. Fireworks,
  LangGraph, LangSmith readiness, S3 provenance, and Twilio gating demonstrate a
  deliberate full-stack architecture.
- Design: The product starts with the business workflow: current cash, runway
  risk, recoverable cash, action detail, approval, and evidence. Technical proof
  is moved to Agent Activity rather than cluttering the overview.
- Impact And Real-World Applicability: The target user is an SMB finance
  operator who needs to protect payroll and recover cash before obligations hit.
  The demo case shows a GBP 6,350 projected gap and a GBP 26,450 recovery plan.
- Originality: The product is not a chat wrapper or static dashboard. The
  original move is combining deterministic finance, customer memory, agentic
  recommendation, human approval, and provider outcome learning into one
  operating loop.

## Source Notes

- Official H0 page: `https://h01.devpost.com/`
- Required H0 submission assets: full-stack app, one of Aurora PostgreSQL,
  Aurora DSQL, or DynamoDB, Vercel or v0.app deployment, sub-3-minute demo
  video, AWS Database explanation, Vercel project link and Team ID,
  architecture diagram, and AWS Database usage screenshot.
- Official H0 judging criteria: Technological Implementation, Design, Impact
  and Real-world Applicability, and Originality.
- Current repo proof used for this script:
  - `docs/live-product-ui-agent-plan.md`
  - `docs/live-demo-runbook.md`
  - `docs/checkpoint-7-live-demo-workflow-status.md`
  - `docs/checkpoint-8-final-product-status.md`
  - `src/server/demo-data/cashflow-demo.ts`
