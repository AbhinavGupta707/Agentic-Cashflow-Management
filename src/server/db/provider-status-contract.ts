export type ProviderName = "elevenlabs" | "fireworks" | "gmail" | "langsmith" | "twilio";

export type ProviderAvailability = "available" | "unavailable" | "disabled" | "error";

export type ProviderUnavailableReason =
  | "configured"
  | "disabled"
  | "invalid-config"
  | "missing-config"
  | "no-key"
  | "no-token"
  | "provider-error";

export type ProviderStatus = {
  provider: ProviderName;
  status: ProviderAvailability;
  reason: ProviderUnavailableReason;
  message: string;
  missingEnv: string[];
  checkedAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export const FIREWORKS_PROVIDER_ENV = [
  "FIREWORKS_API_KEY",
  "FIREWORKS_BASE_URL",
  "FIREWORKS_MODEL",
] as const;

export const LANGSMITH_PROVIDER_ENV = [
  "LANGSMITH_TRACING",
  "LANGSMITH_API_KEY",
  "LANGSMITH_PROJECT",
] as const;

export const GMAIL_PROVIDER_ENV = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GMAIL_ENCRYPTION_KEY",
] as const;

export const TWILIO_PROVIDER_ENV = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "TWILIO_TWIML_URL",
] as const;

export const ELEVENLABS_PROVIDER_ENV = ["ELEVENLABS_API_KEY"] as const;
