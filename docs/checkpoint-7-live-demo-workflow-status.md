# Checkpoint 7 Live Demo Workflow Status

Date: 2026-06-29

Status: Launched. Worker lanes are in progress and final integration evidence
is pending master merge/review.

## Why This Checkpoint Exists

Checkpoint 5/6 delivered a live product shell and backend-capable provider
surface, but browser QA exposed an important gap: several user-facing controls
look clickable without being fully wired to live product routes.

Checkpoint 7 is the integration checkpoint that makes the demo workflow truly
walkable.

## Verified Before Launch

Production API probes on 2026-06-29 showed:

- `/api/product/actions` returns live Aurora-backed actions and provider
  readiness.
- Fireworks is configured in production for structured draft generation.
- LangSmith is configured in production for tracing readiness.
- Gmail is intentionally unavailable unless OAuth/env setup is completed.
- Twilio is configured for readiness, while execution remains separately gated.
- The first action in the list has `draftPreview: null`, which explains the UI
  placeholder.
- `/api/product/actions/act_northstar_cfo_email` returns a Fireworks-generated
  preview with `source: "fireworks"` when called directly.
- `/api/product/agent-activity` returns persisted activity including a completed
  recommendation run and timeline items.

## Launch Baseline

- Base commit: `4a1dbeb docs: plan checkpoint 7 live demo workflow`
- Canonical remote:
  `https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git`
- Worktree policy: this master session is the only orchestration surface.
  Worker sessions are task lanes only.
- Live state at launch: production Vercel APIs are reachable, Fireworks and
  LangSmith readiness are configured, Gmail remains optional/gated, and Twilio
  readiness is configured with separate call-execution guardrails.
- Known browser gaps at launch: selected action detail is not fetched by the UI,
  Approve/Edit/Reject are not wired, Forecasts contain stale hardcoded labels,
  and Agent Activity does not yet foreground the persisted timeline.

## Lane Structure

1. Product Workflow API And Data Contract
   - Owns product routes/repositories for actions, scenarios, overview, and
     activity.
   - Must keep provider states honest and avoid silent sends/calls.
2. Cockpit UI Interaction And Story
   - Owns the customer-facing cockpit UI wiring and cash-risk narrative.
   - Must fetch action detail, wire mutations, remove stale forecast labels, and
     show persisted activity.
3. QA, Demo Script, And Release Evidence
   - Owns CP7 runbook/status/check scripts and post-merge evidence template.
   - Must not fabricate browser/API/provider results.

## Current Product Gaps

- Selecting an action in the UI does not fetch action detail.
- The Fireworks-generated detail preview is not displayed in the selected action
  panel.
- Approve/Edit/Reject controls are visually present but not connected to the
  mutation routes.
- Forecasts include hardcoded 2025 labels and static tooltip values.
- Agent Activity visually reads like a static summary instead of a live
  persisted timeline.
- Overview does not yet explain the risk/action/outcome story strongly enough
  for a judge-facing walkthrough.

## Planned Fix

Use the orchestration plan in
`docs/checkpoint-7-live-demo-workflow-orchestration.md`.

Recommended lanes:

1. Product Workflow API And Data Contract.
2. Cockpit UI Interaction And Story.
3. QA, Demo Script, And Release Evidence.

## Acceptance Checks

Minimum master checks after all lanes merge:

```bash
npm run typecheck
npm run build
npm run check:cp2
npm run check:cp3
npm run check:cp4
npm run check:cp5
CP6_REQUIRE_PRODUCT_ROUTES=true npm run check:cp6
CP7_REQUIRE_LIVE_WORKFLOW=true npm run check:cp7
npm run smoke:product:no-key
npm run smoke:voice:no-key
git diff --check
```

Live API checks after deployment, with no secrets printed:

```text
/api/product/overview
/api/product/actions
/api/product/actions/act_northstar_cfo_email
/api/product/scenarios
/api/product/agent-activity
/api/product/voice/status
```

Browser checks after deployment:

- Overview tells the cash-risk story without debug/checkpoint language.
- Forecasts have no stale hardcoded `2025` labels in visible chart/tooltips.
- Actions fetch selected detail and show a draft/call preview from Fireworks or
  an honest deterministic fallback.
- Edit, Approve, and Reject visibly mutate state and refresh the selected
  action.
- Agent Activity shows persisted runs/checkpoints/events/provider/audit state.
- Customers preserve evidence, memory, and outreach context.
- Desktop and mobile widths have no horizontal overflow or console errors.

## Expected Final Evidence

The master integration status should fill these fields before CP7 is marked
complete:

```text
Integrated commit:
Merged lane commits:
Deployment URL:
Production deployment id:
Commands passed:
Commands failed or skipped, with reason:
Live API probe timestamp:
Action detail preview source:
Approve/Edit/Reject mutation evidence:
Forecast stale-date scan:
Agent Activity timeline evidence:
Browser QA desktop screenshot:
Browser QA mobile screenshot:
Known gated flows:
Remaining risks:
```

## QA Lane Additions

- `npm run check:cp7` runs the CP7 live workflow contract check.
- By default it reports UI wiring gaps as pending so isolated lanes can land
  before the UI/API lanes merge.
- During final integration, run
  `CP7_REQUIRE_LIVE_WORKFLOW=true npm run check:cp7` to hard-fail pending UI
  wiring, stale forecast labels, disabled approval controls, and fake provider
  success markers.

## Do Not Create Additional Orchestration Surfaces

Checkpoint 7 has been launched into the three intended task lanes. Do not create
additional orchestrator, monitor, review, recurring automation, or status-check
sessions. This master session remains the sole orchestration surface, and worker
lanes should be archived after their work is merged and verified.
