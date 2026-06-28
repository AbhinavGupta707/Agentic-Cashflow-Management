-- Checkpoint 1 Aurora PostgreSQL core schema for Agentic Cashflow Management.
-- Required extensions are provisioned on the cash_management database:
-- pgcrypto, pg_trgm, and vector.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  plan_state text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_unique unique (slug),
  constraint tenants_plan_state_check check (plan_state in ('active', 'suspended', 'archived'))
);

drop trigger if exists set_tenants_updated_at on tenants;
create trigger set_tenants_updated_at
before update on tenants
for each row execute function set_updated_at();

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  legal_name text not null,
  trading_name text,
  tax_identifier text,
  base_currency char(3) not null default 'GBP',
  timezone text not null default 'Europe/London',
  state text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_tenant_legal_name_unique unique (tenant_id, legal_name),
  constraint companies_state_check check (state in ('active', 'inactive', 'archived')),
  constraint companies_base_currency_check check (base_currency ~ '^[A-Z]{3}$')
);

drop trigger if exists set_companies_updated_at on companies;
create trigger set_companies_updated_at
before update on companies
for each row execute function set_updated_at();

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'operator',
  state text not null default 'active',
  external_subject text,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_tenant_email_unique unique (tenant_id, email),
  constraint app_users_role_check check (role in ('owner', 'finance_admin', 'operator', 'viewer', 'system')),
  constraint app_users_state_check check (state in ('invited', 'active', 'disabled', 'archived')),
  constraint app_users_email_normalized_check check (email = lower(email))
);

drop trigger if exists set_app_users_updated_at on app_users;
create trigger set_app_users_updated_at
before update on app_users
for each row execute function set_updated_at();

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  external_id text,
  name text not null,
  legal_name text,
  billing_email text,
  payment_terms_days integer not null default 30,
  risk_tier text not null default 'standard',
  state text not null default 'active',
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_tenant_external_unique unique (tenant_id, external_id),
  constraint customers_tenant_company_name_unique unique (tenant_id, company_id, name),
  constraint customers_terms_check check (payment_terms_days between 0 and 365),
  constraint customers_risk_tier_check check (risk_tier in ('low', 'standard', 'elevated', 'high')),
  constraint customers_state_check check (state in ('active', 'paused', 'archived'))
);

drop trigger if exists set_customers_updated_at on customers;
create trigger set_customers_updated_at
before update on customers
for each row execute function set_updated_at();

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  full_name text not null,
  role_title text,
  email text,
  phone_e164 text,
  is_primary boolean not null default false,
  consent_state text not null default 'unknown',
  state text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_email_lower_check check (email is null or email = lower(email)),
  constraint contacts_consent_state_check check (consent_state in ('unknown', 'opted_in', 'opted_out')),
  constraint contacts_state_check check (state in ('active', 'inactive', 'archived')),
  constraint contacts_reachable_check check (email is not null or phone_e164 is not null)
);

drop trigger if exists set_contacts_updated_at on contacts;
create trigger set_contacts_updated_at
before update on contacts
for each row execute function set_updated_at();

create unique index if not exists contacts_one_primary_per_customer_idx
on contacts (tenant_id, customer_id)
where is_primary;

create table if not exists source_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  uploaded_by_user_id uuid references app_users(id) on delete set null,
  source_kind text not null,
  storage_provider text not null default 's3',
  bucket text not null,
  object_key text not null,
  sha256 text not null,
  original_filename text not null,
  content_type text,
  byte_size bigint not null,
  upload_state text not null default 'received',
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_files_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint source_files_tenant_storage_unique unique (tenant_id, storage_provider, bucket, object_key),
  constraint source_files_sha256_check check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint source_files_byte_size_check check (byte_size >= 0),
  constraint source_files_source_kind_check check (source_kind in ('invoice_csv', 'invoice_pdf', 'bank_csv', 'customer_csv', 'obligation_csv', 'email_export', 'manual_upload', 'api')),
  constraint source_files_upload_state_check check (upload_state in ('received', 'scanning', 'ready', 'imported', 'rejected', 'deleted'))
);

