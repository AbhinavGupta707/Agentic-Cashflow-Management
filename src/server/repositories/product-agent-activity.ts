import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../aws/rds-data-api";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";
import type { ProviderStatus } from "../db/provider-status-contract";
import { createFireworksProvider } from "../providers/fireworks";
import { getLangSmithTracingStatus } from "../providers/langsmith";

type RepositoryOptions = {
  dataApi?: AuroraDataApiClient;
  companyExternalId?: string;
  caseId?: string;
  env?: NodeJS.ProcessEnv;
};

type CompanyScopeRow = {
  company_id: string;
  tenant_id: string;
  company_external_id: string | null;
};

type AgentRunRow = {
  id: string;
  run_kind: string;
  graph_name: string;
  state: string;
  error_message: string | null;
  trace_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type AgentCheckpointRow = {
  agent_run_id: string;
  checkpoint_key: string;
  label: string | null;
  stage: string | null;
  created_at: string;
};

type EventLedgerRow = {
  id: string;
  aggregate_type: string;
  event_type: string;
  occurred_at: string;
  payload_summary: string | null;
};

type ProviderExecutionRow = {
  id: string;
  action_id: string | null;
  provider: string;
  operation: string;
  state: string;
  provider_execution_id: string | null;
  attempts: number;
  last_error: string | null;
  attempted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type AuditRow = {
  id: string;
  actor_type: string;
  action: string;
  target_type: string;
  target_id: string | null;
  occurred_at: string;
};

export type ProductAgentActivityState = {
  companyExternalId: string;
  caseId: string;
  generatedAt: string;
  providers: {
    fireworks: ProviderStatus;
    langsmith: ProviderStatus;
  };
  summary: {
    runCount: number;
    checkpointCount: number;
    eventCount: number;
    providerExecutionCount: number;
    auditCount: number;
    traceCount: number;
    lastActivityAt: string | null;
  };
  runs: ProductAgentRun[];
  timeline: ProductActivityItem[];
};

export type ProductAgentRun = {
  id: string;
  runKind: string;
  graphName: string;
  state: string;
  errorMessage: string | null;
  traceUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  checkpoints: ProductAgentCheckpoint[];
};

export type ProductAgentCheckpoint = {
  checkpointKey: string;
  label: string;
  stage: string | null;
  createdAt: string;
};

export type ProductActivityItem = {
  id: string;
  kind: "agent_run" | "checkpoint" | "event" | "provider_execution" | "audit";
  title: string;
  state: string | null;
  occurredAt: string;
  detail: string;
  traceUrl?: string | null;
  providerExecutionId?: string | null;
};

export async function getProductAgentActivity(
  options: RepositoryOptions = {},
): Promise<ProductAgentActivityState> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const caseId = resolveCaseId(options);
  const [runs, events, providerExecutions, audits] = await Promise.all([
    listAgentRuns(dataApi, scope.company_id, caseId),
    listEvents(dataApi, scope.tenant_id),
    listProviderExecutions(dataApi, scope.tenant_id, scope.company_id, caseId),
    listAudits(dataApi, scope.tenant_id),
  ]);
  const checkpoints = runs.length > 0 ? await listAgentCheckpoints(dataApi, scope.tenant_id, runs.map((run) => run.id)) : [];
  const checkpointsByRun = groupCheckpointsByRun(checkpoints);
  const normalizedRuns = runs.map((run) => ({
    id: run.id,
    runKind: run.run_kind,
    graphName: run.graph_name,
    state: run.state,
    errorMessage: run.error_message,
    traceUrl: run.trace_url,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    checkpoints: (checkpointsByRun.get(run.id) ?? []).map((checkpoint) => ({
      checkpointKey: checkpoint.checkpoint_key,
      label: checkpoint.label ?? formatIdentifier(checkpoint.checkpoint_key),
      stage: checkpoint.stage,
      createdAt: checkpoint.created_at,
    })),
  }));

  return {
    companyExternalId: scope.company_external_id ?? resolveCompanyExternalId(options),
    caseId,
    generatedAt: new Date().toISOString(),
    providers: {
      fireworks: createFireworksProvider({ env: options.env }).getStatus(),
      langsmith: getLangSmithTracingStatus(options.env),
    },
    summary: {
      runCount: runs.length,
      checkpointCount: checkpoints.length,
      eventCount: events.length,
      providerExecutionCount: providerExecutions.length,
      auditCount: audits.length,
      traceCount: runs.filter((run) => Boolean(run.trace_url)).length,
      lastActivityAt: latestActivityAt(runs, checkpoints, events, providerExecutions, audits),
    },
    runs: normalizedRuns,
    timeline: buildTimeline(runs, checkpoints, events, providerExecutions, audits).slice(0, 60),
  };
}

async function listAgentRuns(
  dataApi: AuroraDataApiClient,
  companyId: string,
  caseId: string,
): Promise<AgentRunRow[]> {
  return dataApi.execute<AgentRunRow>(
    `
      select
        id,
        run_kind,
        graph_name,
        state,
        error_message,
        trace_url,
        started_at::text as started_at,
        completed_at::text as completed_at,
        created_at::text as created_at,
        updated_at::text as updated_at
      from agent_runs
      where company_id = :companyId
        and coalesce(
          input_payload->>'case_id',
          input_payload->>'caseId',
          output_payload->>'case_id',
          output_payload->>'caseId',
          :caseId
        ) = :caseId
      order by created_at desc
      limit 12
    `,
    { companyId, caseId },
  );
}

async function listAgentCheckpoints(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  agentRunIds: string[],
): Promise<AgentCheckpointRow[]> {
  return dataApi.execute<AgentCheckpointRow>(
    `
      select
        agent_run_id,
        checkpoint_key,
        nullif(coalesce(metadata->>'label', metadata->>'name'), '') as label,
        nullif(metadata->>'stage', '') as stage,
        created_at::text as created_at
      from agent_checkpoints
      where tenant_id = :tenantId
        and agent_run_id = any(string_to_array(cast(:agentRunIds as text), ',')::uuid[])
      order by created_at desc
      limit 60
    `,
    { tenantId, agentRunIds: agentRunIds.join(",") },
  );
}

async function listEvents(dataApi: AuroraDataApiClient, tenantId: string): Promise<EventLedgerRow[]> {
  return dataApi.execute<EventLedgerRow>(
    `
      select
        id,
        aggregate_type,
        event_type,
        occurred_at::text as occurred_at,
        left(payload::text, 240) as payload_summary
      from event_ledger
      where tenant_id = :tenantId
      order by occurred_at desc
      limit 20
    `,
    { tenantId },
  );
}

async function listProviderExecutions(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  companyId: string,
  caseId: string,
): Promise<ProviderExecutionRow[]> {
  return dataApi.execute<ProviderExecutionRow>(
    `
      select
        pe.id,
        pe.action_id,
        pe.provider,
        pe.operation,
        pe.state,
        pe.provider_execution_id,
        pe.attempts,
        pe.last_error,
        pe.attempted_at::text as attempted_at,
        pe.completed_at::text as completed_at,
        pe.created_at::text as created_at,
        pe.updated_at::text as updated_at
      from provider_executions pe
      left join actions a on a.id = pe.action_id and a.tenant_id = pe.tenant_id
      where pe.tenant_id = :tenantId
        and (
          a.company_id = :companyId
          or pe.action_id is null
        )
        and (
          a.id is null
          or coalesce(a.metadata->>'case_id', a.metadata->>'caseId', :caseId) = :caseId
        )
      order by pe.updated_at desc, pe.created_at desc
      limit 20
    `,
    { tenantId, companyId, caseId },
  );
}

async function listAudits(dataApi: AuroraDataApiClient, tenantId: string): Promise<AuditRow[]> {
  return dataApi.execute<AuditRow>(
    `
      select
        id,
        actor_type,
        action,
        target_type,
        target_id,
        occurred_at::text as occurred_at
      from audit_log
      where tenant_id = :tenantId
      order by occurred_at desc
      limit 20
    `,
    { tenantId },
  );
}

function buildTimeline(
  runs: AgentRunRow[],
  checkpoints: AgentCheckpointRow[],
  events: EventLedgerRow[],
  providerExecutions: ProviderExecutionRow[],
  audits: AuditRow[],
): ProductActivityItem[] {
  const items: ProductActivityItem[] = [
    ...runs.map((run) => ({
      id: run.id,
      kind: "agent_run" as const,
      title: `${formatIdentifier(run.run_kind)} run`,
      state: run.state,
      occurredAt: run.completed_at ?? run.started_at ?? run.created_at,
      detail: run.error_message ?? run.graph_name,
      traceUrl: run.trace_url,
    })),
    ...checkpoints.map((checkpoint) => ({
      id: `${checkpoint.agent_run_id}:${checkpoint.checkpoint_key}`,
      kind: "checkpoint" as const,
      title: checkpoint.label ?? formatIdentifier(checkpoint.checkpoint_key),
      state: checkpoint.stage,
      occurredAt: checkpoint.created_at,
      detail: `Checkpoint ${checkpoint.checkpoint_key}`,
    })),
    ...events.map((event) => ({
      id: event.id,
      kind: "event" as const,
      title: formatIdentifier(event.event_type),
      state: event.aggregate_type,
      occurredAt: event.occurred_at,
      detail: event.payload_summary ?? "Event ledger fact recorded.",
    })),
    ...providerExecutions.map((execution) => ({
      id: execution.id,
      kind: "provider_execution" as const,
      title: `${execution.provider} ${formatIdentifier(execution.operation)}`,
      state: execution.state,
      occurredAt: execution.completed_at ?? execution.attempted_at ?? execution.created_at,
      detail: execution.last_error ?? `Attempts: ${execution.attempts}`,
      providerExecutionId: execution.provider_execution_id,
    })),
    ...audits.map((audit) => ({
      id: audit.id,
      kind: "audit" as const,
      title: formatIdentifier(audit.action),
      state: audit.actor_type,
      occurredAt: audit.occurred_at,
      detail: `${audit.target_type}${audit.target_id ? ` ${audit.target_id}` : ""}`,
    })),
  ];

  return items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

function groupCheckpointsByRun(checkpoints: AgentCheckpointRow[]): Map<string, AgentCheckpointRow[]> {
  const grouped = new Map<string, AgentCheckpointRow[]>();

  for (const checkpoint of checkpoints) {
    const existing = grouped.get(checkpoint.agent_run_id) ?? [];
    existing.push(checkpoint);
    grouped.set(checkpoint.agent_run_id, existing);
  }

  return grouped;
}

function latestActivityAt(
  runs: AgentRunRow[],
  checkpoints: AgentCheckpointRow[],
  events: EventLedgerRow[],
  providerExecutions: ProviderExecutionRow[],
  audits: AuditRow[],
): string | null {
  const values = [
    ...runs.map((run) => run.completed_at ?? run.started_at ?? run.updated_at ?? run.created_at),
    ...checkpoints.map((checkpoint) => checkpoint.created_at),
    ...events.map((event) => event.occurred_at),
    ...providerExecutions.map((execution) => execution.completed_at ?? execution.attempted_at ?? execution.updated_at),
    ...audits.map((audit) => audit.occurred_at),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()));

  if (values.length === 0) {
    return null;
  }

  return new Date(Math.max(...values.map((value) => value.getTime()))).toISOString();
}

async function resolveDataApi(options: RepositoryOptions): Promise<AuroraDataApiClient> {
  if (options.dataApi) {
    return options.dataApi;
  }

  const availability = getDataApiAvailability(options.env);

  if (!availability.available) {
    throw new DataApiUnavailableError(availability.missing);
  }

  return createAuroraDataApiClient(availability.config);
}

async function resolveCompanyScope(
  dataApi: AuroraDataApiClient,
  options: RepositoryOptions,
): Promise<CompanyScopeRow> {
  const companyExternalId = resolveCompanyExternalId(options);
  const [scope] = await dataApi.execute<CompanyScopeRow>(
    `
      select
        id as company_id,
        tenant_id,
        external_id as company_external_id
      from companies
      where external_id = :companyExternalId
      limit 1
    `,
    { companyExternalId },
  );

  if (!scope) {
    throw new Error(`No company found for external id ${companyExternalId}. Run the demo seed first.`);
  }

  return scope;
}

function resolveCompanyExternalId(options: RepositoryOptions): string {
  return options.companyExternalId ?? options.env?.DEMO_COMPANY_ID ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID;
}

function resolveCaseId(options: RepositoryOptions): string {
  return options.caseId ?? options.env?.DEMO_CASE_ID ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
}

function formatIdentifier(value: string): string {
  return value
    .split(/[_\s.-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
