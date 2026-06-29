import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../aws/rds-data-api";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";
import type {
  Cp3ActionPlanSummary,
  Cp3ActionState,
  Cp3AgentCheckpointSummary,
  Cp3AgentRunSummary,
  Cp3AgentState,
  Cp3ForecastCockpitState,
  Cp3ForecastDriver,
  Cp3ForecastPoint,
  Cp3ForecastRunSummary,
  Cp3ForecastState,
  Cp3ProviderStatus,
  Cp3RecommendedAction,
  Cp4EmailApprovalItem,
  Cp4EmailApprovalState,
  Cp4ProviderExecutionSummary,
} from "../db/cp3-forecast-cockpit-contract";

type RepositoryOptions = {
  dataApi?: AuroraDataApiClient;
  companyExternalId?: string;
  caseId?: string;
};

type CompanyScopeRow = {
  company_id: string;
  tenant_id: string;
  base_currency: string;
};

type ForecastRunRow = {
  id: string;
  external_id: string | null;
  idempotency_key: string;
  state: string;
  scenario: string;
  model_version: string;
  horizon_start_date: string;
  horizon_end_date: string;
  opening_cash_cents: number;
  minimum_cash_cents: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  output_summary_text: string;
};

type ForecastPointRow = {
  point_date: string;
  expected_cash_cents: number;
  inflow_cents: number;
  outflow_cents: number;
  net_cashflow_cents: number;
  metric_shortfall_cents: number;
  confidence: number | null;
  notes: string | null;
  driver_payload_text: string;
};

type ActionPlanRow = {
  id: string;
  external_id: string | null;
  idempotency_key: string;
  name: string;
  state: string;
  total_expected_impact_cents: number;
  rationale: string | null;
  created_at: string;
  updated_at: string;
};

type ActionRow = {
  external_id: string | null;
  idempotency_key: string;
  action_type: string;
  state: string;
  priority: string;
  priority_rank: number;
  title: string;
  rationale: string | null;
  expected_cash_impact_cents: number;
  scheduled_for: string | null;
  customer_external_id: string | null;
  customer_name: string | null;
  invoice_external_id: string | null;
  invoice_number: string | null;
  obligation_external_id: string | null;
  obligation_title: string | null;
  approval_state: string | null;
  approval_requested_at: string | null;
  approval_decided_at: string | null;
  approval_expires_at: string | null;
  provider_execution_count: number;
};