drop trigger if exists set_source_files_updated_at on source_files;
create trigger set_source_files_updated_at
before update on source_files
for each row execute function set_updated_at();

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_file_id uuid references source_files(id) on delete set null,
  company_id uuid references companies(id) on delete cascade,
  import_kind text not null,
  state text not null default 'queued',
  idempotency_key text not null,
  rows_total integer not null default 0,
  rows_succeeded integer not null default 0,
  rows_failed integer not null default 0,
  error_message text,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint import_batches_import_kind_check check (import_kind in ('customers', 'contacts', 'invoices', 'payments', 'obligations', 'mixed')),
  constraint import_batches_state_check check (state in ('queued', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  constraint import_batches_counts_check check (rows_total >= 0 and rows_succeeded >= 0 and rows_failed >= 0)
);

drop trigger if exists set_import_batches_updated_at on import_batches;
create trigger set_import_batches_updated_at
before update on import_batches
for each row execute function set_updated_at();

create table if not exists import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  import_batch_id uuid not null references import_batches(id) on delete cascade,
  row_number integer not null,
  state text not null default 'pending',
  raw_payload jsonb not null,
  normalized_payload jsonb not null default '{}'::jsonb,
  target_table text,
  target_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batch_rows_batch_row_unique unique (tenant_id, import_batch_id, row_number),
  constraint import_batch_rows_row_number_check check (row_number > 0),
  constraint import_batch_rows_state_check check (state in ('pending', 'applied', 'skipped', 'failed'))
);

drop trigger if exists set_import_batch_rows_updated_at on import_batch_rows;
create trigger set_import_batch_rows_updated_at
before update on import_batch_rows
for each row execute function set_updated_at();

create table if not exists cash_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  institution_name text,
  account_type text not null,
  currency_code char(3) not null,
  current_balance numeric(18, 2) not null default 0,
  balance_as_of timestamptz not null default now(),
  state text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_accounts_tenant_company_name_unique unique (tenant_id, company_id, name),
  constraint cash_accounts_type_check check (account_type in ('operating', 'savings', 'credit', 'loan', 'merchant', 'other')),
  constraint cash_accounts_state_check check (state in ('active', 'inactive', 'archived')),
  constraint cash_accounts_currency_check check (currency_code ~ '^[A-Z]{3}$')
);

drop trigger if exists set_cash_accounts_updated_at on cash_accounts;
create trigger set_cash_accounts_updated_at
before update on cash_accounts
for each row execute function set_updated_at();

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  source_file_id uuid references source_files(id) on delete set null,
  external_id text,
  invoice_number text not null,
  issue_date date not null,
  due_date date not null,
  currency_code char(3) not null,
  amount_total numeric(18, 2) not null,
  amount_paid numeric(18, 2) not null default 0,
  amount_due numeric(18, 2) generated always as (amount_total - amount_paid) stored,
  state text not null default 'open',
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_tenant_invoice_number_unique unique (tenant_id, company_id, invoice_number),
  constraint invoices_tenant_external_unique unique (tenant_id, external_id),
  constraint invoices_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint invoices_dates_check check (due_date >= issue_date),
  constraint invoices_amounts_check check (amount_total >= 0 and amount_paid >= 0 and amount_paid <= amount_total),
  constraint invoices_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint invoices_state_check check (state in ('draft', 'open', 'partially_paid', 'paid', 'disputed', 'void', 'written_off'))
);

drop trigger if exists set_invoices_updated_at on invoices;
create trigger set_invoices_updated_at
before update on invoices
for each row execute function set_updated_at();

