import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../aws/rds-data-api";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";
import { scopedIdempotencyKey, stableHash } from "../ingestion/idempotency";
import { createTwilioProvider, isValidE164PhoneNumber, type TwilioProvider } from "../providers/twilio";
import {
  type VoiceApprovalState,
  type VoiceCallInitiationResult,
  type VoiceCallPreview,
  type VoiceCallRecord,
  type VoiceProviderExecution,
  type VoiceProviderExecutionState,
  type VoiceTranscriptTurn,
  type VoiceWebhookIngestionResult,
} from "./contracts";

type RepositoryOptions = {
  dataApi?: AuroraDataApiClient;
  companyExternalId?: string;
  caseId?: string;
  env?: NodeJS.ProcessEnv;
  twilioProvider?: TwilioProvider;
};

export type InitiateVoiceCallInput = {
  actionId?: string | null;
  actionExternalId?: string | null;
  targetPhoneE164?: string | null;
  approved?: boolean;
  live?: boolean;
  idempotencyKey?: string | null;
};

export type TwilioWebhookInput = {
  providerCallId?: string | null;
  callStatus?: string | null;
  callDurationSeconds?: number | null;
  summary?: string | null;
  transcript?: Array<{
    speaker?: string | null;
    utterance?: string | null;
    startsAtSeconds?: number | null;
    endsAtSeconds?: number | null;
    confidence?: number | null;
  }>;
  rawPayload?: Record<string, unknown>;
};

type CompanyScopeRow = {
  company_id: string;
  tenant_id: string;
};

type VoiceActionContextRow = {
  action_id: string;
  action_external_id: string | null;
  action_idempotency_key: string;
  action_type: string;
  title: string;
  rationale: string | null;
  action_state: string;
  currency_code: string;
  expected_cash_impact_cents: number;
  company_name: string;
  customer_id: string | null;
  customer_external_id: string | null;
  customer_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone_e164: string | null;
  invoice_number: string | null;
  outstanding_cents: number | null;
  approval_id: string | null;
  approval_state: VoiceApprovalState | null;
  approval_requested_at: string | null;
  approval_decided_at: string | null;
  approval_expires_at: string | null;
  draft_body: string | null;
};

