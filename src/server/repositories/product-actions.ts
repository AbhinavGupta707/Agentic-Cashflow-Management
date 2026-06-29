import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import {
  createAuroraDataApiClient,
  type AuroraDataApiClient,
  type DataApiParam,
} from "../aws/rds-data-api";
import { getGmailRuntimeStatus } from "../communication/gmail-runtime";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";
import type {
  Cp4ApprovalState,
  Cp4DraftState,
  Cp4GmailStatus,
  Cp4ProviderExecutionState,
} from "../db/cp4-communication-contract";
import type { ProviderStatus } from "../db/provider-status-contract";
import { scopedIdempotencyKey, stableHash } from "../ingestion/idempotency";
import { createFireworksProvider, type FireworksProvider } from "../providers/fireworks";
import { getLangSmithTracingStatus } from "../providers/langsmith";
import { decideApproval } from "./cp4-communication";

type RepositoryOptions = {
  dataApi?: AuroraDataApiClient;
  companyExternalId?: string;
  caseId?: string;
  env?: NodeJS.ProcessEnv;
  fireworksProvider?: FireworksProvider;
};

type CompanyScopeRow = {
  company_id: string;
  tenant_id: string;
  company_name: string;
  company_external_id: string | null;
  base_currency: string;
};

type ActionRow = {
  id: string;
  external_id: string | null;
  idempotency_key: string;
  action_type: string;
  state: string;
  priority: string;
  title: string;
  rationale: string | null;
  expected_cash_impact_cents: number;
  currency_code: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  customer_id: string | null;
  customer_external_id: string | null;
  customer_name: string | null;
  customer_risk_tier: string | null;
  customer_payment_terms_days: number | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone_e164: string | null;
  contact_consent_state: string | null;
  invoice_id: string | null;
  invoice_external_id: string | null;
  invoice_number: string | null;
  invoice_due_date: string | null;
  invoice_state: string | null;
  invoice_amount_total_cents: number | null;
  invoice_amount_due_cents: number | null;
  approval_id: string | null;
  approval_state: Cp4ApprovalState | null;
  approval_requested_at: string | null;
  approval_decided_at: string | null;
  approval_expires_at: string | null;
  approval_decision_note: string | null;
  draft_id: string | null;
  draft_channel: "email" | "voice_script" | null;
  draft_provider: string | null;
  draft_subject: string | null;
  draft_body: string | null;
  draft_state: Cp4DraftState | null;
  draft_agent_run_id: string | null;
  draft_updated_at: string | null;
  message_id: string | null;
  message_channel: "email" | "voice" | null;
  message_direction: "outbound" | "inbound" | null;
  message_provider: string | null;
  provider_message_id: string | null;
  message_subject: string | null;
  message_state: string | null;
  message_sent_at: string | null;
  message_received_at: string | null;
  execution_id: string | null;
  execution_provider: string | null;
  execution_operation: string | null;
  execution_state: Cp4ProviderExecutionState | null;
  provider_execution_id: string | null;
  execution_attempts: number | null;
  execution_last_error: string | null;
  execution_attempted_at: string | null;
  execution_completed_at: string | null;
  voice_call_id: string | null;
  voice_provider: string | null;
  provider_call_id: string | null;
  voice_state: string | null;
  voice_started_at: string | null;
  voice_ended_at: string | null;
  voice_summary: string | null;
  latest_agent_run_id: string | null;
  latest_agent_state: string | null;
  trace_url: string | null;
};

type MemoryRow = {
  id: string;
  fact_type: string;
  content: string;
  confidence: number | null;
  source_type: string;
  created_at: string;
};

