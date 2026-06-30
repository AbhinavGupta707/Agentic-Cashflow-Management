# RunwayOps Devpost Submission Draft

Date: 2026-06-30

Purpose: paste-ready Devpost copy for the H0 Hackathon submission.

Primary project URL:

```text
https://agentic-cashflow-management.vercel.app
```

Canonical repository:

```text
https://github.com/AbhinavGupta707/Agentic-Cashflow-Management
```

## H0 Alignment Map

Official H0 source: `https://h01.devpost.com/`

| H0 Requirement / Criterion | RunwayOps Evidence | Where To Emphasize |
| --- | --- | --- |
| Full-stack application | Vercel-hosted Next.js product plus API routes for overview, actions, customers, forecasts, activity, intake, uploads, voice readiness, and provider webhooks | Project story, demo path, architecture |
| AWS Database requirement | Aurora PostgreSQL is the primary operational database; Vercel accesses it through the Amazon RDS Data API | Title, opening, architecture, AWS Database field |
| Vercel deployment | Public production URL plus Vercel project and Team IDs | Links checklist and "How I built it" |
| Architecture diagram | Repo-native architecture diagram showing browser, Vercel, API routes, RDS Data API, Aurora, S3, LangGraph, Fireworks, LangSmith, Twilio, and Gmail | Assets, project story, video proof |
| AWS Database screenshot | Needed before final submission: RDS/Aurora screenshot proving the `h0-hackathon-aurora-pg` cluster and `cash_management` database usage | Submission assets checklist |
| Demo video under 3 minutes | Demo script and runbook exist; recommended path: Overview -> Forecasts -> Actions -> approval -> Agent Activity | Demo video field |
| Public content piece with H0 language | Draft exists in final submission package; publish to LinkedIn/dev.to/Medium/YouTube description with `#H0Hackathon` | Links checklist |
| Technical Implementation, 25% | Aurora schema, RDS Data API, S3 provenance, LangGraph checkpoints, Fireworks generation, provider gates, test/smoke suite | Architecture and "How I built it" |
| Design, 25% | Premium product cockpit modeled around founder decisions: Overview, Forecasts, Actions, Customers, Agent Activity | "What it does" and screenshots |
| Impact and Real-world Applicability, 25% | SMB cashflow/payroll risk, late payments, receivables recovery, approval-gated execution, learned customer behavior | Inspiration and product promise |
| Originality, 25% | Not a passive dashboard or one mega-prompt; combines deterministic finance, agentic judgment, human approval, provider execution, and memory | Opening, AI factor, accomplishments |

## Recommended Submission Title

```text
RunwayOps: Agentic Cashflow Management on Vercel and Aurora PostgreSQL
```

## Elevator Pitch

```text
RunwayOps helps SMB founders turn invoices, obligations, and customer history into runway forecasts, approved recovery actions, and learned cashflow memory.
```

Character count: 157.

## Built With

```text
Next.js, React, TypeScript, Tailwind CSS, Vercel, Aurora PostgreSQL, Amazon RDS Data API, Amazon S3, AWS IAM/OIDC, LangGraph, LangSmith, Fireworks AI, Twilio, Gmail OAuth foundation
```

## Public Links

```text
Try it out: https://agentic-cashflow-management.vercel.app
Source code: https://github.com/AbhinavGupta707/Agentic-Cashflow-Management
Demo video: [PASTE YOUTUBE LINK]
Public content: [PASTE LINKEDIN/DEV.TO/MEDIUM/YOUTUBE DESCRIPTION LINK]
Vercel project: [PASTE VERCEL PROJECT URL]
Vercel Team ID: team_GIT6RlxBXVjXuY0g9nIeypsQ
```

## AWS Database Used

```text
Aurora PostgreSQL
```

## How I Used Aurora PostgreSQL

```markdown
Aurora PostgreSQL is the operational backbone of RunwayOps. It is not just a reporting store.

The database stores source provenance, normalized cash accounts, invoices, obligations, payments, event inbox rows, forecast runs, daily forecast points, action plans, recommended actions, approval records, communication drafts, provider execution attempts, voice calls, transcripts, learned customer memory, agent runs, checkpoints, trace metadata, and audit logs.

The Vercel runtime reaches Aurora through the Amazon RDS Data API. That lets the deployed Next.js app run serverless API routes without managing long-lived database connections. Aurora is also what makes the product safe: money calculations, approvals, provider state, and learned memory all land in one durable model instead of being hidden in prompts or browser state.
```

