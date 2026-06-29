import type { Cp4GmailStatus } from "../db/cp4-communication-contract";

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

function present(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