type ProviderExecutionHistoryRow = {
  id: string;
  provider: string;
  operation: string;
  state: Cp4ProviderExecutionState;
  provider_execution_id: string | null;
  attempts: number;
  last_error: string | null;
  attempted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageHistoryRow = {
  id: string;
  channel: string;
  direction: string;
  provider: string | null;
  provider_message_id: string | null;
  subject: string | null;
  state: string;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
};

type VoiceHistoryRow = {
  id: string;
  provider: string;
  provider_call_id: string | null;
  phone_e164: string;
  direction: string;
  state: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

type DraftRow = {
  id: string;
  action_id: string | null;
  action_external_id: string | null;
  customer_id: string | null;
  customer_external_id: string | null;
  customer_name: string | null;
  contact_id: string | null;
  contact_email: string | null;
  channel: "email" | "voice_script";
  provider: string | null;
  subject: string | null;
  body: string;
  state: Cp4DraftState;
  generated_by_agent_run_id: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

export type ProductProviderState = {
  fireworks: ProviderStatus;
  langsmith: ProviderStatus;
  gmail: Cp4GmailStatus;
  voice: {
    provider: "twilio";
    status: "available" | "unavailable";
    reason: "configured" | "missing-config";
    message: string;
    missingEnv: string[];
    checkedAt: string;
    executionGate: {
      state: "approval_and_test_number_required" | "configuration_missing";
      requiresApproval: true;
      requiresExplicitLiveFlag: true;
      requiresTestNumber: true;
      message: string;
    };
  };
};

export type ProductActionDetailContract = {
  href: string;
  previewState: "stored" | "generated_on_detail";
  previewSource: ProductDraftPreview["source"] | null;
  shouldFetchForPreview: boolean;
  mutationRoutes: {
    approve: string;
    reject: string;
    editDraft: string;
  };
};

export type ProductActionSummary = {
  id: string;
  externalId: string;
  actionType: string;
  state: string;
  priority: string;
  title: string;
  whyThisAction: string;
  cashImpact: {
    expectedCents: number;
    currency: string;
    display: string;
  };
  customer: {
    id: string | null;
    externalId: string | null;
    name: string | null;
    riskTier: string | null;
  };
  approval: ProductApprovalState;
  draftPreview: ProductDraftPreview | null;
  detail: ProductActionDetailContract;
  providerState: {
    latestProvider: string | null;
    latestExecutionState: string | null;
    outboundOutcomeBackedByProvider: boolean;
    executionGate: "approval_required" | "provider_executed" | "no_provider_execution";
  };
  updatedAt: string;
};

export type ProductApprovalState = {
  id: string | null;
  state: Cp4ApprovalState | "missing";
  requestedAt: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  decisionNote: string | null;
  canApprove: boolean;
  canReject: boolean;
};

export type ProductDraftPreview = {
  id: string | null;
  channel: "email" | "voice_script";
  provider: string | null;
  subject: string | null;
  body: string;
  state: Cp4DraftState | "preview";
  source: "aurora" | "fireworks" | "deterministic_fallback";
  updatedAt: string | null;
};

export type ProductActionDetail = ProductActionSummary & {
  customerContext: {
    paymentTermsDays: number | null;
    contact: {
      id: string | null;
      name: string | null;
      email: string | null;
      phoneE164: string | null;
      consentState: string | null;
    };
    memoryFacts: Array<{
      id: string;
      factType: string;
      content: string;
      confidence: number | null;
      sourceType: string;
      createdAt: string;
    }>;
  };
  invoice: {
    id: string | null;
    externalId: string | null;
    invoiceNumber: string | null;
    dueDate: string | null;
    state: string | null;
    amountTotalCents: number | null;
    amountDueCents: number | null;
  };
  callScriptPreview: {
    source: "fireworks" | "deterministic_fallback";
    opener: string;
    talkingPoints: string[];
    close: string;
  };
  evidence: Array<{
    type: "invoice" | "memory" | "draft" | "provider_execution" | "message" | "voice_call";
    label: string;
    detail: string;
    occurredAt: string | null;
  }>;
  guardrails: string[];
  providerState: ProductActionSummary["providerState"] & {
    providers: ProductProviderState;
  };
  executionHistory: {
    providerExecutions: ProductProviderExecutionHistory[];
    messages: ProductMessageHistory[];
    voiceCalls: ProductVoiceHistory[];
  };
  agentTrace: {
    agentRunId: string | null;
    state: string | null;
    traceUrl: string | null;
    langSmithProject: string | null;
  };
};

export type ProductProviderExecutionHistory = {
  id: string;
  provider: string;
  operation: string;
  state: Cp4ProviderExecutionState;
  providerExecutionId: string | null;
  attempts: number;
  lastError: string | null;
  attemptedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductMessageHistory = {
  id: string;
  channel: string;
  direction: string;
  provider: string | null;
  providerMessageId: string | null;
  subject: string | null;
  state: string;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductVoiceHistory = {
  id: string;
  provider: string;
  providerCallId: string | null;
  phoneE164: string;
  direction: string;
  state: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductActionsState = {
  companyExternalId: string;
  caseId: string;
  generatedAt: string;
  providers: ProductProviderState;
  actions: ProductActionSummary[];
};

export type ProductActionDecisionResult = {
  action: ProductActionDetail;
  actions: ProductActionsState;
  decision: {
    requested: "approved" | "rejected";
    applied: boolean;
    state: ProductApprovalState["state"];
    message: string;
  };
  refresh: {
    actionHref: string;
    actionsHref: string;
  };
};

export type ProductDraftEditResult = {
  draft: ProductDraftPreview;
  action: ProductActionDetail;
  actions: ProductActionsState;
  edit: {
    applied: true;
    message: string;
  };
  refresh: {
    actionHref: string;
    actionsHref: string;
  };
};

export class ProductActionConflictError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProductActionConflictError";
    this.code = code;
  }
}

export async function listProductActions(options: RepositoryOptions = {}): Promise<ProductActionsState> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const caseId = resolveCaseId(options);
  const rows = await listActionRows(dataApi, scope, caseId);
  const providers = buildProviderState(options);

  return {
    companyExternalId: scope.company_external_id ?? resolveCompanyExternalId(options),
    caseId,
    generatedAt: new Date().toISOString(),
    providers,
    actions: rows.map((row) => toActionSummary(row)),
  };
}

export async function getProductActionDetail(
  input: { actionIdOrExternalId: string },
  options: RepositoryOptions = {},
): Promise<ProductActionDetail> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const caseId = resolveCaseId(options);
  const row = await findActionRow(dataApi, scope, caseId, input.actionIdOrExternalId);
  const [memoryRows, providerExecutions, messages, voiceCalls] = await Promise.all([
    listMemoryFacts(dataApi, scope.tenant_id, row.customer_id),
    listProviderExecutionHistory(dataApi, scope.tenant_id, row.id),
    listMessageHistory(dataApi, scope.tenant_id, row.id),
    listVoiceHistory(dataApi, scope.tenant_id, row.id),
  ]);
  const fireworksProvider = options.fireworksProvider ?? createFireworksProvider({ env: options.env });
  const existingDraft = row.draft_body
    ? {
        subject: row.draft_subject,
        body: row.draft_body,
        channel: row.draft_channel ?? ("email" as const),
      }
    : null;
  const previewResult = await fireworksProvider.generateActionPreview({
    companyName: scope.company_name,
    baseCurrency: scope.base_currency,
    action: {
      externalId: row.external_id ?? row.idempotency_key,
      actionType: row.action_type,
      title: row.title,
      rationale: row.rationale,
      expectedCashImpactCents: row.expected_cash_impact_cents,
      customerName: row.customer_name,
      contactName: row.contact_name,
      invoiceNumber: row.invoice_number,
      invoiceDueDate: row.invoice_due_date,
      outstandingCents: row.invoice_amount_due_cents,
    },
    memoryFacts: memoryRows.map((memory) => memory.content),
    existingDraft,
  });
  const providers = {
    ...buildProviderState(options),
    fireworks: previewResult.providerStatus,
  };
  const summary = toActionSummary(row, previewResult.preview.whyThisAction);
  const previewChannel: "email" | "voice_script" =
    row.action_type === "call_customer" ? "voice_script" : "email";
  const draftPreview: ProductDraftPreview | null =
    row.draft_body && row.draft_channel
      ? toDraftPreview(row)
      : {
          id: null,
          channel: previewChannel,
          provider: previewChannel === "voice_script" ? null : "gmail",
          subject: previewChannel === "voice_script" ? null : previewResult.preview.emailDraft.subject,
          body:
            previewChannel === "voice_script"
              ? scriptToBody(previewResult.preview.callScript)
              : previewResult.preview.emailDraft.body,
          state: "preview",
          source: previewResult.preview.source,
          updatedAt: null,
        };

  return {
    ...summary,
    draftPreview,
    customerContext: {
      paymentTermsDays: row.customer_payment_terms_days,
      contact: {
        id: row.contact_id,
        name: row.contact_name,
        email: row.contact_email,
        phoneE164: row.contact_phone_e164,
        consentState: row.contact_consent_state,
      },
      memoryFacts: memoryRows.map((memory) => ({
        id: memory.id,
        factType: memory.fact_type,
        content: memory.content,
        confidence: memory.confidence,
        sourceType: memory.source_type,
        createdAt: memory.created_at,
      })),
    },
    invoice: {
      id: row.invoice_id,
      externalId: row.invoice_external_id,
      invoiceNumber: row.invoice_number,
      dueDate: row.invoice_due_date,
      state: row.invoice_state,
      amountTotalCents: row.invoice_amount_total_cents,
      amountDueCents: row.invoice_amount_due_cents,
    },
    callScriptPreview: {
      source: previewResult.preview.source,
      ...previewResult.preview.callScript,
    },
    evidence: buildEvidence(row, memoryRows, providerExecutions, messages, voiceCalls),
    guardrails: buildGuardrails(row, previewResult.preview.guardrails),
    providerState: {
      ...summary.providerState,
      providers,
    },
    executionHistory: {
      providerExecutions: providerExecutions.map(toProviderExecutionHistory),
      messages: messages.map(toMessageHistory),
      voiceCalls: voiceCalls.map(toVoiceHistory),
    },
    agentTrace: {
      agentRunId: row.latest_agent_run_id,
      state: row.latest_agent_state,
      traceUrl: row.trace_url,
      langSmithProject:
        typeof providers.langsmith.metadata?.project === "string" ? providers.langsmith.metadata.project : null,
    },
  };
}

export async function approveProductAction(
  input: {
    actionIdOrExternalId: string;
    decisionNote?: string | null;
    decidedByUserId?: string | null;
    idempotencyKey?: string | null;
  },
  options: RepositoryOptions = {},
): Promise<ProductActionDecisionResult> {
  const current = await getDecisionGuardRow(input.actionIdOrExternalId, options);
  const guarded = await handleAlreadyDecidedAction(current, "approved", input.actionIdOrExternalId, options);
  if (guarded) {
    return guarded;
  }

  await decideApproval(
    {
      actionId: isUuid(input.actionIdOrExternalId) ? input.actionIdOrExternalId : null,
      actionExternalId: isUuid(input.actionIdOrExternalId) ? null : input.actionIdOrExternalId,
      decision: "approved",
      decisionNote: input.decisionNote,
      decidedByUserId: input.decidedByUserId,
      idempotencyKey: input.idempotencyKey,
    },
    options,
  );
  await updateNonEmailDraftStates(input.actionIdOrExternalId, "approved", options);

  return buildDecisionResult(input.actionIdOrExternalId, options, "approved", true);
}

export async function rejectProductAction(
  input: {
    actionIdOrExternalId: string;
    decisionNote?: string | null;
    decidedByUserId?: string | null;
    idempotencyKey?: string | null;
  },
  options: RepositoryOptions = {},
): Promise<ProductActionDecisionResult> {
  const current = await getDecisionGuardRow(input.actionIdOrExternalId, options);
  const guarded = await handleAlreadyDecidedAction(current, "rejected", input.actionIdOrExternalId, options);
  if (guarded) {
    return guarded;
  }

  await decideApproval(
    {
      actionId: isUuid(input.actionIdOrExternalId) ? input.actionIdOrExternalId : null,
      actionExternalId: isUuid(input.actionIdOrExternalId) ? null : input.actionIdOrExternalId,
      decision: "rejected",
      decisionNote: input.decisionNote,
      decidedByUserId: input.decidedByUserId,
      idempotencyKey: input.idempotencyKey,
    },
    options,
  );
  await updateNonEmailDraftStates(input.actionIdOrExternalId, "rejected", options);

  return buildDecisionResult(input.actionIdOrExternalId, options, "rejected", true);
}

export async function editProductActionDraft(
  input: {
    actionIdOrExternalId: string;
    channel?: "email" | "voice_script";
    subject?: string | null;
    body: string;
    idempotencyKey?: string | null;
  },
  options: RepositoryOptions = {},
): Promise<ProductDraftEditResult> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const caseId = resolveCaseId(options);
  const action = await findActionRow(dataApi, scope, caseId, input.actionIdOrExternalId);
  const channel = input.channel ?? (action.action_type === "call_customer" ? "voice_script" : "email");

  if (action.approval_state === "approved" || action.state === "approved") {
    throw new ProductActionConflictError(
      "approval_already_granted",
      "Approved actions cannot be edited without a new approval workflow.",
    );
  }

  if (action.draft_state === "sent" || action.message_state === "sent") {
    throw new ProductActionConflictError("draft_already_sent", "Sent drafts cannot be edited.");
  }

  const existingDraft = await findLatestDraft(dataApi, scope.tenant_id, action.id, channel);
  const draftState: Cp4DraftState = action.approval_state === "rejected" ? "rejected" : "needs_approval";
  const idempotencyKey =
    existingDraft?.idempotency_key ??
    input.idempotencyKey ??
    scopedIdempotencyKey(["product", "draft", action.idempotency_key, channel]);
  const [draft] = await dataApi.execute<DraftRow>(
    `
      with upserted as (
        insert into communication_drafts (
          tenant_id,
          action_id,
          customer_id,
          contact_id,
          channel,
          provider,
          subject,
          body,
          state,
          generated_by_agent_run_id,
          idempotency_key,
          metadata
        )
        values (
          :tenantId,
          :actionId,
          :customerId,
          :contactId,
          :channel,
          :provider,
          :subject,
          :body,
          :state,
          :agentRunId,
          :idempotencyKey,
          :metadata
        )
        on conflict (tenant_id, idempotency_key) do update set
          subject = excluded.subject,
          body = excluded.body,
          state = excluded.state,
          metadata = communication_drafts.metadata || excluded.metadata,
          updated_at = now()
        returning *
      )
      select ${draftReturningSql()}
      from upserted cd
      left join actions a on a.id = cd.action_id and a.tenant_id = cd.tenant_id
      left join customers c on c.id = cd.customer_id and c.tenant_id = cd.tenant_id
      left join contacts ct on ct.id = cd.contact_id and ct.tenant_id = cd.tenant_id
    `,
    {
      tenantId: scope.tenant_id,
      actionId: action.id,
      customerId: action.customer_id,
      contactId: action.contact_id,
      channel,
      provider: channel === "email" ? "gmail" : null,
      subject: channel === "email" ? input.subject ?? existingDraft?.subject ?? null : null,
      body: input.body,
      state: draftState,
      agentRunId: action.latest_agent_run_id,
      idempotencyKey,
      metadata: jsonParam({
        source: "user_edit",
        caseId,
        contentHash: stableHash({ subject: input.subject ?? null, body: input.body, channel }),
      }),
    },
  );

  await insertAuditLog(dataApi, {
    tenantId: scope.tenant_id,
    action: "product.action_draft.edited",
    targetType: "communication_draft",
    targetId: requireRow(draft, "edited draft").id,
    afterData: {
      actionId: action.id,
      channel,
      state: draftState,
    },
    idempotencyKey: scopedIdempotencyKey(["audit", "product-draft-edited", idempotencyKey]),
  });

  return {
    draft: normalizeDraft(requireRow(draft, "edited draft")),
    action: await getProductActionDetail({ actionIdOrExternalId: input.actionIdOrExternalId }, options),
    actions: await listProductActions(options),
    edit: {
      applied: true,
      message: "Draft was persisted in Aurora. No provider send or call was executed.",
    },
    refresh: buildRefreshLinks(input.actionIdOrExternalId),
  };
}

async function updateNonEmailDraftStates(
  actionIdOrExternalId: string,
  state: "approved" | "rejected",
  options: RepositoryOptions,
): Promise<void> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const action = await findActionRow(dataApi, scope, resolveCaseId(options), actionIdOrExternalId);

  await dataApi.executeMutation(
    `
      update communication_drafts
      set state = :state, updated_at = now()
      where tenant_id = :tenantId
        and action_id = :actionId
        and channel <> 'email'
        and state <> 'sent'
    `,
    {
      tenantId: scope.tenant_id,
      actionId: action.id,
      state,
    },
  );
}

