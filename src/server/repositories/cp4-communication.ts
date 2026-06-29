import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient, type DataApiParam } from "../aws/rds-data-api";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";
import type {
  Cp4ApprovalDecisionResult,
  Cp4ApprovalRecord,
  Cp4ApprovalState,
  Cp4CommunicationDraft,
  Cp4CommunicationMessage,
  Cp4CommunicationState,
  Cp4CreateDraftResult,
  Cp4DraftState,
  Cp4ProviderExecution,
  Cp4ProviderExecutionState,
  Cp4SendResult,
} from "../db/cp4-communication-contract";
import { scopedIdempotencyKey, stableHash } from "../ingestion/idempotency";
import {
  createDefaultGmailProviderAdapter,
  getEffectiveGmailStatus,
  type GmailProviderAdapter,
  unavailableGmailSendResult,
} from "../communication/gmail-runtime";

type RepositoryOptions = {
  dataApi?: AuroraDataApiClient;
  companyExternalId?: string;
  caseId?: string;
};

type RuntimeOptions = RepositoryOptions & {
  gmailAdapter?: GmailProviderAdapter | null;
  gmailFetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
};

type CompanyScopeRow = {
  company_id: string;
  tenant_id: string;
};

type ActionContextRow = {
  action_id: string;
  action_external_id: string | null;
  action_idempotency_key: string;
  action_type: string;
  title: string;
  rationale: string | null;
  action_state: string;
  expected_cash_impact_cents: number;
  currency_code: string;
  company_id: string;
  company_name: string;
  company_external_id: string | null;
  customer_id: string | null;
  customer_external_id: string | null;
  customer_name: string | null;
  contact_id: string | null;
  contact_email: string | null;
  contact_name: string | null;
  invoice_id: string | null;
  invoice_external_id: string | null;
  invoice_number: string | null;
  outstanding_cents: number | null;
  approval_id: string | null;
  approval_state: Cp4ApprovalState | null;
  approval_requested_at: string | null;
  approval_decided_at: string | null;
  approval_expires_at: string | null;
  approval_decision_note: string | null;
  agent_run_id: string | null;
  agent_output_text: string | null;
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
  channel: "email";
  provider: "gmail";
  subject: string | null;
  body: string;
  state: Cp4DraftState;
  generated_by_agent_run_id: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

type ApprovalRow = {
  id: string;
  action_id: string;
  action_external_id: string | null;
  state: Cp4ApprovalState;
  decision_note: string | null;
  requested_at: string;
  decided_at: string | null;
  expires_at: string | null;
};

type MessageRow = {
  id: string;
  draft_id: string | null;
  action_id: string | null;
  action_external_id: string | null;
  customer_id: string | null;
  customer_external_id: string | null;
  contact_id: string | null;
  channel: "email";
  direction: "outbound" | "inbound";
  provider: "gmail";
  provider_message_id: string | null;
  subject: string | null;
  state: string;
  sent_at: string | null;
  received_at: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

type ProviderExecutionRow = {
  id: string;
  action_id: string | null;
  draft_id: string | null;
  message_id: string | null;
  provider: "gmail";
  operation: string;
  state: Cp4ProviderExecutionState;
  provider_execution_id: string | null;
  attempts: number;
  last_error: string | null;
  attempted_at: string | null;
  completed_at: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

export class Cp4ApprovalGateError extends Error {
  readonly code: string;
  readonly result: Cp4SendResult;

  constructor(code: string, message: string, result: Cp4SendResult) {
    super(message);
    this.name = "Cp4ApprovalGateError";
    this.code = code;
    this.result = result;
  }
}

export async function getCp4CommunicationState(
  options: RuntimeOptions = {},
): Promise<Cp4CommunicationState> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const gmailAdapter = resolveGmailAdapter(scope, options, dataApi);
  const provider = await getEffectiveGmailStatus(options.env, gmailAdapter);

  const [drafts, approvals, messages, providerExecutions] = await Promise.all([
    listDrafts(dataApi, scope.company_id, options.caseId),
    listApprovals(dataApi, scope.company_id, options.caseId),
    listMessages(dataApi, scope.company_id, options.caseId),
    listProviderExecutions(dataApi, scope.tenant_id, scope.company_id, options.caseId),
  ]);

  return {
    companyExternalId: options.companyExternalId ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID,
    caseId: options.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID,
    generatedAt: new Date().toISOString(),
    provider,
    drafts,
    approvals,
    messages,
    providerExecutions,
  };
}

export async function createInternalCommunicationDraft(
  input: {
    actionId?: string | null;
    actionExternalId?: string | null;
    idempotencyKey?: string | null;
  },
  options: RuntimeOptions = {},
): Promise<Cp4CreateDraftResult> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const gmailAdapter = resolveGmailAdapter(scope, options, dataApi);
  const action = await findActionContext(dataApi, scope, options.caseId, input);
  const draftContent = draftContentFromAction(action);
  const idempotencyKey =
    input.idempotencyKey ??
    scopedIdempotencyKey(["cp4", "draft", action.action_idempotency_key, draftContent.sourceHash]);

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
          'email',
          'gmail',
          :subject,
          :body,
          :state,
          :agentRunId,
          :idempotencyKey,
          :metadata
        )
        on conflict (tenant_id, idempotency_key) do update set
          action_id = excluded.action_id,
          customer_id = excluded.customer_id,
          contact_id = excluded.contact_id,
          provider = excluded.provider,
          subject = excluded.subject,
          body = excluded.body,
          state = case
            when communication_drafts.state in ('sent', 'archived') then communication_drafts.state
            else excluded.state
          end,
          generated_by_agent_run_id = excluded.generated_by_agent_run_id,
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
      actionId: action.action_id,
      customerId: action.customer_id,
      contactId: action.contact_id,
      subject: draftContent.subject,
      body: draftContent.body,
      state: action.approval_state === "approved" ? "approved" : "needs_approval",
      agentRunId: action.agent_run_id,
      idempotencyKey,
      metadata: jsonParam({
        caseId: options.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID,
        source: draftContent.source,
        sourceHash: draftContent.sourceHash,
        actionExternalId: action.action_external_id,
        customerExternalId: action.customer_external_id,
        invoiceExternalId: action.invoice_external_id,
        runtime: "cp4-approval-communication",
      }),
    },
  );

  await insertAuditLog(dataApi, {
    tenantId: scope.tenant_id,
    action: "cp4.communication_draft.upserted",
    targetType: "communication_draft",
    targetId: requireRow(draft, "create communication draft").id,
    afterData: {
      actionId: action.action_id,
      state: draft.state,
      provider: "gmail",
    },
    idempotencyKey: scopedIdempotencyKey(["audit", "draft", idempotencyKey]),
  });

  return {
    draft: normalizeDraft(draft),
    approval: action.approval_id ? normalizeApproval(actionToApprovalRow(action)) : null,
    provider: await getEffectiveGmailStatus(options.env, gmailAdapter),
  };
}

