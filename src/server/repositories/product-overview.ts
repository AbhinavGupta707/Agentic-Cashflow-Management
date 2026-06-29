import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../aws/rds-data-api";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";
import type { Cp3ForecastCockpitState, Cp3RecommendedAction } from "../db/cp3-forecast-cockpit-contract";
import type {
  ProductDataSource,
  ProductOverviewAction,
  ProductOverviewAgentStatus,
  ProductOverviewChartPoint,
  ProductOverviewState,
} from "../db/product-overview-contract";
import { getCp3ForecastCockpitState } from "./cp3-forecast-cockpit";

type RepositoryOptions = {
  dataApi?: AuroraDataApiClient;
  companyExternalId?: string;
  caseId?: string;
};

type CompanyOverviewRow = {
  tenant_id: string;
  company_id: string;
  external_id: string;
  name: string;
  industry: string | null;
  base_currency: string;
  timezone: string;
  current_cash_cents: number;
  last_updated_at: string;
};

type ObligationOverviewRow = {
  upcoming_count: number;
  upcoming_amount_cents: number;
  next_due_date: string | null;
  payroll_external_id: string | null;
  payroll_amount_cents: number | null;
  payroll_due_date: string | null;
};

export async function getProductOverviewState(
  options: RepositoryOptions = {},
): Promise<ProductOverviewState> {
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

  const [company, cp3State] = await Promise.all([
    loadCompanyOverview(dataApi, companyExternalId),
    getCp3ForecastCockpitState({ dataApi, companyExternalId, caseId }),
  ]);
  const obligationOverview = await loadObligationOverview(dataApi, company.company_id, company.tenant_id);
  const chartSeries = cp3State.forecast.points.map(toChartPoint);
  const projectedLow = findProjectedLow(chartSeries);
  const runway = findRunway(chartSeries);
  const lastUpdatedAt = latestIso([
    company.last_updated_at,
    cp3State.forecast.run?.completedAt,
    cp3State.forecast.run?.startedAt,
    cp3State.forecast.run?.createdAt,
    cp3State.actionPlan.plan?.updatedAt,
    cp3State.agent.runs[0]?.updatedAt,
    ...cp3State.cp4EmailApproval.items.map((item) => item.draft?.updatedAt ?? item.approval.requestedAt),
  ]);
  const source = readySource("Overview state was read from Aurora-backed forecast, action, approval, and agent records.");

  return {
    company: {
      externalId: company.external_id,
      name: company.name,
      industry: company.industry,
      baseCurrency: company.base_currency,
      timezone: company.timezone,
    },
    case: {
      id: caseId,
      label: formatCaseLabel(caseId),
    },
    source,
    lastUpdatedAt,
    cash: {
      currentCash: {
        label: "Cash today",
        valueCents: company.current_cash_cents,
        currency: company.base_currency,
        source: readySource("Current cash is the sum of active Aurora cash account balances."),
      },
      projectedLowPoint: {
        label: "Projected low point",
        valueCents: projectedLow?.expectedCashCents ?? null,
        currency: company.base_currency,
        date: projectedLow?.date ?? null,
        source: chartSeries.length > 0
          ? readySource("Projected low point is computed from the latest persisted forecast series.")
          : unavailableSource("aurora", "No persisted forecast points are available for this company/case."),
      },
      runway: {
        label: "Runway",
        date: runway?.date ?? null,
        daysFromToday: runway?.daysFromToday ?? null,
        status: runwayStatus(runway?.daysFromToday ?? null, projectedLow?.expectedCashCents ?? null),
        source: chartSeries.length > 0
          ? readySource("Runway is the first forecast date where projected cash falls below zero.")
          : unavailableSource("aurora", "No persisted forecast points are available for runway computation."),
      },
      upcomingPayroll: {
        label: "Payroll due",
        valueCents: obligationOverview.payroll_amount_cents,
        currency: company.base_currency,
        dueDate: obligationOverview.payroll_due_date,
        obligationExternalId: obligationOverview.payroll_external_id,
        source: obligationOverview.payroll_due_date
          ? readySource("Next scheduled payroll obligation was read from Aurora.")
          : unavailableSource("aurora", "No scheduled or overdue payroll obligation is present."),
      },
      upcomingObligations: {
        label: "Upcoming obligations",
        valueCents: obligationOverview.upcoming_amount_cents,
        currency: company.base_currency,
        count: obligationOverview.upcoming_count,
        nextDueDate: obligationOverview.next_due_date,
        source: readySource("Upcoming obligations include scheduled and overdue obligations due in the next 30 days."),
      },
    },
    chart: {
      state: chartSeries.length > 0 ? "ready" : "unavailable",
      source: chartSeries.length > 0
        ? readySource("Cashflow/runway chart series comes from latest persisted forecast points.")
        : unavailableSource("aurora", cp3State.forecast.message),
      series: chartSeries,
    },
    criticalActions: cp3State.actionPlan.recommendedActions.slice(0, 4).map(toOverviewAction),
    approvalsNeeded: cp3State.cp4EmailApproval.items
      .filter((item) => item.approval.state === "pending" || item.approval.required)
      .slice(0, 6)
      .map((item) => ({
        actionExternalId: item.actionExternalId,
        title: item.title,
        approvalState: item.approval.state,
        requestedAt: item.approval.requestedAt,
        expiresAt: item.approval.expiresAt,
        customerName: item.customer.name,
        draftSubject: item.draft?.subject ?? null,
        blockers: item.sendEligibility.blockers,
        source: readySource("Approval item was read from Aurora approval and communication draft records."),
      })),
    agentStatuses: buildAgentStatuses(cp3State),
    providerReadiness: {
      source: readySource("Provider readiness reflects environment configuration and latest provider execution records."),
      providers: cp3State.providers,
      configuredCount: cp3State.providers.filter((provider) => provider.configured).length,
      unavailableCount: cp3State.providers.filter((provider) => provider.status === "unavailable").length,
    },
  };
}