async function listActionRows(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
  caseId: string,
): Promise<ActionRow[]> {
  return dataApi.execute<ActionRow>(
    `
      ${actionSelectSql()}
      where a.tenant_id = :tenantId
        and a.company_id = :companyId
        and coalesce(a.metadata->>'case_id', a.metadata->>'caseId', :caseId) = :caseId
      ${actionOrderSql()}
      limit 30
    `,
    { tenantId: scope.tenant_id, companyId: scope.company_id, caseId },
  );
}

async function findActionRow(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
  caseId: string,
  actionIdOrExternalId: string,
): Promise<ActionRow> {
  const rows = await dataApi.execute<ActionRow>(
    `
      ${actionSelectSql()}
      where a.tenant_id = :tenantId
        and a.company_id = :companyId
        and coalesce(a.metadata->>'case_id', a.metadata->>'caseId', :caseId) = :caseId
        and (
          (cast(:actionId as uuid) is not null and a.id = cast(:actionId as uuid))
          or a.external_id = :externalId
          or a.idempotency_key = :externalId
        )
      ${actionOrderSql()}
      limit 1
    `,
    {
      tenantId: scope.tenant_id,
      companyId: scope.company_id,
      caseId,
      actionId: { value: isUuid(actionIdOrExternalId) ? actionIdOrExternalId : null, typeHint: "UUID" },
      externalId: actionIdOrExternalId,
    },
  );

  return requireRow(rows[0], `product action ${actionIdOrExternalId}`);
}

