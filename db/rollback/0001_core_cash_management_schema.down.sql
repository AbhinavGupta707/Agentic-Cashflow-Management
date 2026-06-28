-- Destructive rollback for checkpoint 1 core schema.
-- Use only in disposable development or checkpoint reset environments.

drop table if exists audit_log cascade;
drop table if exists agent_checkpoints cascade;
drop table if exists agent_runs cascade;
drop table if exists memory_chunks cascade;
drop table if exists voice_transcripts cascade;
drop table if exists voice_calls cascade;
drop table if exists provider_executions cascade;
drop table if exists communication_messages cascade;
drop table if exists communication_drafts cascade;
drop table if exists approval_records cascade;
drop table if exists actions cascade;
drop table if exists action_plans cascade;
drop table if exists forecast_points cascade;
drop table if exists forecast_runs cascade;
drop table if exists event_ledger cascade;
drop table if exists event_inbox cascade;
drop table if exists payments cascade;
drop table if exists obligations cascade;
drop table if exists invoices cascade;
drop table if exists cash_accounts cascade;
drop table if exists import_batch_rows cascade;
drop table if exists import_batches cascade;
drop table if exists source_files cascade;
drop table if exists contacts cascade;
drop table if exists customers cascade;
drop table if exists app_users cascade;
drop table if exists companies cascade;
drop table if exists tenants cascade;

drop function if exists set_updated_at() cascade;
