import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../aws/rds-data-api";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";

export type CompanyCaseState = {
  company: {
    externalId: string;
    name: string;
    industry: string | null;
    baseCurrency: string;
    cashBalanceCents: number;
  };
  caseId: string;
  customers: Array<{
    externalId: string;
    name: string;
    segment: string | null;
    paymentTermsDays: number | null;
    riskScore: number | null;
    primaryContact: {
      fullName: string;
      email: string;
      role: string | null;
    } | null;
  }>;
  invoices: Array<{
    externalId: string;
    invoiceNumber: string;
    customerExternalId: string;
    customerName: string;
    dueDate: string;
    currency: string;
    amountCents: number;
    amountPaidCents: number;
    outstandingCents: number;
    status: string;
    description: string | null;
  }>;
  obligations: Array<{
    externalId: string;
    title: string;
    vendorName: string;
    category: string;
    dueDate: string;
    currency: string;
    amountCents: number;
    status: string;
    priority: number;
  }>;
  forecast: {
    runExternalId: string;
    horizonStartDate: string;
    horizonEndDate: string;
    openingCashCents: number;
    minimumCashCents: number;
    points: Array<{
      pointDate: string;
      expectedCashCents: number;
      inflowCents: number;
      outflowCents: number;
      notes: string | null;
    }>;
  } | null;
  recommendedActions: Array<{
    externalId: string;
    actionType: string;
    status: string;
    priority: number;
    title: string;
    customerExternalId: string;
    customerName: string;
    invoiceExternalId: string | null;
    expectedRecoveryCents: number;
    rationale: string;
    approvalRequired: boolean;
    scheduledFor: string | null;
  }>;
  memoryFacts: Array<{
    externalId: string;
    customerExternalId: string;
    customerName: string;
    factText: string;
    confidence: number | null;
    sourceKind: string | null;
  }>;
};

type RepositoryOptions = {
  dataApi?: AuroraDataApiClient;
  companyExternalId?: string;
  caseId?: string;
};

type CompanyRow = {
  external_id: string;
  name: string;
  industry: string | null;
  base_currency: string;
  cash_balance_cents: number;
};

type CustomerRow = {
  external_id: string;
  name: string;
  segment: string | null;
  payment_terms_days: number | null;
  risk_score: number | null;
  contact_full_name: string | null;
  contact_email: string | null;
  contact_role: string | null;
};

type InvoiceRow = {
  external_id: string;
  invoice_number: string;
  customer_external_id: string;
  customer_name: string;
  due_date: string;
  currency: string;
  amount_cents: number;
  amount_paid_cents: number;
  outstanding_cents: number;
  status: string;
  description: string | null;
};

type ObligationRow = {
  external_id: string;
  title: string;
  vendor_name: string;
  category: string;
  due_date: string;
  currency: string;
  amount_cents: number;
  status: string;
  priority: number;
};

type ForecastRunRow = {
  run_external_id: string;
  horizon_start_date: string;
  horizon_end_date: string;
  opening_cash_cents: number;
  minimum_cash_cents: number;
};

type ForecastPointRow = {
  point_date: string;
  expected_cash_cents: number;
  inflow_cents: number;
  outflow_cents: number;
  notes: string | null;
};

type ActionRow = {
  external_id: string;
  action_type: string;
  status: string;
  priority: number;
  title: string;
  customer_external_id: string;
  customer_name: string;
  invoice_external_id: string | null;
  expected_recovery_cents: number;
  rationale: string;
  approval_required: boolean;
  scheduled_for: string | null;
};

type MemoryRow = {
  external_id: string;
  customer_external_id: string;
  customer_name: string;
  fact_text: string;
  confidence: number | null;
  source_kind: string | null;
};

