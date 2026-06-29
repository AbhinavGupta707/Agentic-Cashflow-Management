import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient, type DataApiParam } from "../aws/rds-data-api";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";
import {
  type DeterministicForecastResult,
  type ForecastCashAccount,
  type ForecastEventLedgerSummary,
  type ForecastInput,
  type ForecastInvoice,
  type ForecastObligation,
  type ForecastPayment,
} from "../db/forecast-contract";
import {
  buildDeterministicForecast,
  CP3_FORECAST_GENERATOR,
  CP3_FORECAST_MODEL_VERSION,
  DEFAULT_FORECAST_HORIZON_DAYS,
  DEFAULT_HIGH_VALUE_RECEIVABLE_CENTS,
  DEFAULT_MINIMUM_CASH_TARGET_CENTS,
} from "../forecast/engine";

export type GenerateForecastOptions = {
  dataApi?: AuroraDataApiClient;
  companyExternalId?: string;
  caseId?: string;
  horizonStart?: string;
  horizonEnd?: string;
  horizonDays?: number;
  scenario?: string;
  modelVersion?: string;
  minimumCashTargetCents?: number;
  highValueReceivableCents?: number;
};

export type ForecastPersistenceResult = {
  forecastRunId: string;
  forecastRunExternalId: string;
  forecastRunIdempotencyKey: string;
  actionPlanId: string;
  actionPlanExternalId: string;
  actionPlanIdempotencyKey: string;
  forecastPointCount: number;
  actionCount: number;
  actionIds: string[];
  staleActionCount: number;
};

export type GenerateForecastResult = {
  input: ForecastInput;
  forecast: DeterministicForecastResult;
  persistence: ForecastPersistenceResult;
};

type IdRow = {
  id: string;
};

type CompanyScopeRow = {
  tenant_id: string;
  company_id: string;
  company_external_id: string;
  company_name: string;
  currency_code: string;
};

type CashAccountRow = {
  id: string;
  name: string;
  account_type: string;
  currency_code: string;
  current_balance_cents: number;
  balance_as_of: string;
};

type InvoiceFactRow = {
  id: string;
  external_id: string;
  invoice_number: string;
  customer_id: string;
  customer_external_id: string;
  customer_name: string;
  due_date: string;
  currency_code: string;
  amount_total_cents: number;
  amount_paid_cents: number;
  amount_due_cents: number;
  state: string;
  risk_tier: string;
  payment_terms_days: number;
  description: string | null;
};

type ObligationFactRow = {
  id: string;
  external_id: string;
  title: string;
  counterparty_name: string;
  category: string;
  obligation_type: string;
  due_date: string;
  currency_code: string;
  amount_cents: number;
  state: string;
  priority_rank: number;
};

type PaymentFactRow = {
  id: string;
  external_id: string;
  payment_date: string;
  direction: "inflow" | "outflow";
  currency_code: string;
  amount_cents: number;
  state: string;
  provider: string | null;
  invoice_id: string | null;
  obligation_id: string | null;
  customer_id: string | null;
};

type EventLedgerSummaryRow = {
  aggregate_type: string;
  event_type: string;
  event_count: number;
  latest_occurred_at: string;
};

type EventLedgerIdRow = {
  id: string;
};

type ExistingActionRow = {
  id: string;
  idempotency_key: string;
  state: string;
};

export async function generateAndPersistForecast(
  options: GenerateForecastOptions = {},
): Promise<GenerateForecastResult> {
  const dataApi = options.dataApi ?? createConfiguredDataApi();
  const input = await loadForecastInput(options, dataApi);
  const forecast = buildDeterministicForecast(input);
  const persistence = await persistForecast(input, forecast, dataApi);

  return {
    input,
    forecast,
    persistence,
  };
}