function actionSelectSql(): string {
  return `
    select
      a.id,
      a.external_id,
      a.idempotency_key,
      a.action_type,
      a.state,
      a.priority,
      a.title,
      a.rationale,
      round(a.expected_cash_impact * 100)::bigint as expected_cash_impact_cents,
      a.currency_code::text as currency_code,
      a.due_at::text as due_at,
      a.created_at::text as created_at,
      a.updated_at::text as updated_at,
      c.id as customer_id,
      c.external_id as customer_external_id,
      c.name as customer_name,
      c.risk_tier as customer_risk_tier,
      c.payment_terms_days as customer_payment_terms_days,
      contact.id as contact_id,
      contact.full_name as contact_name,
      contact.email as contact_email,
      contact.phone_e164 as contact_phone_e164,
      contact.consent_state as contact_consent_state,
      i.id as invoice_id,
      i.external_id as invoice_external_id,
      i.invoice_number,
      i.due_date::text as invoice_due_date,
      i.state as invoice_state,
      round(i.amount_total * 100)::bigint as invoice_amount_total_cents,
      round(i.amount_due * 100)::bigint as invoice_amount_due_cents,
      approval.id as approval_id,
      approval.state as approval_state,
      approval.requested_at::text as approval_requested_at,
      approval.decided_at::text as approval_decided_at,
      approval.expires_at::text as approval_expires_at,
      approval.decision_note as approval_decision_note,
      draft.id as draft_id,
      draft.channel as draft_channel,
      draft.provider as draft_provider,
      draft.subject as draft_subject,
      draft.body as draft_body,
      draft.state as draft_state,
      draft.generated_by_agent_run_id::text as draft_agent_run_id,
      draft.updated_at::text as draft_updated_at,
      message.id as message_id,
      message.channel as message_channel,
      message.direction as message_direction,
      message.provider as message_provider,
      message.provider_message_id,
      message.subject as message_subject,
      message.state as message_state,
      message.sent_at::text as message_sent_at,
      message.received_at::text as message_received_at,
      execution.id as execution_id,
      execution.provider as execution_provider,
      execution.operation as execution_operation,
      execution.state as execution_state,
      execution.provider_execution_id,
      execution.attempts as execution_attempts,
      execution.last_error as execution_last_error,
      execution.attempted_at::text as execution_attempted_at,
      execution.completed_at::text as execution_completed_at,
      voice.id as voice_call_id,
      voice.provider as voice_provider,
      voice.provider_call_id,
      voice.state as voice_state,
      voice.started_at::text as voice_started_at,
      voice.ended_at::text as voice_ended_at,
      voice.summary as voice_summary,
      agent.id as latest_agent_run_id,
      agent.state as latest_agent_state,
      agent.trace_url
    from actions a
    left join customers c on c.id = a.customer_id and c.tenant_id = a.tenant_id
    left join invoices i on i.id = a.invoice_id and i.tenant_id = a.tenant_id
    left join lateral (
      select id, full_name, email, phone_e164, consent_state
      from contacts
      where tenant_id = a.tenant_id
        and customer_id = a.customer_id
      order by is_primary desc, created_at asc
      limit 1
    ) contact on true
    left join lateral (
      select id, state, requested_at, decided_at, expires_at, decision_note
      from approval_records
      where tenant_id = a.tenant_id
        and action_id = a.id
      order by requested_at desc
      limit 1
    ) approval on true
    left join lateral (
      select id, channel, provider, subject, body, state, generated_by_agent_run_id, updated_at
      from communication_drafts
      where tenant_id = a.tenant_id
        and action_id = a.id
      order by
        case channel when 'email' then 0 when 'voice_script' then 1 else 2 end,
        updated_at desc
      limit 1
    ) draft on true
    left join lateral (
      select id, channel, direction, provider, provider_message_id, subject, state, sent_at, received_at
      from communication_messages
      where tenant_id = a.tenant_id
        and action_id = a.id
      order by coalesce(sent_at, received_at, created_at) desc
      limit 1
    ) message on true
    left join lateral (
      select id, provider, operation, state, provider_execution_id, attempts, last_error, attempted_at, completed_at
      from provider_executions
      where tenant_id = a.tenant_id
        and action_id = a.id
      order by updated_at desc, created_at desc
      limit 1
    ) execution on true
    left join lateral (
      select id, provider, provider_call_id, state, started_at, ended_at, summary
      from voice_calls
      where tenant_id = a.tenant_id
        and action_id = a.id
      order by updated_at desc, created_at desc
      limit 1
    ) voice on true
    left join lateral (
      select id, state, trace_url
      from agent_runs
      where tenant_id = a.tenant_id
        and company_id = a.company_id
        and (
          id = draft.generated_by_agent_run_id
          or output_payload::text like '%' || coalesce(a.external_id, a.idempotency_key) || '%'
        )
      order by coalesce(completed_at, updated_at, created_at) desc
      limit 1
    ) agent on true
  `;
}

