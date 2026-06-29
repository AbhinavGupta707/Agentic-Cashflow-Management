import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../aws/rds-data-api";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";
import type { VoiceCallScript } from "../voice/contracts";

type RepositoryOptions = {
  dataApi?: AuroraDataApiClient;
  companyExternalId?: string;
  caseId?: string;
};

export type ProductCustomerListItem = {
  id: string;
  externalId: string | null;
  name: string;
  segment: string | null;
  riskScore: number | null;
  exposureCents: number;
  overdueCents: number;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
  averageDaysLate: number | null;
  lastInteractionAt: string | null;
  recommendedOutreach: ProductRecommendedOutreach;
  primaryContact: ProductCustomerContact | null;
};

export type ProductCustomerDetail = ProductCustomerListItem & {
  paymentTermsDays: number | null;
  behaviorSummary: string;
  invoices: ProductCustomerInvoice[];
  interactionHistory: ProductCustomerInteraction[];
  learnedFacts: ProductCustomerMemoryFact[];
  callScriptPreview: VoiceCallScript;
  evidence: ProductCustomerEvidence[];
};

export type ProductCustomersState = {
  companyExternalId: string;
  caseId: string;
  generatedAt: string;
  customers: ProductCustomerListItem[];
};

export type ProductCustomerContact = {
  id: string;
  fullName: string | null;
  role: string | null;
  email: string | null;
  phoneE164: string | null;
};

export type ProductCustomerInvoice = {
  id: string;
  externalId: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  amountCents: number;
  amountPaidCents: number;
  outstandingCents: number;
  state: string;
  daysOverdue: number;
  description: string | null;
};

export type ProductCustomerInteraction = {
  id: string;
  source: "email" | "voice_call" | "voice_transcript" | "provider_execution";
  direction: "inbound" | "outbound" | "system";
  occurredAt: string;
  title: string;
  summary: string;
  state: string;
  provider: string | null;
  providerId: string | null;
};

export type ProductCustomerMemoryFact = {
  id: string;
  externalId: string | null;
  factType: string;
  content: string;
  confidence: number | null;
  sourceType: string;
  validFrom: string;
};

export type ProductRecommendedOutreach = {
  channel: "phone" | "email" | "manual_review";
  priority: "low" | "medium" | "high" | "urgent";
  reason: string;
  actionId: string | null;
  actionExternalId: string | null;
  expectedCashImpactCents: number;
  approvalState: string | null;
};

export type ProductCustomerEvidence = {
  id: string;
  type: "invoice" | "memory" | "communication" | "voice_call";
  label: string;
  summary: string;
  occurredAt: string | null;
  sourceId: string;
};

type CompanyScopeRow = {
  company_id: string;
  tenant_id: string;
};

type CustomerSummaryRow = {
  id: string;
  external_id: string | null;
  name: string;
  segment: string | null;
  payment_terms_days: number | null;
  risk_score: number | null;
  contact_id: string | null;
  contact_full_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone_e164: string | null;
  exposure_cents: number;
  overdue_cents: number;
  open_invoice_count: number;
  overdue_invoice_count: number;
  average_days_late: number | null;
  last_interaction_at: string | null;
  action_id: string | null;
  action_external_id: string | null;
  action_type: string | null;
  action_priority: "low" | "medium" | "high" | "urgent" | null;
  action_title: string | null;
  action_rationale: string | null;
  expected_cash_impact_cents: number | null;
  approval_state: string | null;
};

type InvoiceRow = {
  id: string;
  external_id: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  amount_cents: number;
  amount_paid_cents: number;
  outstanding_cents: number;
  state: string;
  days_overdue: number;
  description: string | null;
};

type CommunicationRow = {
  id: string;
  source: "email";
  direction: "inbound" | "outbound";
  occurred_at: string;
  title: string | null;
  summary: string | null;
  state: string;
  provider: string | null;
  provider_id: string | null;
};

type VoiceCallRow = {
  id: string;
  source: "voice_call";
  direction: "inbound" | "outbound";
  occurred_at: string;
  title: string;
  summary: string | null;
  state: string;
  provider: string | null;
  provider_id: string | null;
};

type MemoryRow = {
  id: string;
  external_id: string | null;
  fact_type: string;
  content: string;
  confidence: number | null;
  source_type: string;
  valid_from: string;
};

