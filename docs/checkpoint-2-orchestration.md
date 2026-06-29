# Checkpoint 2 Orchestration

Date: 2026-06-29

Checkpoint: Live Ingestion And Event Inbox

## Base State

Repository:

```text
https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git
```

Do not use or modify any external legacy repository. This checkpoint starts from
the canonical repository only.

Checkpoint 2 launch base:

```text
main at 8ab50ef5344f5e239aa42ddb2b8a5cdfcc5da948
```

Source orchestration thread:

```text
019f10e1-1751-7640-834d-5ab6ec3ea572
```

This QA/docs lane worktree:

```text
/Users/abhinavgupta/.codex/worktrees/d29b/Agentic-Cashflow-Management
```

## Worktree Routing Rules

Checkpoint 2 and later lanes should be forked as native Codex worktrees from an
exact repository-root thread, not from the parent `Cash Management` folder
project.

The master orchestration thread is responsible for status checks, integration,
merge review, verification, and cleanup. Do not create recurring Codex
automations or additional "orchestration monitor" sessions for polling; those
spawn visible sidebar threads and can multiply unexpectedly. Create visible
worktree sessions only for concrete implementation or QA task lanes, then
archive them after their merged work is verified.

Required routing checks for each lane:

1. The lane `cwd` starts with `/Users/abhinavgupta/.codex/worktrees/`.
2. `git remote -v` points only to `https://github.com/AbhinavGupta707/Agentic-Cashflow-Management.git`.
3. The lane starts from the recorded CP2 base or an explicitly integrated CP2 branch.
4. The lane keeps secrets out of Git and uses env names only in docs/code.
5. The lane does not introduce any disallowed datastore or external legacy runtime dependency.

## Lane Split

CP2 branch names:

| Lane | Branch | Ownership |
| --- | --- | --- |
| Upload API And S3 Provenance | `codex/cp2-upload-s3-api` | `src/app/api/uploads/**`, upload parsing, S3 put, `source_files`/`import_batches` writes |
| Event Processor And Normalization | `codex/cp2-event-inbox-normalization` | event inbox dequeue, idempotent import processing, manual records route, narrow processor smoke helpers |
| Cockpit Ingestion UX | `codex/cp2-cockpit-ingestion-ux` | cockpit upload controls, read-only ingestion status API, unavailable states |
| QA Docs Runbook | `codex/cp2-qa-docs-runbook` | `docs/checkpoint-2-*.md`, README additions, CP2 runbook/check scripts |

The QA/docs lane should not implement production upload routes or processors
beyond small offline checks. Backend lanes own those changes.

## Product Outcome

Checkpoint 2 should prove that live ingestion can move user-supplied cashflow
evidence into the durable Aurora/S3 foundation:

- Upload invoice, customer, obligation, bank, or PDF files through a Next.js
  route handler.
- Store raw file bytes in S3 and never in Git.
- Record deterministic provenance in Aurora `source_files`.
- Queue import work in `import_batches`, `import_batch_rows`, and
  `event_inbox`.
- Normalize supported CSV/manual rows into customers, invoices, obligations,
  payments, and ledger events.
- Keep event processing idempotent through tenant-scoped idempotency keys.
- Report unavailable live ingestion honestly when Aurora or S3 env is missing.

## Expected API Contracts

### `POST /api/uploads`

Expected request:

- `multipart/form-data`
- `file`: required uploaded file
- `sourceKind`: one of `invoice_csv`, `invoice_pdf`, `bank_csv`,
  `customer_csv`, `obligation_csv`, or `manual_upload`
- `importKind`: one of `invoices`, `customers`, `contacts`, `obligations`,
  `payments`, or `mixed`
- `companyExternalId`: optional external company id; defaults may use
  `DEMO_COMPANY_ID` for smoke
- `caseId`: optional case id; defaults may use `DEMO_CASE_ID` for smoke

The route derives idempotency from tenant, source kind, import kind, checksum,
and file name.

Expected success response:

```json
{
  "status": "ok",
  "sourceFileId": "uuid",
  "importBatchId": "uuid",
  "eventId": "uuid",
  "uploadState": "ready",
  "objectKey": "source-files/cmp_demo/2026-06-29/invoice_csv/sha256-...",
  "checksum": "sha256-hex",
  "message": "Source file uploaded to S3 and queued for ingestion."
}
```