export async function getCurrentCaseState(
  options: RepositoryOptions = {},
): Promise<CompanyCaseState> {
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
  const params = { companyExternalId, caseId };

  const [company] = await dataApi.execute<CompanyRow>(
    `
      select
        c.external_id,
        coalesce(c.trading_name, c.legal_name) as name,
        c.industry,
        c.base_currency,
        coalesce(round(sum(coalesce(ca.current_balance, 0)) * 100), 0)::bigint as cash_balance_cents
      from companies c
      left join cash_accounts ca on ca.company_id = c.id and ca.state = 'active'
      where c.external_id = :companyExternalId
      group by c.id
      limit 1
    `,
    params,
  );

  if (!company) {
    throw new Error(`No company found for external id ${companyExternalId}. Run the demo seed first.`);
  }

  const [customers, invoices, obligations, forecastRuns, actions, memoryFacts] = await Promise.all([
    dataApi.execute<CustomerRow>(
      `
        select
          c.external_id,
          c.name,
          c.metadata->>'segment' as segment,
          c.payment_terms_days,
          nullif(coalesce(c.metadata->>'risk_score', c.metadata->>'riskScore'), '')::integer as risk_score,
          primary_contact.full_name as contact_full_name,
          primary_contact.email as contact_email,
          primary_contact.role_title as contact_role
        from customers c
        left join lateral (
          select full_name, email, role_title
          from contacts
          where customer_id = c.id
          order by is_primary desc, created_at asc
          limit 1
        ) primary_contact on true
        where c.company_id = (
          select id from companies where external_id = :companyExternalId limit 1
        )
        order by c.name asc
      `,
      params,
    ),
    dataApi.execute<InvoiceRow>(
      `
        select
          i.external_id,
          i.invoice_number,
          c.external_id as customer_external_id,
          c.name as customer_name,
          i.due_date::text as due_date,
          i.currency_code as currency,
          round(i.amount_total * 100)::bigint as amount_cents,
          round(i.amount_paid * 100)::bigint as amount_paid_cents,
          round(i.amount_due * 100)::bigint as outstanding_cents,
          i.state as status,
          i.metadata->>'description' as description
        from invoices i
        join customers c on c.id = i.customer_id
        where i.company_id = (
          select id from companies where external_id = :companyExternalId limit 1
        )
        order by i.due_date asc, i.invoice_number asc
      `,
      params,
    ),
    dataApi.execute<ObligationRow>(
      `
        select
          coalesce(external_id, metadata->>'externalId', idempotency_key) as external_id,
          coalesce(metadata->>'title', counterparty_name) as title,
          counterparty_name as vendor_name,
          category,
          due_date::text as due_date,
          currency_code as currency,
          round(amount * 100)::bigint as amount_cents,
          state as status,
          coalesce(nullif(metadata->>'priority', '')::integer, 99) as priority
        from obligations
        where company_id = (
          select id from companies where external_id = :companyExternalId limit 1
        )
        order by due_date asc, priority asc
      `,
      params,
    ),
    dataApi.execute<ForecastRunRow>(
      `
        select
          coalesce(external_id, output_summary->>'external_id', output_summary->>'externalId', idempotency_key) as run_external_id,
          horizon_start::text as horizon_start_date,
          horizon_end::text as horizon_end_date,
          coalesce(
            nullif(coalesce(output_summary->>'opening_cash_cents', output_summary->>'openingCashCents'), '')::bigint,
            0
          ) as opening_cash_cents,
          coalesce(
            nullif(coalesce(output_summary->>'minimum_cash_cents', output_summary->>'minimumCashCents'), '')::bigint,
            0
          ) as minimum_cash_cents
        from forecast_runs
        where company_id = (
          select id from companies where external_id = :companyExternalId limit 1
        )
          and coalesce(output_summary->>'case_id', output_summary->>'caseId') = :caseId
        order by created_at desc
        limit 1
      `,
      params,
    ),
    dataApi.execute<ActionRow>(
      `
        select
          coalesce(a.external_id, a.metadata->>'externalId', a.idempotency_key) as external_id,
          a.action_type,
          a.state as status,
          coalesce(
            nullif(coalesce(a.metadata->>'priority_rank', a.metadata->>'priorityRank'), '')::integer,
            99
          ) as priority,
          a.title,
          c.external_id as customer_external_id,
          c.name as customer_name,
          i.external_id as invoice_external_id,
          round(a.expected_cash_impact * 100)::bigint as expected_recovery_cents,
          coalesce(a.rationale, '') as rationale,
          coalesce(
            nullif(coalesce(a.metadata->>'approval_required', a.metadata->>'approvalRequired'), '')::boolean,
            true
          ) as approval_required,
          a.due_at::text as scheduled_for
        from actions a
        join action_plans ap on ap.id = a.action_plan_id
        join customers c on c.id = a.customer_id
        left join invoices i on i.id = a.invoice_id
        where ap.company_id = (
          select id from companies where external_id = :companyExternalId limit 1
        )
          and coalesce(a.metadata->>'case_id', a.metadata->>'caseId') = :caseId
        order by priority asc, a.created_at asc
      `,
      params,
    ),
    dataApi.execute<MemoryRow>(
      `
        select
          coalesce(m.external_id, m.metadata->>'externalId') as external_id,
          c.external_id as customer_external_id,
          c.name as customer_name,
          m.content as fact_text,
          m.confidence::float8 as confidence,
          m.source_type as source_kind
        from memory_chunks m
        join customers c on c.id = m.customer_id
        where m.company_id = (
          select id from companies where external_id = :companyExternalId limit 1
        )
        order by m.created_at desc
        limit 20
      `,
      params,
    ),
  ]);

  const [forecastRun] = forecastRuns;
  const forecastPoints = forecastRun
    ? await dataApi.execute<ForecastPointRow>(
        `
          select
            point_date::text as point_date,
            coalesce(round(max(amount) filter (where metric = 'cash_balance') * 100), 0)::bigint as expected_cash_cents,
            coalesce(round(max(amount) filter (where metric = 'expected_inflow') * 100), 0)::bigint as inflow_cents,
            coalesce(round(max(amount) filter (where metric = 'expected_outflow') * 100), 0)::bigint as outflow_cents,
            max(drivers->>'notes') as notes
          from forecast_points
          where forecast_run_id = (
            select id
            from forecast_runs
            where external_id = :forecastRunExternalId
            limit 1
          )
          group by point_date
          order by point_date asc
        `,
        { forecastRunExternalId: forecastRun.run_external_id },
      )
    : [];

  return {
    company: {
      externalId: company.external_id,
      name: company.name,
      industry: company.industry,
      baseCurrency: company.base_currency,
      cashBalanceCents: company.cash_balance_cents,
    },
    caseId,
    customers: customers.map((customer) => ({
      externalId: customer.external_id,
      name: customer.name,
      segment: customer.segment,
      paymentTermsDays: customer.payment_terms_days,
      riskScore: customer.risk_score,
      primaryContact: customer.contact_email
        ? {
            fullName: customer.contact_full_name ?? "",
            email: customer.contact_email,
            role: customer.contact_role,
          }
        : null,
    })),
    invoices: invoices.map((invoice) => ({
      externalId: invoice.external_id,
      invoiceNumber: invoice.invoice_number,
      customerExternalId: invoice.customer_external_id,
      customerName: invoice.customer_name,
      dueDate: invoice.due_date,
      currency: invoice.currency,
      amountCents: invoice.amount_cents,
      amountPaidCents: invoice.amount_paid_cents,
      outstandingCents: invoice.outstanding_cents,
      status: invoice.status,
      description: invoice.description,
    })),
    obligations: obligations.map((obligation) => ({
      externalId: obligation.external_id,
      title: obligation.title,
      vendorName: obligation.vendor_name,
      category: obligation.category,
      dueDate: obligation.due_date,
      currency: obligation.currency,
      amountCents: obligation.amount_cents,
      status: obligation.status,
      priority: obligation.priority,
    })),
    forecast: forecastRun
      ? {
          runExternalId: forecastRun.run_external_id,
          horizonStartDate: forecastRun.horizon_start_date,
          horizonEndDate: forecastRun.horizon_end_date,
          openingCashCents: forecastRun.opening_cash_cents,
          minimumCashCents: forecastRun.minimum_cash_cents,
          points: forecastPoints.map((point) => ({
            pointDate: point.point_date,
            expectedCashCents: point.expected_cash_cents,
            inflowCents: point.inflow_cents,
            outflowCents: point.outflow_cents,
            notes: point.notes,
          })),
        }
      : null,
    recommendedActions: actions.map((action) => ({
      externalId: action.external_id,
      actionType: action.action_type,
      status: action.status,
      priority: action.priority,
      title: action.title,
      customerExternalId: action.customer_external_id,
      customerName: action.customer_name,
      invoiceExternalId: action.invoice_external_id,
      expectedRecoveryCents: action.expected_recovery_cents,
      rationale: action.rationale,
      approvalRequired: action.approval_required,
      scheduledFor: action.scheduled_for,
    })),
    memoryFacts: memoryFacts.map((fact) => ({
      externalId: fact.external_id,
      customerExternalId: fact.customer_external_id,
      customerName: fact.customer_name,
      factText: fact.fact_text,
      confidence: fact.confidence,
      sourceKind: fact.source_kind,
    })),
  };
}