export async function decideApproval(
  input: {
    actionId?: string | null;
    actionExternalId?: string | null;
    decision: "approved" | "rejected";
    decisionNote?: string | null;
    decidedByUserId?: string | null;
    idempotencyKey?: string | null;
  },
  options: RepositoryOptions = {},
): Promise<Cp4ApprovalDecisionResult> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const action = await findActionContext(dataApi, scope, options.caseId, input);

  if (!action.approval_id) {
    throw new Error("No approval record is available for this action. Create or seed an approval request first.");
  }

  const transactionId = await dataApi.beginTransaction();
  const decisionState = input.decision;
  const draftState: Cp4DraftState = decisionState === "approved" ? "approved" : "rejected";

  try {
    const [approval] = await dataApi.execute<ApprovalRow>(
      `
        with updated as (
          update approval_records ar
          set
            state = :decisionState,
            decided_by_user_id = :decidedByUserId,
            decision_note = :decisionNote,
            decided_at = now(),
            updated_at = now()
          where ar.tenant_id = :tenantId
            and ar.id = :approvalId
          returning *
        )
        select ${approvalReturningSql()}
        from updated ar
        left join actions a on a.id = ar.action_id and a.tenant_id = ar.tenant_id
      `,
      {
        tenantId: scope.tenant_id,
        approvalId: action.approval_id,
        decisionState,
        decidedByUserId: input.decidedByUserId ?? null,
        decisionNote: input.decisionNote ?? null,
      },
      { transactionId },
    );

    await dataApi.executeMutation(
      `
        update actions
        set state = :actionState, updated_at = now()
        where tenant_id = :tenantId and id = :actionId
      `,
      {
        tenantId: scope.tenant_id,
        actionId: action.action_id,
        actionState: decisionState === "approved" ? "approved" : "rejected",
      },
      { transactionId },
    );

    const draftRows = await dataApi.execute<DraftRow>(
      `
        with updated as (
          update communication_drafts
          set state = :draftState, updated_at = now()
          where tenant_id = :tenantId
            and action_id = :actionId
            and channel = 'email'
            and provider = 'gmail'
            and state <> 'sent'
          returning *
        )
        select ${draftReturningSql()}
        from updated cd
        left join actions a on a.id = cd.action_id and a.tenant_id = cd.tenant_id
        left join customers c on c.id = cd.customer_id and c.tenant_id = cd.tenant_id
        left join contacts ct on ct.id = cd.contact_id and ct.tenant_id = cd.tenant_id
      `,
      {
        tenantId: scope.tenant_id,
        actionId: action.action_id,
        draftState,
      },
      { transactionId },
    );

    await insertAuditLog(
      dataApi,
      {
        tenantId: scope.tenant_id,
        actorUserId: input.decidedByUserId ?? null,
        actorType: input.decidedByUserId ? "user" : "system",
        action: `cp4.approval.${decisionState}`,
        targetType: "approval_record",
        targetId: action.approval_id,
        beforeData: {
          state: action.approval_state,
        },
        afterData: {
          state: decisionState,
          actionId: action.action_id,
        },
        idempotencyKey:
          input.idempotencyKey ??
          scopedIdempotencyKey(["audit", "approval", action.approval_id, decisionState]),
      },
      transactionId,
    );

    await dataApi.commitTransaction(transactionId);

    return {
      approval: normalizeApproval(requireRow(approval, "decide approval")),
      drafts: draftRows.map(normalizeDraft),
    };
  } catch (error) {
    await dataApi.rollbackTransaction(transactionId);
    throw error;
  }
}

