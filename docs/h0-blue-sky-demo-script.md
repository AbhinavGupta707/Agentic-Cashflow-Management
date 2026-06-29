# H0 Demo Script

Date: 2026-06-29

Target length: under 3 minutes.

Framing: use the ambition and cadence of the earlier RunwayOps script, but
tailor the proof to H0. The judges should not need to infer the scoring case:
the narration names the problem, the user, the live workflow, the deliberate
Aurora architecture, the Vercel deployment, the full-stack design, the live
Twilio call, and the additionality beyond a dashboard.

## Setup Tabs

1. Product: `https://agentic-cashflow-management.vercel.app`
2. Action proof fallback:
   `https://agentic-cashflow-management.vercel.app/api/product/actions/act_ember_lane_call`
3. Submission proof assets:
   - architecture diagram
   - AWS Aurora usage screenshot
   - Vercel project link and Team ID

Before recording:

- Configure `TWILIO_TEST_TO_NUMBER` to your own phone number in the target
  environment.
- Keep the Ember Lane phone action pending unless the recording intentionally
  shows approval.
- If approval/call state has changed, reseed/reset the demo case first.

## Demo Path

1. Start on Overview.
2. Open Forecasts.
3. Open Actions.
4. Select `Call Ember Lane owner before lunch service`.
5. Show Fireworks-generated call script, customer memory, evidence, and
   guardrails.
6. Approve the action, then click `Place approved test call`.
7. Let your phone ring; do not answer.
8. Open Agent Activity.

## Best Main Script

**0:00-0:25 - Hook, User, And Impact**

Hello everyone, my name is Abhinav, and this is RunwayOps: an agentic cashflow
operating system for small business finance teams, built on Vercel and Amazon
Aurora PostgreSQL.

Globally, SMEs face a 5.7 trillion dollar finance gap. For a founder, that does
not feel abstract; it can be one late customer payment between making payroll
and a cash crisis.

The problem is that invoices, obligations, customer behavior, and follow-up all
sit in separate tools.

That is the gap RunwayOps is built for.

**0:25-0:42 - Product Thesis**

RunwayOps is not another cash dashboard. It is one operating loop: Aurora is the
source of truth, deterministic forecasting finds risk, multiple agents
coordinate the response, a human approves it, providers execute only when
allowed, and outcomes become memory.

Let's see how it works.

**0:42-1:02 - Overview And Design**

Here we are in the Vercel-deployed Next.js product, on the Marlow & Finch
payroll-risk case.

The overview reads from Aurora. It shows cash pressure, payroll risk,
recoverable cash, and the highest-impact actions. The design point is simple:
the founder sees what to do next, not raw finance tables.

**1:02-1:42 - Technological Implementation And Agents**

On Forecasts, the technical point is that the model is not inventing money.
Aurora is the operational backbone: finance state, forecasts, actions,
approvals, memory, provider logs, and agent checkpoints share one data model.

S3 stores provenance, and Vercel route handlers expose the APIs.
The cash math is deterministic. AI is load-bearing in a different place:
explaining risk, ranking actions, drafting outreach, and summarizing behavior.

Behind the scenes, four specialist agents collaborate. The Forecast Agent
recomputes runway from Aurora facts. The Memory Agent retrieves customer
behavior. The Collections Agent chooses email versus phone and drafts the
outreach. The Audit Agent records the evidence and checkpoints. The LLM
explains; the deterministic layer carries the money.

**1:42-2:25 - Agentic Action And Live Call**

Now I open Actions and select the Ember Lane phone action.

It has identified the customer, invoice EL-3310, cash impact, and rationale.
The live API generates a Fireworks-backed call script, evidence, and guardrails.

The additionality is memory. Ember Lane's owner is usually reachable before
lunch service and responds better to calls than email, so Aurora-stored behavior
is shaping the action.

Autonomy is bounded. Nothing happens just because the AI wrote a script. I can
approve the action, and in a second you will hear my phone ringing as RunwayOps
triggers an outbound call to the customer, which in this demo is me. I will not
pick up; the point is that a real provider action was triggered only after
approval and written back into Aurora.

**2:25-2:45 - Evidence And Shippedness**