function actionOrderSql(): string {
  return `
    order by
      case a.state
        when 'needs_approval' then 0
        when 'approved' then 1
        when 'executing' then 2
        when 'proposed' then 3
        else 4
      end,
      case a.priority
        when 'urgent' then 1
        when 'high' then 2
        when 'medium' then 3
        when 'low' then 4
        else 99
      end,
      a.created_at desc
  `;
}

async function listMemoryFacts(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  customerId: string | null,
): Promise<MemoryRow[]> {
  if (!customerId) {
    return [];
  }

  return dataApi.execute<MemoryRow>(
    `
      select
        id,
        fact_type,
        content,
        confidence::float8 as confidence,
        source_type,
        created_at::text as created_at
      from memory_chunks
      where tenant_id = :tenantId
        and customer_id = :customerId
        and (valid_until is null or valid_until > now())
      order by coalesce(confidence, 0) desc, created_at desc
      limit 5
    `,
    { tenantId, customerId },
  );
}

async function listProviderExecutionHistory(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  actionId: string,
): Promise<ProviderExecutionHistoryRow[]> {
  return dataApi.execute<ProviderExecutionHistoryRow>(
    `
      select
        id,
        provider,
        operation,
        state,
        provider_execution_id,
        attempts,
        last_error,
        attempted_at::text as attempted_at,
        completed_at::text as completed_at,
        created_at::text as created_at,
        updated_at::text as updated_at
      from provider_executions
      where tenant_id = :tenantId
        and action_id = :actionId
      order by updated_at desc, created_at desc
      limit 12
    `,
    { tenantId, actionId },
  );
}

