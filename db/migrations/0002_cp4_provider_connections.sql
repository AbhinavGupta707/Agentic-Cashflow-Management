-- Checkpoint 4 provider connection foundation.
-- OAuth tokens must be encrypted by the application before they are persisted.

create table if not exists provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  account_email text,
  account_subject text,
  scopes text[] not null default '{}'::text[],
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_type text,
  token_expires_at timestamptz,
  state text not null default 'connected',
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_connections_provider_check check (provider in ('gmail')),
  constraint provider_connections_state_check check (state in ('connected', 'needs_reauth', 'revoked', 'error')),
  constraint provider_connections_account_email_normalized_check check (
    account_email is null or account_email = lower(account_email)
  ),
  constraint provider_connections_token_presence_check check (
    encrypted_access_token is not null or encrypted_refresh_token is not null
  )
);

create unique index if not exists provider_connections_tenant_provider_subject_unique
on provider_connections (tenant_id, provider, account_subject)
where account_subject is not null;

create unique index if not exists provider_connections_tenant_provider_email_unique
on provider_connections (tenant_id, provider, account_email)
where account_email is not null;

create index if not exists provider_connections_tenant_provider_state_idx
on provider_connections (tenant_id, provider, state, updated_at desc);

drop trigger if exists set_provider_connections_updated_at on provider_connections;
create trigger set_provider_connections_updated_at
before update on provider_connections
for each row execute function set_updated_at();
