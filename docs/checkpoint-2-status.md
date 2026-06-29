# Checkpoint 2 QA, Docs, And Smoke Status

Date: 2026-06-29

Checkpoint: Live Ingestion And Event Inbox

## Current Lane Scope

This lane documents the CP2 runbook and verification contract. It does not
implement production upload routes, S3 writes, CSV/PDF normalization, event
processors, or cockpit UI.

Branch:

```text
codex/cp2-qa-docs-runbook
```

Worktree:

```text
/Users/abhinavgupta/.codex/worktrees/d29b/Agentic-Cashflow-Management
```

Launch base:

```text
8ab50ef5344f5e239aa42ddb2b8a5cdfcc5da948
```

## Documentation Coverage

Added or updated CP2 documentation for:

- launch base, source thread, lane split, branch names, and worktree routing
- expected `POST /api/uploads` request/response/no-key behavior
- optional `POST /api/manual-records` behavior
- expected event processor and ingestion status contracts
- required live AWS/Aurora/S3 env posture
- optional provider keys that are not required for CP2
- local, no-key, live S3/Aurora, and browser/manual smoke checklist
- privacy/security notes for raw bytes, S3 object keys, idempotency, PDF
  extraction honesty, and provider non-activation
- CP3 handoff after CP2 proves durable ingestion

## Offline Contract Check

This lane adds:

```bash
npm run check:cp2
```

The check reads the CP1 migration and verifies that CP2-required foundation
objects are still present:

- `source_files`
- `import_batches`
- `import_batch_rows`
- `event_inbox`
- `event_ledger`
- idempotency constraints and queue indexes needed by ingestion processors

It also reports whether live CP2 env is present. Missing Aurora/S3 env is an
expected no-key posture for offline smoke and should be treated differently from
a schema contract failure.

## Acceptance Checklist

Required after CP2 implementation lanes integrate:

```bash
npm install
npm run typecheck
npm run build
npm run db:migrate:dry
npm run db:seed:dry
npm run check:cp2
git diff --check
rg -n -e 'Runway''Ops' -e 'external''-legacy-repo-placeholder' -e 'mongo''db\+srv' -e 'Mongo''DB' -e 'MONGO''DB' -e 'mongo''db' src scripts db package.json README.md docs/checkpoint-2*.md
```

Manual/live checks:

- Upload no-key smoke returns unavailable JSON with missing env names.
- Processor dry/no-key smoke reports missing Aurora env without claiming work.
- Live upload stores bytes in S3 and provenance in Aurora when credentials are
  present.
- Live processor creates or updates normalized Aurora rows idempotently.
- Browser/manual upload flow shows clear queued/processed/error states.

## Current Status

At this lane stage:

- CP1 Aurora schema already contains the source, import, event inbox, and event
  ledger primitives needed by CP2.
- CP2 production upload routes and processors are expected from backend lanes.
- `check:cp2` provides an offline guard against accidentally removing the CP2
  foundation.
- Live S3/Aurora smoke is not run by this docs lane unless credentials and the
  backend upload route exist.

## Future Checkpoint Handoff

CP3 should begin only after CP2 proves a durable ingestion chain:

```text
uploaded/manual evidence -> S3/source_files -> import/event inbox -> normalized Aurora rows -> event ledger
```

CP3 should then build forecasting and agent orchestration on persisted facts,
not on demo-only fixtures or raw uploaded files.
