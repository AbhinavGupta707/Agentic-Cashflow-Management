# Database Migrations

Aurora PostgreSQL is the primary backend for this project. Apply SQL files in lexical order from `db/migrations`.

Current migration set:

- `migrations/0001_core_cash_management_schema.sql`

Rollback files live in `db/rollback` and are destructive reset helpers for development/checkpoint environments.

Use `scripts/migrate.ts` through `tsx` after the app scaffold lane provides Node dependencies. The runner records applied checksums in `schema_migrations` and retries `DatabaseResumingException` because Aurora Serverless v2 can resume from 0 ACU.