export async function getProductCustomers(options: RepositoryOptions = {}): Promise<ProductCustomersState> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const caseId = options.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const rows = await listCustomerSummaries(dataApi, scope, caseId);

  return {
    companyExternalId: options.companyExternalId ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID,
    caseId,
    generatedAt: new Date().toISOString(),
    customers: rows.map(normalizeCustomerSummary),
  };
}

export async function getProductCustomerDetail(
  customerIdentifier: string,
  options: RepositoryOptions = {},
): Promise<ProductCustomerDetail> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const caseId = options.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const customer = await findCustomerSummary(dataApi, scope, caseId, customerIdentifier);
  const [invoices, communications, voiceCalls, memoryFacts] = await Promise.all([
    listInvoices(dataApi, scope, customer.id),
    listCommunications(dataApi, scope, customer.id),
    listVoiceCalls(dataApi, scope, customer.id),
    listMemoryFacts(dataApi, scope, customer.id),
  ]);

  const normalized = normalizeCustomerSummary(customer);
  const normalizedInvoices = invoices.map(normalizeInvoice);
  const normalizedMemory = memoryFacts.map(normalizeMemoryFact);
  const interactions = [...communications.map(normalizeCommunication), ...voiceCalls.map(normalizeVoiceCall)].sort(
    (left, right) => right.occurredAt.localeCompare(left.occurredAt),
  );

  return {
    ...normalized,
    paymentTermsDays: customer.payment_terms_days,
    behaviorSummary: behaviorSummary(normalized, normalizedInvoices, normalizedMemory),
    invoices: normalizedInvoices,
    interactionHistory: interactions,
    learnedFacts: normalizedMemory,
    callScriptPreview: createCallScriptPreview(normalized, normalizedInvoices, normalizedMemory),
    evidence: createEvidence(normalizedInvoices, normalizedMemory, interactions),
  };
}

async function resolveDataApi(options: RepositoryOptions): Promise<AuroraDataApiClient> {
  if (options.dataApi) {
    return options.dataApi;
  }

  const availability = getDataApiAvailability();

  if (!availability.available) {
    throw new DataApiUnavailableError(availability.missing);
  }

  return createAuroraDataApiClient(availability.config);
}

