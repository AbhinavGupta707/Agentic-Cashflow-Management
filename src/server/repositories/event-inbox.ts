import { createAuroraDataApiClient, type AuroraDataApiClient, type DataApiParam } from "../aws/rds-data-api";
import { scopedIdempotencyKey, stableHash } from "../ingestion/idempotency";

export type EventInboxEvent = {
  id: string;
  tenant_id: string;
  source: string;
  event_type: string;
  payload: unknown;
  idempotency_key: string;
  state: "queued" | "processing" | "processed" | "failed" | "dead_letter";
  attempts: number;
};

export type EnqueueEventInput = {
  tenantId: string;
  source: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
};

export type TenantReference = {
  tenantId?: string;
  tenantSlug?: string;
};

export type CompanyReference = {
  tenantId: string;
  companyId?: string;
  companyExternalId?: string;
};

type IdRow = {
  id: string;
};

type EventRow = Omit<EventInboxEvent, "payload"> & {
  payload: unknown;
};

export function jsonParam(value: unknown): DataApiParam {
  return { value: JSON.stringify(value), typeHint: "JSON" };
}

export function decimalParam(value: string | number): DataApiParam {
  return { value: String(value), typeHint: "DECIMAL" };
}

export async function enqueueEventInboxEvent(
  input: EnqueueEventInput,
  dataApi: AuroraDataApiClient = createAuroraDataApiClient(),
): Promise<EventInboxEvent> {
  const idempotencyKey =
    input.idempotencyKey ?? scopedIdempotencyKey([input.source, input.eventType, stableHash(input.payload)]);

  const [event] = await dataApi.execute<EventRow>(
    `
      insert into event_inbox (
        tenant_id,
        source,
        event_type,
        payload,
        idempotency_key,
        state
      )
      values (
        :tenantId,
        :source,
        :eventType,
        :payload,
        :idempotencyKey,
        'queued'
      )
      on conflict (tenant_id, idempotency_key) do update set
        payload = excluded.payload,
        available_at = least(event_inbox.available_at, now()),
        updated_at = now()
      returning id, tenant_id, source, event_type, payload, idempotency_key, state, attempts
    `,
    {
      tenantId: input.tenantId,
      source: input.source,
      eventType: input.eventType,
      payload: jsonParam(input.payload),
      idempotencyKey,
    },
  );

  return normalizeEventRow(requireRow(event, "event inbox enqueue"));
}

export async function claimEventInboxEvents(
  options: {
    limit: number;
    workerId: string;
    eventId?: string;
  },
  dataApi: AuroraDataApiClient = createAuroraDataApiClient(),
): Promise<EventInboxEvent[]> {
  const rows = await dataApi.execute<EventRow>(
    `
      with candidate as (
        select id
        from event_inbox
        where available_at <= now()
          and (
            state in ('queued', 'failed')
            or (state = 'processing' and locked_at < now() - interval '10 minutes')
          )
          and (:eventId::uuid is null or id = :eventId)
        order by created_at asc
        for update skip locked
        limit :limit
      )
      update event_inbox event
      set
        state = 'processing',
        attempts = event.attempts + 1,
        locked_at = now(),
        locked_by = :workerId,
        error_message = null,
        updated_at = now()
      from candidate
      where event.id = candidate.id
      returning event.id, event.tenant_id, event.source, event.event_type, event.payload,
        event.idempotency_key, event.state, event.attempts
    `,
    {
      limit: options.limit,
      workerId: options.workerId,
      eventId: options.eventId ?? null,
    },
  );

  return rows.map(normalizeEventRow);
}

export async function markEventInboxProcessed(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  eventId: string,
): Promise<void> {
  await dataApi.executeMutation(
    `
      update event_inbox
      set
        state = 'processed',
        locked_at = null,
        locked_by = null,
        processed_at = now(),
        error_message = null,
        updated_at = now()
      where id = :eventId
    `,
    { eventId },
    { transactionId },
  );
}

export async function markEventInboxFailed(
  dataApi: AuroraDataApiClient,
  event: EventInboxEvent,
  message: string,
  maxAttempts: number,
): Promise<void> {
  const nextState = event.attempts >= maxAttempts ? "dead_letter" : "failed";

  await dataApi.executeMutation(
    `
      update event_inbox
      set
        state = :state,
        locked_at = null,
        locked_by = null,
        error_message = :message,
        available_at = now() + interval '1 minute' * least(attempts, 10),
        updated_at = now()
      where id = :eventId
    `,
    {
      eventId: event.id,
      state: nextState,
      message: message.slice(0, 2_000),
    },
  );
}

export async function resolveTenantId(
  dataApi: AuroraDataApiClient,
  reference: TenantReference,
  transactionId?: string,
): Promise<string> {
  if (reference.tenantId) {
    return reference.tenantId;
  }

  if (!reference.tenantSlug) {
    throw new Error("tenantId or tenantSlug is required.");
  }

  const [tenant] = await dataApi.execute<IdRow>(
    "select id from tenants where slug = :tenantSlug limit 1",
    { tenantSlug: reference.tenantSlug },
    { transactionId },
  );

  return requireRow(tenant, `tenant ${reference.tenantSlug}`).id;
}

export async function resolveCompanyId(
  dataApi: AuroraDataApiClient,
  reference: CompanyReference,
  transactionId?: string,
): Promise<string> {
  if (reference.companyId) {
    return reference.companyId;
  }

  if (!reference.companyExternalId) {
    throw new Error("companyId or companyExternalId is required for ingestion.");
  }

  const [company] = await dataApi.execute<IdRow>(
    `
      select id
      from companies
      where tenant_id = :tenantId
        and external_id = :companyExternalId
      limit 1
    `,
    {
      tenantId: reference.tenantId,
      companyExternalId: reference.companyExternalId,
    },
    { transactionId },
  );

  return requireRow(company, `company ${reference.companyExternalId}`).id;
}

function normalizeEventRow(row: EventRow): EventInboxEvent {
  return {
    ...row,
    payload: parsePayload(row.payload),
  };
}

function parsePayload(payload: unknown): unknown {
  if (typeof payload !== "string") {
    return payload;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) {
    throw new Error(`Missing ${label}.`);
  }

  return row;
}
