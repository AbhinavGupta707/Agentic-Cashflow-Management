# Checkpoint 7 Live Demo Workflow Integration Orchestration

Date: 2026-06-29

Status: Planned. Not launched yet.

Canonical repo: `AbhinavGupta707/Agentic-Cashflow-Management`

## Purpose

Checkpoint 7 turns the current live backend and polished product shell into a
clickable, judge-ready product workflow.

The goal is not to add another proof dashboard. The goal is that a user can open
the deployed app, follow the cash risk story, select an action, see a real
Fireworks-generated draft or call script, edit/approve/reject it, and then see
the workflow and audit trail update from persisted product state.

## Current Diagnosis

The app is live, but the main product flow is only partially wired.

- Production reads Aurora-backed product state.
- Production reports Fireworks and LangSmith as configured.
- `GET /api/product/actions/[id]` can generate a live Fireworks-backed action
  preview for an action detail.
- The React UI currently loads `GET /api/product/actions` for the list, but does
  not fetch `GET /api/product/actions/[id]` when an action is selected.
- The list endpoint can return `draftPreview: null`, so the detail panel shows
  placeholder copy even though the live preview endpoint works.
- The `Approve`, `Edit`, and `Reject` controls are rendered in the UI, but the
  visible buttons are not connected to the existing mutation routes. `Approve`
  is explicitly disabled.
- Forecasts still contain hardcoded 2025 tooltip/runway text and hardcoded
  scenario-control examples.
- Agent Activity reads live backend state, but the visible screen currently
  summarizes it into a static-looking five-step model instead of showing the
  persisted timeline, checkpoints, provider executions, and trace state as the
  actual workflow record.
- Overview needs a clearer narrative: what the cash risk is, what event caused
  it, what the assistant recommends, and what happens if the action is approved.

## External Implementation Guidance

Use the provider docs as constraints, not decoration:

- Fireworks structured outputs should be used with explicit JSON schemas for
  action previews, drafts, classifications, and explanations. Fireworks
  recommends `json_schema` when the application needs parseable structured
  output, and the prompt should also instruct the model to produce JSON.
  Source: https://docs.fireworks.ai/structured-responses/structured-response-formatting
- Fireworks tool calling is appropriate only when the model needs to select
  from external tools. For this checkpoint, prefer structured outputs for draft
  and action-preview generation; reserve tool calling for later multi-tool
  agent routing.
  Source: https://docs.fireworks.ai/guides/function-calling
- LangGraph persistence is the right model for durable run state: checkpoints
  are short-term, thread-scoped state, and stores are long-term memory. This
  product should keep the durable business state in Aurora and use graph
  checkpoints/runs as the auditable execution record.
  Source: https://docs.langchain.com/oss/javascript/langgraph/persistence
- LangGraph interrupts are the right conceptual model for human approval:
  graph execution pauses, checkpoint state is saved, and the same thread ID is
  resumed after approval/rejection/edit. Even if the current implementation
  persists approval records directly, the UI and audit copy should reflect this
  human-in-the-loop contract.
  Source: https://docs.langchain.com/oss/javascript/langgraph/interrupts
- LangSmith tracing should be real or absent. With `LANGSMITH_TRACING=true` and
  `LANGSMITH_API_KEY`, traces should be emitted by LangGraph/LangChain runs or
  trace-wrapped custom provider calls; do not show fake trace URLs.
  Source: https://docs.langchain.com/langsmith/trace-with-langgraph
- Next.js client mutations must show pending/error/success states and refresh or
  re-fetch product data after mutations. Server Functions/Actions and route
  handlers are both acceptable; for this codebase, existing route handlers can
  be called from client event handlers with explicit pending state and refresh.
  Source: https://nextjs.org/docs/app/getting-started/updating-data

## Product Acceptance Criteria

Checkpoint 7 is complete only when all of the following are true:

1. Overview tells a clear cash-risk story using live/current case state.
2. No visible product screen contains stale 2025 forecast/runway labels unless
   the underlying seeded case date intentionally requires it and the UI explains
   that scenario date.
3. Selecting an action fetches action detail from
   `GET /api/product/actions/[id]`.
4. If Fireworks is configured and the detail endpoint returns a preview, the UI
   shows the generated draft/call script and labels it as live AI-generated.
5. If Fireworks fails or is unavailable, the UI shows the deterministic fallback
   honestly and remains usable.
6. Approve, Edit, and Reject call the existing mutation routes and update the UI
   without a page reload.
7. Approving records approval state only. It must not silently send an email or
   place a call unless the provider route explicitly requires approval and
   operator/live-test guardrails are satisfied.
8. Edit opens an actual editor for the generated email or voice script, persists
   via `POST /api/product/actions/[id]/edit-draft`, and refreshes the selected
   action detail.
9. Reject records rejection state with a user-visible result and no provider
   execution.
10. Agent Activity renders the real persisted timeline from
    `/api/product/agent-activity`, including agent runs, checkpoints, events,
    provider executions, audit entries, provider readiness, and trace links when
    real trace metadata exists.
11. Forecasts render current live scenario data from `/api/product/scenarios`
    or honest unavailable state. Hardcoded tooltip values must be removed.
12. The demo workflow can be walked step by step:
    Overview -> Forecasts -> Actions -> action detail -> edit/approve/reject ->
    Agent Activity -> Customers.
13. Browser QA passes on desktop and mobile widths with no console errors,
    no horizontal overflow, and no hidden placeholder/debug copy visible in the
    product path.
14. Documentation is updated so the demo runbook matches the actual clickable
    flow.

## Non-Goals

