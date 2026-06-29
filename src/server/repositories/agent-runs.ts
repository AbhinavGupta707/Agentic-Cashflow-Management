import { createAuroraDataApiClient, type AuroraDataApiClient, type DataApiParam } from "../aws/rds-data-api";

export type AgentRunKind =
  | "ingestion"
  | "forecast"
  | "recommendation"
  | "approval"
  | "execution"
  | "learning"
  | "maintenance";

export type AgentRunState =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentRunRecord = {
  id: string;
  tenantId: string;
  companyId: string | null;
  runKind: AgentRunKind;
  graphName: string;
  state: AgentRunState;
  inputPayload: unknown;
  outputPayload: unknown;
  errorMessage: string | null;
  traceUrl: string | null;
  idempotencyKey: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type AgentCheckpointRecord = {
  id: string;
  tenantId: string;
  agentRunId: string;
  checkpointKey: string;
  statePayload: unknown;
  metadata: unknown;
};

type AgentRunRow = {
  id: string;
  tenant_id: string;
  company_id: string | null;
  run_kind: AgentRunKind;
  graph_name: string;
  state: AgentRunState;
  input_payload: unknown;
  output_payload: unknown;
  error_message: string | null;
  trace_url: string | null;
  idempotency_key: string;
  started_at: string | null;
  completed_at: string | null;
};

type AgentCheckpointRow = {
  id: string;
  tenant_id: string;
  agent_run_id: string;
  checkpoint_key: string;
  state_payload: unknown;
  metadata: unknown;
};

export function jsonParam(value: unknown): DataApiParam {
  return { value: JSON.stringify(value), typeHint: "JSON" };
}

export async function startAgentRun(
  input: {
    tenantId: string;
    companyId?: string | null;
    runKind: AgentRunKind;
    graphName: string;
    inputPayload: unknown;
    idempotencyKey: string;
    traceUrl?: string | null;
  },
  dataApi: AuroraDataApiClient = createAuroraDataApiClient(),
): Promise<AgentRunRecord> {
  const [row] = await dataApi.execute<AgentRunRow>(
    `
      insert into agent_runs (
        tenant_id,
        company_id,
        run_kind,
        graph_name,
        state,
        input_payload,
        output_payload,
        error_message,
        trace_url,
        idempotency_key,
        started_at,
        completed_at
      )
      values (
        :tenantId,
        :companyId,
        :runKind,
        :graphName,
        'running',
        :inputPayload,
        '{}'::jsonb,
        null,
        :traceUrl,
        :idempotencyKey,
        now(),
        null
      )
      on conflict (tenant_id, idempotency_key) do update set
        company_id = coalesce(excluded.company_id, agent_runs.company_id),
        run_kind = excluded.run_kind,
        graph_name = excluded.graph_name,
        state = excluded.state,
        input_payload = excluded.input_payload,
        output_payload = excluded.output_payload,
        error_message = null,
        trace_url = excluded.trace_url,
        started_at = now(),
        completed_at = null,
        updated_at = now()
      returning id, tenant_id, company_id, run_kind, graph_name, state, input_payload,
        output_payload, error_message, trace_url, idempotency_key, started_at::text, completed_at::text
    `,
    {
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      runKind: input.runKind,
      graphName: input.graphName,
      inputPayload: jsonParam(input.inputPayload),
      traceUrl: input.traceUrl ?? null,
      idempotencyKey: input.idempotencyKey,
    },
  );

  return normalizeAgentRun(requireRow(row, "start agent run"));
}

export async function completeAgentRun(
  input: {
    tenantId: string;
    agentRunId: string;
    outputPayload: unknown;
    traceUrl?: string | null;
  },
  dataApi: AuroraDataApiClient = createAuroraDataApiClient(),
): Promise<AgentRunRecord> {
  const [row] = await dataApi.execute<AgentRunRow>(
    `
      update agent_runs
      set
        state = 'completed',
        output_payload = :outputPayload,
        trace_url = coalesce(:traceUrl, trace_url),
        completed_at = now(),
        updated_at = now()
      where tenant_id = :tenantId
        and id = :agentRunId
      returning id, tenant_id, company_id, run_kind, graph_name, state, input_payload,
        output_payload, error_message, trace_url, idempotency_key, started_at::text, completed_at::text
    `,
    {
      tenantId: input.tenantId,
      agentRunId: input.agentRunId,
      outputPayload: jsonParam(input.outputPayload),
      traceUrl: input.traceUrl ?? null,
    },
  );

  return normalizeAgentRun(requireRow(row, "complete agent run"));
}

export async function failAgentRun(
  input: {
    tenantId: string;
    agentRunId: string;
    errorMessage: string;
    outputPayload?: unknown;
  },
  dataApi: AuroraDataApiClient = createAuroraDataApiClient(),
): Promise<AgentRunRecord> {
  const [row] = await dataApi.execute<AgentRunRow>(
    `
      update agent_runs
      set
        state = 'failed',
        output_payload = :outputPayload,
        error_message = :errorMessage,
        completed_at = now(),
        updated_at = now()
      where tenant_id = :tenantId
        and id = :agentRunId
      returning id, tenant_id, company_id, run_kind, graph_name, state, input_payload,
        output_payload, error_message, trace_url, idempotency_key, started_at::text, completed_at::text
    `,
    {
      tenantId: input.tenantId,
      agentRunId: input.agentRunId,
      outputPayload: jsonParam(input.outputPayload ?? {}),
      errorMessage: input.errorMessage,
    },
  );

  return normalizeAgentRun(requireRow(row, "fail agent run"));
}

export async function saveAgentCheckpoint(
  input: {
    tenantId: string;
    agentRunId: string;
    checkpointKey: string;
    statePayload: unknown;
    metadata?: unknown;
  },
  dataApi: AuroraDataApiClient = createAuroraDataApiClient(),
): Promise<AgentCheckpointRecord> {
  const [row] = await dataApi.execute<AgentCheckpointRow>(
    `
      insert into agent_checkpoints (
        tenant_id,
        agent_run_id,
        checkpoint_key,
        state_payload,
        metadata
      )
      values (
        :tenantId,
        :agentRunId,
        :checkpointKey,
        :statePayload,
        :metadata
      )
      on conflict (tenant_id, agent_run_id, checkpoint_key) do update set
        state_payload = excluded.state_payload,
        metadata = excluded.metadata
      returning id, tenant_id, agent_run_id, checkpoint_key, state_payload, metadata
    `,
    {
      tenantId: input.tenantId,
      agentRunId: input.agentRunId,
      checkpointKey: input.checkpointKey,
      statePayload: jsonParam(input.statePayload),
      metadata: jsonParam(input.metadata ?? {}),
    },
  );

  return normalizeAgentCheckpoint(requireRow(row, "save agent checkpoint"));
}

function normalizeAgentRun(row: AgentRunRow): AgentRunRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    companyId: row.company_id,
    runKind: row.run_kind,
    graphName: row.graph_name,
    state: row.state,
    inputPayload: row.input_payload,
    outputPayload: row.output_payload,
    errorMessage: row.error_message,
    traceUrl: row.trace_url,
    idempotencyKey: row.idempotency_key,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function normalizeAgentCheckpoint(row: AgentCheckpointRow): AgentCheckpointRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    agentRunId: row.agent_run_id,
    checkpointKey: row.checkpoint_key,
    statePayload: row.state_payload,
    metadata: row.metadata,
  };
}

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) {
    throw new Error(`Aurora did not return a row for ${label}.`);
  }

  return row;
}