## Main Devpost Project Story

```markdown
# RunwayOps

**RunwayOps is an agentic cashflow operating system for small business founders: it turns messy finance state into runway risk, ranked recovery actions, human-approved execution, and learned customer memory.**

## Inspiration

Small businesses do not usually fail because a dashboard was missing. They fail because the warning signs are scattered: invoices in one place, payroll obligations somewhere else, customer behavior in someone’s head, and follow-up living in email threads or phone calls.

For a founder, that fragmentation can become brutally concrete: one late customer payment can be the difference between making payroll and entering a cash crisis.

I built RunwayOps for that moment. The goal was not to create another cash dashboard. The goal was to create an operating loop: read the source evidence, forecast the risk, recommend the highest-leverage action, require human approval, execute safely, and learn from the outcome.

## What It Does

RunwayOps gives an SMB founder or finance operator a single place to manage cash risk from evidence to action.

A user can:

1. Open the Vercel-deployed product cockpit.
2. Review current cash, low point, payroll pressure, and recoverable cash.
3. Inspect deterministic forecast scenarios built from Aurora-backed finance facts.
4. See ranked collection actions tied to specific customers, invoices, memory, and cash impact.
5. Review an AI-generated email draft or call script with the evidence behind it.
6. Approve, edit, or reject the action before anything leaves the system.
7. See the workflow recorded in Agent Activity: finance import, forecast recomputation, recommendation, draft generation, human approval, provider gate, and outcome memory.
8. Reuse learned customer behavior in future recommendations.

The product is designed so the founder sees what to do next, not a wall of finance tables. The backend remains deep, but the user-facing experience is intentionally simple: what is the risk, why does it matter, what action changes it, and what has been approved?

## Why It Is Agentic

The AI is not a chatbot bolted onto a cash dashboard.

RunwayOps separates deterministic finance from agentic judgment:

- **Deterministic layer:** cash balances, obligations, invoice timing, low points, runway, scenario math, approval state, and provider state are computed or read from Aurora facts.
- **Agentic layer:** Fireworks-powered reasoning explains the risk, ranks actions, drafts outreach, turns customer behavior into memory, and makes the workflow understandable to a business user.
- **Orchestration layer:** LangGraph coordinates the forecast, memory, collections, and audit steps while persisting checkpoints.
- **Control layer:** a human must approve before outbound conduct. The system does not silently send an email or place a call just because the AI wrote good copy.

The most important boundary is this: the model explains and prepares action, but Aurora carries the money, approval, audit, and memory state.

## Product Architecture

| Layer | What It Does | Why It Matters |
| --- | --- | --- |
| **Vercel + Next.js** | Hosts the public product UI and API route runtime | Judges can open and use the product directly |
| **Product cockpit** | Overview, Forecasts, Actions, Customers, Agent Activity, Settings | Makes a complex cashflow workflow feel like a real finance product |
| **Next.js API routes** | Expose product state, intake, actions, approvals, scenarios, activity, voice status, and provider webhooks | Keeps the deployed app full-stack rather than front-end-only |
| **Aurora PostgreSQL** | Source of truth for finance state, forecasts, actions, approvals, providers, memory, checkpoints, and audit logs | Satisfies the AWS Database requirement and makes the agent workflow durable |
| **Amazon RDS Data API** | Lets the Vercel serverless runtime query Aurora safely | Avoids long-lived database connections from the web runtime |
| **Amazon S3** | Stores source file provenance for uploaded finance packs | Makes the intake path auditable and replayable |
| **LangGraph** | Coordinates durable agent runs and checkpoints | Turns the workflow into an inspectable agent process |
| **Fireworks AI** | Generates structured recommendations, email drafts, call scripts, explanations, and memory extraction | Makes AI load-bearing without letting it invent financial totals |
| **LangSmith** | Provides trace readiness for agent runs | Makes the agent layer debuggable and evaluable |
| **Twilio/Gmail provider layer** | Supports approval-gated outbound channels and provider state | Turns insight into action while preserving human control |

## How I Built It

**Frontend:** I built a polished Next.js product cockpit on Vercel with a dark, premium finance-product interface. The main screens are Overview, Forecasts, Actions, Customers, Agent Activity, and Settings.

**Backend:** I built Next.js API routes for product overview, actions, action detail, approvals, draft editing, scenario previews, customers, agent activity, demo intake, uploads, voice status, TwiML, and provider webhooks.

**Database:** I used Aurora PostgreSQL as the primary backend. The schema covers cash accounts, customers, contacts, invoices, obligations, payments, source files, event inbox rows, event ledger rows, forecast runs, forecast points, action plans, actions, approval records, communication drafts, provider executions, voice calls, transcripts, memory chunks, agent runs, agent checkpoints, trace metadata, and audit logs.

**AWS integration:** I used the Amazon RDS Data API from the Vercel runtime and S3 for source-file provenance. The product is designed around serverless web execution without losing relational durability.

**AI and agents:** I used LangGraph for orchestration/checkpoints, Fireworks AI for structured reasoning and draft/call-script generation, and LangSmith readiness for traceability.

**Execution and guardrails:** I built approval-gated action flows so the user can review, edit, approve, or reject actions. Provider surfaces are explicit: RunwayOps only shows provider outcomes when the backend has provider evidence.

**QA and shippedness:** I added checkpoint contract scripts and smoke tests across ingestion, forecasting, approvals, Gmail no-key behavior, voice no-key behavior, product routes, and final submission readiness.

## The Core Workflow

1. **Intake:** finance evidence is uploaded or refreshed; source provenance is stored through S3/Aurora.
2. **Normalize:** invoices, obligations, payments, customers, and events become operational state in Aurora.
3. **Forecast:** deterministic code computes cash risk, low points, and scenario projections.
4. **Recommend:** agents retrieve customer behavior and rank actions by cash impact, timing, and likelihood.
5. **Draft:** Fireworks generates reviewable outreach or call scripts with rationale and guardrails.
6. **Approve:** the founder approves, edits, or rejects the recommendation.
7. **Execute:** provider execution is gated and recorded only when approved/configured.
8. **Learn:** outcomes become customer memory that improves the next recommendation.

## Challenges I Ran Into

**Balancing autonomy and safety.** A cashflow agent should be able to act, but not silently. The solution was to make approval a first-class data model: recommendations can be generated automatically, but outbound conduct is approval-gated and auditable.

**Keeping financial math trustworthy.** I did not want an LLM inventing cash numbers. The solution was to keep the cash math deterministic and use AI for explanation, ranking, drafting, and memory extraction.

**Making infrastructure legible.** The backend has Aurora, S3, LangGraph, provider gates, and audit records, but the user should not have to think about that. The UI surfaces only what matters: risk, action, evidence, approval, and memory.

**Building for real deployment constraints.** Vercel serverless runtimes and relational databases need careful connection design. The RDS Data API made Aurora usable as the operational backbone without managing persistent database connections.

## Accomplishments I Am Proud Of

- Built and deployed a full-stack Vercel product with Aurora PostgreSQL as the primary backend.
- Designed a cash-management data model that spans finance state, events, forecasts, actions, approvals, communications, voice, memory, agents, and audit.
- Built a product UI that feels like a real customer-facing SaaS cockpit rather than a proof dashboard.
- Connected deterministic forecasting with agentic recommendation and human approval.
- Added S3 provenance, event inbox processing, forecast/action refresh, and agent checkpoint evidence.
- Added Fireworks-backed action reasoning and draft/call-script generation.
- Added provider readiness, Twilio/Gmail execution surfaces, and strict approval boundaries.
- Created a judge-reproducible demo path with public URL, architecture docs, QA checklists, and submission assets.

## What I Learned

The biggest lesson was that agentic finance products need a sharp boundary. AI is powerful when it explains, drafts, ranks, and remembers. It is dangerous if it becomes the source of financial truth.

RunwayOps is stronger because Aurora owns the facts, approvals, provider state, and memory. The agent layer becomes useful precisely because it is constrained by durable data and human approval.

I also learned that design matters as much as architecture in a product like this. The backend can be sophisticated, but the founder needs a simple answer: what is the risk, what should I do, and what has the system already learned?

## What Is Next

- Connect live accounting and banking sources.
- Add production team accounts, roles, and permissions.
- Expand Gmail OAuth onboarding for customer-owned mailboxes.
- Add richer outcome analytics over provider actions and customer memory.
- Add deeper LangSmith evaluation dashboards for agent quality.
- Expand from receivables recovery into supplier negotiation, financing options, and rolling cash planning.

## Safety, Privacy, and Boundaries

RunwayOps is not a bank and does not move money. It does not silently send emails or place calls. Outbound actions are approval-gated, provider-gated, and auditable. Secrets are kept out of Git and belong in local or Vercel environment variables. Provider IDs and outcomes should only be shown when backed by real provider state.
```