async function listMessageHistory(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  actionId: string,
): Promise<MessageHistoryRow[]> {
  return dataApi.execute<MessageHistoryRow>(
    `
      select
        id,
        channel,
        direction,
        provider,
        provider_message_id,
        subject,
        state,
        sent_at::text as sent_at,
        received_at::text as received_at,
        created_at::text as created_at,
        updated_at::text as updated_at
      from communication_messages
      where tenant_id = :tenantId
        and action_id = :actionId
      order by coalesce(sent_at, received_at, created_at) desc
      limit 12
    `,
    { tenantId, actionId },
  );
}

async function listVoiceHistory(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  actionId: string,
): Promise<VoiceHistoryRow[]> {
  return dataApi.execute<VoiceHistoryRow>(
    `
      select
        id,
        provider,
        provider_call_id,
        phone_e164,
        direction,
        state,
        started_at::text as started_at,
        ended_at::text as ended_at,
        duration_seconds,
        summary,
        created_at::text as created_at,
        updated_at::text as updated_at
      from voice_calls
      where tenant_id = :tenantId
        and action_id = :actionId
      order by updated_at desc, created_at desc
      limit 12
    `,
    { tenantId, actionId },
  );
}

async function findLatestDraft(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  actionId: string,
  channel: "email" | "voice_script",
): Promise<DraftRow | null> {
  const rows = await dataApi.execute<DraftRow>(
    `
      select ${draftReturningSql()}
      from communication_drafts cd
      left join actions a on a.id = cd.action_id and a.tenant_id = cd.tenant_id
      left join customers c on c.id = cd.customer_id and c.tenant_id = cd.tenant_id
      left join contacts ct on ct.id = cd.contact_id and ct.tenant_id = cd.tenant_id
      where cd.tenant_id = :tenantId
        and cd.action_id = :actionId
        and cd.channel = :channel
      order by cd.updated_at desc
      limit 1
    `,
    { tenantId, actionId, channel },
  );

  return rows[0] ?? null;
}

function toActionSummary(row: ActionRow, whyOverride?: string): ProductActionSummary {
  const approval = toApproval(row);
  const externalId = row.external_id ?? row.idempotency_key;
  const draftPreview = toDraftPreview(row);
  const providerExecuted = Boolean(row.provider_execution_id || row.provider_message_id || row.provider_call_id);

  return {
    id: row.id,
    externalId,
    actionType: row.action_type,
    state: row.state,
    priority: row.priority,
    title: row.title,
    whyThisAction: whyOverride ?? row.rationale ?? fallbackWhy(row),
    cashImpact: {
      expectedCents: row.expected_cash_impact_cents,
      currency: row.currency_code,
      display: formatMoney(row.expected_cash_impact_cents, row.currency_code),
    },
    customer: {
      id: row.customer_id,
      externalId: row.customer_external_id,
      name: row.customer_name,
      riskTier: row.customer_risk_tier,
    },
    approval,
    draftPreview,
    detail: buildDetailContract(externalId, draftPreview),
    providerState: {
      latestProvider: row.execution_provider ?? row.message_provider ?? row.voice_provider,
      latestExecutionState: row.execution_state ?? row.message_state ?? row.voice_state,
      outboundOutcomeBackedByProvider: providerExecuted,
      executionGate: providerExecuted
        ? "provider_executed"
        : approval.canApprove || approval.canReject
          ? "approval_required"
          : "no_provider_execution",
    },
    updatedAt: row.updated_at,
  };
}

async function getDecisionGuardRow(
  actionIdOrExternalId: string,
  options: RepositoryOptions,
): Promise<ActionRow> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const caseId = resolveCaseId(options);

  return findActionRow(dataApi, scope, caseId, actionIdOrExternalId);
}

async function handleAlreadyDecidedAction(
  row: ActionRow,
  decision: "approved" | "rejected",
  actionIdOrExternalId: string,
  options: RepositoryOptions,
): Promise<ProductActionDecisionResult | null> {
  if (!row.approval_id || row.approval_state === "missing") {
    throw new ProductActionConflictError(
      "approval_missing",
      "No approval record is available for this action. Create or seed an approval request first.",
    );
  }

  if (row.approval_state === "pending") {
    return null;
  }

  if (row.approval_state === decision) {
    return buildDecisionResult(actionIdOrExternalId, options, decision, false);
  }

  throw new ProductActionConflictError(
    "approval_already_decided",
    `This action is already ${row.approval_state}. Refresh the action before changing the decision.`,
  );
}