export async function loadForecastInput(
  options: GenerateForecastOptions = {},
  dataApi: AuroraDataApiClient = options.dataApi ?? createConfiguredDataApi(),
): Promise<ForecastInput> {
  const companyExternalId =
    options.companyExternalId ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID;
  const caseId = options.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const scenario = options.scenario ?? "base";
  const modelVersion = options.modelVersion ?? CP3_FORECAST_MODEL_VERSION;
  const scope = await resolveCompanyScope(dataApi, companyExternalId);
  const [cashAccounts, invoices, obligations, payments, eventLedgerSummary, latestEventLedgerId] =
    await Promise.all([
      loadCashAccounts(dataApi, scope),
      loadInvoiceFacts(dataApi, scope),
      loadObligationFacts(dataApi, scope),
      loadPendingPaymentFacts(dataApi, scope),
      loadEventLedgerSummary(dataApi, scope),
      loadLatestEventLedgerId(dataApi, scope),
    ]);
  const horizonStart = options.horizonStart ?? defaultHorizonStart(invoices, obligations, payments);
  const horizonEnd =
    options.horizonEnd ??
    addDays(horizonStart, Math.max(1, options.horizonDays ?? DEFAULT_FORECAST_HORIZON_DAYS) - 1);

  return {
    tenantId: scope.tenant_id,
    companyId: scope.company_id,
    companyExternalId: scope.company_external_id,
    companyName: scope.company_name,
    caseId,
    currencyCode: scope.currency_code,
    horizonStart,
    horizonEnd,
    scenario,
    modelVersion,
    minimumCashTargetCents: options.minimumCashTargetCents ?? DEFAULT_MINIMUM_CASH_TARGET_CENTS,
    highValueReceivableCents: options.highValueReceivableCents ?? DEFAULT_HIGH_VALUE_RECEIVABLE_CENTS,
    latestEventLedgerId,
    cashAccounts,
    invoices,
    obligations,
    payments,
    eventLedgerSummary,
  };
}

export async function persistForecast(
  input: ForecastInput,
  forecast: DeterministicForecastResult,
  dataApi: AuroraDataApiClient,
): Promise<ForecastPersistenceResult> {
  return dataApi.transaction(async (transactionId) => {
    const forecastRunId = await upsertForecastRun(input, forecast, dataApi, transactionId);

    await replaceForecastPoints(input, forecastRunId, forecast, dataApi, transactionId);

    const actionPlanId = await upsertActionPlan(input, forecastRunId, forecast, dataApi, transactionId);
    const staleActionCount = await removeStaleGeneratedActions(actionPlanId, forecast, dataApi, transactionId);
    const actionIds: string[] = [];

    for (const action of forecast.actions) {
      actionIds.push(await upsertAction(input, actionPlanId, action, dataApi, transactionId));
    }

    return {
      forecastRunId,
      forecastRunExternalId: forecast.forecastRunExternalId,
      forecastRunIdempotencyKey: forecast.forecastRunIdempotencyKey,
      actionPlanId,
      actionPlanExternalId: forecast.actionPlanExternalId,
      actionPlanIdempotencyKey: forecast.actionPlanIdempotencyKey,
      forecastPointCount: forecast.points.length,
      actionCount: forecast.actions.length,
      actionIds,
      staleActionCount,
    };
  });
}

function createConfiguredDataApi(): AuroraDataApiClient {
  const availability = getDataApiAvailability();

  if (!availability.available) {
    throw new DataApiUnavailableError(availability.missing);
  }

  return createAuroraDataApiClient(availability.config);
}

async function resolveCompanyScope(
  dataApi: AuroraDataApiClient,
  companyExternalId: string,
): Promise<CompanyScopeRow> {
  const [scope] = await dataApi.execute<CompanyScopeRow>(
    `
      select
        c.tenant_id,
        c.id as company_id,
        c.external_id as company_external_id,
        coalesce(c.trading_name, c.legal_name) as company_name,
        c.base_currency as currency_code
      from companies c
      where c.external_id = :companyExternalId
        and c.state = 'active'
      order by c.created_at asc
      limit 1
    `,
    { companyExternalId },
  );

  if (!scope) {
    throw new Error(`No active company found for external id ${companyExternalId}.`);
  }

  return scope;
}

async function loadCashAccounts(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
): Promise<ForecastCashAccount[]> {
  const rows = await dataApi.execute<CashAccountRow>(
    `
      select
        id,
        name,
        account_type,
        currency_code,
        round(current_balance * 100)::bigint as current_balance_cents,
        balance_as_of::text as balance_as_of
      from cash_accounts
      where tenant_id = :tenantId
        and company_id = :companyId
        and state = 'active'
        and currency_code = :currencyCode
      order by
        case when account_type = 'operating' then 0 else 1 end,
        current_balance desc,
        name asc
    `,
    {
      tenantId: scope.tenant_id,
      companyId: scope.company_id,
      currencyCode: scope.currency_code,
    },
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    accountType: row.account_type,
    currencyCode: row.currency_code,
    currentBalanceCents: Number(row.current_balance_cents),
    balanceAsOf: row.balance_as_of,
  }));
}

