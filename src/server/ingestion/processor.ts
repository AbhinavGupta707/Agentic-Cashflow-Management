import { parseCsv } from "./csv";
import { scopedIdempotencyKey, stableHash } from "./idempotency";
import {
  EXPECTED_CSV_HEADERS,
  importKindFromInput,
  normalizeRow,
  type ImportKind,
  type NormalizedRecord,
} from "./normalize";
import { type AuroraDataApiClient, createAuroraDataApiClient } from "../aws/rds-data-api";
import {
  createSourceObjectStorageClient,
  type SourceObjectStorageClient,
} from "../aws/s3-client";
import {
  claimEventInboxEvents,
  decimalParam,
  jsonParam,
  markEventInboxFailed,
  markEventInboxProcessed,
  resolveCompanyId,
  type EventInboxEvent,
} from "../repositories/event-inbox";

const DEFAULT_MAX_ATTEMPTS = 5;

export type ProcessEventInboxOptions = {
  dataApi?: AuroraDataApiClient;
  sourceObjectStorage?: SourceObjectStorageClient;
  limit?: number;
  workerId?: string;
  eventId?: string;
  maxAttempts?: number;
};

export type ProcessEventInboxSummary = {
  claimed: number;
  processed: number;
  failed: number;
  rowsSucceeded: number;
  rowsFailed: number;
  messages: string[];
};

type IngestionPayload = {
  sourceFileId?: string;
  importBatchId?: string;
  sourceKind?: string;
  importKind?: string;
  kind?: string;
  objectKey?: string;
  checksum?: string;
  companyId?: string;
  companyExternalId?: string;
  csvText?: string;
  rows?: Array<Record<string, unknown>>;
  payload?: Record<string, unknown>;
};

type IdRow = {
  id: string;
};

type ImportContext = {
  tenantId: string;
  companyId: string;
  sourceFileId: string | null;
  importBatchId: string;
  importKind: ImportKind;
};

type ApplyResult = {
  targetTable: string;
  targetId: string;
  eventType: string;
};

