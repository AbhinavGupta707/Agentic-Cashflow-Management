# Checkpoint 5/6 Orchestration Plan

Date: 2026-06-29

Status: Ready to launch worker lanes from the canonical repository root.

Canonical repo:
`/Users/abhinavgupta/Desktop/H0 AWS Hack/Cash Management /Agentic-Cashflow-Management`

Remote:
`https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git`

## Scope

Checkpoint 5 and Checkpoint 6 are being executed as one integrated product
increment:

- CP5: approval-gated voice execution and outcome learning.
- CP6: live customer-facing cockpit replacement backed by Aurora/provider state.

The goal is a live working product surface, not a cached walkthrough. The app
should open into a polished cashflow assistant experience that looks close to
the four `Ui References/*.png` screens and reads from real application state
wherever the repo already has persisted data.

## Non-Goals

- Do not launch Checkpoint 7 in this pass.
- Do not create separate orchestrator, monitor, or recurring status-check
  sessions.
- Do not use or modify any legacy RunwayOps repository or archived folder.
- Do not require Google/Gmail OAuth linking to be live for this pass.
- Do not place real outbound calls except through an explicit live smoke path
  with approval and a test number.
- Do not show fake provider IDs or fake sent/called outcomes.

## Provider Reality

Local `.env.local` is intentionally untracked.

Verified before launch:

- Fireworks key present and live with model
  `accounts/fireworks/models/kimi-k2p5`.
- LangSmith key present and project `agentic-cashflow-h0-live` reachable.
- Twilio credentials present and authentication succeeds.
- ElevenLabs key is present but currently invalid, so ElevenLabs must be
  reported honestly as unavailable/invalid until replaced.

Worker lanes must keep all provider states honest. Missing keys, expired AWS
sessions, invalid provider keys, or absent OAuth connections are acceptable
degraded states; fake success is not acceptable.

## UI Acceptance Criteria

The visible product should follow the reference images closely:

- dark premium fintech shell
- persistent left navigation
- top company/case selector
- live status and last-updated affordance
- large restrained KPI strips
- thin bordered glass-like cards with 6-8px radii
- purple/indigo primary actions and active nav state
- green/red/amber semantic status colors
- dense but calm operational layout
- no checkpoint/env/debug language on primary customer screens

Reference-specific outcomes:

- Overview: KPI strip, cashflow/runway chart, critical actions, approvals, and
  agent health tiles.
- Actions: pending approvals list, selected action detail, explanation, draft or
  call preview, guardrails, and approve/edit/reject controls.
- Customers: risk/exposure summary, behavior summary, interaction history,
  learned memory cards, outreach strategy, script preview, and evidence.
- Forecasts: baseline/optimistic/conservative projection, scenario controls,
  comparison cards, recommended plan, and sensitivity analysis.

## Worker Lanes

### Lane 1: Product UI Shell And Screens

Goal:

- Replace the proof-dashboard feel with a premium app shell and product screens
  aligned to `Ui References/`.

Primary ownership:

- `src/app/page.tsx`
- `src/components/**`
- `src/styles/globals.css`
- `tailwind.config.ts`

Requirements:

- Build reusable UI components for app shell, nav, top case bar, KPI cards,
  action cards, approval cards, customer profile panels, scenario controls,
  charts, timelines, evidence rows, readiness cards, and loading/degraded states.
- The first screen must feel like the customer product, not an engineering
  cockpit.
- Use existing dependencies first. Do not add a charting library unless clearly
  justified; SVG/CSS charts are acceptable if polished and responsive.
- Keep all copy customer-facing and avoid checkpoint/debug wording on primary
  screens.
- Consume product API shapes from the backend lanes when present; provide
  temporary typed fallback objects only as unavailable-state placeholders.

### Lane 2: Product Overview And Scenario APIs

Goal:

- Expose live-backed product APIs for the overview and scenario planner.

Primary ownership:

- `src/app/api/product/overview/**`
- `src/app/api/product/scenarios/**`
- `src/server/repositories/product-overview.ts`
- `src/server/repositories/product-scenarios.ts`
- focused forecast helpers under `src/server/forecast/**`

Requirements:

- Read Aurora-backed repository state where available.
- Return consolidated overview KPIs, cashflow/runway series, critical actions,
  approvals, agent statuses, and last-updated time.
- Return scenario baseline/optimistic/conservative projections and a preview
  endpoint for assumption toggles.
- Keep deterministic fallback/no-Aurora states honest and visibly degraded.

### Lane 3: Actions, Approvals, And Agent Runtime

Goal:

- Create product action APIs and upgrade the agent runtime so approval-gated
  recommendations feel like a live workflow.

Primary ownership:

- `src/app/api/product/actions/**`
- `src/app/api/product/agent-activity/**`
- `src/server/repositories/product-actions.ts`
- `src/server/repositories/product-agent-activity.ts`
- focused changes to `src/server/agents/**` and `src/server/providers/fireworks.ts`

