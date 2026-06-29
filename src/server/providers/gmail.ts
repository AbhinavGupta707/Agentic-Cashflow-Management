import type { ProviderStatus } from "../db/provider-status-contract";
import { getDataApiAvailability } from "../aws/data-api-env";
import {
  getLatestGmailProviderConnection,
  hasUsableGmailTokens,
  type ProviderConnectionRecord,
} from "../repositories/provider-connections";
import { GMAIL_API_BASE_URL, getConfiguredGmailStatus, getGmailConfigAvailability } from "./gmail-config";
import { buildGmailRawMessage, type GmailMimeMessageInput } from "./gmail-mime";

export type GmailProviderExecutionState = "succeeded" | "failed" | "unavailable";

export type GmailProviderExecutionResult = {
  provider: "gmail";
  operation: "draft.create" | "draft.send" | "message.send";
  state: GmailProviderExecutionState;
  idempotencyKey?: string;
  providerDraftId?: string;
  providerMessageId?: string;
  providerThreadId?: string;
  errorMessage?: string;
};

export type GmailProviderStatusInput = {
  tenantId?: string;
  env?: NodeJS.ProcessEnv;
  dataApiConnection?: ProviderConnectionRecord | null;
};

type GmailApiDraftResponse = {
  id?: string;
  message?: {
    id?: string;
    threadId?: string;
  };
};

type GmailApiMessageResponse = {
  id?: string;
  threadId?: string;
};

export async function getGmailProviderStatus(input: GmailProviderStatusInput = {}): Promise<ProviderStatus> {
  const now = new Date();
  const configAvailability = getGmailConfigAvailability(input.env, now);

  if (!configAvailability.available) {
    return configAvailability.status;
  }

  if (!input.tenantId) {
    return noTokenStatus("No tenant was supplied for Gmail provider connection lookup.", now);
  }

  const dataApiAvailability = getDataApiAvailability(input.env);
  if (!dataApiAvailability.available && input.dataApiConnection === undefined) {
    return {
      provider: "gmail",
      status: "unavailable",
      reason: "missing-config",
      message: dataApiAvailability.message,
      missingEnv: dataApiAvailability.missing,
      checkedAt: now.toISOString(),
      metadata: {
        scopes: configAvailability.config.scopes.join(" "),
      },
    };
  }

  const connection =
    input.dataApiConnection !== undefined
      ? input.dataApiConnection
      : await getLatestGmailProviderConnection({ tenantId: input.tenantId });

  if (!hasUsableGmailTokens(connection)) {
    return noTokenStatus("No connected Gmail OAuth token is stored for this tenant.", now);
  }

  return {
    ...getConfiguredGmailStatus(input.env, now),
    metadata: {
      scopes: connection?.scopes.join(" ") || configAvailability.config.scopes.join(" "),
      connected: true,
      accountEmail: connection?.accountEmail ?? null,
      tokenExpiresAt: connection?.tokenExpiresAt ?? null,
    },
  };
}

export class GmailProviderClient {
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiBaseUrl: string;

  constructor(input: { accessToken: string; fetchImpl?: typeof fetch; apiBaseUrl?: string }) {
    this.accessToken = input.accessToken;
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.apiBaseUrl = input.apiBaseUrl ?? GMAIL_API_BASE_URL;
  }

  async createDraft(
    input: GmailMimeMessageInput & { idempotencyKey?: string },
  ): Promise<GmailProviderExecutionResult> {
    try {
      const payload = await this.postJson<GmailApiDraftResponse>("/users/me/drafts", {
        message: {
          raw: buildGmailRawMessage(input),
        },
      });

      return {
        provider: "gmail",
        operation: "draft.create",
        state: "succeeded",
        idempotencyKey: input.idempotencyKey,
        providerDraftId: payload.id,
        providerMessageId: payload.message?.id,
        providerThreadId: payload.message?.threadId,
      };
    } catch (error) {
      return providerFailure("draft.create", input.idempotencyKey, error);
    }
  }

  async sendMessage(
    input: GmailMimeMessageInput & { idempotencyKey?: string },
  ): Promise<GmailProviderExecutionResult> {
    try {
      const payload = await this.postJson<GmailApiMessageResponse>("/users/me/messages/send", {
        raw: buildGmailRawMessage(input),
      });

      return {
        provider: "gmail",
        operation: "message.send",
        state: "succeeded",
        idempotencyKey: input.idempotencyKey,
        providerMessageId: payload.id,
        providerThreadId: payload.threadId,
      };
    } catch (error) {
      return providerFailure("message.send", input.idempotencyKey, error);
    }
  }

  async sendDraft(input: { draftId: string; idempotencyKey?: string }): Promise<GmailProviderExecutionResult> {
    try {
      const payload = await this.postJson<GmailApiMessageResponse>("/users/me/drafts/send", {
        id: input.draftId,
      });

      return {
        provider: "gmail",
        operation: "draft.send",
        state: "succeeded",
        idempotencyKey: input.idempotencyKey,
        providerDraftId: input.draftId,
        providerMessageId: payload.id,
        providerThreadId: payload.threadId,
      };
    } catch (error) {
      return providerFailure("draft.send", input.idempotencyKey, error);
    }
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Gmail API request failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as T;
  }
}

function noTokenStatus(message: string, now: Date): ProviderStatus {
  return {
    provider: "gmail",
    status: "unavailable",
    reason: "no-token",
    message,
    missingEnv: [],
    checkedAt: now.toISOString(),
  };
}

function providerFailure(
  operation: GmailProviderExecutionResult["operation"],
  idempotencyKey: string | undefined,
  error: unknown,
): GmailProviderExecutionResult {
  return {
    provider: "gmail",
    operation,
    state: "failed",
    idempotencyKey,
    errorMessage: error instanceof Error ? error.message : "Gmail provider operation failed.",
  };
}
