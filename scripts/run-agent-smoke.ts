import "./load-local-env";

import { DataApiUnavailableError, getDataApiAvailability } from "../src/server/aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../src/server/aws/rds-data-api";
import type { CashflowGraphOutput } from "../src/server/db/agent-contract";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../src/server/db/case-state-contract";

const PROVIDER_RUNTIME_ENV_KEYS = [
  "FIREWORKS_API_KEY",
  "FIREWORKS_MODEL",
  "FIREWORKS_BASE_URL",
  "LANGCHAIN_API_KEY",
  "LANGCHAIN_ENDPOINT",
  "LANGCHAIN_PROJECT",
  "LANGCHAIN_TRACING",
  "LANGCHAIN_TRACING_V2",
  "LANGSMITH_API_KEY",
  "LANGSMITH_ENDPOINT",
  "LANGSMITH_PROJECT",
  "LANGSMITH_TRACING",
] as const;

type ScopeRow = {
  tenant_id: string;
  company_id: string;
  company_name: string;
};

type AgentRunCheckRow = {
  state: string;
  trace_url: string | null;
};

type CheckpointRow = {
  checkpoint_key: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const availability = getDataApiAvailability();

  if (!availability.available) {
    console.log("CP3 agent live smoke unavailable.");
    console.log(`Missing environment variables: ${availability.missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const dataApi = createAuroraDataApiClient(availability.config);
  const companyExternalId = args.companyExternalId ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID;
  const caseId = args.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const scope = await resolveScope(dataApi, companyExternalId);
  const graphEnv = args.allowProviders ? process.env : buildNoKeyGraphEnv();
  const idempotencyKey = `cp3_agent_smoke:${companyExternalId}:${caseId}`;
  const first = await runGraph({
    dataApi,
    tenantId: scope.tenant_id,
    companyId: scope.company_id,
    companyExternalId,
    caseId,
    idempotencyKey,
    env: graphEnv,
    isolateProviders: !args.allowProviders,
  });

  await assertPersistedGraph(dataApi, scope.tenant_id, first);
  printResult("CP3 agent live smoke passed.", scope, first);

  if (args.replay) {
    const second = await runGraph({
      dataApi,
      tenantId: scope.tenant_id,
      companyId: scope.company_id,
      companyExternalId,
      caseId,
      idempotencyKey,
      env: graphEnv,
      isolateProviders: !args.allowProviders,
    });

    assert(first.agentRunId === second.agentRunId, "agent run id stays stable on replay");
    assert(
      stableList(first.checkpointKeys) === stableList(second.checkpointKeys),
      "checkpoint keys stay stable on replay",
    );
    await assertPersistedGraph(dataApi, scope.tenant_id, second);
    printResult("CP3 agent idempotent replay passed.", scope, second);
  }
}

async function runGraph(input: {
  dataApi: AuroraDataApiClient;
  tenantId: string;
  companyId: string;
  companyExternalId: string;
  caseId: string;
  idempotencyKey: string;
  env: NodeJS.ProcessEnv;
  isolateProviders: boolean;
}): Promise<CashflowGraphOutput> {
  const operation = async () => {
    const { runCashflowAgentGraph } = await import("../src/server/agents/cashflow-graph");

    return runCashflowAgentGraph(
      {
        tenantId: input.tenantId,
        companyId: input.companyId,
        companyExternalId: input.companyExternalId,
        caseId: input.caseId,
        runKind: "recommendation",
        idempotencyKey: input.idempotencyKey,
      },
      {
        dataApi: input.dataApi,
        env: input.env,
        persist: true,
      },
    );
  };

  return input.isolateProviders ? withNoKeyProviderRuntime(operation) : operation();
}

async function resolveScope(
  dataApi: AuroraDataApiClient,
  companyExternalId: string,
): Promise<ScopeRow> {
  const [scope] = await dataApi.execute<ScopeRow>(
    `
      select
        c.tenant_id,
        c.id as company_id,
        coalesce(c.trading_name, c.legal_name) as company_name
      from companies c
      where c.external_id = :companyExternalId
      limit 1
    `,
    {
      companyExternalId,
    },
  );

  if (!scope) {
    throw new Error(`No company found for external id ${companyExternalId}. Run the demo seed first.`);
  }

  return scope;
}

async function assertPersistedGraph(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  output: CashflowGraphOutput,
): Promise<void> {
  assert(output.agentRunId !== null, "agent run id is persisted");

  const [run] = await dataApi.execute<AgentRunCheckRow>(
    `
      select state, trace_url
      from agent_runs
      where tenant_id = :tenantId
        and id = :agentRunId
      limit 1
    `,
    {
      tenantId,
      agentRunId: output.agentRunId,
    },
  );

  assert(run?.state === "completed", "agent run persisted as completed");

  const checkpoints = await dataApi.execute<CheckpointRow>(
    `
      select checkpoint_key
      from agent_checkpoints
      where tenant_id = :tenantId
        and agent_run_id = :agentRunId
      order by checkpoint_key asc
    `,
    {
      tenantId,
      agentRunId: output.agentRunId,
    },
  );
  const checkpointKeys = checkpoints.map((checkpoint) => checkpoint.checkpoint_key);

  for (const key of ["graph.started", "forecast.snapshot", "recommendation.plan", "draft.generated", "graph.completed"]) {
    assert(checkpointKeys.includes(key), `persisted checkpoint ${key}`);
  }

  assert(output.recommendations.length > 0, "agent graph produced recommendations");
  assert(output.draft.channel === "email", "agent graph produced an email draft handoff");
}

function buildNoKeyGraphEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  for (const key of PROVIDER_RUNTIME_ENV_KEYS) {
    delete env[key];
  }

  env.LANGSMITH_TRACING = "true";

  return env;
}

async function withNoKeyProviderRuntime<T>(operation: () => Promise<T>): Promise<T> {
  const previousValues = new Map<string, string | undefined>();

  for (const key of PROVIDER_RUNTIME_ENV_KEYS) {
    previousValues.set(key, process.env[key]);
    delete process.env[key];
  }

  process.env.LANGCHAIN_TRACING = "false";
  process.env.LANGCHAIN_TRACING_V2 = "false";
  process.env.LANGSMITH_TRACING = "false";

  try {
    return await operation();
  } finally {
    for (const key of PROVIDER_RUNTIME_ENV_KEYS) {
      const previousValue = previousValues.get(key);

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

function printResult(label: string, scope: ScopeRow, output: CashflowGraphOutput) {
  console.log(label);
  console.log(`Company: ${scope.company_name} (${output.companyExternalId})`);
  console.log(`Case: ${output.caseId}`);
  console.log(`Agent run id: ${output.agentRunId}`);
  console.log(`Provider Fireworks: ${output.providerStatuses.fireworks.status} (${output.providerStatuses.fireworks.reason})`);
  console.log(`Provider LangSmith: ${output.providerStatuses.langsmith.status} (${output.providerStatuses.langsmith.reason})`);
  console.log(`Draft source: ${output.draft.source}`);
  console.log(`Recommendations: ${output.recommendations.length}`);
  console.log(`Checkpoints: ${output.checkpointKeys.join(", ")}`);
}

function parseArgs(argv: string[]) {
  return {
    replay: argv.includes("--replay"),
    allowProviders: argv.includes("--allow-providers"),
    companyExternalId: valueFor(argv, "--company") ?? valueFor(argv, "--company-external-id"),
    caseId: valueFor(argv, "--case-id"),
  };
}

function valueFor(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);

  if (index === -1) {
    return undefined;
  }

  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function stableList(values: string[]): string {
  return [...values].sort().join(",");
}

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) {
    throw new Error(`CP3 agent smoke failed: ${label}`);
  }
}

main().catch((error) => {
  if (error instanceof DataApiUnavailableError) {
    console.log("CP3 agent live smoke unavailable.");
    console.log(`Missing environment variables: ${error.missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.error("CP3 agent smoke failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
