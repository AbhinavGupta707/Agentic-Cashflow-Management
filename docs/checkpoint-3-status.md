# Checkpoint 3 QA, Docs, And Smoke Runbook

Date: 2026-06-29

Checkpoint: Live Forecasting, LangGraph, Fireworks, And LangSmith

Status: Integrated and verified on `main`. The forecast, agent graph/provider,
cockpit, and QA/docs lanes have been merged together, patched for integration
gaps, and verified against local checks, live Aurora smokes, and browser smoke.

## Scope

Checkpoint 3 adds the CP3 verification and documentation surface:

- offline schema contract check for forecast/action/agent/communication handoff
- deterministic acceptance checks for the orchestrator
- no-key and live-smoke expectations for Aurora, Fireworks, and LangSmith
- browser smoke procedure for the forecast/action cockpit state
- CP4 handoff notes for approval-gated email without implementing CP4

It does not implement Gmail OAuth, email sending, voice execution, or
future-checkpoint runtime behavior.

## Integrated Verification Results

Final CP3 integration verification included:

- `npm install`
- `npm run typecheck`
- `npm run build`
- `npm run db:migrate:dry`
- `npm run db:seed:dry`
- `npm run check:cp2`
- `npm run check:cp3`
- `npm run forecast:dry`
- `npm run forecast:smoke`
- `npm run smoke:agent:no-key`
- `npm run agent:smoke`
- `git diff --check`
- legacy repository / non-Aurora datastore scan
- Chrome cockpit smoke on `http://127.0.0.1:3000`
- local route smoke for `/api/cp3/forecast-cockpit`

Live Aurora forecast replay verified stable forecast/action ids. Live Aurora
agent replay verified stable `agent_runs` and persisted `agent_checkpoints`.
Browser smoke verified the cockpit renders persisted forecast/action/provider
state, keeps Gmail/voice execution unavailable for CP3, refreshes from Aurora,
and reports no browser console errors.

## Official Provider Docs Reviewed

- LangGraph JavaScript quickstart:
  `https://docs.langchain.com/oss/javascript/langgraph/quickstart`
- LangGraph persistence:
  `https://docs.langchain.com/oss/javascript/langgraph/add-memory`
- LangSmith tracing with LangChain:
  `https://docs.langchain.com/langsmith/trace-with-langchain`
- Fireworks text model querying and OpenAI-compatible API:
  `https://docs.fireworks.ai/guides/querying-text-models`

CP3 implementation lanes should still verify package APIs against the installed
versions they add. This lane only documents the expected no-key/live posture and
checks the current Aurora schema contract.

## Offline Contract Check

Run:

```bash
npm run check:cp3
```

The check is deterministic and safe without provider keys. It reads
`db/migrations/0001_core_cash_management_schema.sql` and verifies the existing
migration contains the CP3/CP4 handoff primitives:

- `forecast_runs` with event-ledger provenance, idempotency, horizon, and state
  contracts
- `forecast_points` linked to forecast runs with replay uniqueness and metric
  contracts
- `action_plans`, `actions`, and `approval_records` with idempotency, approval
  states, and forecast/action relationships
- `agent_runs` and `agent_checkpoints` with graph state, replay uniqueness,
  approval wait state, and optional trace URL storage
- `communication_drafts`, `communication_messages`, and `provider_executions`
  needed for CP4 approval-gated email handoff

The check reports missing Aurora env as live-smoke unavailable and reports
missing Fireworks/LangSmith keys as optional provider-unavailable state. It must
not make AWS, Fireworks, LangSmith, Gmail, or voice network calls.

## Environment Posture

Required for deterministic live CP3 Aurora smoke:

- `AWS_REGION`
- `AURORA_CLUSTER_ARN`
- `AURORA_SECRET_ARN`
- `AURORA_DATABASE`

Optional for Fireworks live smoke:

- `FIREWORKS_API_KEY`
- `FIREWORKS_BASE_URL`
- `FIREWORKS_MODEL`
- `FIREWORKS_EMBEDDING_MODEL`
- `FIREWORKS_EMBEDDING_DIMENSIONS`
- `ACM_ENABLE_LIVE_LLM`
- `ACM_ALLOW_CACHED_LLM`

Optional for LangSmith live trace smoke:

- `LANGSMITH_TRACING`
- `LANGSMITH_API_KEY`
- `LANGSMITH_PROJECT`

Missing optional provider keys must not block deterministic forecast/action
generation. Fireworks and LangSmith integrations should return honest
`unavailable` or tracing-disabled state without fabricated calls, IDs, or trace
URLs.

## No-Key Smoke Expectations

With no Fireworks or LangSmith keys:

