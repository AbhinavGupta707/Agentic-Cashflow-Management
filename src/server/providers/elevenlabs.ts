import type { ProviderStatus } from "../db/provider-status-contract";

const DEFAULT_ELEVENLABS_API_BASE_URL = "https://api.elevenlabs.io";

type ElevenLabsEnv = NodeJS.ProcessEnv;

export type ElevenLabsProviderOptions = {
  env?: ElevenLabsEnv;
  fetchImpl?: typeof fetch;
  validateRemote?: boolean;
};

export async function getElevenLabsProviderStatus(
  options: ElevenLabsProviderOptions = {},
  now: Date = new Date(),
): Promise<ProviderStatus> {
  const env = options.env ?? process.env;

  if (!present(env.ELEVENLABS_API_KEY)) {
    return {
      provider: "elevenlabs",
      status: "unavailable",
      reason: "no-key",
      message: "ElevenLabs is not configured. Twilio remains the first live-capable CP5 voice provider.",
      missingEnv: ["ELEVENLABS_API_KEY"],
      checkedAt: now.toISOString(),
      metadata: {
        baseUrl: baseUrl(env),
        remoteValidation: false,
      },
    };
  }

  if (options.validateRemote || env.ELEVENLABS_VALIDATE_STATUS === "true") {
    return validateElevenLabsKey(env, options.fetchImpl ?? fetch, now);
  }

  return {
    provider: "elevenlabs",
    status: "disabled",
    reason: "disabled",
    message:
      "ElevenLabs key is present but not treated as live-ready until remote validation succeeds. Twilio handles CP5 call execution first.",
    missingEnv: [],
    checkedAt: now.toISOString(),
    metadata: {
      baseUrl: baseUrl(env),
      remoteValidation: false,
    },
  };
}

async function validateElevenLabsKey(
  env: ElevenLabsEnv,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<ProviderStatus> {
  try {
    const response = await fetchImpl(`${baseUrl(env)}/v1/models`, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "xi-api-key": env.ELEVENLABS_API_KEY!,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 401 || response.status === 403) {
      return {
        provider: "elevenlabs",
        status: "unavailable",
        reason: "invalid-config",
        message: `ElevenLabs API key validation failed with HTTP ${response.status}; replace the key before enabling ElevenLabs voice features.`,
        missingEnv: [],
        checkedAt: now.toISOString(),
        metadata: {
          baseUrl: baseUrl(env),
          remoteValidation: true,
        },
      };
    }

    if (!response.ok) {
      return {
        provider: "elevenlabs",
        status: "error",
        reason: "provider-error",
        message: `ElevenLabs validation failed with HTTP ${response.status}.`,
        missingEnv: [],
        checkedAt: now.toISOString(),
        metadata: {
          baseUrl: baseUrl(env),
          remoteValidation: true,
        },
      };
    }

    return {
      provider: "elevenlabs",
      status: "available",
      reason: "configured",
      message: "ElevenLabs API key validated successfully. CP5 still routes live phone execution through Twilio.",
      missingEnv: [],
      checkedAt: now.toISOString(),
      metadata: {
        baseUrl: baseUrl(env),
        remoteValidation: true,
      },
    };
  } catch (error) {
    return {
      provider: "elevenlabs",
      status: "error",
      reason: "provider-error",
      message: error instanceof Error ? error.message : "ElevenLabs validation failed.",
      missingEnv: [],
      checkedAt: now.toISOString(),
      metadata: {
        baseUrl: baseUrl(env),
        remoteValidation: true,
      },
    };
  }
}

function baseUrl(env: ElevenLabsEnv): string {
  return env.ELEVENLABS_API_BASE_URL?.trim().replace(/\/+$/, "") || DEFAULT_ELEVENLABS_API_BASE_URL;
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
