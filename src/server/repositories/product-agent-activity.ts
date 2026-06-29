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

type MemoryActivityRow = {
  id: string;
  source_type: string;
  fact_type: string;
  content: string;
  confidence: number | null;
  created_at: string;
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
    memoryCount: number;
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
  kind: "agent_run" | "checkpoint" | "event" | "provider_execution" | "audit" | "memory";
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
  const [runs, events, providerExecutions, audits, memories] = await Promise.all([
    listAgentRuns(dataApi, scope.company_id, caseId),
    listEvents(dataApi, scope.tenant_id),
    listProviderExecutions(dataApi, scope.tenant_id, scope.company_id, caseId),
    listAudits(dataApi, scope.tenant_id),
    listOutcomeMemories(dataApi, scope.tenant_id, scope.company_id, caseId),
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
      memoryCount: memories.length,
      traceCount: runs.filter((run) => Boolean(run.trace_url)).length,
      lastActivityAt: latestActivityAt(runs, checkpoints, events, providerExecutions, audits, memories),
    },
    runs: normalizedRuns,
    timeline: buildTimeline(runs, checkpoints, events, providerExecutions, audits, memories).slice(0, 60),
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

async function listOutcomeMemories(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  companyId: string,
  caseId: string,
): Promise<MemoryActivityRow[]> {
  return dataApi.execute<MemoryActivityRow>(
    `
      select
        m.id,
        m.source_type,
        m.fact_type,
        m.content,
        m.confidence::float8 as confidence,
        m.created_at::text as created_at
      from memory_chunks m
      left join customers c on c.id = m.customer_id and c.tenant_id = m.tenant_id
      where m.tenant_id = :tenantId
        and (
          m.company_id = :companyId
          or c.company_id = :companyId
        )
        and m.source_type in ('manual_note', 'voice_call', 'voice_transcript', 'agent_extract')
        and coalesce(m.metadata->>'caseId', m.metadata->>'case_id', :caseId) = :caseId
      order by m.created_at desc
      limit 20
    `,
    { tenantId, companyId, caseId },
  );
}

function buildTimeline(
  runs: AgentRunRow[],
  checkpoints: AgentCheckpointRow[],
  events: EventLedgerRow[],
  providerExecutions: ProviderExecutionRow[],
  audits: AuditRow[],
  memories: MemoryActivityRow[],
): ProductActivityItem[] {
  const items: ProductActivityItem[] = [
    ...runs.map((run) => ({
      id: run.id,
      kind: "agent_run" as const,
      title: agentRunTitle(run),
      state: run.state,
      occurredAt: run.completed_at ?? run.started_at ?? run.created_at,
      detail: run.error_message ?? agentRunDetail(run),
      traceUrl: run.trace_url,
    })),
    ...checkpoints.map((checkpoint) => ({
      id: `${checkpoint.agent_run_id}:${checkpoint.checkpoint_key}`,
      kind: "checkpoint" as const,
      title: checkpointTitle(checkpoint),
      state: checkpoint.stage,
      occurredAt: checkpoint.created_at,
      detail: checkpointDetail(checkpoint),
    })),
    ...events.map((event) => ({
      id: event.id,
      kind: "event" as const,
      title: eventTitle(event),
      state: event.aggregate_type,
      occurredAt: event.occurred_at,
      detail: eventDetail(event),
    })),
    ...providerExecutions.map((execution) => ({
      id: execution.id,
      kind: "provider_execution" as const,
      title: providerExecutionTitle(execution),
      state: execution.state,
      occurredAt: execution.completed_at ?? execution.attempted_at ?? execution.created_at,
      detail: providerExecutionDetail(execution),
      providerExecutionId: execution.provider_execution_id,
    })),
    ...audits.map((audit) => ({
      id: audit.id,
      kind: "audit" as const,
      title: auditTitle(audit),
      state: audit.actor_type,
      occurredAt: audit.occurred_at,
      detail: auditDetail(audit),
    })),
    ...memories.map((memory) => ({
      id: memory.id,
      kind: "memory" as const,
      title: memoryTitle(memory),
      state: memory.source_type,
      occurredAt: memory.created_at,
      detail:
        memory.confidence === null
          ? memory.content
          : `${memory.content} Confidence ${Math.round(memory.confidence * 100)}%.`,
    })),
  ];

  return items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

function agentRunTitle(run: AgentRunRow): string {
  if (run.run_kind === "forecast") {
    return run.state === "completed" ? "Forecast recomputed" : "Forecast run started";
  }

  if (run.run_kind === "recommendation") {
    return run.state === "completed" ? "Agent workflow completed" : "Recommendation workflow started";
  }

  return `${formatIdentifier(run.run_kind)} run`;
}

function agentRunDetail(run: AgentRunRow): string {
  if (run.graph_name.includes("forecast_recommendation_draft")) {
    return "Forecast, recommendation, and draft agents completed against Aurora-backed case state.";
  }

  return run.graph_name;
}

function checkpointTitle(checkpoint: AgentCheckpointRow): string {
  switch (checkpoint.checkpoint_key) {
    case "forecast.snapshot":
      return "Forecast recomputed";
    case "recommendation.plan":
      return "Recommendation ranked";
    case "draft.generated":
      return "Draft generated";
    case "graph.completed":
      return "Agent workflow completed";
    case "graph.started":
      return "Agent workflow started";
    default:
      return checkpoint.label ?? formatIdentifier(checkpoint.checkpoint_key);
  }
}

function checkpointDetail(checkpoint: AgentCheckpointRow): string {
  switch (checkpoint.checkpoint_key) {
    case "forecast.snapshot":
      return "Deterministic cash forecast checkpoint recorded from Aurora facts.";
    case "recommendation.plan":
      return "Recommended actions ranked by cash impact, timing, and customer memory.";
    case "draft.generated":
      return "Outreach draft or call script generated and stored behind approval.";
    case "graph.completed":
      return "Agent workflow finished with reviewable checkpoint evidence.";
    case "graph.started":
      return "Agent workflow started from the current case state.";
    default:
      return `Checkpoint ${checkpoint.checkpoint_key}`;
  }
}

function eventTitle(event: EventLedgerRow): string {
  if (["customers", "invoices", "obligations", "payments"].includes(event.aggregate_type)) {
    return "Finance pack imported";
  }

  return formatIdentifier(event.event_type);
}

function eventDetail(event: EventLedgerRow): string {
  if (["customers", "invoices", "obligations", "payments"].includes(event.aggregate_type)) {
    return `${formatIdentifier(event.event_type)} event persisted to Aurora from source evidence.`;
  }

  return event.payload_summary ?? "Event ledger fact recorded.";
}

function providerExecutionTitle(execution: ProviderExecutionRow): string {
  if (execution.provider === "twilio" && execution.operation === "voice.call.create") {
    return "Outbound call initiated";
  }

  return `${formatIdentifier(execution.provider)} ${formatIdentifier(execution.operation)}`;
}

function providerExecutionDetail(execution: ProviderExecutionRow): string {
  if (execution.last_error) {
    return execution.last_error;
  }

  if (execution.provider === "twilio" && execution.operation === "voice.call.create") {
    return execution.provider_execution_id
      ? "Twilio accepted the approved test call and returned a real Call SID."
      : "Approved call attempt recorded; no provider Call SID was returned.";
  }

  return `Attempts: ${execution.attempts}`;
}

function auditTitle(audit: AuditRow): string {
  if (audit.action === "cp4.approval.approved") {
    return "Human approval recorded";
  }

  if (audit.action === "product.action_outcome.recorded") {
    return "Outcome memory saved";
  }

  return formatIdentifier(audit.action);
}

function auditDetail(audit: AuditRow): string {
  if (audit.action === "cp4.approval.approved") {
    return "Approval state changed in Aurora before any provider execution.";
  }

  if (audit.action === "product.action_outcome.recorded") {
    return "Outcome was recorded and converted into customer memory evidence.";
  }

  return `${audit.target_type}${audit.target_id ? ` ${audit.target_id}` : ""}`;
}

function memoryTitle(memory: MemoryActivityRow): string {
  if (memory.source_type === "voice_call" || memory.source_type === "voice_transcript") {
    return "Call memory captured";
  }

  return "Customer memory updated";
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
  memories: MemoryActivityRow[],
): string | null {
  const values = [
    ...runs.map((run) => run.completed_at ?? run.started_at ?? run.updated_at ?? run.created_at),
    ...checkpoints.map((checkpoint) => checkpoint.created_at),
    ...events.map((event) => event.occurred_at),
    ...providerExecutions.map((execution) => execution.completed_at ?? execution.attempted_at ?? execution.updated_at),
    ...audits.map((audit) => audit.occurred_at),
    ...memories.map((memory) => memory.created_at),
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