- `npm run check:cp3` passes if the schema contract is present.
- `npm run smoke:agent:no-key` passes without Aurora persistence or provider
  network calls.
- forecast/action generation remains deterministic and uses Aurora facts plus
  deterministic fallback copy only.
- provider status reports Fireworks unavailable instead of calling a model.
- LangSmith tracing reports disabled or unavailable instead of writing fake
  trace metadata.
- Gmail, email send, voice, and provider execution controls remain disabled or
  absent.

With no Aurora env:

- offline checks still pass.
- live forecast smoke must stop with a clear missing-Aurora-env message.
- scripts must not claim success against placeholder data.

## Live Smoke Expectations

After CP3 implementation lanes are merged, run live smoke only when Aurora env is
configured:

1. Apply or dry-check migrations and seed data.
2. Run the deterministic forecast smoke against the seeded company/case.
3. Verify persisted `forecast_runs`, `forecast_points`, `action_plans`,
   `actions`, `approval_records`, `agent_runs`, and `agent_checkpoints`.
4. Re-run the forecast smoke and confirm idempotent replay does not duplicate
   tenant-scoped rows.
5. Run `npm run agent:smoke` and confirm the LangGraph run persists
   `agent_runs` and `agent_checkpoints` with deterministic fallback draft output
   when optional provider keys are absent.
6. If Fireworks keys and model are present, make exactly one real provider smoke
   through the CP3 adapter and verify the response is stored as provenance.
7. If `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` are present, verify the
   real trace metadata or URL is associated with the `agent_runs` record.
8. If optional provider env is absent, verify the same flows report unavailable
   state and do not fake provider results.

## Browser Smoke Procedure

Run against a local app URL after the CP3 cockpit/API lane is integrated:

1. Start the app with Aurora env configured, for example `npm run dev`.
2. Open the cockpit page for the seeded demo company/case.
3. Confirm the forecast panel renders the latest persisted forecast run,
   forecast horizon, cash balance/shortfall points, and source provenance.
4. Confirm recommended actions are tied to an action plan and show approval
   state, expected cash impact, rationale, and related customer/invoice evidence.
5. Confirm provider status is visible for Fireworks and LangSmith, including
   unavailable states when keys are missing.
6. Confirm Gmail/email send, voice execution, and provider action execution are
   not active in CP3.
7. Refresh the page and confirm persisted forecast/action/agent state reloads
   from Aurora instead of client-only state.
8. Check browser console errors and API responses. Provider-unavailable states
   are acceptable; unhandled exceptions are not.

## Acceptance Checks

Run after CP3 lanes are integrated:

```bash
npm install
npm run typecheck
npm run build
npm run db:migrate:dry
npm run db:seed:dry
npm run check:cp2
npm run check:cp3
npm run smoke:agent:no-key
npm run forecast:smoke
npm run agent:smoke
git diff --check
rg -n -e 'Runway''Ops' -e 'external''-legacy-repo-placeholder' -e 'mongo''db\+srv' -e 'Mongo''DB' -e 'MONGO''DB' -e 'mongo''db' src scripts db package.json README.md docs/checkpoint-3*.md docs/schema.md
```

Passing criteria:

- TypeScript and production build pass.
- CP2 ingestion/event contract still passes.
- CP3 offline contract check passes without provider keys.
- Dry migration and dry seed still parse and report deterministic state.
- Live forecast smoke passes when Aurora env is present.
- Live agent smoke persists and replays `agent_runs`/`agent_checkpoints` when
  Aurora env is present.
- Fireworks and LangSmith no-key smokes report unavailable state without fake
  calls.
- Browser smoke shows persisted forecast/action/agent state and provider status.
- No secrets, external legacy repository dependency, or non-Aurora datastore are
  introduced.

## Guardrails

- Do not create recurring Codex automations for orchestration polling.
- Do not implement or enable Gmail OAuth, email sending, voice calls, or provider
  action execution in CP3.
- Do not fake Fireworks responses or LangSmith traces. Missing keys mean
  unavailable, not simulated success.
- Do not use external legacy repositories or add Mongo&#68;B. Aurora PostgreSQL
  remains the primary backend.
- Do not launch CP4 until CP3 is merged, verified, documented, and worker lanes
  are archived.

## CP4 Handoff

CP3 should leave CP4 with persisted, approval-ready records:

- approved or pending `actions`
- corresponding `approval_records`
- optional `communication_drafts` linked to actions and agent runs
- no outbound `communication_messages` unless a later checkpoint sends them
- `provider_executions` available for CP4 to record real Gmail provider work

CP4 owns Gmail OAuth, draft/send behavior, provider IDs, replies, and outcome
capture. CP3 should only prepare the approval-gated handoff state.