create table if not exists obligations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  cash_account_id uuid references cash_accounts(id) on delete set null,
  source_file_id uuid references source_files(id) on delete set null,
  counterparty_name text not null,
  category text not null,
  obligation_type text not null,
  due_date date not null,
  currency_code char(3) not null,
  amount numeric(18, 2) not null,
  state text not null default 'scheduled',
  recurrence_rule text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obligations_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint obligations_amount_check check (amount >= 0),
  constraint obligations_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint obligations_type_check check (obligation_type in ('payroll', 'tax', 'rent', 'supplier', 'loan', 'subscription', 'other')),
  constraint obligations_state_check check (state in ('scheduled', 'paid', 'deferred', 'cancelled', 'overdue'))
);

drop trigger if exists set_obligations_updated_at on obligations;
create trigger set_obligations_updated_at
before update on obligations
for each row execute function set_updated_at();

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  obligation_id uuid references obligations(id) on delete set null,
  cash_account_id uuid references cash_accounts(id) on delete set null,
  payment_date date not null,
  posted_at timestamptz,
  direction text not null,
  currency_code char(3) not null,
  amount numeric(18, 2) not null,
  provider text,
  external_id text,
  state text not null default 'posted',
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint payments_tenant_external_unique unique (tenant_id, provider, external_id),
  constraint payments_amount_check check (amount > 0),
  constraint payments_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint payments_direction_check check (direction in ('inflow', 'outflow')),
  constraint payments_state_check check (state in ('pending', 'posted', 'reconciled', 'reversed', 'failed'))
);

drop trigger if exists set_payments_updated_at on payments;
create trigger set_payments_updated_at
before update on payments
for each row execute function set_updated_at();

create table if not exists event_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source text not null,
  event_type text not null,
  payload jsonb not null,
  idempotency_key text not null,
  state text not null default 'queued',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_inbox_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint event_inbox_attempts_check check (attempts >= 0),
  constraint event_inbox_state_check check (state in ('queued', 'processing', 'processed', 'failed', 'dead_letter'))
);

drop trigger if exists set_event_inbox_updated_at on event_inbox;
create trigger set_event_inbox_updated_at
before update on event_inbox
for each row execute function set_updated_at();

create table if not exists event_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  inbox_event_id uuid references event_inbox(id) on delete set null,
  aggregate_type text not null,
  aggregate_id uuid,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  causation_id uuid,
  correlation_id uuid,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint event_ledger_tenant_idempotency_unique unique (tenant_id, idempotency_key)
);

create table if not exists forecast_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  input_event_ledger_id uuid references event_ledger(id) on delete set null,
  horizon_start date not null,
  horizon_end date not null,
  scenario text not null default 'base',
  model_version text not null,
  state text not null default 'queued',
  input_snapshot jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forecast_runs_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint forecast_runs_horizon_check check (horizon_end >= horizon_start),
  constraint forecast_runs_state_check check (state in ('queued', 'running', 'completed', 'failed', 'cancelled'))
);

drop trigger if exists set_forecast_runs_updated_at on forecast_runs;
create trigger set_forecast_runs_updated_at
before update on forecast_runs
for each row execute function set_updated_at();

create table if not exists forecast_points (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  forecast_run_id uuid not null references forecast_runs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  cash_account_id uuid references cash_accounts(id) on delete set null,
  source_event_ledger_id uuid references event_ledger(id) on delete set null,
  point_date date not null,
  metric text not null,
  currency_code char(3) not null,
  amount numeric(18, 2) not null,
  lower_bound numeric(18, 2),
  upper_bound numeric(18, 2),
  confidence numeric(5, 4),
  drivers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint forecast_points_run_metric_date_unique unique (tenant_id, forecast_run_id, point_date, metric, cash_account_id),
  constraint forecast_points_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint forecast_points_metric_check check (metric in ('cash_balance', 'expected_inflow', 'expected_outflow', 'net_cashflow', 'shortfall')),
  constraint forecast_points_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create table if not exists action_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  forecast_run_id uuid references forecast_runs(id) on delete set null,
  name text not null,
  state text not null default 'draft',
  currency_code char(3) not null,
  total_expected_impact numeric(18, 2) not null default 0,
  rationale text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_plans_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint action_plans_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint action_plans_state_check check (state in ('draft', 'ready_for_review', 'approved', 'active', 'completed', 'cancelled'))
);