async function buildDecisionResult(
  actionIdOrExternalId: string,
  options: RepositoryOptions,
  decision: "approved" | "rejected",
  applied: boolean,
): Promise<ProductActionDecisionResult> {
  const action = await getProductActionDetail({ actionIdOrExternalId }, options);

  return {
    action,
    actions: await listProductActions(options),
    decision: {
      requested: decision,
      applied,
      state: action.approval.state,
      message: applied
        ? `Approval was marked ${decision} in Aurora. No provider send or call was executed.`
        : `Approval was already ${decision}; no duplicate decision was written.`,
    },
    refresh: buildRefreshLinks(actionIdOrExternalId),
  };
}

function buildDetailContract(
  actionExternalId: string,
  draftPreview: ProductDraftPreview | null,
): ProductActionDetailContract {
  const href = actionHref(actionExternalId);

  return {
    href,
    previewState: draftPreview ? "stored" : "generated_on_detail",
    previewSource: draftPreview?.source ?? null,
    shouldFetchForPreview: !draftPreview,
    mutationRoutes: {
      approve: `${href}/approve`,
      reject: `${href}/reject`,
      editDraft: `${href}/edit-draft`,
    },
  };
}

function buildRefreshLinks(actionIdOrExternalId: string): ProductActionDecisionResult["refresh"] {
  return {
    actionHref: actionHref(actionIdOrExternalId),
    actionsHref: "/api/product/actions",
  };
}

function actionHref(actionIdOrExternalId: string): string {
  return `/api/product/actions/${encodeURIComponent(actionIdOrExternalId)}`;
}

function toApproval(row: ActionRow): ProductApprovalState {
  const state = row.approval_state ?? "missing";

  return {
    id: row.approval_id,
    state,
    requestedAt: row.approval_requested_at,
    decidedAt: row.approval_decided_at,
    expiresAt: row.approval_expires_at,
    decisionNote: row.approval_decision_note,
    canApprove: state === "pending",
    canReject: state === "pending",
  };
}

function toDraftPreview(row: ActionRow): ProductDraftPreview | null {
  if (!row.draft_body || !row.draft_channel) {
    return null;
  }

  return {
    id: row.draft_id,
    channel: row.draft_channel,
    provider: row.draft_provider,
    subject: row.draft_subject,
    body: row.draft_body,
    state: row.draft_state ?? "draft",
    source: "aurora",
    updatedAt: row.draft_updated_at,
  };
}

function normalizeDraft(row: DraftRow): ProductDraftPreview {
  return {
    id: row.id,
    channel: row.channel,
    provider: row.provider,
    subject: row.subject,
    body: row.body,
    state: row.state,
    source: "aurora",
    updatedAt: row.updated_at,
  };
}

function buildEvidence(
  row: ActionRow,
  memoryRows: MemoryRow[],
  providerExecutions: ProviderExecutionHistoryRow[],
  messages: MessageHistoryRow[],
  voiceCalls: VoiceHistoryRow[],
): ProductActionDetail["evidence"] {
  const evidence: ProductActionDetail["evidence"] = [];

  if (row.invoice_id) {
    evidence.push({
      type: "invoice",
      label: row.invoice_number ? `Invoice ${row.invoice_number}` : "Invoice",
      detail: `${formatMoney(row.invoice_amount_due_cents ?? 0, row.currency_code)} outstanding${
        row.invoice_due_date ? ` due ${row.invoice_due_date}` : ""
      }.`,
      occurredAt: row.invoice_due_date,
    });
  }

  if (row.draft_id && row.draft_body) {
    evidence.push({
      type: "draft",
      label: row.draft_channel === "voice_script" ? "Call script draft" : "Email draft",
      detail: `${row.draft_state ?? "draft"} draft stored in Aurora.`,
      occurredAt: row.draft_updated_at,
    });
  }

  for (const memory of memoryRows.slice(0, 3)) {
    evidence.push({
      type: "memory",
      label: formatIdentifier(memory.fact_type),
      detail: memory.content,
      occurredAt: memory.created_at,
    });
  }

  for (const execution of providerExecutions.slice(0, 2)) {
    evidence.push({
      type: "provider_execution",
      label: `${execution.provider} ${execution.operation}`,
      detail: execution.provider_execution_id
        ? `${execution.state} with real provider execution id recorded.`
        : `${execution.state}; no provider id recorded.`,
      occurredAt: execution.completed_at ?? execution.attempted_at ?? execution.created_at,
    });
  }

  for (const message of messages.slice(0, 2)) {
    evidence.push({
      type: "message",
      label: `${message.direction} ${message.channel}`,
      detail: message.provider_message_id
        ? `${message.state} with real provider message id recorded.`
        : `${message.state}; no provider message id recorded.`,
      occurredAt: message.sent_at ?? message.received_at ?? message.created_at,
    });
  }

  for (const call of voiceCalls.slice(0, 2)) {
    evidence.push({
      type: "voice_call",
      label: `${call.provider} ${call.direction} call`,
      detail: call.provider_call_id
        ? `${call.state} with real provider call id recorded.`
        : `${call.state}; no provider call id recorded.`,
      occurredAt: call.started_at ?? call.created_at,
    });
  }

  return evidence;
}

function buildGuardrails(row: ActionRow, providerGuardrails: string[]): string[] {
  const guardrails = [
    ...providerGuardrails,
    "Approval changes only update Aurora approval and draft state; they do not execute providers.",
  ];

  if (row.action_type === "call_customer") {
    guardrails.push("A phone call requires a future voice execution route and approved state before Twilio can be used.");
  } else {
    guardrails.push("Email sending remains gated by the CP4 send runtime and an approved, unexpired approval record.");
  }

  if (row.contact_consent_state === "opted_out") {
    guardrails.push("Contact is opted out; outbound communication should remain blocked until consent is resolved.");
  }

  return Array.from(new Set(guardrails));
}

