import type { ProviderStatus } from "../db/provider-status-contract";

type LangSmithEnv = NodeJS.ProcessEnv;

export type LangSmithRunConfig = {
  runName: string;
  tags: string[];
  metadata: Record<string, string | number | boolean | null>;
};

export function getLangSmithTracingStatus(
  env: LangSmithEnv = process.env,
  now: Date = new Date(),
): ProviderStatus {
  const tracingEnabled = isTruthy(env.LANGSMITH_TRACING);
  const project = env.LANGSMITH_PROJECT?.trim() || "agentic-cashflow-management";

  if (!tracingEnabled) {
    return {
      provider: "langsmith",
      status: "disabled",
      reason: "disabled",
      message: "LangSmith tracing is disabled. Set LANGSMITH_TRACING=true and LANGSMITH_API_KEY to enable traces.",
      missingEnv: [],
      checkedAt: now.toISOString(),
      metadata: {
        project,
      },
    };
  }

  if (!present(env.LANGSMITH_API_KEY)) {
    return {
      provider: "langsmith",
      status: "unavailable",
      reason: "no-key",
      message: "LangSmith tracing was requested but LANGSMITH_API_KEY is missing.",
      missingEnv: ["LANGSMITH_API_KEY"],
      checkedAt: now.toISOString(),
      metadata: {
        project,
      },
    };
  }

  return {
    provider: "langsmith",
    status: "available",
    reason: "configured",
    message: "LangSmith tracing is configured for LangChain/LangGraph runs.",
    missingEnv: [],
    checkedAt: now.toISOString(),
    metadata: {
      project,
      endpoint: env.LANGSMITH_ENDPOINT?.trim() || "https://api.smith.langchain.com",
    },
  };
}

export function createLangSmithRunConfig(input: {
  status: ProviderStatus;
  runName: string;
  tenantId: string;
  companyExternalId: string;
  caseId: string;
}): LangSmithRunConfig | undefined {
  if (input.status.status !== "available") {
    return undefined;
  }

  return {
    runName: input.runName,
    tags: ["agentic-cashflow-management", "cp3", "cashflow-agent"],
    metadata: {
      tenantId: input.tenantId,
      companyExternalId: input.companyExternalId,
      caseId: input.caseId,
    },
  };
}

function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function present(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