drop trigger if exists set_action_plans_updated_at on action_plans;
create trigger set_action_plans_updated_at
before update on action_plans
for each row execute function set_updated_at();

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  action_plan_id uuid references action_plans(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  obligation_id uuid references obligations(id) on delete set null,
  action_type text not null,
  title text not null,
  rationale text,
  priority text not null default 'medium',
  state text not null default 'proposed',
  currency_code char(3) not null,
  expected_cash_impact numeric(18, 2) not null default 0,
  due_at timestamptz,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint actions_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint actions_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint actions_type_check check (action_type in ('collect_invoice', 'send_reminder', 'call_customer', 'defer_obligation', 'pause_spend', 'manual_review')),
  constraint actions_priority_check check (priority in ('low', 'medium', 'high', 'urgent')),
  constraint actions_state_check check (state in ('proposed', 'needs_approval', 'approved', 'rejected', 'scheduled', 'executing', 'completed', 'failed', 'cancelled'))
);

drop trigger if exists set_actions_updated_at on actions;
create trigger set_actions_updated_at
before update on actions
for each row execute function set_updated_at();

create table if not exists approval_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  action_id uuid not null references actions(id) on delete cascade,
  requested_by_user_id uuid references app_users(id) on delete set null,
  decided_by_user_id uuid references app_users(id) on delete set null,
  state text not null default 'pending',
  approval_token_hash text,
  request_payload jsonb not null default '{}'::jsonb,
  decision_note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_records_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint approval_records_state_check check (state in ('pending', 'approved', 'rejected', 'expired', 'revoked')),
  constraint approval_records_decision_consistency_check check (
    (state in ('approved', 'rejected', 'revoked') and decided_at is not null)
    or (state in ('pending', 'expired'))
  )
);

drop trigger if exists set_approval_records_updated_at on approval_records;
create trigger set_approval_records_updated_at
before update on approval_records
for each row execute function set_updated_at();

create table if not exists communication_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  action_id uuid references actions(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  channel text not null,
  provider text,
  subject text,
  body text not null,
  state text not null default 'draft',
  generated_by_agent_run_id uuid,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_drafts_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint communication_drafts_channel_check check (channel in ('email', 'sms', 'voice_script', 'in_app')),
  constraint communication_drafts_state_check check (state in ('draft', 'needs_approval', 'approved', 'rejected', 'queued', 'sent', 'archived'))
);

drop trigger if exists set_communication_drafts_updated_at on communication_drafts;
create trigger set_communication_drafts_updated_at
before update on communication_drafts
for each row execute function set_updated_at();

create table if not exists communication_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  draft_id uuid references communication_drafts(id) on delete set null,
  action_id uuid references actions(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  channel text not null,
  direction text not null,
  provider text,
  provider_message_id text,
  subject text,
  body text,
  state text not null default 'created',
  sent_at timestamptz,
  received_at timestamptz,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_messages_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint communication_messages_provider_unique unique (tenant_id, provider, provider_message_id),
  constraint communication_messages_channel_check check (channel in ('email', 'sms', 'voice', 'in_app')),
  constraint communication_messages_direction_check check (direction in ('outbound', 'inbound')),
  constraint communication_messages_state_check check (state in ('created', 'queued', 'sent', 'delivered', 'received', 'bounced', 'failed', 'archived'))
);

drop trigger if exists set_communication_messages_updated_at on communication_messages;
create trigger set_communication_messages_updated_at
before update on communication_messages
for each row execute function set_updated_at();

create table if not exists provider_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  action_id uuid references actions(id) on delete set null,
  draft_id uuid references communication_drafts(id) on delete set null,
  message_id uuid references communication_messages(id) on delete set null,
  provider text not null,
  operation text not null,
  state text not null default 'queued',
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  provider_execution_id text,
  attempts integer not null default 0,
  last_error text,
  idempotency_key text not null,
  attempted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_executions_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint provider_executions_provider_unique unique (tenant_id, provider, provider_execution_id),
  constraint provider_executions_attempts_check check (attempts >= 0),
  constraint provider_executions_state_check check (state in ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);