In Agent Activity, you can see the evidence: finance pack imported, forecast
recomputed, recommendation ranked, draft generated, human approval recorded, and
outbound call initiated. If the call is completed, Twilio callbacks, transcript
state, and recorded outcomes write back into Aurora memory. This is why the
Vercel deployment goes beyond a static front end: screens, APIs, model calls,
approval state, provider execution, and audit trail share live state.

**2:45-3:00 - Close**

The original insight is that cash management should not be a passive BI report
or one hidden mega-prompt. It should be an evidence-backed operating loop.

RunwayOps is a shippable B2B cashflow assistant: Vercel on the front end,
Aurora and S3 on the back end, deterministic finance, agentic judgment, human
approval, live provider execution, and memory after every outcome.

## Shorter Emergency Version

Hello everyone, my name is Abhinav, and this is RunwayOps: an agentic cashflow
operating system for small business finance teams, built with Vercel and Amazon
Aurora PostgreSQL.

Globally, SMEs face a 5.7 trillion dollar finance gap. For a founder, that can
be one late customer payment between making payroll and a cash crisis. RunwayOps
is built for the moment when cash risk is split across invoices, obligations,
customer history, and follow-up tools.

This Vercel app reads the Marlow & Finch case from Aurora. The overview shows
cash pressure, payroll risk, recoverable cash, and recommended actions.

The cash math is deterministic. Aurora stores invoices, obligations, forecasts,
actions, approvals, memory, provider logs, and agent checkpoints. The Forecast,
Memory, Collections, and Audit agents coordinate the workflow, with Fireworks
used for explanation and drafting.

When I open the Ember Lane phone action, the system shows invoice evidence,
customer memory, a Fireworks-generated call script, and guardrails. I approve
the action, then trigger a live Twilio test call to my own configured number.
Here you can hear my phone ringing.

Agent Activity shows the run evidence: forecast snapshot, recommendation plan,
draft generated, graph completed, and provider execution. That is the story: a
designed product surface on Vercel, with a deliberate Aurora data model
underneath, built for a real B2B cashflow workflow.

## Fallback Lines

- If Fireworks is slow: "Live generation can take a few seconds. The important
  product behavior is that the app shows a real provider preview when available
  and an honest deterministic fallback when it is not."
- If the seeded case date looks old: "This is a seeded payroll-week case. The
  scoring proof is that the forecast, actions, and evidence are Aurora-backed."
- If Gmail is unavailable: "For this recording, external email is intentionally
  gated. I am showing the approval and draft review path without fabricating a
  Gmail message ID."
- If Twilio is mentioned but not executed: "Twilio is configured, but live calls
  require an approved action, explicit live mode, and the configured test
  number. That prevents accidental calls during judging."
- If the live call is blocked: "This is the guardrail working: the route will
  not call unless the approved action, live flag, Twilio credentials, and
  configured test number all match."

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
  finance operator. Use the global SME finance context, then show the concrete
  payroll-risk case, recommended actions, and live call-to-self execution.
- Originality And Additionality: Say the product is not a cash dashboard and not
  one hidden mega-prompt. The additionality is combining deterministic finance,
  customer memory, agentic recommendation, human approval, live provider
  guardrails, and audit evidence into one operating loop.

## Source Notes

- Official H0 page: `https://h01.devpost.com/`
- Required H0 submission assets: full-stack app, one of Aurora PostgreSQL,
  Aurora DSQL, or DynamoDB, Vercel or v0.app deployment, sub-3-minute demo
  video, AWS Database explanation, Vercel project link and Team ID,
  architecture diagram, and AWS Database usage screenshot.
- Official H0 judging criteria: Technological Implementation, Design, Impact
  and Real-world Applicability, and Originality.
- Global SME hook: the World Bank says SMEs represent around 90 percent of
  businesses, account for more than half of global employment, and face a
  US$5.7T finance gap across 119 emerging market and developing economies:
  `https://www.worldbank.org/en/topic/smefinance`
- Current repo proof used for this script:
  - `docs/live-product-ui-agent-plan.md`
  - `docs/live-demo-runbook.md`
  - `docs/checkpoint-7-live-demo-workflow-status.md`
  - `docs/checkpoint-8-final-product-status.md`
  - `src/server/demo-data/cashflow-demo.ts`
