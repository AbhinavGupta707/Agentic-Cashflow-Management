import type { Cp4GmailStatus } from "../db/cp4-communication-contract";
import type { ProviderStatus } from "../db/provider-status-contract";
import type { AuroraDataApiClient } from "../aws/rds-data-api";
import { getGmailConfigAvailability } from "../providers/gmail-config";
import { GmailProviderClient, getGmailProviderStatus } from "../providers/gmail";
import { refreshGmailAccessToken } from "../providers/gmail-oauth";
import { decryptGmailToken } from "../providers/gmail-tokens";
import {
  getLatestGmailProviderConnection,
  updateGmailProviderConnectionTokens,
  type ProviderConnectionRecord,
} from "../repositories/provider-connections";

const GMAIL_ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GMAIL_ENCRYPTION_KEY",
] as const;

export type GmailSendInput = {
  tenantId: string;
  draftId: string;
  actionId: string;
  contactId: string | null;
  toEmail: string;
  subject: string;
  body: string;
  idempotencyKey: string;
};

export type GmailSendResult =
  | {
      state: "succeeded";
      providerMessageId: string;
      providerExecutionId?: string | null;
      metadata?: Record<string, unknown>;
    }
  | {
      state: "failed" | "unavailable";
      reason: string;
      message: string;
      providerExecutionId?: string | null;
      metadata?: Record<string, unknown>;
    };

export type GmailProviderAdapter = {
  getStatus?: () => Promise<Cp4GmailStatus> | Cp4GmailStatus;
  sendEmail: (input: GmailSendInput) => Promise<GmailSendResult>;
};

export type DefaultGmailProviderAdapterInput = {
  tenantId: string;
  env?: NodeJS.ProcessEnv;
  dataApi?: AuroraDataApiClient;
  fetchImpl?: typeof fetch;
};

export function createDefaultGmailProviderAdapter(
  input: DefaultGmailProviderAdapterInput,
): GmailProviderAdapter {
  return {
    async getStatus() {
      return cp4StatusFromProviderStatus(
        await getGmailProviderStatus({
          tenantId: input.tenantId,
          env: input.env,
          dataApi: input.dataApi,
        }),
      );
    },
    async sendEmail(sendInput) {
      const now = new Date();
      const availability = getGmailConfigAvailability(input.env, now);

      if (!availability.available) {
        return unavailableGmailSendResult(cp4StatusFromProviderStatus(availability.status));
      }

      let connection: ProviderConnectionRecord | null;

      try {
        connection = await getLatestGmailProviderConnection({ tenantId: input.tenantId }, input.dataApi);
      } catch (error) {
        return providerUnavailableResult("provider-error", providerErrorMessage(error));
      }

      if (!connection || connection.state !== "connected") {
        return providerUnavailableResult("no-token", "No connected Gmail OAuth token is stored for this tenant.");
      }

      const senderEmail = availability.config.senderEmail ?? connection.accountEmail;

      if (!senderEmail) {
        return providerUnavailableResult(
          "provider-error",
          "Gmail sender email is not configured. Set GMAIL_SENDER_EMAIL or reconnect with an account email.",
        );
      }

      const accessTokenResult = await resolveGmailAccessToken({
        connection,
        encryptionKey: availability.config.encryptionKey,
        dataApi: input.dataApi,
        config: availability.config,
        fetchImpl: input.fetchImpl,
      });

      if (!accessTokenResult.ok) {
        return accessTokenResult.result;
      }

      const client = new GmailProviderClient({
        accessToken: accessTokenResult.accessToken,
        fetchImpl: input.fetchImpl,
      });
      const result = await client.sendMessage({
        from: { email: senderEmail, name: "Cashflow Ops" },
        to: [{ email: sendInput.toEmail }],
        subject: sendInput.subject,
        textBody: sendInput.body,
        idempotencyKey: sendInput.idempotencyKey,
        headers: {
          "X-H0-Tenant-Id": sendInput.tenantId,
          "X-H0-Draft-Id": sendInput.draftId,
          "X-H0-Action-Id": sendInput.actionId,
        },
      });

      if (result.state !== "succeeded" || !result.providerMessageId) {
        return {
          state: result.state === "unavailable" ? "unavailable" : "failed",
          reason: "provider-error",
          message: result.errorMessage ?? "Gmail provider send failed.",
          providerExecutionId: result.providerMessageId ?? result.providerDraftId ?? null,
          metadata: providerExecutionMetadata(result),
        };
      }

      return {
        state: "succeeded",
        providerMessageId: result.providerMessageId,
        providerExecutionId: result.providerMessageId,
        metadata: providerExecutionMetadata(result),
      };
    },
  };
}