- Do not connect Gmail OAuth as a requirement for this checkpoint.
- Do not place a real customer call.
- Do not use MongoDB or any legacy RunwayOps repository.
- Do not fabricate provider IDs, trace URLs, sends, calls, replies, or payments.
- Do not create new orchestrator, monitor, recurring automation, or review
  threads. This master session remains the only orchestration surface.
- Do not split unrelated redesign work into this checkpoint.

## Recommended Lanes

Use three isolated Codex worktree sessions when the user explicitly launches
Checkpoint 7.

### Lane 1: Product Workflow API And Data Contract

Owns:

- `src/server/repositories/product-actions.ts`
- `src/server/repositories/product-scenarios.ts`
- `src/server/repositories/product-overview.ts`
- `src/server/repositories/product-agent-activity.ts`
- `src/app/api/product/**`
- focused smoke scripts or contract checks if needed

Goal:

- Make sure product APIs expose everything the UI needs for the clickable demo
  without needing hidden fixture state.
- Ensure action detail generation is fast enough and safe enough for UI use.
- Ensure action mutations return enough state for the client to refresh the
  selected action and list.
- Remove or replace stale date assumptions in scenario/overview API output.
- Preserve honest unavailable/fallback provider states.

Requirements:

- Fireworks preview generation must use real provider calls when configured and
  deterministic fallback when unavailable or failed.
- No silent Gmail send or Twilio call as part of ordinary approval.
- Approval/edit/reject must be idempotent enough for accidental repeated clicks.
- Provider status must distinguish configured, unavailable, provider-error, and
  gated.

Verification:

- `npm run typecheck`
- `npm run check:cp3`
- `npm run check:cp4`
- `npm run check:cp5`
- `CP6_REQUIRE_PRODUCT_ROUTES=true npm run check:cp6`
- targeted product API smoke against local or deployed routes when credentials
  are available

### Lane 2: Cockpit UI Interaction And Story

Owns:

- `src/components/cashflow-cockpit.tsx`
- any new files under `src/components/product/**`
- any local client helpers needed for product route calls

Goal:

- Wire the product UI so the demo can be clicked through like a real product.
- Keep the premium reference-image style, but prioritize actual interaction.

Requirements:

- Fetch selected action detail on selection and show loading/error/fallback
  states in the detail panel.
- Wire Approve/Edit/Reject to the mutation routes with pending states and
  post-mutation refresh.
- Replace disabled/nested action buttons with accessible controls that do not
  accidentally trigger row selection.
- Replace hardcoded forecast labels and 2025 copy with live scenario data.
- Update Overview copy into a concise cash-risk narrative.
- Render Agent Activity from the real product activity timeline instead of a
  static summary-only model.
- Preserve mobile layout and avoid text overflow.

Verification:

- `npm run typecheck`
- `npm run build`
- browser QA with Chrome or in-app browser across Overview, Actions, Forecasts,
  Customers, Agent Activity, and Settings

### Lane 3: QA, Demo Script, And Release Evidence

Owns:

- `docs/live-demo-runbook.md`
- `docs/checkpoint-7-live-demo-workflow-status.md`
- smoke/check scripts under `scripts/**` if needed
- browser QA notes/screenshots

Goal:

- Prove the final workflow is real, not a cached walkthrough.
- Update demo instructions so the user can launch and narrate the product.

Requirements:

- Add a status document with what was verified, which commands passed, which
  provider calls were actually made, and which flows remain intentionally gated.
- Add a concise step-by-step demo script that explains deterministic finance,
  Fireworks generation, LangGraph/audit persistence, approval gates, and
  provider execution boundaries.
- Add or update smoke checks for:
  - selected action detail returns a visible preview or honest fallback
  - approve/reject/edit routes mutate state or return conflict states
  - forecast UI has no stale `2025` hardcoded labels
  - product screens do not expose fake provider success

Verification:

- `npm run typecheck`
- `npm run build`
- `git diff --check`
- live production API probes after deployment
- Chrome/browser-use smoke after deployment

## Merge Order

1. Lane 1 API/data contract.
2. Lane 2 UI wiring and product story.
3. Lane 3 QA/docs/checks.
4. Master integration patch for cross-lane drift.
5. Full verification and deployed browser smoke.

## Launch Prompt Notes

When launching this checkpoint, every worker prompt must include:

- read `AGENTS.md`
- this checkpoint doc
- `docs/live-product-ui-agent-plan.md`
- `docs/live-demo-runbook.md`
- `docs/checkpoint-5-6-status.md`
- exact repository root and current base commit
- explicit instruction not to create orchestrator/monitor/review sessions
- explicit instruction not to modify parent `Cash Management` or legacy repos
- handoff format with files changed, commands run, risks, and integration notes

## Master Verification Checklist

After all lanes merge, the master session must run:

```bash
git status --short --branch
npm run typecheck
npm run build
npm run check:cp2
npm run check:cp3
npm run check:cp4
npm run check:cp5
CP6_REQUIRE_PRODUCT_ROUTES=true npm run check:cp6
npm run smoke:product:no-key
npm run smoke:voice:no-key
git diff --check
```

When live credentials are available, additionally verify:

```text
/api/product/overview
/api/product/actions
/api/product/actions/act_northstar_cfo_email
/api/product/scenarios
/api/product/agent-activity
/api/product/voice/status
```

Browser verification must cover:

- Overview story and live status.
- Forecasts with no stale hardcoded dates.
- Actions detail Fireworks preview.
- Edit modal/drawer.
- Approve and reject state changes.
- Agent Activity showing persisted events/checkpoints.
- Customers showing evidence/memory/outreach context.
- Mobile width with no horizontal overflow.

## Ready To Launch

Checkpoint 7 is ready to launch once the user explicitly instructs the master
session to start it. Do not start workers from this planning document alone.
