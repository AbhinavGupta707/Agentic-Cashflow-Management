# Checkpoint 3 Orchestration

Date: 2026-06-29

Checkpoint: Live Forecasting, LangGraph, Fireworks, And LangSmith

Status: Integrated on `main` from the four CP3 worktree lanes and verified
against local build checks, live Aurora forecast persistence, live Aurora agent
graph persistence, no-key provider posture, and Chrome cockpit smoke.

## Product Outcome

Checkpoint 3 turns CP2-ingested Aurora facts into an auditable forecast and
approval-ready action plan:

- Deterministically compute cash forecasts from Aurora cash accounts, invoices,
  obligations, payments, and event ledger facts.
- Persist forecast runs, forecast points, action plans, recommended actions,
  agent runs, and checkpoints in Aurora.
- Add a LangGraph-style orchestration layer that coordinates forecast,
  recommendation, drafting, tracing, and approval-gated outputs.
- Use Fireworks only when API keys are present; without keys, return honest
  `unavailable` provider state and deterministic fallback copy.
- Emit LangSmith tracing metadata only when tracing env is configured.
- Surface forecast/action provenance in the cockpit without sending email,
  making calls, or executing provider actions.

## Official Docs Consulted

- LangGraph JavaScript quickstart:
  `https://docs.langchain.com/oss/javascript/langgraph/quickstart`
- LangGraph memory/persistence:
  `https://docs.langchain.com/oss/javascript/langgraph/add-memory`
- LangSmith tracing with LangChain:
  `https://docs.langchain.com/langsmith/trace-with-langchain`
- Fireworks text model querying and OpenAI-compatible API:
  `https://docs.fireworks.ai/guides/querying-text-models`

The integrated implementation verifies package APIs against the installed
versions and keeps optional provider calls disabled unless real keys are
intentionally configured.

## Provider And Key Posture

Required for deterministic CP3 verification:

- `AWS_REGION`
- `AURORA_CLUSTER_ARN`
- `AURORA_SECRET_ARN`
- `AURORA_DATABASE`

Optional after the user adds keys:

- `FIREWORKS_API_KEY`
- `FIREWORKS_BASE_URL`
- `FIREWORKS_MODEL`
- `FIREWORKS_EMBEDDING_MODEL`
- `FIREWORKS_EMBEDDING_DIMENSIONS`
- `ACM_ENABLE_LIVE_LLM`
- `ACM_ALLOW_CACHED_LLM`
- `LANGSMITH_API_KEY`
- `LANGSMITH_PROJECT`
- `LANGSMITH_TRACING`

Missing optional provider keys must not block deterministic forecast/action
generation. Provider adapters should report `unavailable` and avoid fake
network calls, fake Fireworks responses, or fake LangSmith traces.

The CP3 QA runbook is tracked in `docs/checkpoint-3-status.md`.

Provider smoke added for the agent/provider lane:

```bash
npm run smoke:agent:no-key
npm run agent:smoke
```

The no-key smoke strips Fireworks and LangSmith keys at the process boundary,
runs the cashflow graph without Aurora persistence against deterministic demo
data, and expects Fireworks/LangSmith `unavailable` provider states plus
deterministic draft fallback output.

The live agent smoke uses Aurora persistence and idempotent replay while still
isolating optional Fireworks/LangSmith env by default. Pass `--allow-providers`
to `scripts/run-agent-smoke.ts` only after real provider keys are intentionally
configured and live provider calls are expected.

## Lane Split

| Lane | Branch | Ownership |
| --- | --- | --- |
| Forecast Engine And Aurora Writes | `codex/cp3-forecast-engine` | deterministic forecast engine, forecast/action repositories, scripts, smoke tests |
| Agent Graph And Provider Adapters | `codex/cp3-agent-graph-providers` | LangGraph orchestration, agent runs/checkpoints, Fireworks and LangSmith adapters, no-key behavior |
| Cockpit Forecast UX And API | `codex/cp3-cockpit-forecast-ux` | forecast/action API routes, cockpit UI, provider status, unavailable/loading/error states |
| QA Docs And Smoke | `codex/cp3-qa-docs-smoke` | CP3 status/runbook, contract checks, no-key/live smoke guidance, browser smoke checklist |

CP4 should launch only from this integrated `main` state after CP3 worker lanes
are archived.

## Acceptance Checklist

Run after CP3 lanes are integrated:

```bash
npm install
npm run typecheck
npm run build
npm run db:migrate:dry
npm run db:seed:dry
npm run check:cp2
npm run check:cp3
git diff --check
rg -n -e 'Runway''Ops' -e 'external''-legacy-repo-placeholder' -e 'mongo''db\+srv' -e 'Mongo''DB' -e 'MONGO''DB' -e 'mongo''db' src scripts db package.json README.md docs/checkpoint-3*.md docs/schema.md
```

Additional CP3 checks:

- Run a deterministic forecast generation smoke against live Aurora when env is
  present.
- Confirm persisted `forecast_runs`, `forecast_points`, `action_plans`,
  `actions`, `agent_runs`, and `agent_checkpoints` rows are idempotent on replay.
- Run provider no-key smokes for Fireworks and LangSmith.
- Confirm cockpit/browser UI shows forecast/action provenance and provider
  status without enabling Gmail, voice, or execution.
- Confirm `npm run check:cp3` passes offline and reports missing optional
  provider env as unavailable rather than failed fake success.

## Non-Goals

- Gmail OAuth, drafts, and sending are CP4.
- Voice execution and transcript learning are CP5.
- Vercel cron/retry production hardening is later.
- Do not add Mongo&#68;B or any legacy repository dependency.
- Do not use recurring Codex automations for orchestration polling.
