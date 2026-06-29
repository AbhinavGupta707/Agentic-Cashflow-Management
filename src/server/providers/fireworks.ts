import type { CashflowDraft } from "../db/agent-contract";
import type { ProviderStatus } from "../db/provider-status-contract";

const DEFAULT_FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";
const DEFAULT_FIREWORKS_MODEL = "accounts/fireworks/models/llama-v3p1-8b-instruct";

type FireworksEnv = NodeJS.ProcessEnv;

export type FireworksDraftInput = {
  companyName: string;
  baseCurrency: string;
  forecastShortfallCents: number;
  action: {
    externalId: string;
    title: string;
    customerExternalId: string;
    customerName: string;
    invoiceExternalId: string | null;
    expectedRecoveryCents: number;
    rationale: string;
  } | null;
  memoryFacts: string[];
};

export type FireworksDraftResult = {
  providerStatus: ProviderStatus;
  draft: CashflowDraft;
  rawJson?: unknown;
};

export type FireworksClientOptions = {
  env?: FireworksEnv;
  fetchImpl?: typeof fetch;
};

type FireworksChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type DraftJson = {
  subject?: unknown;
  body?: unknown;
};

export class FireworksProvider {
  private readonly env: FireworksEnv;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FireworksClientOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getStatus(now: Date = new Date()): ProviderStatus {
    if (!present(this.env.FIREWORKS_API_KEY)) {
      return {
        provider: "fireworks",
        status: "unavailable",
        reason: "no-key",
        message: "Fireworks is not configured. Set FIREWORKS_API_KEY to enable live structured draft generation.",
        missingEnv: ["FIREWORKS_API_KEY"],
        checkedAt: now.toISOString(),
        metadata: {
          baseUrl: this.baseUrl(),
          model: this.model(),
        },
      };
    }

    return {
      provider: "fireworks",
      status: "available",
      reason: "configured",
      message: "Fireworks API key is configured for live structured draft generation.",
      missingEnv: [],
      checkedAt: now.toISOString(),
      metadata: {
        baseUrl: this.baseUrl(),
        model: this.model(),
      },
    };
  }

  async generateCollectionDraft(input: FireworksDraftInput): Promise<FireworksDraftResult> {
    const status = this.getStatus();

    if (status.status !== "available") {
      return {
        providerStatus: status,
        draft: createDeterministicCollectionDraft(input),
      };
    }

    try {
      const response = await this.fetchImpl(`${this.baseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.env.FIREWORKS_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model(),
          temperature: 0.2,
          max_tokens: 700,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You draft concise, approval-gated cash collection emails. Return only JSON with subject and body. Do not claim an email was sent.",
            },
            {
              role: "user",
              content: JSON.stringify({
                companyName: input.companyName,
                baseCurrency: input.baseCurrency,
                forecastShortfallCents: input.forecastShortfallCents,
                action: input.action,
                memoryFacts: input.memoryFacts,
              }),
            },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        return {
          providerStatus: providerErrorStatus(`Fireworks request failed with HTTP ${response.status}.`),
          draft: createDeterministicCollectionDraft(input),
        };
      }

      const payload = (await response.json()) as FireworksChatResponse;
      const content = payload.choices?.[0]?.message?.content;
      const parsed = parseDraftJson(content);

      if (!parsed) {
        return {
          providerStatus: providerErrorStatus("Fireworks returned a response that was not valid draft JSON."),
          draft: createDeterministicCollectionDraft(input),
          rawJson: payload,
        };
      }

      return {
        providerStatus: status,
        draft: {
          source: "fireworks",
          channel: "email",
          subject: parsed.subject,
          body: parsed.body,
          actionExternalId: input.action?.externalId ?? null,
          customerExternalId: input.action?.customerExternalId ?? null,
        },
        rawJson: payload,
      };
    } catch (error) {
      return {
        providerStatus: providerErrorStatus(error instanceof Error ? error.message : "Fireworks request failed."),
        draft: createDeterministicCollectionDraft(input),
      };
    }
  }

  private baseUrl(): string {
    return this.env.FIREWORKS_BASE_URL?.trim().replace(/\/+$/, "") || DEFAULT_FIREWORKS_BASE_URL;
  }

  private model(): string {
    return this.env.FIREWORKS_MODEL?.trim() || DEFAULT_FIREWORKS_MODEL;
  }
}

export function createFireworksProvider(options: FireworksClientOptions = {}): FireworksProvider {
  return new FireworksProvider(options);
}

export function createDeterministicCollectionDraft(input: FireworksDraftInput): CashflowDraft {
  if (!input.action) {
    return {
      source: "deterministic_fallback",
      channel: "email",
      subject: `${input.companyName} cashflow follow-up`,
      body:
        "Hello,\n\nWe are reviewing the current cashflow plan and will follow up with the right payment details once a human has approved the next step.\n\nThanks.",
      actionExternalId: null,
      customerExternalId: null,
    };
  }

  const amount = formatMoney(input.action.expectedRecoveryCents, input.baseCurrency);
  const memoryLine =
    input.memoryFacts.length > 0 ? `\n\nContext we will use carefully: ${input.memoryFacts[0]}` : "";

  return {
    source: "deterministic_fallback",
    channel: "email",
    subject: `Payment follow-up for ${input.action.customerName}`,
    body: `Hello,\n\nI am checking in on ${input.action.title}. The current cash plan is looking for ${amount} of recovery, and this action is still approval-gated before anything is sent.\n\nReason: ${input.action.rationale}.${memoryLine}\n\nThanks,\n${input.companyName}`,
    actionExternalId: input.action.externalId,
    customerExternalId: input.action.customerExternalId,
  };
}

function providerErrorStatus(message: string): ProviderStatus {
  return {
    provider: "fireworks",
    status: "error",
    reason: "provider-error",
    message,
    missingEnv: [],
    checkedAt: new Date().toISOString(),
  };
}

function parseDraftJson(content: string | null | undefined): { subject: string; body: string } | null {
  if (!present(content)) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as DraftJson;
    if (typeof parsed.subject === "string" && typeof parsed.body === "string") {
      return {
        subject: parsed.subject,
        body: parsed.body,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function present(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