export async function sendApprovedCommunicationDraft(
  input: {
    draftId?: string | null;
    actionId?: string | null;
    actionExternalId?: string | null;
    idempotencyKey?: string | null;
  },
  options: RuntimeOptions = {},
): Promise<Cp4SendResult> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const gmailAdapter = resolveGmailAdapter(scope, options, dataApi);
  const draft = await findDraftForSend(dataApi, scope, options.caseId, input);

  if (!draft) {
    const provider = await getEffectiveGmailStatus(options.env, gmailAdapter);
    return {
      state: "draft_unavailable",
      message: "No email draft is available for this CP4 send request.",
      draft: null,
      approval: null,
      communicationMessage: null,
      providerExecution: null,
      provider,
    };
  }

  const approval = await getApprovalForAction(dataApi, scope.tenant_id, draft.actionId);
  const provider = await getEffectiveGmailStatus(options.env, gmailAdapter);
  const approvalBlock = approvalGateBlock(approval);

  if (approvalBlock) {
    await insertAuditLog(dataApi, {
      tenantId: scope.tenant_id,
      action: "cp4.send.blocked",
      targetType: "communication_draft",
      targetId: draft.id,
      afterData: {
        reason: approvalBlock.code,
        approvalState: approval?.state ?? "missing",
      },
      idempotencyKey: scopedIdempotencyKey(["audit", "send-blocked", draft.id, approvalBlock.code]),
    });

    const result: Cp4SendResult = {
      state: "approval_required",
      message: approvalBlock.message,
      draft,
      approval,
      communicationMessage: null,
      providerExecution: null,
      provider,
    };

    throw new Cp4ApprovalGateError(approvalBlock.code, approvalBlock.message, result);
  }

  if (!draft.contactEmail) {
    const providerExecution = await upsertProviderExecution(dataApi, {
      tenantId: scope.tenant_id,
      actionId: draft.actionId,
      draftId: draft.id,
      messageId: null,
      operation: "send_email",
      state: "failed",
      providerExecutionId: null,
      attempts: 1,
      lastError: "Draft has no contact email; Gmail send was not attempted.",
      requestPayload: {
        draftId: draft.id,
        actionId: draft.actionId,
        contentHash: stableHash({ subject: draft.subject, body: draft.body }),
      },
      responsePayload: {
        reason: "missing-recipient",
      },
      idempotencyKey: input.idempotencyKey ?? scopedIdempotencyKey(["cp4", "send", draft.id]),
    });

    return {
      state: "provider_failed",
      message: "Draft has no contact email; Gmail send was not attempted.",
      draft,
      approval,
      communicationMessage: null,
      providerExecution,
      provider,
    };
  }

  const sendIdempotencyKey = input.idempotencyKey ?? scopedIdempotencyKey(["cp4", "send", draft.id]);
  const providerResult =
    provider.status === "available"
      ? await gmailAdapter.sendEmail({
          tenantId: scope.tenant_id,
          draftId: draft.id,
          actionId: requireValue(draft.actionId, "Draft is not linked to an action."),
          contactId: draft.contactId,
          toEmail: draft.contactEmail,
          subject: draft.subject ?? "",
          body: draft.body,
          idempotencyKey: sendIdempotencyKey,
        })
      : unavailableGmailSendResult(provider);

  if (providerResult.state !== "succeeded") {
    const providerExecution = await upsertProviderExecution(dataApi, {
      tenantId: scope.tenant_id,
      actionId: draft.actionId,
      draftId: draft.id,
      messageId: null,
      operation: "send_email",
      state: "failed",
      providerExecutionId: providerResult.providerExecutionId ?? null,
      attempts: 1,
      lastError: providerResult.message,
      requestPayload: sanitizedSendRequestPayload(draft),
      responsePayload: {
        state: providerResult.state,
        reason: providerResult.reason,
        metadata: sanitizeProviderMetadata(providerResult.metadata),
      },
      idempotencyKey: sendIdempotencyKey,
    });

    await insertAuditLog(dataApi, {
      tenantId: scope.tenant_id,
      action: "cp4.send.provider_failed",
      targetType: "communication_draft",
      targetId: draft.id,
      afterData: {
        providerExecutionId: providerExecution.id,
        providerReason: providerResult.reason,
      },
      idempotencyKey: scopedIdempotencyKey(["audit", "send-failed", sendIdempotencyKey]),
    });

    return {
      state: providerResult.state === "unavailable" ? "provider_unavailable" : "provider_failed",
      message: providerResult.message,
      draft,
      approval,
      communicationMessage: null,
      providerExecution,
      provider,
    };
  }

  const transactionId = await dataApi.beginTransaction();

  try {
    const [message] = await dataApi.execute<MessageRow>(
      `
        with upserted as (
          insert into communication_messages (
            tenant_id,
            draft_id,
            action_id,
            customer_id,
            contact_id,
            channel,
            direction,
            provider,
            provider_message_id,
            subject,
            body,
            state,
            sent_at,
            idempotency_key,
            metadata
          )
          values (
            :tenantId,
            :draftId,
            :actionId,
            :customerId,
            :contactId,
            'email',
            'outbound',
            'gmail',
            :providerMessageId,
            :subject,
            :body,
            'sent',
            now(),
            :idempotencyKey,
            :metadata
          )
          on conflict (tenant_id, idempotency_key) do update set
            provider_message_id = excluded.provider_message_id,
            state = 'sent',
            sent_at = coalesce(communication_messages.sent_at, now()),
            metadata = communication_messages.metadata || excluded.metadata,
            updated_at = now()
          returning *
        )
        select ${messageReturningSql()}
        from upserted cm
        left join actions a on a.id = cm.action_id and a.tenant_id = cm.tenant_id
        left join customers c on c.id = cm.customer_id and c.tenant_id = cm.tenant_id
      `,
      {
        tenantId: scope.tenant_id,
        draftId: draft.id,
        actionId: draft.actionId,
        customerId: draft.customerId,
        contactId: draft.contactId,
        providerMessageId: providerResult.providerMessageId,
        subject: draft.subject,
        body: draft.body,
        idempotencyKey: sendIdempotencyKey,
        metadata: jsonParam({
          provider: "gmail",
          sourceDraftId: draft.id,
          providerMetadata: sanitizeProviderMetadata(providerResult.metadata),
        }),
      },
      { transactionId },
    );

    const normalizedMessage = normalizeMessage(requireRow(message, "insert communication message"));
    const providerExecution = await upsertProviderExecution(
      dataApi,
      {
        tenantId: scope.tenant_id,
        actionId: draft.actionId,
        draftId: draft.id,
        messageId: normalizedMessage.id,
        operation: "send_email",
        state: "succeeded",
        providerExecutionId: providerResult.providerExecutionId ?? providerResult.providerMessageId,
        attempts: 1,
        lastError: null,
        requestPayload: sanitizedSendRequestPayload(draft),
        responsePayload: {
          providerMessageId: providerResult.providerMessageId,
          metadata: sanitizeProviderMetadata(providerResult.metadata),
        },
        idempotencyKey: sendIdempotencyKey,
      },
      transactionId,
    );

    const [updatedDraft] = await dataApi.execute<DraftRow>(
      `
        with updated as (
          update communication_drafts
          set state = 'sent', updated_at = now()
          where tenant_id = :tenantId and id = :draftId
          returning *
        )
        select ${draftReturningSql()}
        from updated cd
        left join actions a on a.id = cd.action_id and a.tenant_id = cd.tenant_id
        left join customers c on c.id = cd.customer_id and c.tenant_id = cd.tenant_id
        left join contacts ct on ct.id = cd.contact_id and ct.tenant_id = cd.tenant_id
      `,
      {
        tenantId: scope.tenant_id,
        draftId: draft.id,
      },
      { transactionId },
    );

    await dataApi.executeMutation(
      `
        update actions
        set state = 'completed', updated_at = now()
        where tenant_id = :tenantId and id = :actionId
      `,
      {
        tenantId: scope.tenant_id,
        actionId: draft.actionId,
      },
      { transactionId },
    );

    await insertAuditLog(
      dataApi,
      {
        tenantId: scope.tenant_id,
        action: "cp4.send.succeeded",
        targetType: "communication_message",
        targetId: normalizedMessage.id,
        afterData: {
          draftId: draft.id,
          actionId: draft.actionId,
          provider: "gmail",
          providerMessageId: providerResult.providerMessageId,
        },
        idempotencyKey: scopedIdempotencyKey(["audit", "send-succeeded", sendIdempotencyKey]),
      },
      transactionId,
    );

    await dataApi.commitTransaction(transactionId);

    return {
      state: "sent",
      message: "Approved email was sent through the Gmail provider adapter.",
      draft: normalizeDraft(requireRow(updatedDraft, "update sent draft")),
      approval,
      communicationMessage: normalizedMessage,
      providerExecution,
      provider,
    };
  } catch (error) {
    await dataApi.rollbackTransaction(transactionId);
    throw error;
  }
}