type VoiceProviderExecutionRow = {
  id: string;
  action_id: string | null;
  provider: "twilio";
  operation: string;
  state: VoiceProviderExecutionState;
  provider_execution_id: string | null;
  attempts: number;
  last_error: string | null;
  attempted_at: string | null;
  completed_at: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

type VoiceCallRow = {
  id: string;
  action_id: string | null;
  customer_id: string | null;
  contact_id: string | null;
  provider_execution_id: string | null;
  provider: "twilio" | "elevenlabs";
  provider_call_id: string | null;
  phone_e164: string;
  direction: "outbound" | "inbound";
  state: VoiceCallRecord["state"];
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

type TranscriptRow = {
  id: string;
  voice_call_id: string;
  sequence_number: number;
  speaker: VoiceTranscriptTurn["speaker"];
  utterance: string;
  starts_at_seconds: number | null;
  ends_at_seconds: number | null;
  confidence: number | null;
  created_at: string;
};

export class VoiceApprovalGateError extends Error {
  readonly code: string;
  readonly result: VoiceCallInitiationResult;

  constructor(code: string, message: string, result: VoiceCallInitiationResult) {
    super(message);
    this.name = "VoiceApprovalGateError";
    this.code = code;
    this.result = result;
  }
}

export async function previewVoiceCall(
  input: { actionId?: string | null; actionExternalId?: string | null },
  options: RepositoryOptions = {},
): Promise<VoiceCallPreview> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const action = await findVoiceActionContext(dataApi, scope, options.caseId, input);

  return previewFromAction(action);
}

export async function initiateApprovalGatedVoiceCall(
  input: InitiateVoiceCallInput,
  options: RepositoryOptions = {},
): Promise<VoiceCallInitiationResult> {
  const env = options.env ?? process.env;
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);
  const action = await findVoiceActionContext(dataApi, scope, options.caseId, input);
  const provider = options.twilioProvider ?? createTwilioProvider({ env });
  const providerStatus = provider.getStatus();
  const preview = previewFromAction(action);
  const approvalBlock = approvalGateBlock(action);

  if (approvalBlock) {
    const result: VoiceCallInitiationResult = {
      state: "approval_required",
      message: approvalBlock.message,
      preview,
      provider: providerStatus,
      providerExecution: null,
      voiceCall: null,
    };

    throw new VoiceApprovalGateError(approvalBlock.code, approvalBlock.message, result);
  }

  if (input.approved !== true) {
    return {
      state: "preview_only",
      message: "The action is approved in Aurora, but this request did not include approved=true; no call was placed.",
      preview,
      provider: providerStatus,
      providerExecution: null,
      voiceCall: null,
    };
  }

  const targetPhone = input.targetPhoneE164 ?? action.contact_phone_e164;
  if (!isValidE164PhoneNumber(targetPhone)) {
    const providerExecution = await upsertProviderExecution(dataApi, {
      tenantId: scope.tenant_id,
      actionId: action.action_id,
      operation: "voice.call.create",
      state: "failed",
      providerExecutionId: null,
      attempts: 1,
      lastError: "No valid E.164 target phone number is available; Twilio was not called.",
      requestPayload: requestPayload(action, targetPhone, false),
      responsePayload: { reason: "missing-phone" },
      idempotencyKey: input.idempotencyKey ?? scopedIdempotencyKey(["cp5", "call", action.action_id, "missing-phone"]),
    });

    return {
      state: "missing_phone",
      message: "No valid E.164 target phone number is available; Twilio was not called.",
      preview,
      provider: providerStatus,
      providerExecution,
      voiceCall: null,
    };
  }

  if (input.live !== true) {
    return {
      state: "preview_only",
      message: "Live call execution requires live=true and a target matching TWILIO_TEST_TO_NUMBER; no call was placed.",
      preview: { ...preview, phoneE164: targetPhone },
      provider: providerStatus,
      providerExecution: null,
      voiceCall: null,
    };
  }

  if (env.TWILIO_TEST_TO_NUMBER !== targetPhone) {
    const providerExecution = await upsertProviderExecution(dataApi, {
      tenantId: scope.tenant_id,
      actionId: action.action_id,
      operation: "voice.call.create",
      state: "failed",
      providerExecutionId: null,
      attempts: 1,
      lastError: "Target phone does not match TWILIO_TEST_TO_NUMBER; Twilio was not called.",
      requestPayload: requestPayload(action, targetPhone, true),
      responsePayload: { reason: "target-not-allowed" },
      idempotencyKey: input.idempotencyKey ?? scopedIdempotencyKey(["cp5", "call", action.action_id, "target-not-allowed"]),
    });

    return {
      state: "target_not_allowed",
      message: "Target phone does not match TWILIO_TEST_TO_NUMBER; Twilio was not called.",
      preview: { ...preview, phoneE164: targetPhone },
      provider: providerStatus,
      providerExecution,
      voiceCall: null,
    };
  }

  if (providerStatus.status !== "available") {
    const providerExecution = await upsertProviderExecution(dataApi, {
      tenantId: scope.tenant_id,
      actionId: action.action_id,
      operation: "voice.call.create",
      state: "failed",
      providerExecutionId: null,
      attempts: 1,
      lastError: providerStatus.message,
      requestPayload: requestPayload(action, targetPhone, true),
      responsePayload: { reason: providerStatus.reason, missingEnv: providerStatus.missingEnv },
      idempotencyKey: input.idempotencyKey ?? scopedIdempotencyKey(["cp5", "call", action.action_id, "provider-unavailable"]),
    });

    return {
      state: "provider_unavailable",
      message: providerStatus.message,
      preview: { ...preview, phoneE164: targetPhone },
      provider: providerStatus,
      providerExecution,
      voiceCall: null,
    };
  }

  const idempotencyKey = input.idempotencyKey ?? scopedIdempotencyKey(["cp5", "call", action.action_id, targetPhone]);
  const providerResult = await provider.createCall({
    to: targetPhone,
    idempotencyKey,
  });

  if (providerResult.state !== "succeeded") {
    const providerExecution = await upsertProviderExecution(dataApi, {
      tenantId: scope.tenant_id,
      actionId: action.action_id,
      operation: "voice.call.create",
      state: "failed",
      providerExecutionId: null,
      attempts: 1,
      lastError: providerResult.errorMessage ?? "Twilio call create failed.",
      requestPayload: requestPayload(action, targetPhone, true),
      responsePayload: { state: providerResult.state },
      idempotencyKey,
    });

    return {
      state: "provider_failed",
      message: providerResult.errorMessage ?? "Twilio call create failed.",
      preview: { ...preview, phoneE164: targetPhone },
      provider: providerStatus,
      providerExecution,
      voiceCall: null,
    };
  }

  const transactionId = await dataApi.beginTransaction();

  try {
    const providerExecution = await upsertProviderExecution(
      dataApi,
      {
        tenantId: scope.tenant_id,
        actionId: action.action_id,
        operation: "voice.call.create",
        state: "succeeded",
        providerExecutionId: providerResult.providerCallId ?? null,
        attempts: 1,
        lastError: null,
        requestPayload: requestPayload(action, targetPhone, true),
        responsePayload: {
          providerCallId: providerResult.providerCallId,
          callStatus: providerResult.callStatus,
        },
        idempotencyKey,
      },
      transactionId,
    );

    const voiceCall = await upsertVoiceCall(
      dataApi,
      {
        tenantId: scope.tenant_id,
        actionId: action.action_id,
        customerId: action.customer_id,
        contactId: action.contact_id,
        providerExecutionId: providerExecution.id,
        providerCallId: providerResult.providerCallId ?? null,
        phoneE164: targetPhone,
        state: twilioStatusToVoiceState(providerResult.callStatus),
        summary: null,
        durationSeconds: null,
        idempotencyKey,
        metadata: {
          actionExternalId: action.action_external_id,
          customerExternalId: action.customer_external_id,
          approvalId: action.approval_id,
        },
      },
      transactionId,
    );

    await dataApi.commitTransaction(transactionId);

    return {
      state: "queued",
      message: "Approved test call was created through Twilio and persisted with the real provider Call SID.",
      preview: { ...preview, phoneE164: targetPhone },
      provider: providerStatus,
      providerExecution,
      voiceCall,
    };
  } catch (error) {
    await dataApi.rollbackTransaction(transactionId);
    throw error;
  }
}