export function getGmailRuntimeStatus(
  env: NodeJS.ProcessEnv = process.env,
  adapter?: GmailProviderAdapter | null,
  now: Date = new Date(),
): Cp4GmailStatus {
  const missingEnv = GMAIL_ENV_KEYS.filter((key) => !present(env[key]));

  if (missingEnv.length > 0) {
    return {
      provider: "gmail",
      status: "unavailable",
      reason: "no-key",
      message: "Gmail is not configured. Internal drafts and approvals remain available, but sends are disabled.",
      missingEnv,
      checkedAt: now.toISOString(),
    };
  }

  if (!adapter) {
    return {
      provider: "gmail",
      status: "unavailable",
      reason: "adapter-missing",
      message:
        "Gmail OAuth env is present, but the Gmail provider adapter is not registered in this runtime.",
      missingEnv: [],
      checkedAt: now.toISOString(),
    };
  }

  return {
    provider: "gmail",
    status: "available",
    reason: "configured",
    message: "Gmail provider env and runtime adapter are available for approval-gated email execution.",
    missingEnv: [],
    checkedAt: now.toISOString(),
  };
}

export async function getEffectiveGmailStatus(
  env: NodeJS.ProcessEnv = process.env,
  adapter?: GmailProviderAdapter | null,
): Promise<Cp4GmailStatus> {
  const baseStatus = getGmailRuntimeStatus(env, adapter);

  if (baseStatus.status !== "available" || !adapter?.getStatus) {
    return baseStatus;
  }

  const adapterStatus = await adapter.getStatus();

  return sanitizeGmailStatus(adapterStatus);
}

export function unavailableGmailSendResult(status: Cp4GmailStatus): GmailSendResult {
  return {
    state: "unavailable",
    reason: status.reason,
    message: status.message,
    metadata: {
      missingEnv: status.missingEnv,
    },
  };
}

export function sanitizeGmailStatus(status: Cp4GmailStatus): Cp4GmailStatus {
  return {
    provider: "gmail",
    status: status.status,
    reason: status.reason,
    message: status.message,
    missingEnv: [...status.missingEnv],
    checkedAt: status.checkedAt,
  };
}

function cp4StatusFromProviderStatus(status: ProviderStatus): Cp4GmailStatus {
  return {
    provider: "gmail",
    status: status.status === "available" ? "available" : "unavailable",
    reason:
      status.reason === "configured" ||
      status.reason === "missing-config" ||
      status.reason === "no-key" ||
      status.reason === "no-token" ||
      status.reason === "provider-error"
        ? status.reason
        : "provider-error",
    message: status.message,
    missingEnv: [...status.missingEnv],
    checkedAt: status.checkedAt,
  };
}

async function resolveGmailAccessToken(input: {
  connection: ProviderConnectionRecord;
  encryptionKey: string;
  dataApi?: AuroraDataApiClient;
  config: Parameters<typeof refreshGmailAccessToken>[0]["config"];
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; accessToken: string } | { ok: false; result: GmailSendResult }> {
  const encryptedAccessToken = input.connection.encryptedAccessToken;
  const encryptedRefreshToken = input.connection.encryptedRefreshToken;
  const tokenExpiresAt = input.connection.tokenExpiresAt ? Date.parse(input.connection.tokenExpiresAt) : NaN;
  const shouldRefresh =
    Boolean(encryptedRefreshToken) &&
    (!encryptedAccessToken || !Number.isFinite(tokenExpiresAt) || tokenExpiresAt <= Date.now() + 60_000);

  if (shouldRefresh && encryptedRefreshToken) {
    try {
      const refreshToken = decryptGmailToken(encryptedRefreshToken, input.encryptionKey);
      const tokenSet = await refreshGmailAccessToken({
        refreshToken,
        config: input.config,
        fetchImpl: input.fetchImpl,
      });
      await updateGmailProviderConnectionTokens(
        {
          connectionId: input.connection.id,
          tokenSet,
          encryptionKey: input.encryptionKey,
          metadata: {
            lastRefreshAt: new Date().toISOString(),
          },
        },
        input.dataApi,
      );

      return { ok: true, accessToken: tokenSet.accessToken! };
    } catch (error) {
      return {
        ok: false,
        result: providerUnavailableResult("provider-error", providerErrorMessage(error)),
      };
    }
  }

  if (!encryptedAccessToken) {
    return {
      ok: false,
      result: providerUnavailableResult("no-token", "Stored Gmail connection does not contain an access token."),
    };
  }

  try {
    return {
      ok: true,
      accessToken: decryptGmailToken(encryptedAccessToken, input.encryptionKey),
    };
  } catch (error) {
    return {
      ok: false,
      result: providerUnavailableResult("provider-error", providerErrorMessage(error)),
    };
  }
}

function providerUnavailableResult(
  reason: Cp4GmailStatus["reason"],
  message: string,
): GmailSendResult {
  return {
    state: "unavailable",
    reason,
    message,
  };
}

function providerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Gmail provider operation failed.";
}

function providerExecutionMetadata(result: {
  operation?: unknown;
  providerDraftId?: unknown;
  providerMessageId?: unknown;
  providerThreadId?: unknown;
}): Record<string, unknown> {
  return {
    operation: result.operation ?? null,
    providerDraftId: result.providerDraftId ?? null,
    providerMessageId: result.providerMessageId ?? null,
    providerThreadId: result.providerThreadId ?? null,
  };
}

function present(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