async function loadCompanyOverview(
  dataApi: AuroraDataApiClient,
  companyExternalId: string,
): Promise<CompanyOverviewRow> {
  const [company] = await dataApi.execute<CompanyOverviewRow>(
    `
      select
        c.tenant_id,
        c.id as company_id,
        c.external_id,
        coalesce(c.trading_name, c.legal_name) as name,
        c.industry,
        c.base_currency,
        c.timezone,
        coalesce(round(sum(coalesce(ca.current_balance, 0)) * 100), 0)::bigint as current_cash_cents,
        greatest(
          c.updated_at,
          coalesce(max(ca.updated_at), c.updated_at),
          coalesce((select max(updated_at) from forecast_runs where company_id = c.id), c.updated_at),
          coalesce((select max(updated_at) from actions where company_id = c.id), c.updated_at),
          coalesce((select max(updated_at) from agent_runs where company_id = c.id), c.updated_at)
        )::text as last_updated_at
      from companies c
      left join cash_accounts ca on ca.company_id = c.id and ca.state = 'active'
      where c.external_id = :companyExternalId
        and c.state = 'active'
      group by c.id
      limit 1
    `,
    { companyExternalId },
  );

  if (!company) {
    throw new Error(`No active company found for external id ${companyExternalId}. Run the demo seed first.`);
  }

  return company;
}

async function loadObligationOverview(
  dataApi: AuroraDataApiClient,
  companyId: string,
  tenantId: string,
): Promise<ObligationOverviewRow> {
  const [row] = await dataApi.execute<ObligationOverviewRow>(
    `
      with upcoming as (
        select *
        from obligations
        where tenant_id = :tenantId
          and company_id = :companyId
          and state in ('scheduled', 'overdue')
          and due_date <= current_date + interval '30 days'
      ),
      payroll as (
        select
          coalesce(external_id, idempotency_key, id::text) as payroll_external_id,
          round(amount * 100)::bigint as payroll_amount_cents,
          due_date::text as payroll_due_date
        from obligations
        where tenant_id = :tenantId
          and company_id = :companyId
          and state in ('scheduled', 'overdue')
          and obligation_type = 'payroll'
        order by due_date asc, amount desc
        limit 1
      )
      select
        count(upcoming.id)::int as upcoming_count,
        coalesce(round(sum(upcoming.amount) * 100), 0)::bigint as upcoming_amount_cents,
        min(upcoming.due_date)::text as next_due_date,
        max(payroll.payroll_external_id) as payroll_external_id,
        max(payroll.payroll_amount_cents) as payroll_amount_cents,
        max(payroll.payroll_due_date) as payroll_due_date
      from upcoming
      full join payroll on true
    `,
    { companyId, tenantId },
  );

  return row ?? {
    upcoming_count: 0,
    upcoming_amount_cents: 0,
    next_due_date: null,
    payroll_external_id: null,
    payroll_amount_cents: null,
    payroll_due_date: null,
  };
}