function toProviderExecutionHistory(row: ProviderExecutionHistoryRow): ProductProviderExecutionHistory {
  return {
    id: row.id,
    provider: row.provider,
    operation: row.operation,
    state: row.state,
    providerExecutionId: row.provider_execution_id,
    attempts: row.attempts,
    lastError: row.last_error,
    attemptedAt: row.attempted_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessageHistory(row: MessageHistoryRow): ProductMessageHistory {
  return {
    id: row.id,
    channel: row.channel,
    direction: row.direction,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    subject: row.subject,
    state: row.state,
    sentAt: row.sent_at,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toVoiceHistory(row: VoiceHistoryRow): ProductVoiceHistory {
  return {
    id: row.id,
    provider: row.provider,
    providerCallId: row.provider_call_id,
    phoneE164: row.phone_e164,
    direction: row.direction,
    state: row.state,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildProviderState(options: RepositoryOptions): ProductProviderState {
  const now = new Date();
  const env = options.env ?? process.env;
  const fireworksProvider = options.fireworksProvider ?? createFireworksProvider({ env });
  const voiceMissing = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"].filter((key) => !present(env[key]));

  if (!present(env.TWILIO_FROM_NUMBER) && !present(env.TWILIO_PHONE_NUMBER)) {
    voiceMissing.push("TWILIO_FROM_NUMBER", "TWILIO_PHONE_NUMBER");
  }

  return {
    fireworks: fireworksProvider.getStatus(now),
    langsmith: getLangSmithTracingStatus(env, now),
    gmail: getGmailRuntimeStatus(env, null, now),
    voice: {
      provider: "twilio",
      status: voiceMissing.length === 0 ? "available" : "unavailable",
      reason: voiceMissing.length === 0 ? "configured" : "missing-config",
      message:
        voiceMissing.length === 0
          ? "Twilio environment appears configured, but this action API does not place calls."
          : "Twilio is not fully configured. Voice execution remains unavailable.",
      missingEnv: voiceMissing,
      checkedAt: now.toISOString(),
      executionGate:
        voiceMissing.length === 0
          ? {
              state: "approval_and_test_number_required",
              requiresApproval: true,
              requiresExplicitLiveFlag: true,
              requiresTestNumber: true,
              message:
                "Voice execution is configured but gated. A separate execution route must verify approval, live=true, and TWILIO_TEST_TO_NUMBER before placing a call.",
            }
          : {
              state: "configuration_missing",
              requiresApproval: true,
              requiresExplicitLiveFlag: true,
              requiresTestNumber: true,
              message: "Voice execution is unavailable until Twilio configuration is complete.",
            },
    },
  };
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
        coalesce(trading_name, legal_name) as company_name,
        external_id as company_external_id,
        base_currency::text as base_currency
      from companies
      where external_id = :companyExternalId
      limit 1
    `,
    { companyExternalId },
  );

  return requireRow(scope, `company ${companyExternalId}`);
}

function resolveCompanyExternalId(options: RepositoryOptions): string {
  return options.companyExternalId ?? options.env?.DEMO_COMPANY_ID ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID;
}

function resolveCaseId(options: RepositoryOptions): string {
  return options.caseId ?? options.env?.DEMO_CASE_ID ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
}

async function insertAuditLog(
  dataApi: AuroraDataApiClient,
  input: {
    tenantId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    afterData?: unknown;
    idempotencyKey: string;
  },
): Promise<void> {
  await dataApi.executeMutation(
    `
      insert into audit_log (
        tenant_id,
        actor_type,
        action,
        target_type,
        target_id,
        after_data,
        idempotency_key
      )
      values (
        :tenantId,
        'user',
        :action,
        :targetType,
        :targetId,
        :afterData,
        :idempotencyKey
      )
      on conflict (tenant_id, idempotency_key) do nothing
    `,
    {
      tenantId: input.tenantId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      afterData: jsonParam(input.afterData ?? null),
      idempotencyKey: input.idempotencyKey,
    },
  );
}

function draftReturningSql(): string {
  return `
    cd.id,
    cd.action_id,
    a.external_id as action_external_id,
    cd.customer_id,
    c.external_id as customer_external_id,
    c.name as customer_name,
    cd.contact_id,
    ct.email as contact_email,
    cd.channel,
    cd.provider,
    cd.subject,
    cd.body,
    cd.state,
    cd.generated_by_agent_run_id,
    cd.idempotency_key,
    cd.created_at::text as created_at,
    cd.updated_at::text as updated_at
  `;
}

function fallbackWhy(row: ActionRow): string {
  if (row.invoice_number && row.invoice_amount_due_cents !== null) {
    return `${row.customer_name ?? "Customer"} has ${formatMoney(
      row.invoice_amount_due_cents,
      row.currency_code,
    )} outstanding on invoice ${row.invoice_number}.`;
  }

  return `This action is expected to improve cash by ${formatMoney(
    row.expected_cash_impact_cents,
    row.currency_code,
  )}.`;
}

function scriptToBody(script: { opener: string; talkingPoints: string[]; close: string }): string {
  return [script.opener, "", ...script.talkingPoints.map((point) => `- ${point}`), "", script.close].join("\n");
}

function jsonParam(value: unknown): DataApiParam {
  return { value: JSON.stringify(value), typeHint: "JSON" };
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatIdentifier(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) {
    throw new Error(`Unable to find ${label}.`);
  }

  return row;
}