Requirements:

- Support list/detail action APIs plus approve, reject, and edit-draft routes.
- Include why-this-action, draft/call preview, evidence, provider status, and
  guardrails in the API contract.
- Use Fireworks structured JSON for recommendations/drafts/scripts when
  configured, with deterministic safe fallback when unavailable.
- Surface LangSmith trace metadata where configured.
- Never execute outbound provider actions without approval.

### Lane 4: Customer Intelligence And Voice Runtime

Goal:

- Build CP5 voice/customer intelligence plumbing that can power customer and
  action screens.

Primary ownership:

- `src/app/api/product/customers/**`
- `src/app/api/product/voice/**`
- `src/server/repositories/product-customers.ts`
- `src/server/voice/**`
- `src/server/providers/twilio.ts`
- `src/server/providers/elevenlabs.ts`

Requirements:

- Return customer list/detail APIs with exposure, lateness, interaction history,
  learned facts, recommended outreach, call script preview, and evidence.
- Add Twilio-first provider status and approval-gated call initiation scaffolding.
- Persist or prepare persistence contracts for `voice_calls`,
  `voice_transcripts`, `provider_executions`, and memory extraction.
- Keep ElevenLabs optional and honest when invalid/unavailable.
- Add webhook route scaffolding for call status/transcript ingestion if needed.

### Lane 5: QA, Docs, And Smoke Coverage

Goal:

- Make CP5/CP6 verifiable without keys and safely testable with keys.

Primary ownership:

- `scripts/**` CP5/CP6 checks and smokes
- `docs/checkpoint-5-6-status.md`
- `README.md` provider/demo updates
- focused docs updates only

Requirements:

- Add deterministic no-key/provider-unavailable smoke checks.
- Add contract checks for product APIs and voice provider guardrails.
- Document live Fireworks, LangSmith, Twilio, ElevenLabs, and browser QA steps.
- Document that live Gmail OAuth is not required for this pass.
- Include manual browser smoke checklist matching the reference screens.

## Merge Order

1. Lane 2: Product overview/scenario APIs.
2. Lane 3: Actions/agent activity/runtime APIs.
3. Lane 4: Customer intelligence/voice runtime.
4. Lane 1: Product UI shell and screens.
5. Lane 5: QA/docs/smoke.
6. Master integration patches for API/UI drift.

## Verification Target

Minimum integration checks:

```bash
npm run typecheck
npm run build
npm run check:cp2
npm run check:cp3
npm run check:cp4
npm run smoke:agent:no-key
npm run smoke:gmail:no-key
npm run smoke:cp4:runtime:no-key
git diff --check
```

Expected new checks:

```bash
npm run check:cp5
npm run check:cp6
npm run smoke:voice:no-key
npm run smoke:product:no-key
```

Live checks after integration, when local credentials/session allow:

- Fireworks structured reasoning smoke.
- LangSmith trace/project smoke.
- Twilio provider status smoke without placing a call.
- Aurora Data API read smoke.
- Browser QA with console/network inspection against the local app.

## Launch Record

Base branch: `main`

Base commit: `0fe2350` (`docs: add live product ui orchestration plan`)

Launched by the master orchestrator on 2026-06-29:

| Lane | Thread ID | Worktree |
| --- | --- | --- |
| CP5/CP6 UI Shell Lane | `019f1341-b833-7d92-9642-d3b7517e68d9` | `/Users/abhinavgupta/.codex/worktrees/1b8c/Agentic-Cashflow-Management` |
| CP5/CP6 Overview Scenario API Lane | `019f1342-2e23-7d41-8630-66e7efe59b27` | `/Users/abhinavgupta/.codex/worktrees/0844/Agentic-Cashflow-Management` |
| CP5/CP6 Actions Agent Runtime Lane | `019f1342-bb75-7572-974d-89cccd55020e` | `/Users/abhinavgupta/.codex/worktrees/e19d/Agentic-Cashflow-Management` |
| CP5/CP6 Customer Voice Lane | `019f1343-49e6-7272-b851-bb8833144fbf` | `/Users/abhinavgupta/.codex/worktrees/73de/Agentic-Cashflow-Management` |
| CP5/CP6 QA Docs Smoke Lane | `019f1343-e0d1-7493-a01e-2cbe79ab6c3f` | `/Users/abhinavgupta/.codex/worktrees/0f9e/Agentic-Cashflow-Management` |

Pending worktree IDs used during launch:

- `local:15760a7c-c247-494f-8508-1e2a6ac8e61b`
- `local:176b9821-f54a-4c8e-9177-fce3e90d9ddc`
- `local:2b3a4fe2-3091-4d33-adf1-300e3b030fdf`
- `local:c44b4d72-2b1b-45e6-b7e0-57768d5f65a6`
- `local:50853f82-e1cb-4018-93ef-a12370b063a4`