function toChartPoint(point: Cp3ForecastCockpitState["forecast"]["points"][number]): ProductOverviewChartPoint {
  return {
    date: point.pointDate,
    expectedCashCents: point.expectedCashCents,
    inflowCents: point.inflowCents,
    outflowCents: point.outflowCents,
    netCashflowCents: point.netCashflowCents,
    shortfallCents: point.shortfallCents,
  };
}

function toOverviewAction(action: Cp3RecommendedAction): ProductOverviewAction {
  return {
    externalId: action.externalId,
    title: action.title,
    priority: action.priority,
    actionType: action.actionType,
    expectedCashImpactCents: action.expectedCashImpactCents,
    rationale: action.rationale,
    customerName: action.customer.name,
    approvalState: action.approval.state,
    dueAt: action.scheduledFor,
    source: readySource("Critical action was read from the latest Aurora action plan."),
  };
}

function buildAgentStatuses(cp3State: Cp3ForecastCockpitState): ProductOverviewAgentStatus[] {
  if (cp3State.agent.runs.length === 0) {
    return [
      {
        key: "agent-runtime",
        label: "Agent runtime",
        state: "unavailable",
        lastUpdatedAt: null,
        traceAvailable: false,
        message: cp3State.agent.message,
        source: unavailableSource("aurora", cp3State.agent.message),
      },
    ];
  }

  return cp3State.agent.runs.map((run) => ({
    key: run.id,
    label: formatIdentifier(`${run.runKind} ${run.graphName}`),
    state: run.state,
    lastUpdatedAt: run.updatedAt,
    traceAvailable: run.traceAvailable,
    message: run.errorMessage ?? `${formatIdentifier(run.runKind)} agent run is ${run.state}.`,
    source: readySource("Agent run metadata was read from Aurora. Trace URLs and payload bodies are not exposed here."),
  }));
}

function findProjectedLow(series: ProductOverviewChartPoint[]): ProductOverviewChartPoint | null {
  return series.reduce<ProductOverviewChartPoint | null>((lowest, point) => {
    if (!lowest || point.expectedCashCents < lowest.expectedCashCents) {
      return point;
    }

    return lowest;
  }, null);
}

function findRunway(series: ProductOverviewChartPoint[]): { date: string; daysFromToday: number } | null {
  const firstBelowZero = series.find((point) => point.expectedCashCents < 0);

  if (!firstBelowZero) {
    return null;
  }

  return {
    date: firstBelowZero.date,
    daysFromToday: diffDays(new Date(), new Date(`${firstBelowZero.date}T00:00:00.000Z`)),
  };
}

function runwayStatus(
  daysFromToday: number | null,
  projectedLowCents: number | null,
): "safe" | "watch" | "critical" | "unknown" {
  if (projectedLowCents === null) {
    return "unknown";
  }

  if (projectedLowCents < 0 || (daysFromToday !== null && daysFromToday <= 14)) {
    return "critical";
  }

  if (projectedLowCents < 250_000 || (daysFromToday !== null && daysFromToday <= 30)) {
    return "watch";
  }

  return "safe";
}

function latestIso(values: Array<string | null | undefined>): string {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()));

  if (dates.length === 0) {
    return new Date().toISOString();
  }

  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
}

function diffDays(left: Date, right: Date): number {
  const start = Date.UTC(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate());
  const end = Date.UTC(right.getUTCFullYear(), right.getUTCMonth(), right.getUTCDate());

  return Math.ceil((end - start) / 86_400_000);
}

function readySource(message: string): ProductDataSource {
  return {
    state: "ready",
    source: "aurora",
    message,
    unavailableReason: null,
  };
}

function unavailableSource(source: ProductDataSource["source"], message: string): ProductDataSource {
  return {
    state: "unavailable",
    source,
    message,
    unavailableReason: message,
  };
}

function formatCaseLabel(caseId: string): string {
  return formatIdentifier(caseId.replace(/^case_/, ""));
}

function formatIdentifier(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
