import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient, type DataApiParam } from "../aws/rds-data-api";
import type { GmailTokenSet } from "../providers/gmail-tokens";
import { encryptGmailToken } from "../providers/gmail-tokens";

export type ProviderConnectionState = "connected" | "needs_reauth" | "revoked" | "error";

export type ProviderConnectionRecord = {
  id: string;
  tenantId: string;
  provider: "gmail";
  accountEmail: string | null;
  accountSubject: string | null;
  scopes: string[];
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  tokenType: string | null;
  tokenExpiresAt: string | null;
  state: ProviderConnectionState;
  lastError: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

type ProviderConnectionRow = {
  id: string;
  tenant_id: string;
  provider: "gmail";
  account_email: string | null;
  account_subject: string | null;
  scopes: string[] | string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_type: string | null;
  token_expires_at: string | null;
  state: ProviderConnectionState;
  last_error: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export async function getLatestGmailProviderConnection(
  input: { tenantId: string },
  dataApi: AuroraDataApiClient = createProviderConnectionDataApi(),
): Promise<ProviderConnectionRecord | null> {
  const [row] = await dataApi.execute<ProviderConnectionRow>(
    `
      select
        id,
        tenant_id,
        provider,
        account_email,
        account_subject,
        scopes,
        encrypted_access_token,
        encrypted_refresh_token,
        token_type,
        token_expires_at::text,
        state,
        last_error,
        metadata,
        created_at::text,
        updated_at::text
      from provider_connections
      where tenant_id = :tenantId
        and provider = 'gmail'
      order by updated_at desc
      limit 1
    `,
    { tenantId: input.tenantId },
  );

  return row ? normalizeProviderConnection(row) : null;
}

export async function upsertGmailProviderConnection(
  input: {
    tenantId: string;
    accountEmail?: string | null;
    accountSubject?: string | null;
    scopes: string[];
    tokenSet: GmailTokenSet;
    encryptionKey: string;
    metadata?: unknown;
  },
  dataApi: AuroraDataApiClient = createProviderConnectionDataApi(),
): Promise<ProviderConnectionRecord> {
  const encryptedAccessToken = input.tokenSet.accessToken
    ? encryptGmailToken(input.tokenSet.accessToken, input.encryptionKey)
    : null;
  const encryptedRefreshToken = input.tokenSet.refreshToken
    ? encryptGmailToken(input.tokenSet.refreshToken, input.encryptionKey)
    : null;

  if (!encryptedAccessToken && !encryptedRefreshToken) {
    throw new Error("Gmail token exchange did not return an access token or refresh token.");
  }

  const [row] = await dataApi.execute<ProviderConnectionRow>(
    `
      insert into provider_connections (
        tenant_id,
        provider,
        account_email,
        account_subject,
        scopes,
        encrypted_access_token,
        encrypted_refresh_token,
        token_type,
        token_expires_at,
        state,
        last_error,
        metadata
      )
      values (
        :tenantId,
        'gmail',
        :accountEmail,
        :accountSubject,
        :scopes::text[],
        :encryptedAccessToken,
        :encryptedRefreshToken,
        :tokenType,
        :tokenExpiresAt,
        'connected',
        null,
        :metadata
      )
      on conflict (tenant_id, provider, account_email) where account_email is not null
      do update set
        account_subject = coalesce(excluded.account_subject, provider_connections.account_subject),
        scopes = excluded.scopes,
        encrypted_access_token = coalesce(excluded.encrypted_access_token, provider_connections.encrypted_access_token),
        encrypted_refresh_token = coalesce(excluded.encrypted_refresh_token, provider_connections.encrypted_refresh_token),
        token_type = excluded.token_type,
        token_expires_at = excluded.token_expires_at,
        state = 'connected',
        last_error = null,
        metadata = excluded.metadata,
        updated_at = now()
      returning
        id,
        tenant_id,
        provider,
        account_email,
        account_subject,
        scopes,
        encrypted_access_token,
        encrypted_refresh_token,
        token_type,
        token_expires_at::text,
        state,
        last_error,
        metadata,
        created_at::text,
        updated_at::text
    `,
    {
      tenantId: input.tenantId,
      accountEmail: normalizeNullableEmail(input.accountEmail),
      accountSubject: input.accountSubject ?? null,
      scopes: `{${input.scopes.map(escapePostgresTextArrayValue).join(",")}}`,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenType: input.tokenSet.tokenType ?? "Bearer",
      tokenExpiresAt: input.tokenSet.expiresAt ?? null,
      metadata: jsonParam(input.metadata ?? {}),
    },
  );

  return normalizeProviderConnection(requireRow(row, "upsert Gmail provider connection"));
}

export function hasUsableGmailTokens(connection: ProviderConnectionRecord | null): boolean {
  return Boolean(
    connection &&
      connection.state === "connected" &&
      (connection.encryptedAccessToken || connection.encryptedRefreshToken),
  );
}

function createProviderConnectionDataApi(): AuroraDataApiClient {
  const availability = getDataApiAvailability();

  if (!availability.available) {
    throw new DataApiUnavailableError(availability.missing);
  }

  return createAuroraDataApiClient(availability.config);
}

function normalizeProviderConnection(row: ProviderConnectionRow): ProviderConnectionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider,
    accountEmail: row.account_email,
    accountSubject: row.account_subject,
    scopes: normalizeScopes(row.scopes),
    encryptedAccessToken: row.encrypted_access_token,
    encryptedRefreshToken: row.encrypted_refresh_token,
    tokenType: row.token_type,
    tokenExpiresAt: row.token_expires_at,
    state: row.state,
    lastError: row.last_error,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeScopes(value: ProviderConnectionRow["scopes"]): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return [];
  }

  return value.replace(/^{|}$/g, "").split(",").filter(Boolean);
}

function normalizeNullableEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function jsonParam(value: unknown): DataApiParam {
  return { value: JSON.stringify(value), typeHint: "JSON" };
}

function escapePostgresTextArrayValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function requireRow<T>(row: T | undefined, action: string): T {
  if (!row) {
    throw new Error(`Aurora did not return a row for ${action}.`);
  }

  return row;
}