function resolveGmailAdapter(
  scope: CompanyScopeRow,
  options: RuntimeOptions,
  dataApi: AuroraDataApiClient,
): GmailProviderAdapter {
  return (
    options.gmailAdapter ??
    createDefaultGmailProviderAdapter({
      tenantId: scope.tenant_id,
      env: options.env,
      dataApi,
      fetchImpl: options.gmailFetch,
    })
  );
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

  return requireRow(scope, `company ${companyExternalId}`);
}

async function findActionContext(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
  caseIdInput: string | undefined,
  input: { actionId?: string | null; actionExternalId?: string | null },
): Promise<ActionContextRow> {
  const caseId = caseIdInput ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const rows = await dataApi.execute<ActionContextRow>(
    `
      select
        a.id as action_id,
        a.external_id as action_external_id,
        a.idempotency_key as action_idempotency_key,
        a.action_type,
        a.title,
        a.rationale,
        a.state as action_state,
        round(a.expected_cash_impact * 100)::bigint as expected_cash_impact_cents,
        a.currency_code::text as currency_code,
        co.id as company_id,
        coalesce(co.trading_name, co.legal_name) as company_name,
        co.external_id as company_external_id,
        c.id as customer_id,
        c.external_id as customer_external_id,
        c.name as customer_name,
        ct.id as contact_id,
        ct.email as contact_email,
        ct.full_name as contact_name,
        i.id as invoice_id,
        i.external_id as invoice_external_id,
        i.invoice_number,
        round((i.amount - i.amount_paid) * 100)::bigint as outstanding_cents,
        approval.id as approval_id,
        approval.state as approval_state,
        approval.requested_at::text as approval_requested_at,
        approval.decided_at::text as approval_decided_at,
        approval.expires_at::text as approval_expires_at,
        approval.decision_note as approval_decision_note,
        agent.id as agent_run_id,
        agent.output_payload::text as agent_output_text
      from actions a
      join companies co on co.id = a.company_id and co.tenant_id = a.tenant_id
      left join customers c on c.id = a.customer_id and c.tenant_id = a.tenant_id
      left join lateral (
        select id, email, full_name
        from contacts
        where tenant_id = a.tenant_id
          and customer_id = a.customer_id
          and email is not null
        order by is_primary desc, created_at asc
        limit 1
      ) ct on true
      left join invoices i on i.id = a.invoice_id and i.tenant_id = a.tenant_id
      left join lateral (
        select id, state, requested_at, decided_at, expires_at, decision_note
        from approval_records
        where tenant_id = a.tenant_id
          and action_id = a.id
        order by requested_at desc
        limit 1
      ) approval on true
      left join lateral (
        select id, output_payload
        from agent_runs
        where tenant_id = a.tenant_id
          and company_id = a.company_id
          and output_payload->'draft' is not null
          and coalesce(output_payload->'draft'->>'actionExternalId', '') = coalesce(a.external_id, a.idempotency_key)
        order by coalesce(completed_at, updated_at, created_at) desc
        limit 1
      ) agent on true
      where a.tenant_id = :tenantId
        and a.company_id = :companyId
        and (
          (cast(:actionId as uuid) is not null and a.id = cast(:actionId as uuid))
          or (:actionExternalId <> '' and a.external_id = :actionExternalId)
          or (cast(:actionId as uuid) is null and :actionExternalId = '' and coalesce(a.metadata->>'case_id', a.metadata->>'caseId', :caseId) = :caseId)
        )
      order by
        case when a.state in ('needs_approval', 'approved') then 0 else 1 end,
        a.created_at asc
      limit 1
    `,
    {
      tenantId: scope.tenant_id,
      companyId: scope.company_id,
      caseId,
      actionId: { value: input.actionId ?? null, typeHint: "UUID" },
      actionExternalId: input.actionExternalId ?? "",
    },
  );

  return requireRow(rows[0], "CP4 action context");
}

