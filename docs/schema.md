# Checkpoint 1 Aurora Schema

This checkpoint defines the Aurora PostgreSQL foundation for Agentic Cashflow Management and the schema contract used by the demo seed/repository read path.

## Migration Order

Apply migrations in lexical order from `db/migrations`:

1. `0001_core_cash_management_schema.sql`

The first migration creates the core multi-tenant cash-management model:

- tenant, company, and application user records
- customers and contacts
- source files, import batches, and import rows
- cash accounts, invoices, obligations, and payments
- event inbox and append-style event ledger
- forecast runs and forecast points
- action plans, actions, and approval records
- communication drafts, messages, and provider execution logs
- voice calls and transcripts
- customer memory chunks with `vector(1024)`
- agent runs, checkpoints, and audit log

## Required Database Capabilities

Checkpoint 0 verified these extensions on the `cash_management` database:

- `pgcrypto`, used by `gen_random_uuid()`
- `pg_trgm`, used by trigram search indexes on customer/contact/memory text
- `vector`, used by `memory_chunks.embedding vector(1024)` and the HNSW cosine index

The migration assumes the extensions already exist. The app database user should not need to provision extensions during normal deploys.

## Migration Runner

Scripts added in this lane:

- `scripts/check-aurora-env.ts` validates the required local environment names without making network calls.
- `scripts/migrate.ts` applies SQL files through the RDS Data API and records checksums in `schema_migrations`.

Expected env:

```text
AWS_REGION=eu-west-2
AURORA_CLUSTER_ARN=arn:aws:rds:eu-west-2:222634407676:cluster:h0-hackathon-aurora-pg
AURORA_SECRET_ARN=arn:aws:secretsmanager:eu-west-2:222634407676:secret:h0/cash-management/rds/app-user-DHvZHY
AURORA_DATABASE=cash_management
```

The first RDS Data API call can fail with `DatabaseResumingException` when Aurora resumes from 0 ACU. `scripts/migrate.ts` retries that exception with bounded exponential backoff.

Expected commands are:

```bash
npm run db:check
npm run db:migrate:dry
npm run db:migrate
```

Repository scripts load `.env.local` and `.env` automatically.

## Rollback

`db/rollback/0001_core_cash_management_schema.down.sql` drops checkpoint 1 objects in reverse dependency order. It is destructive and intended only for disposable development or checkpoint reset environments.

Production rollback should usually be a forward corrective migration, not the destructive down file.

## Tenant And Idempotency Strategy

All product tables carry `tenant_id`, and natural uniqueness is tenant-scoped. Ingested, generated, or provider-originated records include `idempotency_key` where replay is plausible.

Core examples:

- Companies, source files, import batches, contacts, obligations, forecast runs, action plans, actions, and memory chunks expose tenant-scoped `external_id` where the live demo needs deterministic upserts/read-model identifiers.
- `source_files`, `import_batches`, `invoices`, `payments`, `event_inbox`, `event_ledger`, `forecast_runs`, `actions`, `approval_records`, `communications`, `provider_executions`, `voice_calls`, `agent_runs`, and `audit_log` each have tenant-scoped idempotency uniqueness.
- Workflow tables use state checks so processors cannot introduce undocumented states.
- Time-sensitive queue tables have state/time indexes for workers.
- Search and retrieval use trigram text indexes plus the `memory_chunks` HNSW vector index.

## Seed Notes

Seed data is added by `npm run db:seed`; use `npm run db:seed:dry` for an offline count/shape check. Current seed shape:

- one tenant and one company
- one owner/operator user
- two to four customers and primary contacts
- source file/import batch records for invoice/customer CSV provenance
- open invoices, one overdue invoice, one obligation, one cash account, and one payment
- one event inbox item and matching event ledger facts
- one forecast run with daily forecast points
- one action plan with approval-gated collection actions
- one draft communication, provider execution placeholder, and one memory chunk embedding placeholder

## Checkpoint 2 Ingestion Contract

Checkpoint 2 reuses the checkpoint 1 Aurora primitives for live ingestion:

- `source_files` records S3 provenance for uploaded files, including
  `source_kind`, bucket, object key, SHA-256 hash, byte size, upload state, and
  tenant-scoped idempotency.
- `import_batches` and `import_batch_rows` track file/manual normalization work,
  row counts, validation errors, and target row references.
- `event_inbox` queues idempotent processing work with explicit queue states,
  attempts, availability time, locks, processed timestamp, and error message.
- `event_ledger` stores durable facts emitted by ingestion processors.

Expected CP2 live flow:

```text
POST /api/uploads or POST /api/manual-records
  -> S3 object for raw bytes when a file is present
  -> source_files/import_batches provenance
  -> event_inbox queued event
  -> processor normalizes supported rows
  -> invoices/customers/obligations/payments and event_ledger facts
```

The schema supports idempotent replay through tenant-scoped idempotency keys.
PDF extraction should not be faked: unsupported PDF parsing should remain
visible as queued, unsupported, or failed import state until a real extractor is
implemented.
