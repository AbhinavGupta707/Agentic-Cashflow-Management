# H0 Blue Sky Demo Script

Date: 2026-06-29

Target length: under 3 minutes.

Framing: use the ambition and cadence of the earlier RunwayOps script, but
tailor the proof to H0. The judges should not need to infer the scoring case:
the narration names the problem, the user, the live workflow, the deliberate
Aurora architecture, the Vercel deployment, the full-stack design, and the
additionality beyond a dashboard.

## Setup Tabs

1. Product: `https://agentic-cashflow-management.vercel.app`
2. Action proof fallback:
   `https://agentic-cashflow-management.vercel.app/api/product/actions/act_northstar_cfo_email`
3. Submission proof assets:
   - architecture diagram
   - AWS Aurora usage screenshot
   - Vercel project link and Team ID

Before recording, keep the Northstar action in a pending state unless the video
intentionally shows approval. If approval state has changed, reseed/reset the
demo case first.

## Demo Path

1. Start on Overview.
2. Open Forecasts.
3. Open Actions.
4. Select `Send payment-link reminder to Northstar`.
5. Show Fireworks-generated email/call preview, customer memory, evidence, and
   guardrails.
6. Open Agent Activity.
7. Show Customers or Settings only if time remains.

## Best Main Script

**0:00-0:25 - Hook, User, And Impact**

Hello everyone, my name is Abhinav, and this is RunwayOps: an agentic cashflow
operating system for small business finance teams, built for H0 on Vercel and
Amazon Aurora PostgreSQL.

Late payments cost the UK economy almost GBP 11 billion a year and are linked
to around 38 business closures every day. That is the risk here: profitable on
paper, but unable to meet payroll because invoices, obligations, customer
behavior, and follow-up sit in separate tools.

**0:25-0:45 - Blue-Sky Thesis**

The blue-sky product is not another cash dashboard. It is one operating loop:
data comes in, Aurora becomes the source of truth, deterministic forecasting
finds the risk, agents recommend action, a human approves it, and outcomes
become memory for the next decision.

That is the gap RunwayOps is built for. Let's see how it works.

**0:45-1:10 - Overview And Design**

Here we are in the Vercel-deployed Next.js product. This case is Marlow & Finch
Studio with a payroll-week cash squeeze.

The overview reads from Aurora, not client-side demo state. It shows GBP 41,250
cash, GBP 38,000 payroll due, and a projected low point of negative GBP 6,350.
The design is not asking the founder to interpret raw tables. It translates the
back end into the next decision: recover GBP 18,600 from Northstar.

**1:10-1:45 - Technological Implementation**

On Forecasts, the important H0 technical point is that the model is not
inventing money. Aurora is deliberately integrated as the operational backbone:
finance state, forecasts, actions, approvals, memory, provider logs, and agent
checkpoints share one data model.

S3 stores source provenance, and Vercel route handlers expose the product APIs.
The cash math is deterministic. AI is load-bearing in a different place:
explaining risk, ranking actions, drafting outreach, and summarizing customer
behavior. The LLM explains and drafts; the deterministic layer carries the
money.

**1:45-2:25 - Agentic Action**

Now I open Actions and select Northstar.

This is where RunwayOps becomes agentic. It has identified the customer, invoice
NS-1048, cash impact, and rationale. The detail view calls the live API and
generates a Fireworks-backed email draft, call script, evidence, and guardrails.

The additionality is the memory. Northstar pays fastest when reminders include a
payment link and the final snagging list, so this is not a generic collection
email. It is Aurora-stored behavior shaping the next action.

Autonomy is bounded. Nothing is sent just because the AI wrote a draft. Approval
is explicit, Gmail is connection-gated, and Twilio requires approval, live mode,
and a test number.

**2:25-2:45 - Evidence And Shippedness**

In Agent Activity, you can see the evidence: graph started, forecast snapshot,
recommendation plan, draft generated, and graph completed. This is why the
Vercel deployment goes beyond a static front end: screens, APIs, model calls,
approval state, and audit trail share live product state.

**2:45-3:00 - Close**

The original insight is that cash management should not be a passive BI report
or one hidden mega-prompt. It should be an evidence-backed operating loop.

RunwayOps is a shippable B2B cashflow assistant: Vercel on the front end, Aurora
and S3 on the back end, deterministic finance for numbers, agents for judgment,
human approval for action, and memory after every outcome.

## Shorter Emergency Version

Hello everyone, my name is Abhinav, and this is RunwayOps: an agentic cashflow
operating system for small business finance teams, built with Vercel and Amazon
Aurora PostgreSQL for H0.

Late payments cost the UK economy almost GBP 11 billion a year and are linked to
around 38 business closures every day. The problem is that cash risk is usually
split across invoices, obligations, customer history, and follow-up tools.
RunwayOps turns that into one operating loop: ingest evidence, forecast risk,
recommend recovery action, require approval, execute only through gated
providers, and learn from the outcome.

This Vercel app is reading the Marlow & Finch case from Aurora. The overview
shows GBP 41,250 cash, a GBP 38,000 payroll obligation, a projected low point of
negative GBP 6,350, and the top recoverable action: GBP 18,600 from Northstar.

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

- Technological Implementation: Say "Aurora is deliberately integrated as the
  operational backbone" and point out the shared data model for finance state,
  events, forecasts, actions, approvals, memory, provider logs, and checkpoints.
  This directly addresses H0's software craftsmanship, AWS Database, and
  architecture criterion.
- Design: Show that the UI is designed around the founder's next decision, not
  around raw infrastructure. Overview, Forecasts, Actions, and Agent Activity
  make the front end visibly reflect back-end state.
- Impact And Real-World Applicability: Name the target user as an SMB founder or
  finance operator. Use the late-payment stat, then show the concrete
  payroll-risk case with a GBP 6,350 projected gap and GBP 26,450 recovery plan.
- Originality And Additionality: Say the product is not a cash dashboard and not
  one hidden mega-prompt. The additionality is combining deterministic finance,
  customer memory, agentic recommendation, human approval, provider guardrails,
  and audit evidence into one operating loop.

## Source Notes

- Official H0 page: `https://h01.devpost.com/`
- Required H0 submission assets: full-stack app, one of Aurora PostgreSQL,
  Aurora DSQL, or DynamoDB, Vercel or v0.app deployment, sub-3-minute demo
  video, AWS Database explanation, Vercel project link and Team ID,
  architecture diagram, and AWS Database usage screenshot.
- Official H0 judging criteria: Technological Implementation, Design, Impact
  and Real-world Applicability, and Originality.
- Late-payment hook: the GBP 11 billion and 38-closures-per-day figures are
  reported in UK late-payment coverage citing government research, including
  The Guardian's July 2025 coverage:
  `https://www.theguardian.com/business/2025/jul/30/labour-firms-penalised-late-payments-suppliers`
- Current repo proof used for this script:
  - `docs/live-product-ui-agent-plan.md`
  - `docs/live-demo-runbook.md`
  - `docs/checkpoint-7-live-demo-workflow-status.md`
  - `docs/checkpoint-8-final-product-status.md`
  - `src/server/demo-data/cashflow-demo.ts`
