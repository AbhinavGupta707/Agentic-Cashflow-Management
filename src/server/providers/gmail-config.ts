import type { ProviderStatus } from "../db/provider-status-contract";

export const DEFAULT_GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.compose"] as const;

export const GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1";

export type GmailEnv = NodeJS.ProcessEnv;

export type GmailConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
  scopes: string[];
  senderEmail?: string;
};

export type GmailConfigAvailability =
  | {
      available: true;
      config: GmailConfig;
    }
  | {
      available: false;
      status: ProviderStatus;
    };

const GMAIL_REQUIRED_ENV = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GMAIL_ENCRYPTION_KEY",
] as const;

export function getGmailConfigAvailability(
  env: GmailEnv = process.env,
  now: Date = new Date(),
): GmailConfigAvailability {
  const missingEnv = GMAIL_REQUIRED_ENV.filter((key) => !present(env[key]));

  if (missingEnv.length > 0) {
    return {
      available: false,
      status: {
        provider: "gmail",
        status: "unavailable",
        reason: "no-key",
        message:
          "Gmail is not configured. Set Google OAuth credentials and GMAIL_ENCRYPTION_KEY to enable Gmail provider connection.",
        missingEnv,
        checkedAt: now.toISOString(),
        metadata: {
          scopes: getGmailScopes(env).join(" "),
        },
      },
    };
  }

  return {
    available: true,
    config: {
      clientId: env.GOOGLE_CLIENT_ID!.trim(),
      clientSecret: env.GOOGLE_CLIENT_SECRET!.trim(),
      redirectUri: env.GOOGLE_REDIRECT_URI!.trim(),
      encryptionKey: env.GMAIL_ENCRYPTION_KEY!.trim(),
      scopes: getGmailScopes(env),
      senderEmail: present(env.GMAIL_SENDER_EMAIL) ? env.GMAIL_SENDER_EMAIL.trim().toLowerCase() : undefined,
    },
  };
}

export function getConfiguredGmailStatus(env: GmailEnv = process.env, now: Date = new Date()): ProviderStatus {
  const availability = getGmailConfigAvailability(env, now);

  if (!availability.available) {
    return availability.status;
  }

  return {
    provider: "gmail",
    status: "available",
    reason: "configured",
    message: "Gmail OAuth credentials and token encryption are configured.",
    missingEnv: [],
    checkedAt: now.toISOString(),
    metadata: {
      scopes: availability.config.scopes.join(" "),
      senderEmailConfigured: Boolean(availability.config.senderEmail),
    },
  };
}

export function getGmailScopes(env: GmailEnv = process.env): string[] {
  const raw = env.GOOGLE_GMAIL_SCOPES;

  if (!present(raw)) {
    return [...DEFAULT_GMAIL_SCOPES];
  }

  const scopes = raw
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return scopes.length > 0 ? scopes : [...DEFAULT_GMAIL_SCOPES];
}

export function present(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