export async function processEventInbox(
  options: ProcessEventInboxOptions = {},
): Promise<ProcessEventInboxSummary> {
  const dataApi = options.dataApi ?? createAuroraDataApiClient();
  const workerId = options.workerId ?? `event-inbox-${process.pid}`;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const events = await claimEventInboxEvents(
    {
      limit: options.eventId ? 1 : options.limit ?? 10,
      workerId,
      eventId: options.eventId,
    },
    dataApi,
  );
  const summary: ProcessEventInboxSummary = {
    claimed: events.length,
    processed: 0,
    failed: 0,
    rowsSucceeded: 0,
    rowsFailed: 0,
    messages: [],
  };

  for (const event of events) {
    try {
      const payload = requirePayload(event.payload);
      const rows = isPdfPayload(payload) ? [] : await rowsFromPayload(payload, options.sourceObjectStorage);
      const result = await dataApi.transaction((transactionId) =>
        processClaimedEvent(dataApi, transactionId, event, payload, rows),
      );
      summary.processed += 1;
      summary.rowsSucceeded += result.rowsSucceeded;
      summary.rowsFailed += result.rowsFailed;
      summary.messages.push(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown event processor error.";
      await markEventInboxFailed(dataApi, event, message, maxAttempts);
      summary.failed += 1;
      summary.messages.push(`event ${event.id} failed: ${message}`);
    }
  }

  return summary;
}

export function dryRunNormalizeCsv(importKind: ImportKind, csvText: string): {
  expectedHeaders: string[];
  rowsTotal: number;
  rowsSucceeded: number;
  rowsFailed: number;
  errors: string[];
} {
  const parsed = parseCsv(csvText);
  const results = parsed.rows.map((row) => normalizeRow(importKind, row));

  return {
    expectedHeaders: EXPECTED_CSV_HEADERS[importKind],
    rowsTotal: parsed.rows.length,
    rowsSucceeded: results.filter((result) => result.ok).length,
    rowsFailed: results.filter((result) => !result.ok).length,
    errors: results.flatMap((result, index) =>
      result.ok ? [] : result.errors.map((error) => `row ${index + 1}: ${error}`),
    ),
  };
}

async function processClaimedEvent(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  event: EventInboxEvent,
  payload: IngestionPayload,
  rows: Array<Record<string, unknown>>,
): Promise<{ rowsSucceeded: number; rowsFailed: number; message: string }> {
  if (isPdfPayload(payload)) {
    await recordPdfStoredForReview(dataApi, transactionId, event, payload);
    await markEventInboxProcessed(dataApi, transactionId, event.id);
    return {
      rowsSucceeded: 0,
      rowsFailed: 0,
      message: `event ${event.id} recorded PDF provenance for manual review`,
    };
  }

  const importKind = importKindFromInput(String(payload.importKind ?? payload.kind ?? event.event_type));
  const context = await resolveImportContext(dataApi, transactionId, event, payload, importKind);

  await markImportBatchProcessing(dataApi, transactionId, context.importBatchId, rows.length);

  let rowsSucceeded = 0;
  let rowsFailed = 0;

  for (const [index, rawRow] of rows.entries()) {
    const rowNumber = index + 1;
    const normalized = normalizeRow(context.importKind, rawRow);

    if (!normalized.ok) {
      rowsFailed += 1;
      await recordImportBatchRow(dataApi, transactionId, {
        context,
        rowNumber,
        rawPayload: rawRow,
        normalizedPayload: {},
        state: "failed",
        targetTable: null,
        targetId: null,
        errorMessage: normalized.errors.join("; "),
      });
      continue;
    }

    try {
      const applyResult = await applyNormalizedRecord(dataApi, transactionId, event, context, normalized.record);
      rowsSucceeded += 1;

      await recordImportBatchRow(dataApi, transactionId, {
        context,
        rowNumber,
        rawPayload: rawRow,
        normalizedPayload: normalized.record,
        state: "applied",
        targetTable: applyResult.targetTable,
        targetId: applyResult.targetId,
        errorMessage: null,
      });

      await insertLedgerEvent(dataApi, transactionId, {
        event,
        aggregateType: applyResult.targetTable,
        aggregateId: applyResult.targetId,
        eventType: applyResult.eventType,
        payload: {
          importBatchId: context.importBatchId,
          rowNumber,
          normalized: normalized.record,
        },
        idempotencyKey: scopedIdempotencyKey([event.idempotency_key, "row", rowNumber, applyResult.eventType]),
      });
    } catch (error) {
      rowsFailed += 1;
      await recordImportBatchRow(dataApi, transactionId, {
        context,
        rowNumber,
        rawPayload: rawRow,
        normalizedPayload: normalized.record,
        state: "failed",
        targetTable: null,
        targetId: null,
        errorMessage: error instanceof Error ? error.message : "Unknown row apply error.",
      });
    }
  }

  await completeImportBatch(dataApi, transactionId, context.importBatchId, rowsSucceeded, rowsFailed);
  await markEventInboxProcessed(dataApi, transactionId, event.id);

  return {
    rowsSucceeded,
    rowsFailed,
    message: `event ${event.id} processed ${rowsSucceeded} rows with ${rowsFailed} failures`,
  };
}

async function resolveImportContext(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  event: EventInboxEvent,
  payload: IngestionPayload,
  importKind: ImportKind,
): Promise<ImportContext> {
  const tenantId = event.tenant_id;
  const sourceFileId = payload.sourceFileId ?? (await sourceFileIdFromImportBatch(dataApi, transactionId, payload.importBatchId));
  const companyId =
    payload.companyId ??
    (await companyIdFromImportBatch(dataApi, transactionId, payload.importBatchId)) ??
    (await companyIdFromSourceFile(dataApi, transactionId, sourceFileId)) ??
    (payload.companyExternalId
      ? await resolveCompanyId(dataApi, { tenantId, companyExternalId: payload.companyExternalId }, transactionId)
      : null);

  if (!companyId) {
    throw new Error("Unable to resolve company for ingestion event.");
  }

  const importBatchId =
    payload.importBatchId ??
    (await createImportBatch(dataApi, transactionId, {
      tenantId,
      companyId,
      sourceFileId,
      importKind,
      idempotencyKey: scopedIdempotencyKey(["event", event.idempotency_key, "import-batch"]),
    }));

  return {
    tenantId,
    companyId,
    sourceFileId,
    importBatchId,
    importKind,
  };
}

async function applyNormalizedRecord(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  event: EventInboxEvent,
  context: ImportContext,
  record: NormalizedRecord,
): Promise<ApplyResult> {
  switch (record.kind) {
    case "customer":
      return {
        targetTable: "customers",
        targetId: await upsertCustomer(dataApi, transactionId, context, record, event),
        eventType: "customer.upserted",
      };
    case "contact":
      return {
        targetTable: "contacts",
        targetId: await upsertContact(dataApi, transactionId, context, record, event),
        eventType: "contact.upserted",
      };
    case "invoice":
      return {
        targetTable: "invoices",
        targetId: await upsertInvoice(dataApi, transactionId, context, record, event),
        eventType: "invoice.upserted",
      };
    case "obligation":
      return {
        targetTable: "obligations",
        targetId: await upsertObligation(dataApi, transactionId, context, record, event),
        eventType: "obligation.upserted",
      };
    case "payment":
      return {
        targetTable: "payments",
        targetId: await upsertPayment(dataApi, transactionId, context, record, event),
        eventType: "payment.upserted",
      };
  }
}

async function upsertCustomer(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  context: ImportContext,
  record: Extract<NormalizedRecord, { kind: "customer" }>,
  event: EventInboxEvent,
): Promise<string> {
  const [row] = await dataApi.execute<IdRow>(
    `
      insert into customers (
        tenant_id, company_id, external_id, name, legal_name, billing_email,
        payment_terms_days, risk_tier, state, metadata
      )
      values (
        :tenantId, :companyId, :externalId, :name, :legalName, :billingEmail,
        :paymentTermsDays, :riskTier, 'active', :metadata
      )
      on conflict (tenant_id, external_id) do update set
        company_id = excluded.company_id,
        name = excluded.name,
        legal_name = excluded.legal_name,
        billing_email = excluded.billing_email,
        payment_terms_days = excluded.payment_terms_days,
        risk_tier = excluded.risk_tier,
        state = excluded.state,
        metadata = customers.metadata || excluded.metadata,
        updated_at = now()
      returning id
    `,
    {
      tenantId: context.tenantId,
      companyId: context.companyId,
      externalId: record.externalId,
      name: record.name,
      legalName: record.legalName,
      billingEmail: record.billingEmail,
      paymentTermsDays: record.paymentTermsDays,
      riskTier: record.riskTier,
      metadata: jsonParam(metadataFor(event, context, record.metadata)),
    },
    { transactionId },
  );

  return requireId(row, `customer ${record.externalId}`);
}

async function upsertContact(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  context: ImportContext,
  record: Extract<NormalizedRecord, { kind: "contact" }>,
  event: EventInboxEvent,
): Promise<string> {
  const customerId = await resolveCustomerForRecord(dataApi, transactionId, context, {
    customerExternalId: record.customerExternalId,
    customerName: record.customerName,
  });

  if (record.isPrimary) {
    await dataApi.executeMutation(
      "update contacts set is_primary = false where tenant_id = :tenantId and customer_id = :customerId",
      { tenantId: context.tenantId, customerId },
      { transactionId },
    );
  }

  const [row] = await dataApi.execute<IdRow>(
    `
      insert into contacts (
        tenant_id, external_id, customer_id, full_name, role_title, email,
        phone_e164, is_primary, consent_state, state, metadata
      )
      values (
        :tenantId, :externalId, :customerId, :fullName, :roleTitle, :email,
        :phoneE164, :isPrimary, :consentState, 'active', :metadata
      )
      on conflict (tenant_id, external_id) do update set
        customer_id = excluded.customer_id,
        full_name = excluded.full_name,
        role_title = excluded.role_title,
        email = excluded.email,
        phone_e164 = excluded.phone_e164,
        is_primary = excluded.is_primary,
        consent_state = excluded.consent_state,
        state = excluded.state,
        metadata = contacts.metadata || excluded.metadata,
        updated_at = now()
      returning id
    `,
    {
      tenantId: context.tenantId,
      externalId: record.externalId,
      customerId,
      fullName: record.fullName,
      roleTitle: record.roleTitle,
      email: record.email,
      phoneE164: record.phoneE164,
      isPrimary: record.isPrimary,
      consentState: record.consentState,
      metadata: jsonParam(metadataFor(event, context, record.metadata)),
    },
    { transactionId },
  );

  return requireId(row, `contact ${record.externalId}`);
}

async function upsertInvoice(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  context: ImportContext,
  record: Extract<NormalizedRecord, { kind: "invoice" }>,
  event: EventInboxEvent,
): Promise<string> {
  const customerId = await resolveCustomerForRecord(dataApi, transactionId, context, {
    customerExternalId: record.customerExternalId,
    customerName: record.customerName,
  });

  const [row] = await dataApi.execute<IdRow>(
    `
      insert into invoices (
        tenant_id, company_id, customer_id, source_file_id, external_id, invoice_number,
        issue_date, due_date, currency_code, amount_total, amount_paid, state,
        idempotency_key, metadata
      )
      values (
        :tenantId, :companyId, :customerId, :sourceFileId, :externalId, :invoiceNumber,
        :issueDate, :dueDate, :currencyCode, :amountTotal, :amountPaid, :state,
        :idempotencyKey, :metadata
      )
      on conflict (tenant_id, external_id) do update set
        company_id = excluded.company_id,
        customer_id = excluded.customer_id,
        source_file_id = excluded.source_file_id,
        invoice_number = excluded.invoice_number,
        issue_date = excluded.issue_date,
        due_date = excluded.due_date,
        currency_code = excluded.currency_code,
        amount_total = excluded.amount_total,
        amount_paid = excluded.amount_paid,
        state = excluded.state,
        idempotency_key = excluded.idempotency_key,
        metadata = invoices.metadata || excluded.metadata,
        updated_at = now()
      returning id
    `,
    {
      tenantId: context.tenantId,
      companyId: context.companyId,
      customerId,
      sourceFileId: context.sourceFileId,
      externalId: record.externalId,
      invoiceNumber: record.invoiceNumber,
      issueDate: record.issueDate,
      dueDate: record.dueDate,
      currencyCode: record.currencyCode,
      amountTotal: decimalParam(record.amountTotal),
      amountPaid: decimalParam(record.amountPaid),
      state: record.state,
      idempotencyKey: scopedIdempotencyKey(["invoice", record.externalId]),
      metadata: jsonParam(metadataFor(event, context, record.metadata)),
    },
    { transactionId },
  );

  return requireId(row, `invoice ${record.externalId}`);
}

async function upsertObligation(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  context: ImportContext,
  record: Extract<NormalizedRecord, { kind: "obligation" }>,
  event: EventInboxEvent,
): Promise<string> {
  const [row] = await dataApi.execute<IdRow>(
    `
      insert into obligations (
        tenant_id, external_id, company_id, source_file_id, counterparty_name,
        category, obligation_type, due_date, currency_code, amount, state,
        idempotency_key, metadata
      )
      values (
        :tenantId, :externalId, :companyId, :sourceFileId, :counterpartyName,
        :category, :obligationType, :dueDate, :currencyCode, :amount, :state,
        :idempotencyKey, :metadata
      )
      on conflict (tenant_id, idempotency_key) do update set
        external_id = excluded.external_id,
        source_file_id = excluded.source_file_id,
        counterparty_name = excluded.counterparty_name,
        category = excluded.category,
        obligation_type = excluded.obligation_type,
        due_date = excluded.due_date,
        currency_code = excluded.currency_code,
        amount = excluded.amount,
        state = excluded.state,
        metadata = obligations.metadata || excluded.metadata,
        updated_at = now()
      returning id
    `,
    {
      tenantId: context.tenantId,
      externalId: record.externalId,
      companyId: context.companyId,
      sourceFileId: context.sourceFileId,
      counterpartyName: record.counterpartyName,
      category: record.category,
      obligationType: record.obligationType,
      dueDate: record.dueDate,
      currencyCode: record.currencyCode,
      amount: decimalParam(record.amount),
      state: record.state,
      idempotencyKey: scopedIdempotencyKey(["obligation", record.externalId]),
      metadata: jsonParam(metadataFor(event, context, record.metadata)),
    },
    { transactionId },
  );

  return requireId(row, `obligation ${record.externalId}`);
}

async function upsertPayment(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  context: ImportContext,
  record: Extract<NormalizedRecord, { kind: "payment" }>,
  event: EventInboxEvent,
): Promise<string> {
  const customerId = await maybeResolveCustomerForRecord(dataApi, transactionId, context, {
    customerExternalId: record.customerExternalId,
    customerName: record.customerName,
  });
  const invoiceId = await maybeResolveInvoiceForPayment(dataApi, transactionId, context, record);
  const obligationId = await maybeResolveObligationForPayment(dataApi, transactionId, context, record);

  const [row] = await dataApi.execute<IdRow>(
    `
      insert into payments (
        tenant_id, company_id, customer_id, invoice_id, obligation_id, payment_date,
        posted_at, direction, currency_code, amount, provider, external_id, state,
        idempotency_key, metadata
      )
      values (
        :tenantId, :companyId, :customerId, :invoiceId, :obligationId, :paymentDate,
        :postedAt, :direction, :currencyCode, :amount, :provider, :externalId, :state,
        :idempotencyKey, :metadata
      )
      on conflict (tenant_id, idempotency_key) do update set
        customer_id = excluded.customer_id,
        invoice_id = excluded.invoice_id,
        obligation_id = excluded.obligation_id,
        payment_date = excluded.payment_date,
        posted_at = excluded.posted_at,
        direction = excluded.direction,
        currency_code = excluded.currency_code,
        amount = excluded.amount,
        provider = excluded.provider,
        external_id = excluded.external_id,
        state = excluded.state,
        metadata = payments.metadata || excluded.metadata,
        updated_at = now()
      returning id
    `,
    {
      tenantId: context.tenantId,
      companyId: context.companyId,
      customerId,
      invoiceId,
      obligationId,
      paymentDate: record.paymentDate,
      postedAt: record.postedAt,
      direction: record.direction,
      currencyCode: record.currencyCode,
      amount: decimalParam(record.amount),
      provider: record.provider,
      externalId: record.externalId,
      state: record.state,
      idempotencyKey: scopedIdempotencyKey(["payment", record.provider, record.externalId]),
      metadata: jsonParam(metadataFor(event, context, record.metadata)),
    },
    { transactionId },
  );

  if (invoiceId && record.direction === "inflow") {
    await refreshInvoicePaidAmount(dataApi, transactionId, invoiceId);
  }

  return requireId(row, `payment ${record.externalId}`);
}

async function resolveCustomerForRecord(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  context: ImportContext,
  reference: { customerExternalId: string | null; customerName: string | null },
): Promise<string> {
  const customerId = await maybeResolveCustomerForRecord(dataApi, transactionId, context, reference);

  if (!customerId) {
    throw new Error("customer_external_id or customer_name is required.");
  }

  return customerId;
}

async function maybeResolveCustomerForRecord(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  context: ImportContext,
  reference: { customerExternalId: string | null; customerName: string | null },
): Promise<string | null> {
  if (reference.customerExternalId) {
    const [row] = await dataApi.execute<IdRow>(
      `
        select id
        from customers
        where tenant_id = :tenantId
          and external_id = :externalId
        limit 1
      `,
      { tenantId: context.tenantId, externalId: reference.customerExternalId },
      { transactionId },
    );

    if (row) {
      return row.id;
    }
  }

  if (!reference.customerName && !reference.customerExternalId) {
    return null;
  }

  const externalId =
    reference.customerExternalId ??
    `customer:${stableHash(reference.customerName ?? reference.customerExternalId ?? "unknown").slice(0, 16)}`;
  const name = reference.customerName ?? externalId;

  const [row] = await dataApi.execute<IdRow>(
    `
      insert into customers (
        tenant_id, company_id, external_id, name, legal_name, payment_terms_days,
        risk_tier, state, metadata
      )
      values (
        :tenantId, :companyId, :externalId, :name, :name, 30,
        'standard', 'active', :metadata
      )
      on conflict (tenant_id, external_id) do update set
        name = excluded.name,
        legal_name = excluded.legal_name,
        updated_at = now()
      returning id
    `,
    {
      tenantId: context.tenantId,
      companyId: context.companyId,
      externalId,
      name,
      metadata: jsonParam({
        createdBy: "ingestion-processor",
        reason: "referenced-by-import-row",
      }),
    },
    { transactionId },
  );

  return requireId(row, `customer ${externalId}`);
}

async function maybeResolveInvoiceForPayment(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  context: ImportContext,
  record: Extract<NormalizedRecord, { kind: "payment" }>,
): Promise<string | null> {
  if (!record.invoiceExternalId && !record.invoiceNumber) {
    return null;
  }

  const [row] = await dataApi.execute<IdRow>(
    `
      select id
      from invoices
      where tenant_id = :tenantId
        and company_id = :companyId
        and (
          (:invoiceExternalId::text is not null and external_id = :invoiceExternalId)
          or (:invoiceNumber::text is not null and invoice_number = :invoiceNumber)
        )
      order by created_at asc
      limit 1
    `,
    {
      tenantId: context.tenantId,
      companyId: context.companyId,
      invoiceExternalId: record.invoiceExternalId,
      invoiceNumber: record.invoiceNumber,
    },
    { transactionId },
  );

  return row?.id ?? null;
}

async function maybeResolveObligationForPayment(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  context: ImportContext,
  record: Extract<NormalizedRecord, { kind: "payment" }>,
): Promise<string | null> {
  if (!record.obligationExternalId) {
    return null;
  }

  const [row] = await dataApi.execute<IdRow>(
    `
      select id
      from obligations
      where tenant_id = :tenantId
        and company_id = :companyId
        and external_id = :externalId
      limit 1
    `,
    {
      tenantId: context.tenantId,
      companyId: context.companyId,
      externalId: record.obligationExternalId,
    },
    { transactionId },
  );

  return row?.id ?? null;
}

async function refreshInvoicePaidAmount(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  invoiceId: string,
): Promise<void> {
  await dataApi.executeMutation(
    `
      update invoices invoice
      set
        amount_paid = least(
          invoice.amount_total,
          coalesce((
            select sum(payment.amount)
            from payments payment
            where payment.invoice_id = invoice.id
              and payment.direction = 'inflow'
              and payment.state in ('posted', 'reconciled')
          ), 0)
        ),
        state = case
          when least(
            invoice.amount_total,
            coalesce((
              select sum(payment.amount)
              from payments payment
              where payment.invoice_id = invoice.id
                and payment.direction = 'inflow'
                and payment.state in ('posted', 'reconciled')
            ), 0)
          ) >= invoice.amount_total then 'paid'
          when coalesce((
            select sum(payment.amount)
            from payments payment
            where payment.invoice_id = invoice.id
              and payment.direction = 'inflow'
              and payment.state in ('posted', 'reconciled')
          ), 0) > 0 then 'partially_paid'
          else invoice.state
        end,
        updated_at = now()
      where invoice.id = :invoiceId
    `,
    { invoiceId },
    { transactionId },
  );
}

async function createImportBatch(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  input: {
    tenantId: string;
    companyId: string;
    sourceFileId: string | null;
    importKind: ImportKind;
    idempotencyKey: string;
  },
): Promise<string> {
  const [row] = await dataApi.execute<IdRow>(
    `
      insert into import_batches (
        tenant_id, source_file_id, company_id, import_kind, state,
        idempotency_key, rows_total, rows_succeeded, rows_failed, started_at, summary
      )
      values (
        :tenantId, :sourceFileId, :companyId, :importKind, 'processing',
        :idempotencyKey, 0, 0, 0, now(), :summary
      )
      on conflict (tenant_id, idempotency_key) do update set
        source_file_id = excluded.source_file_id,
        company_id = excluded.company_id,
        import_kind = excluded.import_kind,
        state = 'processing',
        started_at = coalesce(import_batches.started_at, now()),
        updated_at = now()
      returning id
    `,
    {
      tenantId: input.tenantId,
      sourceFileId: input.sourceFileId,
      companyId: input.companyId,
      importKind: input.importKind,
      idempotencyKey: input.idempotencyKey,
      summary: jsonParam({ createdBy: "ingestion-processor" }),
    },
    { transactionId },
  );

  return requireId(row, "import batch");
}

async function markImportBatchProcessing(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  importBatchId: string,
  rowsTotal: number,
): Promise<void> {
  await dataApi.executeMutation(
    `
      update import_batches
      set
        state = 'processing',
        rows_total = :rowsTotal,
        rows_succeeded = 0,
        rows_failed = 0,
        error_message = null,
        started_at = coalesce(started_at, now()),
        completed_at = null,
        updated_at = now()
      where id = :importBatchId
    `,
    { importBatchId, rowsTotal },
    { transactionId },
  );
}

async function completeImportBatch(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  importBatchId: string,
  rowsSucceeded: number,
  rowsFailed: number,
): Promise<void> {
  await dataApi.executeMutation(
    `
      update import_batches
      set
        state = case when :rowsFailed = 0 then 'completed' else 'completed_with_errors' end,
        rows_succeeded = :rowsSucceeded,
        rows_failed = :rowsFailed,
        completed_at = now(),
        summary = summary || :summary,
        updated_at = now()
      where id = :importBatchId
    `,
    {
      importBatchId,
      rowsSucceeded,
      rowsFailed,
      summary: jsonParam({ rowsSucceeded, rowsFailed, processedBy: "ingestion-processor" }),
    },
    { transactionId },
  );
}

async function recordImportBatchRow(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  input: {
    context: ImportContext;
    rowNumber: number;
    rawPayload: Record<string, unknown>;
    normalizedPayload: Record<string, unknown>;
    state: "applied" | "failed";
    targetTable: string | null;
    targetId: string | null;
    errorMessage: string | null;
  },
): Promise<void> {
  await dataApi.executeMutation(
    `
      insert into import_batch_rows (
        tenant_id, import_batch_id, row_number, state, raw_payload,
        normalized_payload, target_table, target_id, error_message
      )
      values (
        :tenantId, :importBatchId, :rowNumber, :state, :rawPayload,
        :normalizedPayload, :targetTable, :targetId, :errorMessage
      )
      on conflict (tenant_id, import_batch_id, row_number) do update set
        state = excluded.state,
        raw_payload = excluded.raw_payload,
        normalized_payload = excluded.normalized_payload,
        target_table = excluded.target_table,
        target_id = excluded.target_id,
        error_message = excluded.error_message,
        updated_at = now()
    `,
    {
      tenantId: input.context.tenantId,
      importBatchId: input.context.importBatchId,
      rowNumber: input.rowNumber,
      state: input.state,
      rawPayload: jsonParam(input.rawPayload),
      normalizedPayload: jsonParam(input.normalizedPayload),
      targetTable: input.targetTable,
      targetId: input.targetId,
      errorMessage: input.errorMessage,
    },
    { transactionId },
  );
}

async function insertLedgerEvent(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  input: {
    event: EventInboxEvent;
    aggregateType: string;
    aggregateId: string | null;
    eventType: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  },
): Promise<void> {
  await dataApi.executeMutation(
    `
      insert into event_ledger (
        tenant_id, inbox_event_id, aggregate_type, aggregate_id, event_type,
        payload, causation_id, correlation_id, idempotency_key
      )
      values (
        :tenantId, :inboxEventId, :aggregateType, :aggregateId, :eventType,
        :payload, :causationId, :correlationId, :idempotencyKey
      )
      on conflict (tenant_id, idempotency_key) do nothing
    `,
    {
      tenantId: input.event.tenant_id,
      inboxEventId: input.event.id,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: jsonParam(input.payload),
      causationId: input.event.id,
      correlationId: input.event.id,
      idempotencyKey: input.idempotencyKey,
    },
    { transactionId },
  );
}

async function recordPdfStoredForReview(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  event: EventInboxEvent,
  payload: IngestionPayload,
): Promise<void> {
  await insertLedgerEvent(dataApi, transactionId, {
    event,
    aggregateType: "source_files",
    aggregateId: payload.sourceFileId ?? null,
    eventType: "source_file.stored_for_manual_review",
    payload: {
      sourceKind: payload.sourceKind,
      sourceFileId: payload.sourceFileId,
      objectKey: payload.objectKey,
      checksum: payload.checksum,
      note: "PDF extraction is not implemented in checkpoint 2; file is stored as provenance for manual review.",
    },
    idempotencyKey: scopedIdempotencyKey([event.idempotency_key, "pdf-manual-review"]),
  });

  if (payload.importBatchId) {
    await completeImportBatch(dataApi, transactionId, payload.importBatchId, 0, 0);
  }
}

async function sourceFileIdFromImportBatch(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  importBatchId: string | undefined,
): Promise<string | null> {
  if (!importBatchId) {
    return null;
  }

  const [row] = await dataApi.execute<{ source_file_id: string | null }>(
    "select source_file_id from import_batches where id = :importBatchId limit 1",
    { importBatchId },
    { transactionId },
  );

  return row?.source_file_id ?? null;
}

async function companyIdFromImportBatch(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  importBatchId: string | undefined,
): Promise<string | null> {
  if (!importBatchId) {
    return null;
  }

  const [row] = await dataApi.execute<{ company_id: string | null }>(
    "select company_id from import_batches where id = :importBatchId limit 1",
    { importBatchId },
    { transactionId },
  );

  return row?.company_id ?? null;
}

async function companyIdFromSourceFile(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  sourceFileId: string | null,
): Promise<string | null> {
  if (!sourceFileId) {
    return null;
  }

  const [row] = await dataApi.execute<{ company_id: string | null }>(
    "select company_id from source_files where id = :sourceFileId limit 1",
    { sourceFileId },
    { transactionId },
  );

  return row?.company_id ?? null;
}

async function rowsFromPayload(
  payload: IngestionPayload,
  sourceObjectStorage?: SourceObjectStorageClient,
): Promise<Array<Record<string, unknown>>> {
  if (payload.payload && typeof payload.payload === "object" && !Array.isArray(payload.payload)) {
    return [payload.payload];
  }

  if (Array.isArray(payload.rows)) {
    return payload.rows;
  }

  if (payload.csvText) {
    return parseCsv(payload.csvText).rows;
  }

  if (payload.objectKey && payload.objectKey.trim().length > 0) {
    const storage = sourceObjectStorage ?? createSourceObjectStorageClient();
    const csvText = await storage.getSourceObjectText({ key: payload.objectKey });
    return parseCsv(csvText).rows;
  }

  throw new Error(
    "CSV event payload must include csvText, rows, or an S3 objectKey that can be read by the processor.",
  );
}

function isPdfPayload(payload: IngestionPayload): boolean {
  return payload.sourceKind === "invoice_pdf" || payload.importKind === "pdf";
}

function requirePayload(payload: unknown): IngestionPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Event payload must be a JSON object.");
  }

  return payload as IngestionPayload;
}

function metadataFor(
  event: EventInboxEvent,
  context: ImportContext,
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...metadata,
    ingestion: {
      inboxEventId: event.id,
      importBatchId: context.importBatchId,
      sourceFileId: context.sourceFileId,
      idempotencyKey: event.idempotency_key,
    },
  };
}

function requireId(row: IdRow | undefined, label: string): string {
  if (!row?.id) {
    throw new Error(`Unable to resolve ${label}.`);
  }

  return row.id;
}