drop trigger if exists set_provider_executions_updated_at on provider_executions;
create trigger set_provider_executions_updated_at
before update on provider_executions
for each row execute function set_updated_at();

create table if not exists voice_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  action_id uuid references actions(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  provider_execution_id uuid references provider_executions(id) on delete set null,
  provider text not null,
  provider_call_id text,
  phone_e164 text not null,
  direction text not null default 'outbound',
  state text not null default 'queued',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  summary text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_calls_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint voice_calls_provider_unique unique (tenant_id, provider, provider_call_id),
  constraint voice_calls_direction_check check (direction in ('outbound', 'inbound')),
  constraint voice_calls_state_check check (state in ('queued', 'ringing', 'in_progress', 'completed', 'no_answer', 'failed', 'cancelled')),
  constraint voice_calls_duration_check check (duration_seconds is null or duration_seconds >= 0)
);

drop trigger if exists set_voice_calls_updated_at on voice_calls;
create trigger set_voice_calls_updated_at
before update on voice_calls
for each row execute function set_updated_at();

create table if not exists voice_transcripts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  voice_call_id uuid not null references voice_calls(id) on delete cascade,
  sequence_number integer not null,
  speaker text not null,
  utterance text not null,
  starts_at_seconds numeric(10, 3),
  ends_at_seconds numeric(10, 3),
  confidence numeric(5, 4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint voice_transcripts_call_sequence_unique unique (tenant_id, voice_call_id, sequence_number),
  constraint voice_transcripts_sequence_check check (sequence_number > 0),
  constraint voice_transcripts_speaker_check check (speaker in ('agent', 'customer', 'system', 'unknown')),
  constraint voice_transcripts_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create table if not exists memory_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  fact_type text not null,
  content text not null,
  embedding vector(1024),
  embedding_model text,
  confidence numeric(5, 4),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_chunks_source_check check (source_type in ('invoice', 'payment', 'email', 'voice_call', 'voice_transcript', 'manual_note', 'agent_extract')),
  constraint memory_chunks_fact_type_check check (fact_type in ('payment_behavior', 'contact_preference', 'dispute_pattern', 'promise_to_pay', 'risk_signal', 'general')),
  constraint memory_chunks_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint memory_chunks_validity_check check (valid_until is null or valid_until > valid_from)
);

drop trigger if exists set_memory_chunks_updated_at on memory_chunks;
create trigger set_memory_chunks_updated_at
before update on memory_chunks
for each row execute function set_updated_at();

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  run_kind text not null,
  graph_name text not null,
  state text not null default 'queued',
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  error_message text,
  trace_url text,
  idempotency_key text not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_runs_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint agent_runs_kind_check check (run_kind in ('ingestion', 'forecast', 'recommendation', 'approval', 'execution', 'learning', 'maintenance')),
  constraint agent_runs_state_check check (state in ('queued', 'running', 'waiting_for_approval', 'completed', 'failed', 'cancelled'))
);

drop trigger if exists set_agent_runs_updated_at on agent_runs;
create trigger set_agent_runs_updated_at
before update on agent_runs
for each row execute function set_updated_at();

alter table communication_drafts
  drop constraint if exists communication_drafts_agent_run_fk;

alter table communication_drafts
  add constraint communication_drafts_agent_run_fk
  foreign key (generated_by_agent_run_id) references agent_runs(id) on delete set null;

create table if not exists agent_checkpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  agent_run_id uuid not null references agent_runs(id) on delete cascade,
  checkpoint_key text not null,
  state_payload jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint agent_checkpoints_run_key_unique unique (tenant_id, agent_run_id, checkpoint_key)
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_user_id uuid references app_users(id) on delete set null,
  actor_type text not null default 'system',
  action text not null,
  target_type text not null,
  target_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  ip_address inet,
  user_agent text,
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint audit_log_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  constraint audit_log_actor_type_check check (actor_type in ('user', 'agent', 'system', 'provider'))
);