async function findDraftForSend(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
  caseId: string | undefined,
  input: { draftId?: string | null; actionId?: string | null; actionExternalId?: string | null },
): Promise<Cp4CommunicationDraft | null> {
  if (input.draftId) {
    const rows = await dataApi.execute<DraftRow>(
      `
        select ${draftReturningSql()}
        from communication_drafts cd
        left join actions a on a.id = cd.action_id and a.tenant_id = cd.tenant_id
        left join customers c on c.id = cd.customer_id and c.tenant_id = cd.tenant_id
        left join contacts ct on ct.id = cd.contact_id and ct.tenant_id = cd.tenant_id
        where cd.tenant_id = :tenantId
          and cd.id = :draftId
          and cd.channel = 'email'
          and cd.provider = 'gmail'
        limit 1
      `,
      { tenantId: scope.tenant_id, draftId: input.draftId },
    );

    return rows[0] ? normalizeDraft(rows[0]) : null;
  }

  const action = await findActionContext(dataApi, scope, caseId, input);
  const rows = await dataApi.execute<DraftRow>(
    `
      select ${draftReturningSql()}
      from communication_drafts cd
      left join actions a on a.id = cd.action_id and a.tenant_id = cd.tenant_id
      left join customers c on c.id = cd.customer_id and c.tenant_id = cd.tenant_id
      left join contacts ct on ct.id = cd.contact_id and ct.tenant_id = cd.tenant_id
      where cd.tenant_id = :tenantId
        and cd.action_id = :actionId
        and cd.channel = 'email'
        and cd.provider = 'gmail'
      order by cd.updated_at desc
      limit 1
    `,
    { tenantId: scope.tenant_id, actionId: action.action_id },
  );

  return rows[0] ? normalizeDraft(rows[0]) : null;
}

