# Checkpoint 7 Live Demo Workflow Status

Date: 2026-06-29

Status: Planned. No worker lanes launched yet.

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

## Do Not Launch Without Explicit User Instruction

This document records the next checkpoint. It is not permission to create
worktree sessions. This master session remains the sole orchestration surface
until the user explicitly launches Checkpoint 7.