async function loadInvoiceFacts(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
): Promise<ForecastInvoice[]> {
  const rows = await dataApi.execute<InvoiceFactRow>(
    `
      select
        i.id,
        coalesce(i.external_id, i.invoice_number, i.id::text) as external_id,
        i.invoice_number,
        i.customer_id,
        coalesce(c.external_id, c.id::text) as customer_external_id,
        c.name as customer_name,
        i.due_date::text as due_date,
        i.currency_code,
        round(i.amount_total * 100)::bigint as amount_total_cents,
        round(i.amount_paid * 100)::bigint as amount_paid_cents,
        round(i.amount_due * 100)::bigint as amount_due_cents,
        i.state,
        c.risk_tier,
        c.payment_terms_days,
        i.metadata->>'description' as description
      from invoices i
      join customers c on c.id = i.customer_id
      where i.tenant_id = :tenantId
        and i.company_id = :companyId
        and i.currency_code = :currencyCode
        and i.amount_due > 0
        and i.state in ('open', 'partially_paid', 'disputed')
      order by i.due_date asc, i.amount_due desc, i.invoice_number asc
    `,
    {
      tenantId: scope.tenant_id,
      companyId: scope.company_id,
      currencyCode: scope.currency_code,
    },
  );

  return rows.map((row) => ({
    id: row.id,
    externalId: row.external_id,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    customerExternalId: row.customer_external_id,
    customerName: row.customer_name,
    dueDate: row.due_date,
    currencyCode: row.currency_code,
    amountTotalCents: Number(row.amount_total_cents),
    amountPaidCents: Number(row.amount_paid_cents),
    amountDueCents: Number(row.amount_due_cents),
    state: row.state,
    riskTier: row.risk_tier,
    paymentTermsDays: Number(row.payment_terms_days),
    description: row.description,
  }));
}

async function loadObligationFacts(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
): Promise<ForecastObligation[]> {
  const rows = await dataApi.execute<ObligationFactRow>(
    `
      select
        id,
        coalesce(external_id, metadata->>'externalId', idempotency_key, id::text) as external_id,
        coalesce(metadata->>'title', counterparty_name) as title,
        counterparty_name,
        category,
        obligation_type,
        due_date::text as due_date,
        currency_code,
        round(amount * 100)::bigint as amount_cents,
        state,
        coalesce(nullif(metadata->>'priority', '')::integer, 99) as priority_rank
      from obligations
      where tenant_id = :tenantId
        and company_id = :companyId
        and currency_code = :currencyCode
        and amount > 0
        and state in ('scheduled', 'overdue')
      order by due_date asc, priority_rank asc, amount desc
    `,
    {
      tenantId: scope.tenant_id,
      companyId: scope.company_id,
      currencyCode: scope.currency_code,
    },
  );

  return rows.map((row) => ({
    id: row.id,
    externalId: row.external_id,
    title: row.title,
    counterpartyName: row.counterparty_name,
    category: row.category,
    obligationType: row.obligation_type,
    dueDate: row.due_date,
    currencyCode: row.currency_code,
    amountCents: Number(row.amount_cents),
    state: row.state,
    priorityRank: Number(row.priority_rank),
  }));
}

async function loadPendingPaymentFacts(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
): Promise<ForecastPayment[]> {
  const rows = await dataApi.execute<PaymentFactRow>(
    `
      select
        id,
        coalesce(external_id, idempotency_key, id::text) as external_id,
        payment_date::text as payment_date,
        direction,
        currency_code,
        round(amount * 100)::bigint as amount_cents,
        state,
        provider,
        invoice_id,
        obligation_id,
        customer_id
      from payments
      where tenant_id = :tenantId
        and company_id = :companyId
        and currency_code = :currencyCode
        and amount > 0
        and state = 'pending'
      order by payment_date asc, created_at asc
    `,
    {
      tenantId: scope.tenant_id,
      companyId: scope.company_id,
      currencyCode: scope.currency_code,
    },
  );

  return rows.map((row) => ({
    id: row.id,
    externalId: row.external_id,
    paymentDate: row.payment_date,
    direction: row.direction,
    currencyCode: row.currency_code,
    amountCents: Number(row.amount_cents),
    state: row.state,
    provider: row.provider,
    invoiceId: row.invoice_id,
    obligationId: row.obligation_id,
    customerId: row.customer_id,
  }));
}