## Short "Inspiration" Field

```markdown
I built RunwayOps around a simple founder pain: a business can look profitable on paper and still miss payroll because cash is trapped in late invoices, obligations, customer behavior, and manual follow-up.

Most cash tools stop at dashboards. I wanted an operating loop: read the evidence, forecast risk, recommend the next action, require human approval, execute safely, and learn from the result.
```

## Short "What It Does" Field

```markdown
RunwayOps is an agentic cashflow operating system for SMB founders.

It ingests finance evidence, stores provenance, normalizes operational state in Aurora PostgreSQL, forecasts runway risk, ranks recovery actions, generates reviewable outreach, requires human approval, and records outcomes as customer memory.

The judge-facing workflow is simple: open the app, review the cash risk, inspect the forecast, approve the recommended action, and open Agent Activity to see the evidence trail.
```

## Short "How I Built It" Field

```markdown
I built RunwayOps as a Vercel-deployed Next.js full-stack app with Aurora PostgreSQL as the primary backend.

The frontend is a polished finance cockpit. The backend uses Next.js API routes, the Amazon RDS Data API, S3 provenance, LangGraph checkpoints, Fireworks AI generation, LangSmith trace readiness, and approval-gated provider adapters for voice/email execution.

The core design choice is that deterministic finance logic owns the money, while AI owns explanation, ranking, drafting, and memory extraction.
```