export async function ingestTwilioWebhook(
  input: TwilioWebhookInput,
  options: RepositoryOptions = {},
): Promise<VoiceWebhookIngestionResult> {
  const dataApi = await resolveDataApi(options);
  const scope = await resolveCompanyScope(dataApi, options);

  if (!input.providerCallId) {
    return {
      state: "ignored",
      message: "Twilio webhook did not include a CallSid/providerCallId; no records were changed.",
      voiceCall: null,
      transcripts: [],
      memoryFactsPrepared: 0,
    };
  }

  const existing = await findVoiceCallByProviderCallId(dataApi, scope.tenant_id, input.providerCallId);
  if (!existing) {
    return {
      state: "ignored",
      message: "No existing voice_call row matches this Twilio CallSid; CP5 does not create calls from untrusted webhooks.",
      voiceCall: null,
      transcripts: [],
      memoryFactsPrepared: 0,
    };
  }

  const transactionId = await dataApi.beginTransaction();

  try {
    const [updatedRow] = await dataApi.execute<VoiceCallRow>(
      `
        update voice_calls
        set
          state = :state,
          ended_at = case when :ended::boolean then coalesce(ended_at, now()) else ended_at end,
          duration_seconds = coalesce(:durationSeconds, duration_seconds),
          summary = coalesce(:summary, summary),
          metadata = metadata || :metadata,
          updated_at = now()
        where tenant_id = :tenantId
          and provider = 'twilio'
          and provider_call_id = :providerCallId
        returning *
      `,
      {
        tenantId: scope.tenant_id,
        providerCallId: input.providerCallId,
        state: twilioStatusToVoiceState(input.callStatus),
        ended: ["completed", "busy", "failed", "no-answer", "canceled"].includes(input.callStatus ?? ""),
        durationSeconds: input.callDurationSeconds ?? null,
        summary: input.summary ?? null,
        metadata: jsonParam({
          lastWebhookStatus: input.callStatus ?? null,
          lastWebhookPayloadHash: stableHash(input.rawPayload ?? {}),
        }),
      },
      { transactionId },
    );

    const updated = normalizeVoiceCall(requireRow(updatedRow, "update voice call from Twilio webhook"));
    const transcripts = await insertTranscriptTurns(dataApi, scope.tenant_id, updated.id, input.transcript ?? [], transactionId);
    await dataApi.commitTransaction(transactionId);

    return {
      state: "accepted",
      message: "Twilio webhook state was applied to the existing voice call record.",
      voiceCall: updated,
      transcripts,
      memoryFactsPrepared: transcripts.length > 0 ? 1 : 0,
    };
  } catch (error) {
    await dataApi.rollbackTransaction(transactionId);
    throw error;
  }
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

async function findVoiceActionContext(
  dataApi: AuroraDataApiClient,
  scope: CompanyScopeRow,
  caseIdInput: string | undefined,
  input: { actionId?: string | null; actionExternalId?: string | null },
): Promise<VoiceActionContextRow> {
  const caseId = caseIdInput ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const rows = await dataApi.execute<VoiceActionContextRow>(
    `
      select
        a.id as action_id,
        a.external_id as action_external_id,
        a.idempotency_key as action_idempotency_key,
        a.action_type,
        a.title,
        a.rationale,
        a.state as action_state,
        a.currency_code::text as currency_code,
        round(a.expected_cash_impact * 100)::bigint as expected_cash_impact_cents,
        coalesce(co.trading_name, co.legal_name) as company_name,
        c.id as customer_id,
        c.external_id as customer_external_id,
        c.name as customer_name,
        ct.id as contact_id,
        ct.full_name as contact_name,
        ct.phone_e164 as contact_phone_e164,
        i.invoice_number,
        round(i.amount_due * 100)::bigint as outstanding_cents,
        approval.id as approval_id,
        coalesce(approval.state, 'missing') as approval_state,
        approval.requested_at::text as approval_requested_at,
        approval.decided_at::text as approval_decided_at,
        approval.expires_at::text as approval_expires_at,
        draft.body as draft_body
      from actions a
      join companies co on co.id = a.company_id and co.tenant_id = a.tenant_id
      left join customers c on c.id = a.customer_id and c.tenant_id = a.tenant_id
      left join lateral (
        select id, full_name, phone_e164
        from contacts
        where tenant_id = a.tenant_id
          and customer_id = a.customer_id
          and phone_e164 is not null
        order by is_primary desc, created_at asc
        limit 1
      ) ct on true
      left join invoices i on i.id = a.invoice_id and i.tenant_id = a.tenant_id
      left join lateral (
        select id, state, requested_at, decided_at, expires_at
        from approval_records
        where tenant_id = a.tenant_id
          and action_id = a.id
        order by requested_at desc
        limit 1
      ) approval on true
      left join lateral (
        select body
        from communication_drafts
        where tenant_id = a.tenant_id
          and action_id = a.id
          and channel = 'voice_script'
        order by updated_at desc
        limit 1
      ) draft on true
      where a.tenant_id = :tenantId
        and a.company_id = :companyId
        and a.action_type = 'call_customer'
        and (
          (cast(:actionId as uuid) is not null and a.id = cast(:actionId as uuid))
          or (:actionExternalId <> '' and a.external_id = :actionExternalId)
          or (cast(:actionId as uuid) is null and :actionExternalId = '' and coalesce(a.metadata->>'case_id', a.metadata->>'caseId', :caseId) = :caseId)
        )
      order by
        case when a.state in ('needs_approval', 'approved') then 0 else 1 end,
        case a.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
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

  return requireRow(rows[0], "voice call action context");
}

function approvalGateBlock(action: VoiceActionContextRow): { code: string; message: string } | null {
  if (action.approval_state !== "approved") {
    return {
      code: "approval-required",
      message: `Voice call execution requires an approved approval_record; current state is ${action.approval_state}.`,
    };
  }

  if (action.approval_expires_at && new Date(action.approval_expires_at).getTime() < Date.now()) {
    return {
      code: "approval-expired",
      message: "Voice call execution is blocked because the approval record is expired.",
    };
  }

  return null;
}

function previewFromAction(action: VoiceActionContextRow): VoiceCallPreview {
  const scriptBody = action.draft_body ?? deterministicScriptBody(action);

  return {
    actionId: action.action_id,
    actionExternalId: action.action_external_id,
    customerId: action.customer_id,
    customerExternalId: action.customer_external_id,
    customerName: action.customer_name,
    contactId: action.contact_id,
    contactName: action.contact_name,
    phoneE164: action.contact_phone_e164,
    approval: {
      id: action.approval_id,
      state: action.approval_state ?? "missing",
      requestedAt: action.approval_requested_at,
      decidedAt: action.approval_decided_at,
      expiresAt: action.approval_expires_at,
    },
    script: {
      source: action.draft_body ? "draft" : "deterministic_fallback",
      opening: `Hi ${action.contact_name ?? action.customer_name ?? "there"}, this is a payment follow-up for ${action.company_name}.`,
      talkingPoints: [
        action.invoice_number
          ? `Confirm the status of invoice ${action.invoice_number}.`
          : "Confirm the current payment status.",
        action.rationale ?? "Explain that the call is part of an approval-gated cashflow recovery plan.",
        "Ask for a concrete payment date or next step.",
      ],
      objectionHandling: [
        "If there is a dispute, capture the reason and supporting owner.",
        "If payment is scheduled, capture the promised date for memory extraction.",
      ],
      close: "Thank them, confirm the agreed next step, and update the cashflow plan.",
      body: scriptBody,
    },
    guardrails: [
      "Do not imply payment action has happened unless the customer confirms it.",
      "Do not place a call unless the approval record is approved.",
      "Use only the explicit test target for live CP5 smoke.",
    ],
  };
}

function deterministicScriptBody(action: VoiceActionContextRow): string {
  const invoiceLine = action.invoice_number ? `invoice ${action.invoice_number}` : "the outstanding balance";
  const amount = action.outstanding_cents ?? action.expected_cash_impact_cents;

  return [
    `Hi ${action.contact_name ?? action.customer_name ?? "there"}, this is a payment follow-up for ${action.company_name}.`,
    `I am calling about ${invoiceLine}, with ${amount} cents included in the cashflow recovery plan.`,
    action.rationale ? `Context: ${action.rationale}` : "This call will capture the customer's next step for the cashflow plan.",
    "Can you confirm the expected payment date or whether anything is blocking payment?",
    "Thanks. I will update the cashflow plan with the confirmed next step.",
  ].join("\n");
}

function requestPayload(action: VoiceActionContextRow, targetPhone: string | null | undefined, live: boolean): Record<string, unknown> {
  return {
    actionId: action.action_id,
    actionExternalId: action.action_external_id,
    customerId: action.customer_id,
    contactId: action.contact_id,
    targetPhoneConfigured: Boolean(targetPhone),
    live,
    scriptHash: stableHash(deterministicScriptBody(action)),
  };
}

async function upsertProviderExecution(
  dataApi: AuroraDataApiClient,
  input: {
    tenantId: string;
    actionId: string | null;
    operation: string;
    state: VoiceProviderExecutionState;
    providerExecutionId: string | null;
    attempts: number;
    lastError: string | null;
    requestPayload: unknown;
    responsePayload: unknown;
    idempotencyKey: string;
  },
  transactionId?: string,
): Promise<VoiceProviderExecution> {
  const [row] = await dataApi.execute<VoiceProviderExecutionRow>(
    `
      with upserted as (
        insert into provider_executions (
          tenant_id,
          action_id,
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
          'twilio',
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
      select *
      from upserted
    `,
    {
      tenantId: input.tenantId,
      actionId: input.actionId,
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

  return normalizeProviderExecution(requireRow(row, "upsert Twilio provider execution"));
}

async function upsertVoiceCall(
  dataApi: AuroraDataApiClient,
  input: {
    tenantId: string;
    actionId: string | null;
    customerId: string | null;
    contactId: string | null;
    providerExecutionId: string;
    providerCallId: string | null;
    phoneE164: string;
    state: VoiceCallRecord["state"];
    summary: string | null;
    durationSeconds: number | null;
    idempotencyKey: string;
    metadata: unknown;
  },
  transactionId?: string,
): Promise<VoiceCallRecord> {
  const [row] = await dataApi.execute<VoiceCallRow>(
    `
      with upserted as (
        insert into voice_calls (
          tenant_id,
          action_id,
          customer_id,
          contact_id,
          provider_execution_id,
          provider,
          provider_call_id,
          phone_e164,
          direction,
          state,
          duration_seconds,
          summary,
          idempotency_key,
          metadata
        )
        values (
          :tenantId,
          :actionId,
          :customerId,
          :contactId,
          :providerExecutionId,
          'twilio',
          :providerCallId,
          :phoneE164,
          'outbound',
          :state,
          :durationSeconds,
          :summary,
          :idempotencyKey,
          :metadata
        )
        on conflict (tenant_id, idempotency_key) do update set
          provider_execution_id = excluded.provider_execution_id,
          provider_call_id = excluded.provider_call_id,
          state = excluded.state,
          metadata = voice_calls.metadata || excluded.metadata,
          updated_at = now()
        returning *
      )
      select *
      from upserted
    `,
    {
      tenantId: input.tenantId,
      actionId: input.actionId,
      customerId: input.customerId,
      contactId: input.contactId,
      providerExecutionId: input.providerExecutionId,
      providerCallId: input.providerCallId,
      phoneE164: input.phoneE164,
      state: input.state,
      durationSeconds: input.durationSeconds,
      summary: input.summary,
      idempotencyKey: input.idempotencyKey,
      metadata: jsonParam(input.metadata),
    },
    { transactionId },
  );

  return normalizeVoiceCall(requireRow(row, "upsert voice call"));
}

async function findVoiceCallByProviderCallId(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  providerCallId: string,
): Promise<VoiceCallRecord | null> {
  const rows = await dataApi.execute<VoiceCallRow>(
    `
      select *
      from voice_calls
      where tenant_id = :tenantId
        and provider = 'twilio'
        and provider_call_id = :providerCallId
      limit 1
    `,
    { tenantId, providerCallId },
  );

  return rows[0] ? normalizeVoiceCall(rows[0]) : null;
}

async function insertTranscriptTurns(
  dataApi: AuroraDataApiClient,
  tenantId: string,
  voiceCallId: string,
  turns: NonNullable<TwilioWebhookInput["transcript"]>,
  transactionId: string,
): Promise<VoiceTranscriptTurn[]> {
  const inserted: VoiceTranscriptTurn[] = [];

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (!turn.utterance?.trim()) {
      continue;
    }

    const [row] = await dataApi.execute<TranscriptRow>(
      `
        insert into voice_transcripts (
          tenant_id,
          voice_call_id,
          sequence_number,
          speaker,
          utterance,
          starts_at_seconds,
          ends_at_seconds,
          confidence,
          metadata
        )
        values (
          :tenantId,
          :voiceCallId,
          :sequenceNumber,
          :speaker,
          :utterance,
          :startsAtSeconds,
          :endsAtSeconds,
          :confidence,
          :metadata
        )
        on conflict (tenant_id, voice_call_id, sequence_number) do update set
          speaker = excluded.speaker,
          utterance = excluded.utterance,
          starts_at_seconds = excluded.starts_at_seconds,
          ends_at_seconds = excluded.ends_at_seconds,
          confidence = excluded.confidence,
          metadata = voice_transcripts.metadata || excluded.metadata
        returning *
      `,
      {
        tenantId,
        voiceCallId,
        sequenceNumber: index + 1,
        speaker: normalizeSpeaker(turn.speaker),
        utterance: turn.utterance.trim(),
        startsAtSeconds: turn.startsAtSeconds ?? null,
        endsAtSeconds: turn.endsAtSeconds ?? null,
        confidence: turn.confidence ?? null,
        metadata: jsonParam({ source: "twilio-webhook" }),
      },
      { transactionId },
    );

    inserted.push(normalizeTranscript(requireRow(row, "insert voice transcript")));
  }

  return inserted;
}

function twilioStatusToVoiceState(status: string | null | undefined): VoiceCallRecord["state"] {
  switch (status) {
    case "ringing":
      return "ringing";
    case "in-progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "no-answer":
    case "busy":
      return "no_answer";
    case "failed":
      return "failed";
    case "canceled":
      return "cancelled";
    default:
      return "queued";
  }
}

function normalizeSpeaker(value: string | null | undefined): VoiceTranscriptTurn["speaker"] {
  if (value === "agent" || value === "customer" || value === "system" || value === "unknown") {
    return value;
  }

  return "unknown";
}

function normalizeProviderExecution(row: VoiceProviderExecutionRow): VoiceProviderExecution {
  return {
    id: row.id,
    actionId: row.action_id,
    provider: row.provider,
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

function normalizeVoiceCall(row: VoiceCallRow): VoiceCallRecord {
  return {
    id: row.id,
    actionId: row.action_id,
    customerId: row.customer_id,
    contactId: row.contact_id,
    providerExecutionId: row.provider_execution_id,
    provider: row.provider,
    providerCallId: row.provider_call_id,
    phoneE164: row.phone_e164,
    direction: row.direction,
    state: row.state,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    summary: row.summary,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeTranscript(row: TranscriptRow): VoiceTranscriptTurn {
  return {
    id: row.id,
    voiceCallId: row.voice_call_id,
    sequenceNumber: row.sequence_number,
    speaker: row.speaker,
    utterance: row.utterance,
    startsAtSeconds: row.starts_at_seconds,
    endsAtSeconds: row.ends_at_seconds,
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

function jsonParam(value: unknown) {
  return {
    value: JSON.stringify(value ?? {}),
    typeHint: "JSON" as const,
  };
}

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) {
    throw new Error(`Missing ${label}.`);
  }

  return row;
}