async function loadEventLedgerSummary(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
): Promise<ForecastEventLedgerSummary[]> {
  const rows = await dataApi.execute<EventLedgerSummaryRow>(
    `
      select
        aggregate_type,
        event_type,
        count(*)::bigint as event_count,
        max(occurred_at)::text as latest_occurred_at
      from event_ledger
      where tenant_id = :tenantId
        and (
          (aggregate_type = 'invoices' and aggregate_id in (
            select id from invoices where company_id = :companyId
          ))
          or (aggregate_type = 'obligations' and aggregate_id in (
            select id from obligations where company_id = :companyId
          ))
          or (aggregate_type = 'payments' and aggregate_id in (
            select id from payments where company_id = :companyId
          ))
          or (aggregate_type = 'customers' and aggregate_id in (
            select id from customers where company_id = :companyId
          ))
        )
      group by aggregate_type, event_type
      order by latest_occurred_at desc, aggregate_type asc, event_type asc
      limit 50
    `,
    {
      tenantId: scope.tenant_id,
      companyId: scope.company_id,
    },
  );

  return rows.map((row) => ({
    aggregateType: row.aggregate_type,
    eventType: row.event_type,
    eventCount: Number(row.event_count),
    latestOccurredAt: row.latest_occurred_at,
  }));
}

async function loadLatestEventLedgerId(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
): Promise<string | null> {
  const [row] = await dataApi.execute<EventLedgerIdRow>(
    `
      select id
      from event_ledger
      where tenant_id = :tenantId
        and (
          (aggregate_type = 'invoices' and aggregate_id in (
            select id from invoices where company_id = :companyId
          ))
          or (aggregate_type = 'obligations' and aggregate_id in (
            select id from obligations where company_id = :companyId
          ))
          or (aggregate_type = 'payments' and aggregate_id in (
            select id from payments where company_id = :companyId
          ))
          or (aggregate_type = 'customers' and aggregate_id in (
            select id from customers where company_id = :companyId
          ))
        )
      order by occurred_at desc
      limit 1
    `,
    {
      tenantId: scope.tenant_id,
      companyId: scope.company_id,
    },
  );

  return row?.id ?? null;
}

async function upsertForecastRun(
  input: ForecastInput,
  forecast: DeterministicForecastResult,
  dataApi: AuroraDataApiClient,
  transactionId: string,
): Promise<string> {
  const [row] = await dataApi.execute<IdRow>(
    `
      insert into forecast_runs (
        tenant_id,
        external_id,
        company_id,
        input_event_ledger_id,
        horizon_start,
        horizon_end,
        scenario,
        model_version,
        state,
        input_snapshot,
        output_summary,
        idempotency_key,
        started_at,
        completed_at
      )
      values (
        :tenantId,
        :externalId,
        :companyId,
        :inputEventLedgerId,
        :horizonStart,
        :horizonEnd,
        :scenario,
        :modelVersion,
        'completed',
        :inputSnapshot,
        :outputSummary,
        :idempotencyKey,
        now(),
        now()
      )
      on conflict (tenant_id, idempotency_key) do update set
        external_id = excluded.external_id,
        company_id = excluded.company_id,
        input_event_ledger_id = excluded.input_event_ledger_id,
        horizon_start = excluded.horizon_start,
        horizon_end = excluded.horizon_end,
        scenario = excluded.scenario,
        model_version = excluded.model_version,
        state = excluded.state,
        input_snapshot = excluded.input_snapshot,
        output_summary = excluded.output_summary,
        completed_at = excluded.completed_at,
        updated_at = now()
      returning id
    `,
    {
      tenantId: input.tenantId,
      externalId: forecast.forecastRunExternalId,
      companyId: input.companyId,
      inputEventLedgerId: input.latestEventLedgerId,
      horizonStart: input.horizonStart,
      horizonEnd: input.horizonEnd,
      scenario: input.scenario,
      modelVersion: input.modelVersion,
      inputSnapshot: jsonParam(forecast.inputSnapshot),
      outputSummary: jsonParam(forecast.outputSummary),
      idempotencyKey: forecast.forecastRunIdempotencyKey,
    },
    { transactionId },
  );

  return requireId(row, "forecast run");
}