async function resolveCompanyScope(
  dataApi: AuroraDataApiClient,
  options: RepositoryOptions,
): Promise<CompanyScopeRow> {
  const companyExternalId = options.companyExternalId ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID;
  const [scope] = await dataApi.execute<CompanyScopeRow>(
    `
      select id as company_id, tenant_id
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

async function findCustomerSummary(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
  caseId: string,
  customerIdentifier: string,
): Promise<CustomerSummaryRow> {
  const rows = await listCustomerSummaries(dataApi, scope, caseId, customerIdentifier);
  const customer = rows[0];

  if (!customer) {
    throw new Error(`No customer found for id or external id ${customerIdentifier}.`);
  }

  return customer;
}

async function listCustomerSummaries(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
  caseId: string,
  customerIdentifier?: string,
): Promise<CustomerSummaryRow[]> {
  return dataApi.execute<CustomerSummaryRow>(
    `
      select
        c.id,
        c.external_id,
        c.name,
        c.metadata->>'segment' as segment,
        c.payment_terms_days,
        nullif(coalesce(c.metadata->>'risk_score', c.metadata->>'riskScore'), '')::integer as risk_score,
        primary_contact.id as contact_id,
        primary_contact.full_name as contact_full_name,
        primary_contact.role_title as contact_role,
        primary_contact.email as contact_email,
        primary_contact.phone_e164 as contact_phone_e164,
        coalesce(invoice_stats.exposure_cents, 0)::bigint as exposure_cents,
        coalesce(invoice_stats.overdue_cents, 0)::bigint as overdue_cents,
        coalesce(invoice_stats.open_invoice_count, 0)::integer as open_invoice_count,
        coalesce(invoice_stats.overdue_invoice_count, 0)::integer as overdue_invoice_count,
        invoice_stats.average_days_late::float8 as average_days_late,
        interactions.last_interaction_at::text as last_interaction_at,
        action.id as action_id,
        action.external_id as action_external_id,
        action.action_type,
        action.priority as action_priority,
        action.title as action_title,
        action.rationale as action_rationale,
        round(action.expected_cash_impact * 100)::bigint as expected_cash_impact_cents,
        approval.state as approval_state
      from customers c
      left join lateral (
        select id, full_name, role_title, email, phone_e164
        from contacts
        where tenant_id = c.tenant_id
          and customer_id = c.id
        order by is_primary desc, created_at asc
        limit 1
      ) primary_contact on true
      left join lateral (
        select
          round(sum(amount_due) * 100)::bigint as exposure_cents,
          round(sum(amount_due) filter (where due_date < current_date and state in ('open', 'partially_paid', 'disputed')) * 100)::bigint as overdue_cents,
          count(*) filter (where state in ('open', 'partially_paid', 'disputed'))::integer as open_invoice_count,
          count(*) filter (where due_date < current_date and state in ('open', 'partially_paid', 'disputed'))::integer as overdue_invoice_count,
          avg(greatest(0, current_date - due_date)) filter (where due_date < current_date and state in ('open', 'partially_paid', 'disputed')) as average_days_late
        from invoices
        where tenant_id = c.tenant_id
          and customer_id = c.id
      ) invoice_stats on true
      left join lateral (
        select max(occurred_at) as last_interaction_at
        from (
          select coalesce(sent_at, received_at, created_at) as occurred_at
          from communication_messages
          where tenant_id = c.tenant_id
            and customer_id = c.id
          union all
          select coalesce(started_at, ended_at, created_at) as occurred_at
          from voice_calls
          where tenant_id = c.tenant_id
            and customer_id = c.id
        ) recent
      ) interactions on true
      left join lateral (
        select a.*
        from actions a
        where a.tenant_id = c.tenant_id
          and a.company_id = c.company_id
          and a.customer_id = c.id
          and a.action_type in ('call_customer', 'send_reminder', 'collect_invoice')
          and coalesce(a.metadata->>'case_id', a.metadata->>'caseId', :caseId) = :caseId
        order by
          case a.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
          a.created_at desc
        limit 1
      ) action on true
      left join lateral (
        select state
        from approval_records
        where tenant_id = c.tenant_id
          and action_id = action.id
        order by requested_at desc
        limit 1
      ) approval on true
      where c.tenant_id = :tenantId
        and c.company_id = :companyId
        and (
          :customerIdentifier = ''
          or c.id::text = :customerIdentifier
          or c.external_id = :customerIdentifier
        )
      order by coalesce(invoice_stats.overdue_cents, 0) desc, c.name asc
    `,
    {
      tenantId: scope.tenant_id,
      companyId: scope.company_id,
      caseId,
      customerIdentifier: customerIdentifier ?? "",
    },
  );
}

async function listInvoices(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
  customerId: string,
): Promise<InvoiceRow[]> {
  return dataApi.execute<InvoiceRow>(
    `
      select
        id,
        external_id,
        invoice_number,
        issue_date::text as issue_date,
        due_date::text as due_date,
        currency_code::text as currency,
        round(amount_total * 100)::bigint as amount_cents,
        round(amount_paid * 100)::bigint as amount_paid_cents,
        round(amount_due * 100)::bigint as outstanding_cents,
        state,
        greatest(0, current_date - due_date)::integer as days_overdue,
        metadata->>'description' as description
      from invoices
      where tenant_id = :tenantId
        and customer_id = :customerId
      order by due_date asc, invoice_number asc
    `,
    { tenantId: scope.tenant_id, customerId },
  );
}

async function listCommunications(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
  customerId: string,
): Promise<CommunicationRow[]> {
  return dataApi.execute<CommunicationRow>(
    `
      select
        id,
        'email'::text as source,
        direction,
        coalesce(sent_at, received_at, created_at)::text as occurred_at,
        subject as title,
        left(coalesce(body, ''), 240) as summary,
        state,
        provider,
        provider_message_id as provider_id
      from communication_messages
      where tenant_id = :tenantId
        and customer_id = :customerId
      order by coalesce(sent_at, received_at, created_at) desc
      limit 20
    `,
    { tenantId: scope.tenant_id, customerId },
  );
}

async function listVoiceCalls(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
  customerId: string,
): Promise<VoiceCallRow[]> {
  return dataApi.execute<VoiceCallRow>(
    `
      select
        id,
        'voice_call'::text as source,
        direction,
        coalesce(started_at, ended_at, created_at)::text as occurred_at,
        'Phone call'::text as title,
        summary,
        state,
        provider,
        provider_call_id as provider_id
      from voice_calls
      where tenant_id = :tenantId
        and customer_id = :customerId
      order by coalesce(started_at, ended_at, created_at) desc
      limit 20
    `,
    { tenantId: scope.tenant_id, customerId },
  );
}

async function listMemoryFacts(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
  customerId: string,
): Promise<MemoryRow[]> {
  return dataApi.execute<MemoryRow>(
    `
      select
        id,
        external_id,
        fact_type,
        content,
        confidence::float8 as confidence,
        source_type,
        valid_from::text as valid_from
      from memory_chunks
      where tenant_id = :tenantId
        and customer_id = :customerId
      order by confidence desc nulls last, valid_from desc
      limit 20
    `,
    { tenantId: scope.tenant_id, customerId },
  );
}

function normalizeCustomerSummary(row: CustomerSummaryRow): ProductCustomerListItem {
  const channel = recommendedChannel(row);
  const priority = row.action_priority ?? priorityFromExposure(row.overdue_cents, row.exposure_cents);

  return {
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    segment: row.segment,
    riskScore: row.risk_score,
    exposureCents: row.exposure_cents,
    overdueCents: row.overdue_cents,
    openInvoiceCount: row.open_invoice_count,
    overdueInvoiceCount: row.overdue_invoice_count,
    averageDaysLate: row.average_days_late,
    lastInteractionAt: row.last_interaction_at,
    primaryContact: row.contact_id
      ? {
          id: row.contact_id,
          fullName: row.contact_full_name,
          role: row.contact_role,
          email: row.contact_email,
          phoneE164: row.contact_phone_e164,
        }
      : null,
    recommendedOutreach: {
      channel,
      priority,
      reason: row.action_rationale ?? recommendedReason(row, channel),
      actionId: row.action_id,
      actionExternalId: row.action_external_id,
      expectedCashImpactCents: row.expected_cash_impact_cents ?? row.exposure_cents,
      approvalState: row.approval_state,
    },
  };
}

function normalizeInvoice(row: InvoiceRow): ProductCustomerInvoice {
  return {
    id: row.id,
    externalId: row.external_id,
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    currency: row.currency,
    amountCents: row.amount_cents,
    amountPaidCents: row.amount_paid_cents,
    outstandingCents: row.outstanding_cents,
    state: row.state,
    daysOverdue: row.days_overdue,
    description: row.description,
  };
}

function normalizeCommunication(row: CommunicationRow): ProductCustomerInteraction {
  return {
    id: row.id,
    source: row.source,
    direction: row.direction,
    occurredAt: row.occurred_at,
    title: row.title ?? "Email interaction",
    summary: row.summary ?? "",
    state: row.state,
    provider: row.provider,
    providerId: row.provider_id,
  };
}

function normalizeVoiceCall(row: VoiceCallRow): ProductCustomerInteraction {
  return {
    id: row.id,
    source: row.source,
    direction: row.direction,
    occurredAt: row.occurred_at,
    title: row.title,
    summary: row.summary ?? "Voice call state recorded without a transcript summary yet.",
    state: row.state,
    provider: row.provider,
    providerId: row.provider_id,
  };
}

function normalizeMemoryFact(row: MemoryRow): ProductCustomerMemoryFact {
  return {
    id: row.id,
    externalId: row.external_id,
    factType: row.fact_type,
    content: row.content,
    confidence: row.confidence,
    sourceType: row.source_type,
    validFrom: row.valid_from,
  };
}

function recommendedChannel(row: CustomerSummaryRow): ProductRecommendedOutreach["channel"] {
  if (row.action_type === "call_customer" || (row.overdue_cents > 0 && row.contact_phone_e164)) {
    return "phone";
  }

  if (row.contact_email) {
    return "email";
  }

  return "manual_review";
}

function priorityFromExposure(overdueCents: number, exposureCents: number): ProductRecommendedOutreach["priority"] {
  if (overdueCents >= 100_000_00) {
    return "urgent";
  }

  if (overdueCents > 0 || exposureCents >= 50_000_00) {
    return "high";
  }

  if (exposureCents > 0) {
    return "medium";
  }

  return "low";
}

function recommendedReason(row: CustomerSummaryRow, channel: ProductRecommendedOutreach["channel"]): string {
  if (channel === "phone") {
    return "Prioritize a phone follow-up because this customer has overdue exposure and a callable contact on file.";
  }

  if (channel === "email") {
    return "Send an approval-gated payment follow-up using the current invoice and customer memory context.";
  }

  return "Review manually because no approved email or phone contact is available.";
}

function behaviorSummary(
  customer: ProductCustomerListItem,
  invoices: ProductCustomerInvoice[],
  facts: ProductCustomerMemoryFact[],
): string {
  const overdue = invoices.filter((invoice) => invoice.daysOverdue > 0 && invoice.outstandingCents > 0);
  const topFact = facts[0]?.content;

  if (overdue.length > 0) {
    const days = Math.max(...overdue.map((invoice) => invoice.daysOverdue));
    return `${customer.name} has ${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"}, with the oldest ${days} days late.${
      topFact ? ` Learned context: ${topFact}` : ""
    }`;
  }

  if (customer.exposureCents > 0) {
    return `${customer.name} has open receivables but no overdue balance in the current case.${
      topFact ? ` Learned context: ${topFact}` : ""
    }`;
  }

  return `${customer.name} has no current open receivable exposure in this case.${
    topFact ? ` Learned context: ${topFact}` : ""
  }`;
}

function createCallScriptPreview(
  customer: ProductCustomerListItem,
  invoices: ProductCustomerInvoice[],
  facts: ProductCustomerMemoryFact[],
): VoiceCallScript {
  const targetInvoice = invoices.find((invoice) => invoice.outstandingCents > 0);
  const invoiceLine = targetInvoice
    ? `invoice ${targetInvoice.invoiceNumber}, currently ${targetInvoice.daysOverdue} days overdue`
    : "the open balance on your account";
  const learnedContext = facts[0]?.content;
  const opening = `Hi ${customer.primaryContact?.fullName ?? customer.name}, this is a cashflow follow-up about ${invoiceLine}.`;
  const talkingPoints = [
    "Confirm the invoice is with the right approver and there are no unresolved disputes.",
    "Ask for a concrete payment date or partial payment plan.",
    "Explain that any follow-up action remains subject to the approval workflow.",
  ];

  if (learnedContext) {
    talkingPoints.unshift(`Use learned context carefully: ${learnedContext}`);
  }

  const objectionHandling = [
    "If they need more detail, offer to resend invoice evidence after the call.",
    "If payment timing has moved, capture the promised date for memory extraction.",
  ];
  const close = "Thanks for confirming. I will update the cashflow plan with the agreed next step.";

  return {
    source: "deterministic_fallback",
    opening,
    talkingPoints,
    objectionHandling,
    close,
    body: [opening, ...talkingPoints.map((point) => `- ${point}`), ...objectionHandling.map((point) => `- ${point}`), close].join(
      "\n",
    ),
  };
}

function createEvidence(
  invoices: ProductCustomerInvoice[],
  facts: ProductCustomerMemoryFact[],
  interactions: ProductCustomerInteraction[],
): ProductCustomerEvidence[] {
  const invoiceEvidence = invoices.slice(0, 6).map((invoice) => ({
    id: `invoice:${invoice.id}`,
    type: "invoice" as const,
    label: invoice.invoiceNumber,
    summary: `${invoice.state} invoice with ${invoice.outstandingCents} cents outstanding.`,
    occurredAt: invoice.dueDate,
    sourceId: invoice.id,
  }));
  const memoryEvidence = facts.slice(0, 4).map((fact) => ({
    id: `memory:${fact.id}`,
    type: "memory" as const,
    label: fact.factType,
    summary: fact.content,
    occurredAt: fact.validFrom,
    sourceId: fact.id,
  }));
  const interactionEvidence = interactions.slice(0, 4).map((interaction) => ({
    id: `interaction:${interaction.id}`,
    type: interaction.source === "voice_call" ? ("voice_call" as const) : ("communication" as const),
    label: interaction.title,
    summary: interaction.summary,
    occurredAt: interaction.occurredAt,
    sourceId: interaction.id,
  }));

  return [...invoiceEvidence, ...memoryEvidence, ...interactionEvidence];
}