create index if not exists companies_tenant_state_idx on companies (tenant_id, state);
create index if not exists app_users_tenant_state_idx on app_users (tenant_id, state);
create index if not exists customers_tenant_company_state_idx on customers (tenant_id, company_id, state);
create index if not exists customers_name_trgm_idx on customers using gin (name gin_trgm_ops);
create index if not exists contacts_customer_idx on contacts (tenant_id, customer_id);
create index if not exists contacts_email_trgm_idx on contacts using gin (email gin_trgm_ops) where email is not null;
create index if not exists source_files_tenant_created_idx on source_files (tenant_id, created_at desc);
create index if not exists import_batches_tenant_state_idx on import_batches (tenant_id, state, created_at desc);
create index if not exists import_batch_rows_batch_state_idx on import_batch_rows (tenant_id, import_batch_id, state);
create index if not exists cash_accounts_company_state_idx on cash_accounts (tenant_id, company_id, state);
create index if not exists invoices_customer_due_idx on invoices (tenant_id, customer_id, due_date);
create index if not exists invoices_company_state_due_idx on invoices (tenant_id, company_id, state, due_date);
create index if not exists invoices_open_due_idx on invoices (tenant_id, due_date) where state in ('open', 'partially_paid', 'disputed');
create index if not exists obligations_company_due_idx on obligations (tenant_id, company_id, due_date);
create index if not exists payments_invoice_date_idx on payments (tenant_id, invoice_id, payment_date desc);
create index if not exists payments_company_date_idx on payments (tenant_id, company_id, payment_date desc);
create index if not exists event_inbox_ready_idx on event_inbox (tenant_id, state, available_at) where state in ('queued', 'failed');
create index if not exists event_ledger_aggregate_idx on event_ledger (tenant_id, aggregate_type, aggregate_id, occurred_at desc);
create index if not exists event_ledger_occurred_idx on event_ledger (tenant_id, occurred_at desc);
create index if not exists forecast_runs_company_created_idx on forecast_runs (tenant_id, company_id, created_at desc);
create index if not exists forecast_points_run_date_idx on forecast_points (tenant_id, forecast_run_id, point_date);
create index if not exists action_plans_company_state_idx on action_plans (tenant_id, company_id, state);
create index if not exists actions_state_due_idx on actions (tenant_id, state, due_at);
create index if not exists actions_customer_idx on actions (tenant_id, customer_id, created_at desc);
create index if not exists approval_records_pending_idx on approval_records (tenant_id, state, expires_at) where state = 'pending';
create index if not exists communication_drafts_action_idx on communication_drafts (tenant_id, action_id, state);
create index if not exists communication_messages_customer_idx on communication_messages (tenant_id, customer_id, created_at desc);
create index if not exists provider_executions_state_idx on provider_executions (tenant_id, state, created_at);
create index if not exists voice_calls_customer_idx on voice_calls (tenant_id, customer_id, created_at desc);
create index if not exists voice_transcripts_call_sequence_idx on voice_transcripts (tenant_id, voice_call_id, sequence_number);
create index if not exists memory_chunks_customer_created_idx on memory_chunks (tenant_id, customer_id, created_at desc);
create index if not exists memory_chunks_content_trgm_idx on memory_chunks using gin (content gin_trgm_ops);
create index if not exists memory_chunks_embedding_hnsw_idx on memory_chunks using hnsw (embedding vector_cosine_ops) where embedding is not null;
create index if not exists agent_runs_state_idx on agent_runs (tenant_id, state, created_at);
create index if not exists agent_checkpoints_run_idx on agent_checkpoints (tenant_id, agent_run_id, created_at);
create index if not exists audit_log_target_idx on audit_log (tenant_id, target_type, target_id, occurred_at desc);
create index if not exists audit_log_actor_idx on audit_log (tenant_id, actor_user_id, occurred_at desc);