## Short "Challenges" Field

```markdown
The hardest challenge was making the product agentic without making it unsafe.

A cashflow assistant should recommend and prepare action, but it should not silently contact customers or invent financial totals. I solved that by separating deterministic finance from AI reasoning and making approvals, provider state, memory, and audit logs first-class Aurora records.
```

## Short "Accomplishments" Field

```markdown
I am proud that RunwayOps feels like a real product, not a command dashboard. A judge can open the deployed app, see cash risk, inspect scenario forecasts, review a generated call script, approve an action, and see a recent agent timeline.

Technically, I am proud of the Aurora-backed operating model: finance facts, events, forecasts, actions, approvals, provider state, memory, checkpoints, and audit all share one source of truth.
```

## Short "What I Learned" Field

```markdown
I learned that the most important design decision in agentic finance is the boundary between trust and judgment.

The LLM should not be the source of cash truth. It should explain, prioritize, draft, and learn from outcomes. Aurora makes that boundary durable because facts, decisions, approvals, and memory are all persisted outside the prompt.
```

## Short "What's Next" Field

```markdown
Next I would connect real accounting and banking sources, add production team permissions, complete customer-owned Gmail OAuth onboarding, deepen LangSmith evaluation dashboards, and expand the agent loop into supplier negotiation, financing recommendations, and rolling cash planning.
```

## Architecture Diagram For Devpost / README

Devpost may not render Mermaid directly, so use this as source for an uploaded diagram image or GitHub README section.

