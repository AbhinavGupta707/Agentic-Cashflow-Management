# Checkpoint 7 Live Demo Workflow QA Checklist

Date: 2026-06-29

Status: QA checklist for master integration. Results are pending until the API
and UI lanes are merged.

## Purpose

Use this checklist to prove the CP7 product path is live, clickable, and honest.
It should catch the exact failures seen before CP7:

- action detail preview exists in the backend but is not shown in the UI
- Approve/Edit/Reject controls appear clickable but do not mutate state
- Forecasts expose stale hardcoded 2025 labels
- Agent Activity reads persisted data but renders like a static summary
- provider success is implied without a real provider response

## Offline Checks

Run from the canonical repository root after all CP7 lanes merge:

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

`npm run check:cp7` without `CP7_REQUIRE_LIVE_WORKFLOW=true` may report UI
wiring checks as pending. The strict form must pass before CP7 can be called
complete.

## Live API Probe

Probe the deployed URL after production deployment. Do not print secrets.

Required responses:

- `/api/product/overview`: returns live company/case/current cash/risk state.
- `/api/product/actions`: returns actions and provider readiness.
- `/api/product/actions/act_northstar_cfo_email`: returns an action detail with
  a visible `draftPreview` or an honest deterministic fallback.
- `/api/product/scenarios`: returns scenario/projection data with current,
  explainable dates.
- `/api/product/agent-activity`: returns persisted timeline entries.
- `/api/product/voice/status`: returns Twilio/ElevenLabs readiness without
  placing a call.

Expected provider interpretation:

- Fireworks available: draft preview source can be `fireworks`.
- Fireworks unavailable/error: UI must show fallback or unavailable copy without
  fake model output.
- LangSmith available: real trace metadata may be shown.
- LangSmith unavailable: no fake trace URL is shown.
- Gmail unavailable: email send remains gated/OAuth-required.
- Twilio available: calls still require approval, live mode, and an explicit
  test number.

## Browser QA

Use Chrome or browser-use against the deployed app.

### Overview

- Product shell loads without debug/checkpoint language.
- The first visible story explains current cash, risk, major obligation, and
  recommended action.
- Live status or degraded status is understandable to a business user.
- No fake provider success or route/env jargon is visible in the main story.

### Forecasts

- Forecast chart/tooltips do not show hardcoded stale 2025 dates.
- Baseline/optimistic/conservative values are visibly connected to product data.
- Scenario controls change preview state or clearly describe why they are
  unavailable.
- Recommended action plan is consistent with the top action in Actions.

### Actions

- Selecting a row fetches and displays selected action detail.
- Draft email or call script appears after selection.
- Preview source is labelled as live AI-generated or deterministic fallback.
- Edit opens an editor, saves, and refreshes the selected detail.
- Approve records approval and refreshes action/list/detail state.
- Reject records rejection and refreshes action/list/detail state.
- Approve does not silently send Gmail or place a Twilio call.
- Provider IDs are absent until a real provider execution exists.

### Agent Activity

- Timeline shows persisted run/checkpoint/event/provider/audit entries from
  `/api/product/agent-activity`.
- Approval decisions appear after action mutation.
- Provider executions appear only after real execution attempts.
- LangSmith trace links are present only when real trace metadata exists.

### Customers

- Customer profile explains exposure, behavior, learned memory, outreach
  strategy, and evidence.
- Customer state aligns with the selected action.
- No customer communication outcome is fabricated.

### Mobile

- Open a mobile-width viewport around 390px.
- Navigation labels fit without horizontal scroll.
- Cards, buttons, and draft preview text do not overlap.
- Main document width equals viewport width.

## Evidence To Capture

Add final values to `docs/checkpoint-7-live-demo-workflow-status.md`:

- commit and deployment URL
- command results
- API probe timestamp
- action selected for demo
- action detail preview source
- edit/approve/reject evidence
- Agent Activity timeline count before and after mutation
- desktop screenshot path
- mobile screenshot path
- known gated flows
- remaining risks

## Failure Handling

Do not soften these into "demo limitations":

- visible stale forecast dates
- disabled or no-op approval controls
- detail panel without draft/call preview when the detail endpoint has one
- fake sent/called/provider/trace state
- browser console exceptions during the main walkthrough
- mobile horizontal overflow

These are CP7 blockers until fixed or explicitly descoped by the user.