async function replaceForecastPoints(
  input: ForecastInput,
  forecastRunId: string,
  forecast: DeterministicForecastResult,
  dataApi: AuroraDataApiClient,
  transactionId: string,
): Promise<void> {
  await dataApi.executeMutation(
    "delete from forecast_points where tenant_id = :tenantId and forecast_run_id = :forecastRunId",
    {
      tenantId: input.tenantId,
      forecastRunId,
    },
    { transactionId },
  );

  for (const point of forecast.points) {
    await dataApi.executeMutation(
      `
        insert into forecast_points (
          tenant_id,
          forecast_run_id,
          company_id,
          cash_account_id,
          point_date,
          metric,
          currency_code,
          amount,
          confidence,
          drivers
        )
        values (
          :tenantId,
          :forecastRunId,
          :companyId,
          :cashAccountId,
          :pointDate,
          :metric,
          :currencyCode,
          :amount,
          :confidence,
          :drivers
        )
      `,
      {
        tenantId: input.tenantId,
        forecastRunId,
        companyId: input.companyId,
        cashAccountId: point.cashAccountId,
        pointDate: point.pointDate,
        metric: point.metric,
        currencyCode: input.currencyCode,
        amount: decimalParamFromCents(point.amountCents),
        confidence: decimalParam(point.confidence, 4),
        drivers: jsonParam(point.drivers),
      },
      { transactionId },
    );
  }
}

async function upsertActionPlan(
  input: ForecastInput,
  forecastRunId: string,
  forecast: DeterministicForecastResult,
  dataApi: AuroraDataApiClient,
  transactionId: string,
): Promise<string> {
  const [row] = await dataApi.execute<IdRow>(
    `
      insert into action_plans (
        tenant_id,
        external_id,
        company_id,
        forecast_run_id,
        name,
        state,
        currency_code,
        total_expected_impact,
        rationale,
        idempotency_key
      )
      values (
        :tenantId,
        :externalId,
        :companyId,
        :forecastRunId,
        :name,
        'ready_for_review',
        :currencyCode,
        :totalExpectedImpact,
        :rationale,
        :idempotencyKey
      )
      on conflict (tenant_id, idempotency_key) do update set
        external_id = excluded.external_id,
        company_id = excluded.company_id,
        forecast_run_id = excluded.forecast_run_id,
        name = excluded.name,
        state = case
          when action_plans.state in ('approved', 'active', 'completed', 'cancelled')
          then action_plans.state
          else excluded.state
        end,
        currency_code = excluded.currency_code,
        total_expected_impact = excluded.total_expected_impact,
        rationale = excluded.rationale,
        updated_at = now()
      returning id
    `,
    {
      tenantId: input.tenantId,
      externalId: forecast.actionPlanExternalId,
      companyId: input.companyId,
      forecastRunId,
      name: forecast.actionPlanName,
      currencyCode: input.currencyCode,
      totalExpectedImpact: decimalParamFromCents(forecast.totalExpectedImpactCents),
      rationale: forecast.actionPlanRationale,
      idempotencyKey: forecast.actionPlanIdempotencyKey,
    },
    { transactionId },
  );

  return requireId(row, "action plan");
}