type AgentRunRow = {
  id: string;
  run_kind: string;
  graph_name: string;
  state: string;
  error_message: string | null;
  trace_available: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type AgentCheckpointRow = {
  checkpoint_key: string;
  label: string | null;
  stage: string | null;
  created_at: string;
};

type ProviderExecutionRow = {
  provider: string;
  operation: string;
  state: string;
  attempts: number;
  last_error: string | null;
  updated_at: string;
};

type Cp4EmailApprovalRow = {
  action_external_id: string | null;
  action_idempotency_key: string;
  action_state: string;
  action_type: string;
  title: string;
  expected_cash_impact_cents: number;
  customer_external_id: string | null;
  customer_name: string | null;
  contact_full_name: string | null;
  contact_email: string | null;
  contact_role: string | null;
  invoice_external_id: string | null;
  invoice_number: string | null;
  approval_state: string | null;
  approval_requested_at: string | null;
  approval_decided_at: string | null;
  approval_expires_at: string | null;
  draft_id: string | null;
  draft_idempotency_key: string | null;
  draft_provider: string | null;
  draft_subject: string | null;
  draft_body_preview: string | null;
  draft_state: string | null;
  draft_agent_run_id: string | null;
  draft_created_at: string | null;
  draft_updated_at: string | null;
  message_provider: string | null;
  provider_message_id: string | null;
  message_direction: string | null;
  message_state: string | null;
  message_subject: string | null;
  message_sent_at: string | null;
  message_received_at: string | null;
  message_updated_at: string | null;
  execution_provider: string | null;
  execution_operation: string | null;
  execution_state: string | null;
  provider_execution_id: string | null;
  execution_attempts: number | null;
  execution_last_error: string | null;
  execution_attempted_at: string | null;
  execution_completed_at: string | null;
  execution_updated_at: string | null;
  provider_execution_count: number;
};

export async function getCp3ForecastCockpitState(
  options: RepositoryOptions = {},
): Promise<Cp3ForecastCockpitState> {
  const availability = getDataApiAvailability();
  let dataApi = options.dataApi;

  if (!dataApi) {
    if (!availability.available) {
      throw new DataApiUnavailableError(availability.missing);
    }

    dataApi = createAuroraDataApiClient(availability.config);
  }

  const companyExternalId =
    options.companyExternalId ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID;
  const caseId = options.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;

  const [scope] = await dataApi.execute<CompanyScopeRow>(
    `
      select id as company_id, tenant_id, base_currency
      from companies
      where external_id = :companyExternalId
      limit 1
    `,
    { companyExternalId },
  );

  if (!scope) {
    throw new Error(`No company found for external id ${companyExternalId}. Run the demo seed first.`);
  }

  const [forecastRun] = await dataApi.execute<ForecastRunRow>(
    `
      select
        id,
        external_id,
        idempotency_key,
        state,
        scenario,
        model_version,
        horizon_start::text as horizon_start_date,
        horizon_end::text as horizon_end_date,
        coalesce(
          nullif(coalesce(output_summary->>'opening_cash_cents', output_summary->>'openingCashCents'), '')::bigint,
          0
        ) as opening_cash_cents,
        coalesce(
          nullif(coalesce(output_summary->>'minimum_cash_cents', output_summary->>'minimumCashCents'), '')::bigint,
          0
        ) as minimum_cash_cents,
        created_at::text as created_at,
        started_at::text as started_at,
        completed_at::text as completed_at,
        output_summary::text as output_summary_text
      from forecast_runs
      where company_id = :companyId
        and coalesce(
          output_summary->>'case_id',
          output_summary->>'caseId',
          input_snapshot->>'case_id',
          input_snapshot->>'caseId',
          :caseId
        ) = :caseId
      order by coalesce(completed_at, started_at, created_at) desc
      limit 1
    `,
    { companyId: scope.company_id, caseId },
  );

  const [forecastPoints, actionPlan, agentRuns, providerExecutions] = await Promise.all([
    forecastRun ? getForecastPoints(dataApi, forecastRun.id, forecastRun.minimum_cash_cents) : Promise.resolve([]),
    getLatestActionPlan(dataApi, scope.company_id, forecastRun?.id ?? null),
    getAgentRuns(dataApi, scope.company_id, caseId),
    getProviderExecutions(dataApi, scope.tenant_id),
  ]);

  const actions = actionPlan
    ? await getRecommendedActionsForPlan(dataApi, actionPlan.id)
    : await getRecommendedActionsForCase(dataApi, scope.company_id, caseId);

  const providerStatuses = buildProviderStatuses(providerExecutions);
  const cp4EmailApprovalRows = await getCp4EmailApprovalRows(dataApi, scope.company_id, caseId);
  const checkpoints = agentRuns[0] ? await getAgentCheckpoints(dataApi, agentRuns[0].id) : [];

  return {
    companyExternalId,
    caseId,
    currency: scope.base_currency,
    generatedAt: new Date().toISOString(),
    forecast: buildForecastState(forecastRun, forecastPoints),
    actionPlan: buildActionState(actionPlan, actions),
    cp4EmailApproval: buildCp4EmailApprovalState(
      cp4EmailApprovalRows,
      providerStatuses.find((provider) => provider.key === "gmail")!,
    ),
    agent: buildAgentState(agentRuns, checkpoints),
    providers: providerStatuses,
  };
}

async function getForecastPoints(
  dataApi: AuroraDataApiClient,
  forecastRunId: string,
  minimumCashCents: number,
): Promise<Cp3ForecastPoint[]> {
  const rows = await dataApi.execute<ForecastPointRow>(
    `
      select
        point_date::text as point_date,
        coalesce(round(max(amount) filter (where metric = 'cash_balance') * 100), 0)::bigint as expected_cash_cents,
        coalesce(round(max(amount) filter (where metric = 'expected_inflow') * 100), 0)::bigint as inflow_cents,
        coalesce(round(max(amount) filter (where metric = 'expected_outflow') * 100), 0)::bigint as outflow_cents,
        coalesce(round(max(amount) filter (where metric = 'net_cashflow') * 100), 0)::bigint as net_cashflow_cents,
        coalesce(round(max(amount) filter (where metric = 'shortfall') * 100), 0)::bigint as metric_shortfall_cents,
        max(confidence)::float8 as confidence,
        max(drivers->>'notes') as notes,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'metric', metric,
              'drivers', drivers
            )
            order by metric
          ) filter (where drivers <> '{}'::jsonb),
          '[]'::jsonb
        )::text as driver_payload_text
      from forecast_points
      where forecast_run_id = :forecastRunId
      group by point_date
      order by point_date asc
    `,
    { forecastRunId },
  );

  return rows.map((row) => {
    const computedShortfallCents = Math.max(0, minimumCashCents - row.expected_cash_cents);

    return {
      pointDate: row.point_date,
      expectedCashCents: row.expected_cash_cents,
      inflowCents: row.inflow_cents,
      outflowCents: row.outflow_cents,
      netCashflowCents: row.net_cashflow_cents || row.inflow_cents - row.outflow_cents,
      shortfallCents: Math.max(row.metric_shortfall_cents, computedShortfallCents),
      confidence: row.confidence,
      notes: row.notes,
      drivers: extractForecastDrivers(row.driver_payload_text),
    };
  });
}

async function getLatestActionPlan(
  dataApi: AuroraDataApiClient,
  companyId: string,
  forecastRunId: string | null,
): Promise<ActionPlanRow | null> {
  const rows = await dataApi.execute<ActionPlanRow>(
    `
      select
        id,
        external_id,
        idempotency_key,
        name,
        state,
        round(total_expected_impact * 100)::bigint as total_expected_impact_cents,
        rationale,
        created_at::text as created_at,
        updated_at::text as updated_at
      from action_plans
      where company_id = :companyId
        and (cast(:forecastRunId as uuid) is null or forecast_run_id = cast(:forecastRunId as uuid))
      order by created_at desc
      limit 1
    `,
    { companyId, forecastRunId: { value: forecastRunId, typeHint: "UUID" } },
  );

  if (rows[0]) {
    return rows[0];
  }

  const [fallback] = await dataApi.execute<ActionPlanRow>(
    `
      select
        id,
        external_id,
        idempotency_key,
        name,
        state,
        round(total_expected_impact * 100)::bigint as total_expected_impact_cents,
        rationale,
        created_at::text as created_at,
        updated_at::text as updated_at
      from action_plans
      where company_id = :companyId
      order by created_at desc
      limit 1
    `,
    { companyId },
  );

  return fallback ?? null;
}

async function getRecommendedActionsForPlan(
  dataApi: AuroraDataApiClient,
  actionPlanId: string,
): Promise<Cp3RecommendedAction[]> {
  const rows = await dataApi.execute<ActionRow>(
    actionSql("a.action_plan_id = :actionPlanId"),
    { actionPlanId },
  );

  return rows.map(toRecommendedAction);
}

async function getRecommendedActionsForCase(
  dataApi: AuroraDataApiClient,
  companyId: string,
  caseId: string,
): Promise<Cp3RecommendedAction[]> {
  const rows = await dataApi.execute<ActionRow>(
    actionSql(
      `
        a.company_id = :companyId
        and coalesce(a.metadata->>'case_id', a.metadata->>'caseId', :caseId) = :caseId
      `,
    ),
    { companyId, caseId },
  );

  return rows.map(toRecommendedAction);
}

function actionSql(whereClause: string) {
  return `
    select
      a.external_id,
      a.idempotency_key,
      a.action_type,
      a.state,
      a.priority,
      case a.priority
        when 'urgent' then 1
        when 'high' then 2
        when 'medium' then 3
        when 'low' then 4
        else coalesce(nullif(coalesce(a.metadata->>'priority_rank', a.metadata->>'priorityRank'), '')::integer, 99)
      end as priority_rank,
      a.title,
      a.rationale,
      round(a.expected_cash_impact * 100)::bigint as expected_cash_impact_cents,
      a.due_at::text as scheduled_for,
      c.external_id as customer_external_id,
      c.name as customer_name,
      i.external_id as invoice_external_id,
      i.invoice_number,
      o.external_id as obligation_external_id,
      coalesce(o.metadata->>'title', o.counterparty_name) as obligation_title,
      approval.state as approval_state,
      approval.requested_at::text as approval_requested_at,
      approval.decided_at::text as approval_decided_at,
      approval.expires_at::text as approval_expires_at,
      count(pe.id)::int as provider_execution_count
    from actions a
    left join customers c on c.id = a.customer_id
    left join invoices i on i.id = a.invoice_id
    left join obligations o on o.id = a.obligation_id
    left join lateral (
      select state, requested_at, decided_at, expires_at
      from approval_records
      where action_id = a.id
      order by requested_at desc
      limit 1
    ) approval on true
    left join provider_executions pe on pe.action_id = a.id
    where ${whereClause}
    group by a.id, c.id, i.id, o.id, approval.state, approval.requested_at, approval.decided_at, approval.expires_at
    order by priority_rank asc, a.created_at asc
    limit 8
  `;
}

async function getAgentRuns(
  dataApi: AuroraDataApiClient,
  companyId: string,
  caseId: string,
): Promise<Cp3AgentRunSummary[]> {
  const rows = await dataApi.execute<AgentRunRow>(
    `
      select
        id,
        run_kind,
        graph_name,
        state,
        error_message,
        (trace_url is not null and trace_url <> '') as trace_available,
        started_at::text as started_at,
        completed_at::text as completed_at,
        created_at::text as created_at,
        updated_at::text as updated_at
      from agent_runs
      where company_id = :companyId
        and run_kind in ('forecast', 'recommendation', 'approval')
        and coalesce(
          input_payload->>'case_id',
          input_payload->>'caseId',
          output_payload->>'case_id',
          output_payload->>'caseId',
          :caseId
        ) = :caseId
      order by created_at desc
      limit 4
    `,
    { companyId, caseId },
  );

  return rows.map((row) => ({
    id: row.id,
    runKind: row.run_kind,
    graphName: row.graph_name,
    state: row.state,
    errorMessage: row.error_message,
    traceAvailable: row.trace_available,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function getAgentCheckpoints(
  dataApi: AuroraDataApiClient,
  agentRunId: string,
): Promise<Cp3AgentCheckpointSummary[]> {
  const rows = await dataApi.execute<AgentCheckpointRow>(
    `
      select
        checkpoint_key,
        nullif(coalesce(metadata->>'label', metadata->>'name'), '') as label,
        nullif(metadata->>'stage', '') as stage,
        created_at::text as created_at
      from agent_checkpoints
      where agent_run_id = :agentRunId
      order by created_at asc
      limit 8
    `,
    { agentRunId },
  );

  return rows.map((row) => ({
    checkpointKey: row.checkpoint_key,
    label: row.label ?? formatIdentifier(row.checkpoint_key),
    stage: row.stage,
    createdAt: row.created_at,
  }));
}

async function getProviderExecutions(
  dataApi: AuroraDataApiClient,
  tenantId: string,
): Promise<ProviderExecutionRow[]> {
  return dataApi.execute<ProviderExecutionRow>(
    `
      select distinct on (provider)
        provider,
        operation,
        state,
        attempts,
        last_error,
        updated_at::text as updated_at
      from provider_executions
      where tenant_id = :tenantId
      order by provider, updated_at desc
    `,
    { tenantId },
  );
}

async function getCp4EmailApprovalRows(
  dataApi: AuroraDataApiClient,
  companyId: string,
  caseId: string,
): Promise<Cp4EmailApprovalRow[]> {
  return dataApi.execute<Cp4EmailApprovalRow>(
    `
      select
        a.external_id as action_external_id,
        a.idempotency_key as action_idempotency_key,
        a.state as action_state,
        a.action_type,
        a.title,
        round(a.expected_cash_impact * 100)::bigint as expected_cash_impact_cents,
        c.external_id as customer_external_id,
        c.name as customer_name,
        contact.full_name as contact_full_name,
        contact.email as contact_email,
        contact.role as contact_role,
        i.external_id as invoice_external_id,
        i.invoice_number,
        approval.state as approval_state,
        approval.requested_at::text as approval_requested_at,
        approval.decided_at::text as approval_decided_at,
        approval.expires_at::text as approval_expires_at,
        draft.id::text as draft_id,
        draft.idempotency_key as draft_idempotency_key,
        draft.provider as draft_provider,
        draft.subject as draft_subject,
        left(regexp_replace(draft.body, '[\\r\\n\\t]+', ' ', 'g'), 700) as draft_body_preview,
        draft.state as draft_state,
        draft.generated_by_agent_run_id::text as draft_agent_run_id,
        draft.created_at::text as draft_created_at,
        draft.updated_at::text as draft_updated_at,
        message.provider as message_provider,
        message.provider_message_id,
        message.direction as message_direction,
        message.state as message_state,
        message.subject as message_subject,
        message.sent_at::text as message_sent_at,
        message.received_at::text as message_received_at,
        message.updated_at::text as message_updated_at,
        execution.provider as execution_provider,
        execution.operation as execution_operation,
        execution.state as execution_state,
        execution.provider_execution_id,
        execution.attempts as execution_attempts,
        execution.last_error as execution_last_error,
        execution.attempted_at::text as execution_attempted_at,
        execution.completed_at::text as execution_completed_at,
        execution.updated_at::text as execution_updated_at,
        coalesce(execution_counts.provider_execution_count, 0)::int as provider_execution_count
      from actions a
      left join customers c on c.id = a.customer_id
      left join invoices i on i.id = a.invoice_id
      left join lateral (
        select full_name, email, role
        from contacts
        where customer_id = a.customer_id
        order by is_primary desc, created_at asc
        limit 1
      ) contact on true
      left join lateral (
        select state, requested_at, decided_at, expires_at
        from approval_records
        where action_id = a.id
        order by requested_at desc
        limit 1
      ) approval on true
      left join lateral (
        select
          id,
          idempotency_key,
          provider,
          subject,
          body,
          state,
          generated_by_agent_run_id,
          created_at,
          updated_at
        from communication_drafts
        where action_id = a.id
          and channel = 'email'
        order by updated_at desc, created_at desc
        limit 1
      ) draft on true
      left join lateral (
        select
          provider,
          provider_message_id,
          direction,
          state,
          subject,
          sent_at,
          received_at,
          updated_at
        from communication_messages
        where action_id = a.id
          or (draft.id is not null and draft_id = draft.id)
        order by coalesce(sent_at, received_at, created_at) desc
        limit 1
      ) message on true
      left join lateral (
        select
          provider,
          operation,
          state,
          provider_execution_id,
          attempts,
          last_error,
          attempted_at,
          completed_at,
          updated_at
        from provider_executions
        where action_id = a.id
          or (draft.id is not null and draft_id = draft.id)
          or (message.provider_message_id is not null and message_id in (
            select id
            from communication_messages
            where provider_message_id = message.provider_message_id
              and tenant_id = a.tenant_id
          ))
        order by updated_at desc, created_at desc
        limit 1
      ) execution on true
      left join lateral (
        select count(*)::int as provider_execution_count
        from provider_executions
        where action_id = a.id
          or (draft.id is not null and draft_id = draft.id)
      ) execution_counts on true
      where a.company_id = :companyId
        and a.action_type in ('collect_invoice', 'send_reminder')
        and coalesce(a.metadata->>'case_id', a.metadata->>'caseId', :caseId) = :caseId
      order by
        case a.priority
          when 'urgent' then 1
          when 'high' then 2
          when 'medium' then 3
          when 'low' then 4
          else 99
        end,
        a.created_at asc
      limit 8
    `,
    { companyId, caseId },
  );
}

function buildForecastState(
  forecastRun: ForecastRunRow | undefined,
  points: Cp3ForecastPoint[],
): Cp3ForecastState {
  if (!forecastRun) {
    return {
      state: "unavailable",
      message: "No CP3 forecast run is persisted for this company/case yet.",
      run: null,
      points: [],
      shortfallPoints: [],
      drivers: [],
    };
  }

  const minimumProjectedCashCents =
    points.length > 0 ? Math.min(...points.map((point) => point.expectedCashCents)) : null;
  const totalShortfallCents = points.reduce((sum, point) => sum + point.shortfallCents, 0);
  const summaryDrivers = extractForecastDrivers(forecastRun.output_summary_text);
  const pointDrivers = points.flatMap((point) => point.drivers);
  const drivers = dedupeDrivers([...summaryDrivers, ...pointDrivers]).slice(0, 8);

  const run: Cp3ForecastRunSummary = {
    externalId: forecastRun.external_id ?? forecastRun.idempotency_key,
    state: forecastRun.state,
    scenario: forecastRun.scenario,
    modelVersion: forecastRun.model_version,
    horizonStartDate: forecastRun.horizon_start_date,
    horizonEndDate: forecastRun.horizon_end_date,
    openingCashCents: forecastRun.opening_cash_cents,
    minimumCashCents: forecastRun.minimum_cash_cents,
    minimumProjectedCashCents,
    totalShortfallCents,
    pointCount: points.length,
    createdAt: forecastRun.created_at,
    startedAt: forecastRun.started_at,
    completedAt: forecastRun.completed_at,
  };

  return {
    state: "ready",
    message: "Latest forecast run and forecast points were read from Aurora.",
    run,
    points,
    shortfallPoints: points.filter((point) => point.shortfallCents > 0),
    drivers,
  };
}

function buildActionState(
  actionPlan: ActionPlanRow | null,
  actions: Cp3RecommendedAction[],
): Cp3ActionState {
  if (!actionPlan && actions.length === 0) {
    return {
      state: "unavailable",
      message: "No CP3 action plan or recommended actions are persisted for this company/case yet.",
      plan: null,
      recommendedActions: [],
      totals: {
        actionCount: 0,
        needsApprovalCount: 0,
        expectedImpactCents: 0,
      },
    };
  }

  const plan: Cp3ActionPlanSummary | null = actionPlan
    ? {
        externalId: actionPlan.external_id ?? actionPlan.idempotency_key,
        name: actionPlan.name,
        state: actionPlan.state,
        totalExpectedImpactCents: actionPlan.total_expected_impact_cents,
        rationale: actionPlan.rationale,
        createdAt: actionPlan.created_at,
        updatedAt: actionPlan.updated_at,
      }
    : null;

  return {
    state: "ready",
    message: "Recommended actions are approval-gated. CP3 does not execute Gmail, voice, or provider actions.",
    plan,
    recommendedActions: actions,
    totals: {
      actionCount: actions.length,
      needsApprovalCount: actions.filter((action) => action.approval.required).length,
      expectedImpactCents: actions.reduce((sum, action) => sum + action.expectedCashImpactCents, 0),
    },
  };
}

function buildAgentState(
  runs: Cp3AgentRunSummary[],
  checkpoints: Cp3AgentCheckpointSummary[],
): Cp3AgentState {
  if (runs.length === 0) {
    return {
      state: "unavailable",
      message: "No CP3 forecast/recommendation agent run has been persisted yet.",
      runs: [],
      checkpoints: [],
    };
  }

  return {
    state: "ready",
    message: "Latest CP3 agent run metadata is available. Payload bodies are not exposed in the cockpit contract.",
    runs,
    checkpoints,
  };
}

function buildCp4EmailApprovalState(
  rows: Cp4EmailApprovalRow[],
  gmailProvider: Cp3ProviderStatus,
): Cp4EmailApprovalState {
  if (rows.length === 0) {
    return {
      state: "unavailable",
      message: "No email-capable approval actions are persisted for this company/case yet.",
      provider: gmailProvider,
      items: [],
      totals: {
        actionCount: 0,
        draftCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        sendEligibleCount: 0,
        providerExecutionCount: 0,
      },
    };
  }

  const items = rows.map((row) => toCp4EmailApprovalItem(row, gmailProvider));

  return {
    state: "ready",
    message:
      "Email actions are shown as internal drafts and approval-gated send attempts. This route is read-only and never sends mail.",
    provider: gmailProvider,
    items,
    totals: {
      actionCount: items.length,
      draftCount: items.filter((item) => item.draft).length,
      approvedCount: items.filter((item) => item.approval.state === "approved").length,
      rejectedCount: items.filter((item) => item.approval.state === "rejected").length,
      sendEligibleCount: items.filter((item) => item.sendEligibility.eligible).length,
      providerExecutionCount: rows.reduce((sum, row) => sum + row.provider_execution_count, 0),
    },
  };
}

function buildProviderStatuses(executions: ProviderExecutionRow[]): Cp3ProviderStatus[] {
  const byProvider = new Map(executions.map((execution) => [execution.provider.toLowerCase(), execution]));
  const fireworksConfigured = hasEnv("FIREWORKS_API_KEY") && (hasEnv("FIREWORKS_MODEL") || hasEnv("FIREWORKS_BASE_URL"));
  const langSmithRequested = process.env.LANGSMITH_TRACING === "true";
  const langSmithConfigured = langSmithRequested && hasEnv("LANGSMITH_API_KEY") && hasEnv("LANGSMITH_PROJECT");
  const gmailConfigured = hasGmailEnv();

  return [
    {
      key: "aurora",
      name: "Aurora PostgreSQL",
      status: "connected",
      capability: "Forecast/action read model",
      configured: true,
      executionEnabled: true,
      message: "Aurora Data API is configured and this response was read from the live repository path.",
      lastExecution: null,
    },
    {
      key: "fireworks",
      name: "Fireworks",
      status: fireworksConfigured ? "configured" : "optional_unconfigured",
      capability: "Optional CP3 structured reasoning",
      configured: fireworksConfigured,
      executionEnabled: fireworksConfigured,
      message: fireworksConfigured
        ? "Fireworks env is present for the agent lane; this UI only reads persisted outputs."
        : "Fireworks is optional for CP3 and is not configured in this runtime.",
      lastExecution: byProvider.get("fireworks") ? toLastExecution(byProvider.get("fireworks")!) : null,
    },
    {
      key: "langsmith",
      name: "LangSmith",
      status: langSmithConfigured ? "configured" : "optional_unconfigured",
      capability: "Optional trace metadata",
      configured: langSmithConfigured,
      executionEnabled: langSmithConfigured,
      message: langSmithConfigured
        ? "LangSmith tracing env is present; the cockpit exposes only trace availability."
        : langSmithRequested
          ? "LangSmith tracing was requested but required tracing env is incomplete."
          : "LangSmith tracing is optional and currently disabled.",
      lastExecution: byProvider.get("langsmith") ? toLastExecution(byProvider.get("langsmith")!) : null,
    },
    {
      key: "gmail",
      name: "Gmail",
      status: gmailConfigured ? "configured" : "unavailable",
      capability: "Approval-gated email execution",
      configured: gmailConfigured,
      executionEnabled: false,
      message: gmailConfigured
        ? "Gmail env is present, but OAuth connection state is not exposed by this read-only UI lane. Send attempts remain disabled until the provider/runtime lanes explicitly enable execution."
        : "Gmail env is missing or incomplete. Internal approval and draft review can still be shown, but Gmail sends are unavailable.",
      lastExecution: byProvider.get("gmail") ? toLastExecution(byProvider.get("gmail")!) : null,
    },
    {
      key: "voice",
      name: "Voice",
      status: "unavailable",
      capability: "Approval-gated voice execution",
      configured: false,
      executionEnabled: false,
      message: "ElevenLabs/Twilio calling is reserved for CP5. CP3 must not place calls.",
      lastExecution: byProvider.get("elevenlabs") ?? byProvider.get("twilio")
        ? toLastExecution((byProvider.get("elevenlabs") ?? byProvider.get("twilio"))!)
        : null,
    },
  ];
}

function toRecommendedAction(row: ActionRow): Cp3RecommendedAction {
  const approvalState = row.approval_state ?? (row.state === "needs_approval" ? "pending" : "not_requested");
  const approvalRequired = row.state === "proposed" || row.state === "needs_approval" || approvalState === "pending";

  return {
    externalId: row.external_id ?? row.idempotency_key,
    actionType: row.action_type,
    state: row.state,
    priority: row.priority,
    priorityRank: row.priority_rank,
    title: row.title,
    rationale: row.rationale,
    expectedCashImpactCents: row.expected_cash_impact_cents,
    scheduledFor: row.scheduled_for,
    customer: {
      externalId: row.customer_external_id,
      name: row.customer_name,
    },
    invoice: {
      externalId: row.invoice_external_id,
      invoiceNumber: row.invoice_number,
    },
    obligation: {
      externalId: row.obligation_external_id,
      title: row.obligation_title,
    },
    approval: {
      required: approvalRequired,
      state: approvalState,
      requestedAt: row.approval_requested_at,
      decidedAt: row.approval_decided_at,
      expiresAt: row.approval_expires_at,
      message: approvalRequired
        ? "Needs human approval before any outbound action."
        : "No pending approval request is recorded.",
    },
    execution: {
      state: row.provider_execution_count > 0 ? "provider_log_present" : "not_enabled_cp3",
      message:
        row.provider_execution_count > 0
          ? "Provider log metadata exists, but request/response payloads are hidden."
          : "Provider execution is not enabled in CP3.",
      providerExecutionCount: row.provider_execution_count,
    },
  };
}

function toCp4EmailApprovalItem(
  row: Cp4EmailApprovalRow,
  gmailProvider: Cp3ProviderStatus,
): Cp4EmailApprovalItem {
  const approvalState = row.approval_state ?? (row.action_state === "needs_approval" ? "pending" : "not_requested");
  const blockers: string[] = [];

  if (approvalState !== "approved") {
    blockers.push("Human approval is not recorded as approved.");
  }

  if (!row.draft_id || !row.draft_body_preview) {
    blockers.push("No internal email draft is persisted for this action.");
  }

  if (!row.contact_email) {
    blockers.push("No customer contact email is available.");
  }

  if (!gmailProvider.executionEnabled) {
    blockers.push("Gmail provider execution is unavailable in this runtime.");
  }

  const eligible = blockers.length === 0;

  return {
    actionExternalId: row.action_external_id ?? row.action_idempotency_key,
    actionState: row.action_state,
    actionType: row.action_type,
    title: row.title,
    expectedCashImpactCents: row.expected_cash_impact_cents,
    customer: {
      externalId: row.customer_external_id,
      name: row.customer_name,
    },
    contact: {
      fullName: row.contact_full_name,
      email: row.contact_email,
      role: row.contact_role,
    },
    invoice: {
      externalId: row.invoice_external_id,
      invoiceNumber: row.invoice_number,
    },
    approval: {
      required: approvalState !== "not_requested",
      state: approvalState,
      requestedAt: row.approval_requested_at,
      decidedAt: row.approval_decided_at,
      expiresAt: row.approval_expires_at,
      message:
        approvalState === "approved"
          ? "Human approval is recorded; provider readiness still gates email execution."
          : approvalState === "rejected"
            ? "This action was rejected and must not be sent."
            : "Needs human approval before any Gmail draft/send attempt.",
    },
    draft: row.draft_id
      ? {
          idempotencyKey: row.draft_idempotency_key ?? row.draft_id,
          channel: "email",
          provider: row.draft_provider,
          subject: row.draft_subject,
          bodyPreview: row.draft_body_preview ?? "",
          state: row.draft_state ?? "draft",
          generatedByAgentRunId: row.draft_agent_run_id,
          createdAt: row.draft_created_at ?? "",
          updatedAt: row.draft_updated_at ?? "",
        }
      : null,
    sendEligibility: {
      eligible,
      reason: eligible ? "Approved action with Gmail execution enabled." : blockers[0] ?? "Send attempt is gated.",
      blockers,
    },
    lastMessage: row.message_state
      ? {
          provider: row.message_provider,
          providerMessageId: row.provider_message_id,
          direction: row.message_direction ?? "outbound",
          state: row.message_state,
          subject: row.message_subject,
          sentAt: row.message_sent_at,
          receivedAt: row.message_received_at,
          updatedAt: row.message_updated_at ?? "",
        }
      : null,
    lastProviderExecution: toCp4ProviderExecution(row),
  };
}

function toCp4ProviderExecution(row: Cp4EmailApprovalRow): Cp4ProviderExecutionSummary | null {
  if (!row.execution_provider || !row.execution_operation || !row.execution_state) {
    return null;
  }

  return {
    provider: row.execution_provider,
    operation: row.execution_operation,
    state: row.execution_state,
    providerExecutionId: row.provider_execution_id,
    attempts: row.execution_attempts ?? 0,
    lastError: row.execution_last_error,
    attemptedAt: row.execution_attempted_at,
    completedAt: row.execution_completed_at,
    updatedAt: row.execution_updated_at ?? "",
  };
}

function toLastExecution(row: ProviderExecutionRow): Cp3ProviderStatus["lastExecution"] {
  return {
    provider: row.provider,
    operation: row.operation,
    state: row.state,
    attempts: row.attempts,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

function extractForecastDrivers(rawJson: string | null): Cp3ForecastDriver[] {
  const parsed = parseJson(rawJson);

  if (!parsed) {
    return [];
  }

  const candidates = collectDriverCandidates(parsed);

  const drivers = candidates
    .map(toForecastDriver)
    .filter((driver): driver is Cp3ForecastDriver => Boolean(driver));

  return dedupeDrivers(drivers).slice(0, 12);
}

function collectDriverCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectDriverCandidates(item));
  }

  if (!isRecord(value)) {
    return [];
  }

  const nestedDrivers = value.drivers ?? value.driver_details ?? value.driverDetails;
  const metric = typeof value.metric === "string" ? value.metric : null;
  const notes = pickString(value, ["notes", "note", "summary", "reason", "rationale"]);

  const direct = notes
    ? [
        {
          label: metric ? formatIdentifier(metric) : notes,
          detail: metric ? notes : null,
          amount_cents: pickNumber(value, ["amount_cents", "amountCents", "impact_cents", "impactCents"]),
          source_kind: pickString(value, ["source_kind", "sourceKind", "source"]),
        },
      ]
    : [];

  if (nestedDrivers) {
    return [...direct, ...collectDriverCandidates(nestedDrivers)];
  }

  return direct;
}

function toForecastDriver(value: unknown): Cp3ForecastDriver | null {
  if (!isRecord(value)) {
    return null;
  }

  const label =
    pickString(value, ["label", "title", "name", "metric", "source_kind", "sourceKind"]) ?? "Forecast driver";
  const detail = pickString(value, ["detail", "description", "reason", "rationale", "notes", "note"]);

  return {
    label: formatIdentifier(label),
    detail,
    amountCents: pickNumber(value, ["amount_cents", "amountCents", "impact_cents", "impactCents"]),
    sourceKind: pickString(value, ["source_kind", "sourceKind", "source"]),
  };
}

function dedupeDrivers(drivers: Cp3ForecastDriver[]) {
  const seen = new Set<string>();

  return drivers.filter((driver) => {
    const key = `${driver.label}:${driver.detail ?? ""}:${driver.amountCents ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function parseJson(rawJson: string | null): unknown {
  if (!rawJson) {
    return null;
  }

  try {
    return JSON.parse(rawJson) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = value[key];

    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return null;
}

function pickNumber(value: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const candidate = value[key];

    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.round(candidate);
    }

    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const parsed = Number(candidate);

      if (Number.isFinite(parsed)) {
        return Math.round(parsed);
      }
    }
  }

  return null;
}

function hasEnv(key: string) {
  return typeof process.env[key] === "string" && process.env[key]!.trim().length > 0;
}

function hasGmailEnv() {
  return [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "GMAIL_ENCRYPTION_KEY",
    "GMAIL_SENDER_EMAIL",
  ].every(hasEnv);
}

function formatIdentifier(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