Expected no-key response:

- `503`
- JSON body with `status: "error"`, `code: "missing_configuration"`, and a
  `missingEnv` list.
- Missing AWS/Aurora/S3 configuration must not fall back to fake persistence.

### Optional `POST /api/manual-records`

Expected request:

- JSON body for a small manual record such as invoice, obligation, customer, or
  payment.
- `tenantId` or `tenantSlug`
- `companyId` or `companyExternalId`
- `kind`: `customer`, `contact`, `invoice`, `obligation`, or `payment`
- `payload`, optional `idempotencyKey`, and optional `process: true`

Expected behavior:

- Validate the payload before writing.
- Record an `event_inbox` item with a deterministic idempotency key.
- Optional `process=true` immediately processes that exact event through the
  same event inbox processor path.
- Return `queued`, `processed`, unavailable, or validation errors without
  activating provider actions.

### Event Processor Script

Expected command shape:

```bash
npx tsx scripts/process-event-inbox.ts --dry-run --kind invoices
```

The processor should:

- Claim queued `event_inbox` rows using `state`, `available_at`, `locked_at`,
  and `locked_by`.
- Increment attempts and move rows through `queued`, `processing`, `processed`,
  `failed`, or `dead_letter`.
- Use `event_ledger` for durable facts created from source/import events.
- Re-run safely when the same idempotency key or source file is submitted.
- Resolve CSV rows from inline `csvText`, parsed `rows`, or the S3 `objectKey`
  written by `POST /api/uploads`; raw bytes stay in S3.
- In dry/no-key mode, validate headers or report unavailable Aurora config
  rather than claiming live processing.

### Optional Ingestion Status API

Expected route:

```text
GET /api/ingestion-status?sourceFileId=...&importBatchId=...
```

Expected response:

- source file upload state
- import batch state and row counts
- event inbox state, attempts, and last error when available
- no raw file bytes

## Provider And Key Posture

Required for live CP2 proof:

- `AWS_REGION`
- `AURORA_CLUSTER_ARN`
- `AURORA_SECRET_ARN`
- `AURORA_DATABASE`
- `AWS_S3_BUCKET`
- local AWS credentials or production Vercel OIDC through `AWS_ROLE_ARN`

Not required for CP2:

- Fireworks keys or model IDs
- LangSmith API key
- Google/Gmail OAuth credentials
- Gmail encryption key
- ElevenLabs or Twilio credentials

CP2 must not activate Gmail, voice, or provider action execution. It should only
ingest source evidence and queue/process internal events.

## Acceptance Checklist

Run after CP2 lanes are integrated:

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

Additional CP2 live/manual checks:

- Upload no-key smoke: remove Aurora/S3 env and confirm `POST /api/uploads`
  returns a clear unavailable response.
- Processor dry/no-key smoke: run the processor dry mode without Aurora env and
  confirm it reports unavailable configuration.
- Live S3/Aurora smoke: with credentials present, upload a tiny CSV and confirm
  one S3 object, one `source_files` row, one `import_batches` row, and one
  queued or processed `event_inbox` row.
- Browser/manual upload flow: use the local app to submit a supported file,
  observe status, and confirm no raw bytes or secrets are displayed.

## Privacy And Security Notes

- Do not commit raw uploaded files, screenshots containing secrets, or generated
  private customer data.
- S3 object keys should be deterministic for idempotency, but they are not
  secrets and must not include sensitive customer names when avoidable.
- Hash uploaded bytes with SHA-256 before provenance writes.
- Store only object keys and metadata in Aurora; file bytes belong in S3.
- Do not fake PDF extraction. If PDF parsing is not implemented, return
  accepted-but-unprocessed or unsupported status honestly.
- No provider action activation belongs in CP2.

## CP3 Handoff

Checkpoint 3 can start once CP2 has a live path from upload/manual evidence to
Aurora-backed normalized facts and event ledger entries. CP3 should consume
those persisted facts for deterministic forecasting, LangGraph orchestration,
Fireworks structured reasoning where keys are present, and LangSmith traces
where tracing is configured.