```mermaid
flowchart LR
  founder["SMB founder / finance operator"] --> ui["Vercel Next.js product cockpit"]
  ui --> api["Next.js API routes"]
  api --> rds["Amazon RDS Data API"]
  rds --> aurora[("Aurora PostgreSQL\nfinance, forecasts, actions,\napprovals, providers, memory,\nagents, audit")]
  api --> s3[("Amazon S3\nsource provenance")]
  api --> graph["LangGraph\nagent orchestration + checkpoints"]
  graph --> fireworks["Fireworks AI\nrecommendations, drafts,\ncall scripts, memory extraction"]
  graph --> langsmith["LangSmith\ntrace readiness"]
  api --> providers["Gated providers\nTwilio + Gmail"]
  providers --> aurora
  graph --> aurora
  aurora --> ui
```

## Judge Reproduction Path

```markdown
1. Open https://agentic-cashflow-management.vercel.app.
2. Start on Overview and read the live risk story: current cash, low point, payroll pressure, and recommended next action.
3. Open Forecasts to see deterministic baseline/optimistic/conservative projections.
4. Open Actions and select the Ember Lane phone action.
5. Review the invoice evidence, customer memory, rationale, and generated call script.
6. Click Approve. The action enters an approval flow and the UI shows that outbound call initiation has been approved.
7. Open Agent Activity and inspect the workflow timeline: approval, forecast, draft, recommendation, finance import, outcome memory, and customer memory.
8. Open Customers to see how learned behavior is represented as reusable customer memory.
```

## Demo Video Outline

```markdown
1. **0:00-0:20 - Hook.** SMB cash risk is not a dashboard problem; it is an operating-loop problem.
2. **0:20-0:45 - Overview.** Show Vercel app, Aurora-backed risk story, current cash, payroll pressure, and recommended next action.
3. **0:45-1:15 - Forecasts.** Show deterministic scenarios and explain that AI does not invent money.
4. **1:15-1:55 - Actions.** Show customer memory, generated call script, evidence, guardrails, and approval.
5. **1:55-2:25 - Agent Activity.** Show the recent workflow timeline and provider/readiness surfaces.
6. **2:25-2:55 - Architecture close.** Aurora is the operating backbone; Vercel is the product surface; agents explain, rank, draft, and learn.
```

## Public Content Draft

```markdown
I created this piece of content for the purposes of entering the H0 Hackathon.
#H0Hackathon

For H0, I built RunwayOps: an agentic cashflow operating system for SMB founders, deployed on Vercel and backed by Amazon Aurora PostgreSQL.

The problem is simple: a small business can look profitable and still hit a cash crisis because invoices, obligations, customer behavior, and follow-up live in separate tools.

RunwayOps turns that into one operating loop:

1. Finance evidence is uploaded or refreshed.
2. Source provenance is stored through S3/Aurora.
3. Aurora PostgreSQL stores normalized finance state, forecasts, actions, approvals, providers, memory, checkpoints, and audit records.
4. Deterministic code computes cash risk and runway.
5. LangGraph coordinates the agent workflow.
6. Fireworks AI explains risk, ranks actions, drafts outreach, and extracts customer memory.
7. Human approval gates outbound action.
8. Provider outcomes and learned memory write back into Aurora.

The key architecture choice is that the LLM does not invent financial totals. Aurora carries the operational truth. AI handles judgment, explanation, drafting, and learning.

That is what makes RunwayOps more than a dashboard: it is a Vercel product surface on top of a deliberate AWS Database architecture, built for a real B2B cashflow workflow.
```

## Assets Checklist Before Final Submit

```text
[ ] Public Vercel app URL
[ ] GitHub repository URL
[ ] YouTube demo video under 3 minutes
[ ] Vercel project link
[ ] Vercel Team ID: team_GIT6RlxBXVjXuY0g9nIeypsQ
[ ] AWS Database used: Aurora PostgreSQL
[ ] AWS Aurora screenshot
[ ] Architecture diagram image
[ ] Public content link with H0 entry language and #H0Hackathon
[ ] Product screenshots: Overview, Forecasts, Actions, Agent Activity, Customers
```

## Submission-Safe Boundary Note

Keep this near the end, not the lead:

```markdown
RunwayOps is a cashflow workflow assistant, not a bank or payment processor. It does not move money. Outbound messages and calls are approval-gated, provider-gated, and auditable. The system is designed to show provider outcomes only when provider state exists, and to keep secrets in local/Vercel environment variables rather than Git.
```
