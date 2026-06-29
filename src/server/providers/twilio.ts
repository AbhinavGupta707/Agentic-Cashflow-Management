import type { ProviderStatus } from "../db/provider-status-contract";

const DEFAULT_TWILIO_API_BASE_URL = "https://api.twilio.com/2010-04-01";
const TWILIO_ACCOUNT_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;
const TWILIO_CALL_SID_PATTERN = /^CA[0-9a-fA-F]{32}$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

type TwilioEnv = NodeJS.ProcessEnv;

export type TwilioCallInput = {
  to: string;
  from?: string;
  twimlUrl?: string;
  statusCallbackUrl?: string | null;
  idempotencyKey?: string;
};

export type TwilioCallResult = {
  provider: "twilio";
  operation: "voice.call.create";
  state: "succeeded" | "failed";
  providerCallId?: string;
  callStatus?: string;
  errorMessage?: string;
};

type TwilioCallResponse = {
  sid?: string;
  status?: string;
};

export type TwilioProviderOptions = {
  env?: TwilioEnv;
  fetchImpl?: typeof fetch;
};

export class TwilioProvider {
  private readonly env: TwilioEnv;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TwilioProviderOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getStatus(now: Date = new Date()): ProviderStatus {
    const missing = requiredEnvKeys.filter((key) => !present(this.env[key]));

    if (missing.length > 0) {
      return {
        provider: "twilio",
        status: "unavailable",
        reason: missing.includes("TWILIO_ACCOUNT_SID") || missing.includes("TWILIO_AUTH_TOKEN") ? "no-key" : "missing-config",
        message:
          "Twilio voice is not live-capable until account credentials, a caller number, and a TwiML URL are configured.",
        missingEnv: missing,
        checkedAt: now.toISOString(),
        metadata: statusMetadata(this.env),
      };
    }

    if (!TWILIO_ACCOUNT_SID_PATTERN.test(this.env.TWILIO_ACCOUNT_SID!.trim())) {
      return {
        provider: "twilio",
        status: "unavailable",
        reason: "invalid-config",
        message: "TWILIO_ACCOUNT_SID must look like a Twilio Account SID before live calls can be enabled.",
        missingEnv: [],
        checkedAt: now.toISOString(),
        metadata: statusMetadata(this.env),
      };
    }

    if (!E164_PATTERN.test(this.env.TWILIO_FROM_NUMBER!.trim())) {
      return {
        provider: "twilio",
        status: "unavailable",
        reason: "invalid-config",
        message: "TWILIO_FROM_NUMBER must be an E.164 phone number owned or verified in the Twilio account.",
        missingEnv: [],
        checkedAt: now.toISOString(),
        metadata: statusMetadata(this.env),
      };
    }

    return {
      provider: "twilio",
      status: "available",
      reason: "configured",
      message:
        "Twilio credentials, caller number, and TwiML URL are configured. Live calls still require an approved action and explicit test target.",
      missingEnv: [],
      checkedAt: now.toISOString(),
      metadata: statusMetadata(this.env),
    };
  }

  async createCall(input: TwilioCallInput): Promise<TwilioCallResult> {
    const status = this.getStatus();

    if (status.status !== "available") {
      return {
        provider: "twilio",
        operation: "voice.call.create",
        state: "failed",
        errorMessage: status.message,
      };
    }

    try {
      const body = new URLSearchParams();
      body.set("To", input.to);
      body.set("From", input.from ?? this.env.TWILIO_FROM_NUMBER!);
      body.set("Url", input.twimlUrl ?? this.env.TWILIO_TWIML_URL!);
      body.set("Method", "POST");

      if (input.statusCallbackUrl ?? this.env.TWILIO_STATUS_CALLBACK_URL) {
        body.set("StatusCallback", input.statusCallbackUrl ?? this.env.TWILIO_STATUS_CALLBACK_URL!);
        body.set("StatusCallbackMethod", "POST");
        body.append("StatusCallbackEvent", "initiated");
        body.append("StatusCallbackEvent", "ringing");
        body.append("StatusCallbackEvent", "answered");
        body.append("StatusCallbackEvent", "completed");
      }

      const response = await this.fetchImpl(`${apiBaseUrl(this.env)}/Accounts/${this.env.TWILIO_ACCOUNT_SID}/Calls.json`, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.env.TWILIO_ACCOUNT_SID}:${this.env.TWILIO_AUTH_TOKEN}`).toString(
            "base64",
          )}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        return {
          provider: "twilio",
          operation: "voice.call.create",
          state: "failed",
          errorMessage: `Twilio call create failed with HTTP ${response.status}.`,
        };
      }

      const payload = (await response.json()) as TwilioCallResponse;
      if (!payload.sid || !TWILIO_CALL_SID_PATTERN.test(payload.sid)) {
        return {
          provider: "twilio",
          operation: "voice.call.create",
          state: "failed",
          errorMessage: "Twilio did not return a valid Call SID.",
        };
      }

      return {
        provider: "twilio",
        operation: "voice.call.create",
        state: "succeeded",
        providerCallId: payload.sid,
        callStatus: payload.status,
      };
    } catch (error) {
      return {
        provider: "twilio",
        operation: "voice.call.create",
        state: "failed",
        errorMessage: error instanceof Error ? error.message : "Twilio call create failed.",
      };
    }
  }
}

export function createTwilioProvider(options: TwilioProviderOptions = {}): TwilioProvider {
  return new TwilioProvider(options);
}

export function isValidE164PhoneNumber(value: string | null | undefined): value is string {
  return typeof value === "string" && E164_PATTERN.test(value.trim());
}

const requiredEnvKeys = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "TWILIO_TWIML_URL",
] as const;

function apiBaseUrl(env: TwilioEnv): string {
  return env.TWILIO_API_BASE_URL?.trim().replace(/\/+$/, "") || DEFAULT_TWILIO_API_BASE_URL;
}

function statusMetadata(env: TwilioEnv): ProviderStatus["metadata"] {
  return {
    accountSidConfigured: present(env.TWILIO_ACCOUNT_SID),
    fromNumberConfigured: present(env.TWILIO_FROM_NUMBER),
    twimlUrlConfigured: present(env.TWILIO_TWIML_URL),
    statusCallbackConfigured: present(env.TWILIO_STATUS_CALLBACK_URL),
    testTargetConfigured: present(env.TWILIO_TEST_TO_NUMBER),
    apiBaseUrl: apiBaseUrl(env),
  };
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