async function getApprovalForAction(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  actionId: string | null,
): Promise<Cp4ApprovalRecord | null> {
  if (!actionId) {
    return null;
  }

  const rows = await dataApi.execute<ApprovalRow>(
    `
      select ${approvalReturningSql()}
      from approval_records ar
      left join actions a on a.id = ar.action_id and a.tenant_id = ar.tenant_id
      where ar.tenant_id = :tenantId
        and ar.action_id = :actionId
      order by ar.requested_at desc
      limit 1
    `,
    { tenantId, actionId },
  );

  return rows[0] ? normalizeApproval(rows[0]) : null;
}

function draftContentFromAction(action: ActionContextRow): {
  source: "agent_run" | "deterministic_action_context";
  sourceHash: string;
  subject: string;
  body: string;
} {
  const agentDraft = parseAgentDraft(action.agent_output_text, action.action_external_id ?? action.action_idempotency_key);

  if (agentDraft) {
    return {
      source: "agent_run",
      sourceHash: stableHash(agentDraft),
      subject: agentDraft.subject,
      body: agentDraft.body,
    };
  }

  const customerName = action.customer_name ?? "your team";
  const amount = formatMoney(action.outstanding_cents ?? action.expected_cash_impact_cents, action.currency_code);
  const invoiceLine = action.invoice_number ? ` for invoice ${action.invoice_number}` : "";
  const rationale = action.rationale ? `\n\nContext: ${action.rationale}` : "";
  const body = [
    `Hello ${action.contact_name ?? customerName},`,
    "",
    `I am checking in${invoiceLine}. Our current cashflow plan is looking for ${amount} of recovery, and this message will only be sent after explicit approval.`,
    rationale.trim(),
    "",
    `Thanks,\n${action.company_name}`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  return {
    source: "deterministic_action_context",
    sourceHash: stableHash({ actionId: action.action_id, body }),
    subject: `Payment follow-up${action.invoice_number ? `: ${action.invoice_number}` : ""}`,
    body,
  };
}

function parseAgentDraft(rawJson: string | null, actionExternalId: string): { subject: string; body: string } | null {
  if (!rawJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawJson) as { draft?: { actionExternalId?: unknown; subject?: unknown; body?: unknown } };
    const draft = parsed.draft;

    if (
      draft &&
      typeof draft.subject === "string" &&
      typeof draft.body === "string" &&
      (typeof draft.actionExternalId !== "string" || draft.actionExternalId === actionExternalId)
    ) {
      return {
        subject: draft.subject,
        body: draft.body,
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function listDrafts(
  dataApi: AuroraDataApiClient,
  companyId: string,
  caseIdInput: string | undefined,
): Promise<Cp4CommunicationDraft[]> {
  const caseId = caseIdInput ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const rows = await dataApi.execute<DraftRow>(
    `
      select ${draftReturningSql()}
      from communication_drafts cd
      left join actions a on a.id = cd.action_id and a.tenant_id = cd.tenant_id
      left join customers c on c.id = cd.customer_id and c.tenant_id = cd.tenant_id
      left join contacts ct on ct.id = cd.contact_id and ct.tenant_id = cd.tenant_id
      where a.company_id = :companyId
        and cd.channel = 'email'
        and cd.provider = 'gmail'
        and coalesce(a.metadata->>'case_id', a.metadata->>'caseId', :caseId) = :caseId
      order by cd.updated_at desc
      limit 20
    `,
    { companyId, caseId },
  );

  return rows.map(normalizeDraft);
}

async function listApprovals(
  dataApi: AuroraDataApiClient,
  companyId: string,
  caseIdInput: string | undefined,
): Promise<Cp4ApprovalRecord[]> {
  const caseId = caseIdInput ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const rows = await dataApi.execute<ApprovalRow>(
    `
      select ${approvalReturningSql()}
      from approval_records ar
      join actions a on a.id = ar.action_id and a.tenant_id = ar.tenant_id
      where a.company_id = :companyId
        and coalesce(a.metadata->>'case_id', a.metadata->>'caseId', :caseId) = :caseId
      order by ar.requested_at desc
      limit 20
    `,
    { companyId, caseId },
  );

  return rows.map(normalizeApproval);
}

async function listMessages(
  dataApi: AuroraDataApiClient,
  companyId: string,
  caseIdInput: string | undefined,
): Promise<Cp4CommunicationMessage[]> {
  const caseId = caseIdInput ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const rows = await dataApi.execute<MessageRow>(
    `
      select ${messageReturningSql()}
      from communication_messages cm
      left join actions a on a.id = cm.action_id and a.tenant_id = cm.tenant_id
      left join customers c on c.id = cm.customer_id and c.tenant_id = cm.tenant_id
      where a.company_id = :companyId
        and cm.channel = 'email'
        and cm.provider = 'gmail'
        and coalesce(a.metadata->>'case_id', a.metadata->>'caseId', :caseId) = :caseId
      order by cm.updated_at desc
      limit 20
    `,
    { companyId, caseId },
  );

  return rows.map(normalizeMessage);
}

async function listProviderExecutions(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  companyId: string,
  caseIdInput: string | undefined,
): Promise<Cp4ProviderExecution[]> {
  const caseId = caseIdInput ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const rows = await dataApi.execute<ProviderExecutionRow>(
    `
      select ${providerExecutionReturningSql()}
      from provider_executions pe
      left join actions a on a.id = pe.action_id and a.tenant_id = pe.tenant_id
      where pe.tenant_id = :tenantId
        and pe.provider = 'gmail'
        and a.company_id = :companyId
        and coalesce(a.metadata->>'case_id', a.metadata->>'caseId', :caseId) = :caseId
      order by pe.updated_at desc
      limit 20
    `,
    { tenantId, companyId, caseId },
  );

  return rows.map(normalizeProviderExecution);
}

async function upsertProviderExecution(
  dataApi: AuroraDataApiClient,
  input: {
    tenantId: string;
    actionId: string | null;
    draftId: string | null;
    messageId: string | null;
    operation: string;
    state: Cp4ProviderExecutionState;
    providerExecutionId: string | null;
    attempts: number;
    lastError: string | null;
    requestPayload: unknown;
    responsePayload: unknown;
    idempotencyKey: string;
  },
  transactionId?: string,
): Promise<Cp4ProviderExecution> {
  const [row] = await dataApi.execute<ProviderExecutionRow>(
    `
      with upserted as (
        insert into provider_executions (
          tenant_id,
          action_id,
          draft_id,
          message_id,
          provider,
          operation,
          state,
          request_payload,
          response_payload,
          provider_execution_id,
          attempts,
          last_error,
          idempotency_key,
          attempted_at,
          completed_at
        )
        values (
          :tenantId,
          :actionId,
          :draftId,
          :messageId,
          'gmail',
          :operation,
          :state,
          :requestPayload,
          :responsePayload,
          :providerExecutionId,
          :attempts,
          :lastError,
          :idempotencyKey,
          now(),
          now()
        )
        on conflict (tenant_id, idempotency_key) do update set
          action_id = excluded.action_id,
          draft_id = excluded.draft_id,
          message_id = excluded.message_id,
          operation = excluded.operation,
          state = excluded.state,
          request_payload = excluded.request_payload,
          response_payload = excluded.response_payload,
          provider_execution_id = excluded.provider_execution_id,
          attempts = provider_executions.attempts + excluded.attempts,
          last_error = excluded.last_error,
          attempted_at = excluded.attempted_at,
          completed_at = excluded.completed_at,
          updated_at = now()
        returning *
      )
      select ${providerExecutionReturningSql()}
      from upserted pe
    `,
    {
      tenantId: input.tenantId,
      actionId: input.actionId,
      draftId: input.draftId,
      messageId: input.messageId,
      operation: input.operation,
      state: input.state,
      requestPayload: jsonParam(input.requestPayload),
      responsePayload: jsonParam(input.responsePayload),
      providerExecutionId: input.providerExecutionId,
      attempts: input.attempts,
      lastError: input.lastError,
      idempotencyKey: input.idempotencyKey,
    },
    { transactionId },
  );

  return normalizeProviderExecution(requireRow(row, "upsert provider execution"));
}

async function insertAuditLog(
  dataApi: AuroraDataApiClient,
  input: {
    tenantId: string;
    actorUserId?: string | null;
    actorType?: "user" | "agent" | "system" | "provider";
    action: string;
    targetType: string;
    targetId?: string | null;
    beforeData?: unknown;
    afterData?: unknown;
    idempotencyKey: string;
  },
  transactionId?: string,
): Promise<void> {
  await dataApi.executeMutation(
    `
      insert into audit_log (
        tenant_id,
        actor_user_id,
        actor_type,
        action,
        target_type,
        target_id,
        before_data,
        after_data,
        idempotency_key
      )
      values (
        :tenantId,
        :actorUserId,
        :actorType,
        :action,
        :targetType,
        :targetId,
        :beforeData,
        :afterData,
        :idempotencyKey
      )
      on conflict (tenant_id, idempotency_key) do nothing
    `,
    {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType ?? "system",
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      beforeData: jsonParam(input.beforeData ?? null),
      afterData: jsonParam(input.afterData ?? null),
      idempotencyKey: input.idempotencyKey,
    },
    { transactionId },
  );
}

function approvalGateBlock(approval: Cp4ApprovalRecord | null): { code: string; message: string } | null {
  if (!approval) {
    return {
      code: "approval_missing",
      message: "Explicit approval is required before CP4 can attempt Gmail send.",
    };
  }

  if (approval.state !== "approved") {
    return {
      code: `approval_${approval.state}`,
      message: `CP4 cannot send because the approval state is ${approval.state}.`,
    };
  }

  if (approval.expiresAt && new Date(approval.expiresAt).getTime() <= Date.now()) {
    return {
      code: "approval_expired",
      message: "CP4 cannot send because the approval record has expired.",
    };
  }

  return null;
}

function actionToApprovalRow(action: ActionContextRow): ApprovalRow {
  return {
    id: requireValue(action.approval_id, "Approval id is missing."),
    action_id: action.action_id,
    action_external_id: action.action_external_id,
    state: action.approval_state ?? "missing",
    decision_note: action.approval_decision_note,
    requested_at: action.approval_requested_at ?? "",
    decided_at: action.approval_decided_at,
    expires_at: action.approval_expires_at,
  };
}

function sanitizedSendRequestPayload(draft: Cp4CommunicationDraft): Record<string, unknown> {
  return {
    draftId: draft.id,
    actionId: draft.actionId,
    contactId: draft.contactId,
    channel: "email",
    provider: "gmail",
    contentHash: stableHash({ subject: draft.subject, body: draft.body }),
    hasRecipient: Boolean(draft.contactEmail),
  };
}

function sanitizeProviderMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (/token|secret|authorization|raw|body|payload|email/i.test(key)) {
      continue;
    }

    safe[key] = value;
  }

  return safe;
}

function draftReturningSql() {
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

function approvalReturningSql() {
  return `
    ar.id,
    ar.action_id,
    a.external_id as action_external_id,
    ar.state,
    ar.decision_note,
    ar.requested_at::text as requested_at,
    ar.decided_at::text as decided_at,
    ar.expires_at::text as expires_at
  `;
}

function messageReturningSql() {
  return `
    cm.id,
    cm.draft_id,
    cm.action_id,
    a.external_id as action_external_id,
    cm.customer_id,
    c.external_id as customer_external_id,
    cm.contact_id,
    cm.channel,
    cm.direction,
    cm.provider,
    cm.provider_message_id,
    cm.subject,
    cm.state,
    cm.sent_at::text as sent_at,
    cm.received_at::text as received_at,
    cm.idempotency_key,
    cm.created_at::text as created_at,
    cm.updated_at::text as updated_at
  `;
}

function providerExecutionReturningSql() {
  return `
    pe.id,
    pe.action_id,
    pe.draft_id,
    pe.message_id,
    pe.provider,
    pe.operation,
    pe.state,
    pe.provider_execution_id,
    pe.attempts,
    pe.last_error,
    pe.attempted_at::text as attempted_at,
    pe.completed_at::text as completed_at,
    pe.idempotency_key,
    pe.created_at::text as created_at,
    pe.updated_at::text as updated_at
  `;
}

function normalizeDraft(row: DraftRow): Cp4CommunicationDraft {
  return {
    id: row.id,
    actionId: row.action_id,
    actionExternalId: row.action_external_id,
    customerId: row.customer_id,
    customerExternalId: row.customer_external_id,
    customerName: row.customer_name,
    contactId: row.contact_id,
    contactEmail: row.contact_email,
    channel: "email",
    provider: "gmail",
    subject: row.subject,
    body: row.body,
    state: row.state,
    generatedByAgentRunId: row.generated_by_agent_run_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeApproval(row: ApprovalRow): Cp4ApprovalRecord {
  return {
    id: row.id,
    actionId: row.action_id,
    actionExternalId: row.action_external_id,
    state: row.state,
    decisionNote: row.decision_note,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    expiresAt: row.expires_at,
  };
}

function normalizeMessage(row: MessageRow): Cp4CommunicationMessage {
  return {
    id: row.id,
    draftId: row.draft_id,
    actionId: row.action_id,
    actionExternalId: row.action_external_id,
    customerId: row.customer_id,
    customerExternalId: row.customer_external_id,
    contactId: row.contact_id,
    channel: "email",
    direction: row.direction,
    provider: "gmail",
    providerMessageId: row.provider_message_id,
    subject: row.subject,
    state: row.state,
    sentAt: row.sent_at,
    receivedAt: row.received_at,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeProviderExecution(row: ProviderExecutionRow): Cp4ProviderExecution {
  return {
    id: row.id,
    actionId: row.action_id,
    draftId: row.draft_id,
    messageId: row.message_id,
    provider: "gmail",
    operation: row.operation,
    state: row.state,
    providerExecutionId: row.provider_execution_id,
    attempts: row.attempts,
    lastError: row.last_error,
    attemptedAt: row.attempted_at,
    completedAt: row.completed_at,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) {
    throw new Error(`Unable to find ${label}.`);
  }

  return row;
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }

  return value;
}