async function removeStaleGeneratedActions(
  actionPlanId: string,
  forecast: DeterministicForecastResult,
  dataApi: AuroraDataApiClient,
  transactionId: string,
): Promise<number> {
  const expectedKeys = new Set(forecast.actions.map((action) => action.idempotencyKey));
  const existingActions = await dataApi.execute<ExistingActionRow>(
    `
      select id, idempotency_key, state
      from actions
      where action_plan_id = :actionPlanId
        and metadata->>'generated_by' = :generatedBy
    `,
    {
      actionPlanId,
      generatedBy: CP3_FORECAST_GENERATOR,
    },
    { transactionId },
  );
  let deleted = 0;

  for (const action of existingActions) {
    if (expectedKeys.has(action.idempotency_key) || !["proposed", "needs_approval"].includes(action.state)) {
      continue;
    }

    deleted += await dataApi.executeMutation(
      "delete from actions where id = :actionId and state in ('proposed', 'needs_approval')",
      { actionId: action.id },
      { transactionId },
    );
  }

  return deleted;
}

async function upsertAction(
  input: ForecastInput,
  actionPlanId: string,
  action: DeterministicForecastResult["actions"][number],
  dataApi: AuroraDataApiClient,
  transactionId: string,
): Promise<string> {
  const [row] = await dataApi.execute<IdRow>(
    `
      insert into actions (
        tenant_id,
        external_id,
        action_plan_id,
        company_id,
        customer_id,
        invoice_id,
        obligation_id,
        action_type,
        title,
        rationale,
        priority,
        state,
        currency_code,
        expected_cash_impact,
        due_at,
        idempotency_key,
        metadata
      )
      values (
        :tenantId,
        :externalId,
        :actionPlanId,
        :companyId,
        :customerId,
        :invoiceId,
        :obligationId,
        :actionType,
        :title,
        :rationale,
        :priority,
        :state,
        :currencyCode,
        :expectedCashImpact,
        :dueAt,
        :idempotencyKey,
        :metadata
      )
      on conflict (tenant_id, idempotency_key) do update set
        external_id = excluded.external_id,
        action_plan_id = excluded.action_plan_id,
        company_id = excluded.company_id,
        customer_id = excluded.customer_id,
        invoice_id = excluded.invoice_id,
        obligation_id = excluded.obligation_id,
        action_type = excluded.action_type,
        title = excluded.title,
        rationale = excluded.rationale,
        priority = excluded.priority,
        state = case
          when actions.state in ('approved', 'rejected', 'scheduled', 'executing', 'completed', 'failed', 'cancelled')
          then actions.state
          else excluded.state
        end,
        currency_code = excluded.currency_code,
        expected_cash_impact = excluded.expected_cash_impact,
        due_at = excluded.due_at,
        metadata = excluded.metadata,
        updated_at = now()
      returning id
    `,
    {
      tenantId: input.tenantId,
      externalId: action.externalId,
      actionPlanId,
      companyId: input.companyId,
      customerId: action.customerId,
      invoiceId: action.invoiceId,
      obligationId: action.obligationId,
      actionType: action.actionType,
      title: action.title,
      rationale: action.rationale,
      priority: action.priority,
      state: action.state,
      currencyCode: action.currencyCode,
      expectedCashImpact: decimalParamFromCents(action.expectedCashImpactCents),
      dueAt: action.dueAt,
      idempotencyKey: action.idempotencyKey,
      metadata: jsonParam(action.metadata),
    },
    { transactionId },
  );

  return requireId(row, `action ${action.externalId}`);
}

function defaultHorizonStart(
  invoices: ForecastInvoice[],
  obligations: ForecastObligation[],
  payments: ForecastPayment[],
): string {
  const today = new Date().toISOString().slice(0, 10);
  const candidateDates = [
    today,
    ...invoices.map((invoice) => invoice.dueDate),
    ...obligations.map((obligation) => obligation.dueDate),
    ...payments.map((payment) => payment.paymentDate),
  ].sort();

  return candidateDates[0] ?? today;
}

function addDays(startDate: string, days: number): string {
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function decimalParamFromCents(cents: number): DataApiParam {
  return {
    value: (cents / 100).toFixed(2),
    typeHint: "DECIMAL",
  };
}

function decimalParam(value: number, decimals = 2): DataApiParam {
  return {
    value: value.toFixed(decimals),
    typeHint: "DECIMAL",
  };
}

function jsonParam(value: unknown): DataApiParam {
  return {
    value: JSON.stringify(value),
    typeHint: "JSON",
  };
}

function requireId(row: IdRow | undefined, label: string): string {
  if (!row?.id) {
    throw new Error(`Could not resolve ${label} id while persisting forecast.`);
  }

  return row.id;
}
