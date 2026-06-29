# Checkpoint 2 Status

Date: 2026-06-29

Checkpoint: Live Ingestion And Event Inbox

Status: Complete and integrated on `main`.

## Integrated Lanes

Checkpoint 2 launched only task-lane worktree sessions from the canonical
`Agentic-Cashflow-Management` repository root:

| Lane | Branch | Merge Commit |
| --- | --- | --- |
| Upload API And S3 Provenance | `codex/cp2-upload-s3-api` | `d12c687` |
| Event Processor And Normalization | `codex/cp2-event-inbox-normalization` | `11b2b0f` |
| Cockpit Ingestion UX | `codex/cp2-cockpit-ingestion-ux` | `ae5b9ba` |
| QA Docs Runbook | `codex/cp2-qa-docs-runbook` | `4af264f` |

Final integration also patched the upload-to-processor contract so uploaded CSV
events can be normalized from the S3 `objectKey` written by `POST /api/uploads`.

## What Landed

- `POST /api/uploads` accepts supported source files, writes bytes to S3, records
  deterministic provenance in Aurora `source_files`, creates an import batch,
  and queues an `event_inbox` item.
- The event inbox processor claims queued upload/manual events, reads CSV rows
  from inline payloads, parsed rows, or S3 object keys, normalizes supported
  records, updates import batches, and writes durable `event_ledger` facts.
- `GET /api/ingestion-status` exposes source, import, and event state without
  exposing raw bytes.
- The cockpit renders ingestion controls, live import/event status, recent
  imports, manual-entry gating, and honest provider-unavailable states.
- CP2 provider posture stays limited to Aurora and S3. Fireworks, LangSmith,
  Gmail, voice, and provider action execution remain gated for later
  checkpoints.

## Verified Checks

All checks below passed on 2026-06-29:

```bash
npm run typecheck
npm run build
npm run check:cp2
npm run db:migrate:dry
npm run db:seed:dry
npx tsx scripts/process-event-inbox.ts --dry-run --kind invoices
git diff --check
rg -n -e 'Runway''Ops' -e 'external''-legacy-repo-placeholder' -e 'mongo''db\+srv' -e 'Mongo''DB' -e 'MONGO''DB' -e 'mongo''db' src scripts db package.json README.md docs/checkpoint-2*.md
```

The legacy/datastore scan returned no matches.

## Live Smoke

Live Aurora/S3 smoke passed with local environment credentials:

- Uploaded `/private/tmp/h0-cp2-live-invoice.csv` through
  `POST /api/uploads`.
- Upload response returned `status: "ok"` with source file, import batch, event,
  checksum, and S3 object key metadata.
- Processed the returned event with
  `npx tsx scripts/process-event-inbox.ts --event-id <eventId>`.
- Processor result: claimed `1`, processed `1`, failed events `0`, rows
  succeeded `1`, rows failed `0`.
- `GET /api/ingestion-status` showed the live import as `completed`, event state
  as `processed`, and normalized records as `4 invoices, 3 customers,
  2 obligations`.

No-key helper smoke also passed: removing Aurora/S3 env caused upload to fail
honestly with `DataApiUnavailableError` and the missing Aurora env names.

## Browser Smoke

Chrome extension smoke passed against `http://127.0.0.1:3052`:

- The cockpit loaded the live Aurora case for `cmp_marlow_finch`.
- The ingestion panel displayed source/import controls and manual-route gating.
- The import/event status panel showed `3` sources, `0` queued, `0` processing,
  `0` blocked, and `1` processed event.
- Recent imports included `h0-cp2-live-invoice.csv` as a completed invoice
  import with `1` row applied and `0` failed.
- Browser console error count was `0`.

The in-app browser backend was not discoverable in this Codex session, so the
browser pass used the Chrome extension path.

## Orchestration Guardrail

A previous recurring Codex automation created duplicate visible orchestration
monitor sessions. That automation has been removed and the guardrail is now
documented in `AGENTS.md` and `docs/checkpoint-2-orchestration.md`:

- This thread remains the master orchestration surface.
- Create visible Codex worktree sessions only for concrete task lanes.
- Do not create recurring orchestration polling automations.
- Archive worker lanes after their merged work is verified.

## CP3 Handoff

Checkpoint 3 can start from the integrated CP2 `main` state. It should consume
persisted Aurora facts and event ledger records for deterministic forecasting,
LangGraph orchestration, Fireworks structured reasoning where keys are present,
and LangSmith traces where tracing is configured.
