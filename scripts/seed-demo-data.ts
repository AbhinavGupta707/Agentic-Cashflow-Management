import "./load-local-env";

import { createHash } from "node:crypto";

import { getDataApiAvailability } from "../src/server/aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../src/server/aws/rds-data-api";
import { demoCaseData, type DemoAction, type DemoMemoryFact } from "../src/server/demo-data/cashflow-demo";

const SEED_MARKER = "checkpoint-1-demo";
const TENANT_SLUG = "marlow-finch-demo";
const TENANT_NAME = "Marlow & Finch Demo Tenant";
const PRIMARY_CASH_ACCOUNT_NAME = "Primary Operating Account";
const ZERO_VECTOR_1024 = `[${Array.from({ length: 1024 }, () => "0").join(",")}]`;

type IdRow = {
  id: string;
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const availability = getDataApiAvailability();

  if (dryRun) {
    printDryRun(availability.available ? [] : availability.missing);
    return;
  }

  if (!availability.available) {
    console.error("Demo seed cannot run because Aurora Data API env is incomplete.");
    console.error(`Missing environment variables: ${availability.missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const dataApi = createAuroraDataApiClient(availability.config);

  await dataApi.transaction(async (transactionId) => {
    const tenantId = await seedTenant(dataApi, transactionId);
    const companyId = await seedCompany(dataApi, transactionId, tenantId);
    const primaryCashAccountId = await seedPrimaryCashAccount(dataApi, transactionId, tenantId, companyId);
    const sourceFileIds = await seedImportSources(dataApi, transactionId, tenantId, companyId);
    const customerIds = await seedCustomersAndContacts(dataApi, transactionId, tenantId, companyId);
    const invoiceIds = await seedInvoices(
      dataApi,
      transactionId,
      tenantId,
      companyId,
      customerIds,
      sourceFileIds,
    );
    await seedObligations(dataApi, transactionId, tenantId, companyId, sourceFileIds);
    const forecastRunId = await seedForecast(
      dataApi,
      transactionId,
      tenantId,
      companyId,
      primaryCashAccountId,
    );
    await seedActions(
      dataApi,
      transactionId,
      tenantId,
      companyId,
      forecastRunId,
      customerIds,
      invoiceIds,
    );
    await resetSeededApprovalAudits(dataApi, transactionId, tenantId);
    await seedMemoryFacts(dataApi, transactionId, tenantId, companyId, customerIds);
  });

  console.log("Demo cashflow case seeded successfully.");
  console.log(`Company: ${demoCaseData.company.externalId}`);
  console.log(`Case: ${demoCaseData.caseId}`);
}

function printDryRun(missing: string[]) {
  console.log("Demo seed dry run.");
  if (missing.length > 0) {
    console.log(`Live seed would require these environment variables: ${missing.join(", ")}`);
  }
  console.log(`Company: ${demoCaseData.company.name} (${demoCaseData.company.externalId})`);
  console.log(`Customers: ${demoCaseData.customers.length}`);
  console.log(`Contacts: ${demoCaseData.customers.reduce((sum, customer) => sum + customer.contacts.length, 0)}`);
  console.log(`Invoices: ${demoCaseData.invoices.length}`);
  console.log(`Obligations: ${demoCaseData.obligations.length}`);
  console.log(`Forecast points: ${demoCaseData.forecastRun.points.length}`);
  console.log(`Actions: ${demoCaseData.actionPlan.actions.length}`);
  console.log(`Memory facts: ${demoCaseData.memoryFacts.length}`);
}

async function seedTenant(dataApi: AuroraDataApiClient, transactionId: string): Promise<string> {
  const [tenant] = await dataApi.execute<IdRow>(
    `
      insert into tenants (
        slug,
        name,
        metadata
      )
      values (
        :slug,
        :name,
        :metadata
      )
      on conflict (slug) do update set
        name = excluded.name,
        metadata = excluded.metadata,
        updated_at = now()
      returning id
    `,
    {
      slug: TENANT_SLUG,
      name: TENANT_NAME,
      metadata: jsonParam({
        seed: SEED_MARKER,
        demoCompanyExternalId: demoCaseData.company.externalId,
        demoCaseId: demoCaseData.caseId,
      }),
    },
    { transactionId },
  );

  return requireId(tenant, "tenant");
}

async function seedCompany(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  tenantId: string,
): Promise<string> {
  const [company] = await dataApi.execute<IdRow>(
    `
      insert into companies (
        tenant_id,
        external_id,
        legal_name,
        trading_name,
        industry,
        base_currency,
        timezone,
        state,
        metadata
      )
      values (
        :tenantId,
        :externalId,
        :legalName,
        :tradingName,
        :industry,
        :baseCurrency,
        :timezone,
        'active',
        :metadata
      )
      on conflict (tenant_id, external_id) do update set
        legal_name = excluded.legal_name,
        trading_name = excluded.trading_name,
        industry = excluded.industry,
        base_currency = excluded.base_currency,
        timezone = excluded.timezone,
        state = excluded.state,
        metadata = excluded.metadata,
        updated_at = now()
      returning id
    `,
    {
      tenantId,
      externalId: demoCaseData.company.externalId,
      legalName: demoCaseData.company.name,
      tradingName: demoCaseData.company.name,
      industry: demoCaseData.company.industry,
      baseCurrency: demoCaseData.company.baseCurrency,
      timezone: demoCaseData.company.timezone,
      metadata: jsonParam({
        seed: SEED_MARKER,
        externalId: demoCaseData.company.externalId,
        industry: demoCaseData.company.industry,
        caseId: demoCaseData.caseId,
      }),
    },
    { transactionId },
  );

  return requireId(company, "company");
}

async function seedPrimaryCashAccount(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  tenantId: string,
  companyId: string,
): Promise<string> {
  const [cashAccount] = await dataApi.execute<IdRow>(
    `
      insert into cash_accounts (
        tenant_id,
        company_id,
        name,
        institution_name,
        account_type,
        currency_code,
        current_balance,
        metadata
      )
      values (
        :tenantId,
        :companyId,
        :name,
        :institutionName,
        'operating',
        :currencyCode,
        :currentBalance,
        :metadata
      )
      on conflict (tenant_id, company_id, name) do update set
        institution_name = excluded.institution_name,
        account_type = excluded.account_type,
        currency_code = excluded.currency_code,
        current_balance = excluded.current_balance,
        balance_as_of = now(),
        metadata = excluded.metadata,
        updated_at = now()
      returning id
    `,
    {
      tenantId,
      companyId,
      name: PRIMARY_CASH_ACCOUNT_NAME,
      institutionName: "Aurora demo ledger",
      currencyCode: demoCaseData.company.baseCurrency,
      currentBalance: decimalParamFromCents(demoCaseData.company.cashBalanceCents),
      metadata: jsonParam({
        seed: SEED_MARKER,
        externalId: "cash_account_primary_demo",
      }),
    },
    { transactionId },
  );

  return requireId(cashAccount, "cash account");
}

async function seedImportSources(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  tenantId: string,
  companyId: string,
): Promise<Map<string, string>> {
  const sourceFileIds = new Map<string, string>();
  const bucket = process.env.AWS_S3_BUCKET ?? "demo-bucket-unconfigured";

  for (const sourceFile of demoCaseData.sourceFiles) {
    const [row] = await dataApi.execute<IdRow>(
      `
        insert into source_files (
          tenant_id,
          external_id,
          company_id,
          source_kind,
          storage_provider,
          bucket,
          object_key,
          sha256,
          original_filename,
          content_type,
          byte_size,
          upload_state,
          idempotency_key,
          metadata
        )
        values (
          :tenantId,
          :externalId,
          :companyId,
          :sourceKind,
          's3',
          :bucket,
          :objectKey,
          :sha256,
          :originalFilename,
          :contentType,
          :byteSize,
          'ready',
          :idempotencyKey,
          :metadata
        )
        on conflict (tenant_id, idempotency_key) do update set
          source_kind = excluded.source_kind,
          bucket = excluded.bucket,
          object_key = excluded.object_key,
          sha256 = excluded.sha256,
          original_filename = excluded.original_filename,
          content_type = excluded.content_type,
          byte_size = excluded.byte_size,
          upload_state = excluded.upload_state,
          idempotency_key = excluded.idempotency_key,
          metadata = excluded.metadata,
          updated_at = now()
        returning id
      `,
      {
        tenantId,
        externalId: sourceFile.externalId,
        companyId,
        sourceKind: inferSourceKind(sourceFile.originalFilename),
        bucket,
        objectKey: sourceFile.storageKey,
        sha256: createHash("sha256").update(sourceFile.storageKey).digest("hex"),
        originalFilename: sourceFile.originalFilename,
        contentType: sourceFile.contentType,
        byteSize: sourceFile.sizeBytes,
        idempotencyKey: sourceFile.externalId,
        metadata: jsonParam({
          seed: SEED_MARKER,
          externalId: sourceFile.externalId,
          caseId: demoCaseData.caseId,
        }),
      },
      { transactionId },
    );

    sourceFileIds.set(sourceFile.externalId, requireId(row, `source file ${sourceFile.externalId}`));
  }

  await dataApi.executeMutation(
    `
      insert into import_batches (
        tenant_id,
        external_id,
        source_file_id,
        company_id,
        import_kind,
        state,
        idempotency_key,
        rows_total,
        rows_succeeded,
        rows_failed,
        summary,
        started_at,
        completed_at
      )
      values (
        :tenantId,
        :externalId,
        :sourceFileId,
        :companyId,
        'mixed',
        'completed',
        :idempotencyKey,
        :rowsTotal,
        :rowsSucceeded,
        0,
        :summary,
        now(),
        now()
      )
      on conflict (tenant_id, idempotency_key) do update set
        source_file_id = excluded.source_file_id,
        company_id = excluded.company_id,
        import_kind = excluded.import_kind,
        state = excluded.state,
        rows_total = excluded.rows_total,
        rows_succeeded = excluded.rows_succeeded,
        rows_failed = excluded.rows_failed,
        summary = excluded.summary,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        updated_at = now()
    `,
    {
      tenantId,
      externalId: demoCaseData.importBatch.externalId,
      sourceFileId: sourceFileIds.get(demoCaseData.sourceFiles[0]?.externalId ?? "") ?? null,
      companyId,
      idempotencyKey: demoCaseData.importBatch.externalId,
      rowsTotal:
        demoCaseData.customers.length +
        demoCaseData.invoices.length +
        demoCaseData.obligations.length +
        demoCaseData.actionPlan.actions.length +
        demoCaseData.memoryFacts.length,
      rowsSucceeded:
        demoCaseData.customers.length +
        demoCaseData.invoices.length +
        demoCaseData.obligations.length +
        demoCaseData.actionPlan.actions.length +
        demoCaseData.memoryFacts.length,
      summary: jsonParam({
        seed: SEED_MARKER,
        externalId: demoCaseData.importBatch.externalId,
        sourceName: demoCaseData.importBatch.sourceName,
        sourceType: demoCaseData.importBatch.sourceType,
      }),
    },
    { transactionId },
  );

  return sourceFileIds;
}

async function seedCustomersAndContacts(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  tenantId: string,
  companyId: string,
): Promise<Map<string, string>> {
  const customerIds = new Map<string, string>();

  for (const customer of demoCaseData.customers) {
    const [customerRow] = await dataApi.execute<IdRow>(
      `
        insert into customers (
          tenant_id,
          company_id,
          external_id,
          name,
          legal_name,
          billing_email,
          payment_terms_days,
          risk_tier,
          state,
          metadata
        )
        values (
          :tenantId,
          :companyId,
          :externalId,
          :name,
          :legalName,
          :billingEmail,
          :paymentTermsDays,
          :riskTier,
          'active',
          :metadata
        )
        on conflict (tenant_id, external_id) do update set
          name = excluded.name,
          legal_name = excluded.legal_name,
          billing_email = excluded.billing_email,
          payment_terms_days = excluded.payment_terms_days,
          risk_tier = excluded.risk_tier,
          state = excluded.state,
          metadata = excluded.metadata,
          updated_at = now()
        returning id
      `,
      {
        tenantId,
        companyId,
        externalId: customer.externalId,
        name: customer.name,
        legalName: customer.name,
        billingEmail: customer.contacts[0]?.email ?? null,
        paymentTermsDays: customer.paymentTermsDays,
        riskTier: riskTierFromScore(customer.riskScore),
        metadata: jsonParam({
          seed: SEED_MARKER,
          segment: customer.segment,
          riskScore: customer.riskScore,
        }),
      },
      { transactionId },
    );

    const customerId = requireId(customerRow, `customer ${customer.externalId}`);
    customerIds.set(customer.externalId, customerId);

    await dataApi.executeMutation(
      `
        delete from contacts
        where customer_id = :customerId
          and metadata->>'seed' = :seedMarker
      `,
      {
        customerId,
        seedMarker: SEED_MARKER,
      },
      { transactionId },
    );

    for (const [index, contact] of customer.contacts.entries()) {
      await dataApi.executeMutation(
        `
          insert into contacts (
            tenant_id,
            customer_id,
            full_name,
            role_title,
            email,
            phone_e164,
            is_primary,
            consent_state,
            state,
            metadata
          )
          values (
            :tenantId,
            :customerId,
            :fullName,
            :roleTitle,
            :email,
            :phoneE164,
            :isPrimary,
            'unknown',
            'active',
            :metadata
          )
        `,
        {
          tenantId,
          customerId,
          fullName: contact.fullName,
          roleTitle: contact.role,
          email: contact.email,
          phoneE164: contact.phone,
          isPrimary: index === 0,
          metadata: jsonParam({
            seed: SEED_MARKER,
            externalId: contact.externalId,
          }),
        },
        { transactionId },
      );
    }
  }

  return customerIds;
}

async function seedInvoices(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  tenantId: string,
  companyId: string,
  customerIds: Map<string, string>,
  sourceFileIds: Map<string, string>,
): Promise<Map<string, string>> {
  const invoiceIds = new Map<string, string>();
  const sourceFileId = sourceFileIds.get(demoCaseData.sourceFiles[0]?.externalId ?? "") ?? null;

  for (const invoice of demoCaseData.invoices) {
    const [invoiceRow] = await dataApi.execute<IdRow>(
      `
        insert into invoices (
          tenant_id,
          company_id,
          customer_id,
          source_file_id,
          external_id,
          invoice_number,
          issue_date,
          due_date,
          currency_code,
          amount_total,
          amount_paid,
          state,
          idempotency_key,
          metadata
        )
        values (
          :tenantId,
          :companyId,
          :customerId,
          :sourceFileId,
          :externalId,
          :invoiceNumber,
          :issueDate,
          :dueDate,
          :currencyCode,
          :amountTotal,
          :amountPaid,
          :state,
          :idempotencyKey,
          :metadata
        )
        on conflict (tenant_id, external_id) do update set
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
          metadata = excluded.metadata,
          updated_at = now()
        returning id
      `,
      {
        tenantId,
        companyId,
        customerId: requireMapValue(customerIds, invoice.customerExternalId, "invoice customer"),
        sourceFileId,
        externalId: invoice.externalId,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        currencyCode: invoice.currency,
        amountTotal: decimalParamFromCents(invoice.amountCents),
        amountPaid: decimalParamFromCents(invoice.amountPaidCents),
        state: invoiceStateFromDemo(invoice.status),
        idempotencyKey: invoice.externalId,
        metadata: jsonParam({
          seed: SEED_MARKER,
          description: invoice.description,
          demoStatus: invoice.status,
        }),
      },
      { transactionId },
    );

    invoiceIds.set(invoice.externalId, requireId(invoiceRow, `invoice ${invoice.externalId}`));
  }

  return invoiceIds;
}

async function seedObligations(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  tenantId: string,
  companyId: string,
  sourceFileIds: Map<string, string>,
) {
  const sourceFileId = sourceFileIds.get(demoCaseData.sourceFiles[1]?.externalId ?? "") ?? null;

  for (const obligation of demoCaseData.obligations) {
    await dataApi.executeMutation(
      `
        insert into obligations (
          tenant_id,
          external_id,
          company_id,
          source_file_id,
          counterparty_name,
          category,
          obligation_type,
          due_date,
          currency_code,
          amount,
          state,
          idempotency_key,
          metadata
        )
        values (
          :tenantId,
          :externalId,
          :companyId,
          :sourceFileId,
          :counterpartyName,
          :category,
          :obligationType,
          :dueDate,
          :currencyCode,
          :amount,
          :state,
          :idempotencyKey,
          :metadata
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
          metadata = excluded.metadata,
          updated_at = now()
      `,
      {
        tenantId,
        externalId: obligation.externalId,
        companyId,
        sourceFileId,
        counterpartyName: obligation.vendorName,
        category: obligation.category,
        obligationType: obligationTypeFromCategory(obligation.category),
        dueDate: obligation.dueDate,
        currencyCode: obligation.currency,
        amount: decimalParamFromCents(obligation.amountCents),
        state: obligationStateFromDemo(obligation.status),
        idempotencyKey: obligation.externalId,
        metadata: jsonParam({
          seed: SEED_MARKER,
          title: obligation.title,
          priority: obligation.priority,
          externalId: obligation.externalId,
          demoStatus: obligation.status,
        }),
      },
      { transactionId },
    );
  }
}

async function seedForecast(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  tenantId: string,
  companyId: string,
  primaryCashAccountId: string,
): Promise<string> {
  const [forecastRun] = await dataApi.execute<IdRow>(
    `
      insert into forecast_runs (
        tenant_id,
        external_id,
        company_id,
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
        :horizonStart,
        :horizonEnd,
        'base',
        'checkpoint-1-demo',
        'completed',
        :inputSnapshot,
        :outputSummary,
        :idempotencyKey,
        now(),
        now()
      )
      on conflict (tenant_id, idempotency_key) do update set
        external_id = excluded.external_id,
        horizon_start = excluded.horizon_start,
        horizon_end = excluded.horizon_end,
        scenario = excluded.scenario,
        model_version = excluded.model_version,
        state = excluded.state,
        input_snapshot = excluded.input_snapshot,
        output_summary = excluded.output_summary,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        updated_at = now()
      returning id
    `,
    {
      tenantId,
      externalId: demoCaseData.forecastRun.externalId,
      companyId,
      horizonStart: demoCaseData.forecastRun.horizonStartDate,
      horizonEnd: demoCaseData.forecastRun.horizonEndDate,
      inputSnapshot: jsonParam({
        seed: SEED_MARKER,
        caseId: demoCaseData.caseId,
        case_id: demoCaseData.caseId,
      }),
      outputSummary: jsonParam({
        seed: SEED_MARKER,
        caseId: demoCaseData.caseId,
        case_id: demoCaseData.caseId,
        externalId: demoCaseData.forecastRun.externalId,
        external_id: demoCaseData.forecastRun.externalId,
        openingCashCents: demoCaseData.forecastRun.openingCashCents,
        opening_cash_cents: demoCaseData.forecastRun.openingCashCents,
        minimumCashCents: demoCaseData.forecastRun.minimumCashCents,
        minimum_cash_cents: demoCaseData.forecastRun.minimumCashCents,
      }),
      idempotencyKey: demoCaseData.caseId,
    },
    { transactionId },
  );

  const forecastRunId = requireId(forecastRun, "forecast run");

  await dataApi.executeMutation(
    `
      delete from forecast_points
      where forecast_run_id = :forecastRunId
    `,
    { forecastRunId },
    { transactionId },
  );

  for (const point of demoCaseData.forecastRun.points) {
    await insertForecastMetric(
      dataApi,
      transactionId,
      tenantId,
      forecastRunId,
      companyId,
      primaryCashAccountId,
      point.pointDate,
      "cash_balance",
      point.expectedCashCents,
      point.notes,
    );
    await insertForecastMetric(
      dataApi,
      transactionId,
      tenantId,
      forecastRunId,
      companyId,
      null,
      point.pointDate,
      "expected_inflow",
      point.inflowCents,
      null,
    );
    await insertForecastMetric(
      dataApi,
      transactionId,
      tenantId,
      forecastRunId,
      companyId,
      null,
      point.pointDate,
      "expected_outflow",
      point.outflowCents,
      null,
    );
  }

  return forecastRunId;
}

async function insertForecastMetric(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  tenantId: string,
  forecastRunId: string,
  companyId: string,
  cashAccountId: string | null,
  pointDate: string,
  metric: "cash_balance" | "expected_inflow" | "expected_outflow",
  amountCents: number,
  notes: string | null,
) {
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
      tenantId,
      forecastRunId,
      companyId,
      cashAccountId,
      pointDate,
      metric,
      currencyCode: demoCaseData.company.baseCurrency,
      amount: decimalParamFromCents(amountCents),
      confidence: decimalParam(0.82, 4),
      drivers: jsonParam({
        seed: SEED_MARKER,
        notes,
      }),
    },
    { transactionId },
  );
}

async function seedActions(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  tenantId: string,
  companyId: string,
  forecastRunId: string,
  customerIds: Map<string, string>,
  invoiceIds: Map<string, string>,
) {
  const [actionPlan] = await dataApi.execute<IdRow>(
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
        forecast_run_id = excluded.forecast_run_id,
        name = excluded.name,
        state = excluded.state,
        currency_code = excluded.currency_code,
        total_expected_impact = excluded.total_expected_impact,
        rationale = excluded.rationale,
        updated_at = now()
      returning id
    `,
    {
      tenantId,
      externalId: demoCaseData.actionPlan.externalId,
      companyId,
      forecastRunId,
      name: "Checkpoint 1 demo recovery plan",
      currencyCode: demoCaseData.company.baseCurrency,
      totalExpectedImpact: decimalParamFromCents(demoCaseData.actionPlan.projectedRecoveryCents),
      rationale: demoCaseData.actionPlan.summary,
      idempotencyKey: demoCaseData.caseId,
    },
    { transactionId },
  );

  const actionPlanId = requireId(actionPlan, "action plan");

  for (const action of demoCaseData.actionPlan.actions) {
    const [actionRow] = await dataApi.execute<IdRow>(
      `
        insert into actions (
          tenant_id,
          external_id,
          action_plan_id,
          company_id,
          customer_id,
          invoice_id,
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
          action_type = excluded.action_type,
          title = excluded.title,
          rationale = excluded.rationale,
          priority = excluded.priority,
          state = excluded.state,
          currency_code = excluded.currency_code,
          expected_cash_impact = excluded.expected_cash_impact,
          due_at = excluded.due_at,
          metadata = excluded.metadata,
          updated_at = now()
        returning id
      `,
      {
        tenantId,
        externalId: action.externalId,
        actionPlanId,
        companyId,
        customerId: requireMapValue(customerIds, action.customerExternalId, "action customer"),
        invoiceId: action.invoiceExternalId ? requireMapValue(invoiceIds, action.invoiceExternalId, "action invoice") : null,
        actionType: actionTypeFromDemo(action),
        title: action.title,
        rationale: action.rationale,
        priority: priorityLevelFromRank(action.priority),
        state: actionStateFromDemo(action),
        currencyCode: demoCaseData.company.baseCurrency,
        expectedCashImpact: decimalParamFromCents(action.expectedRecoveryCents),
        dueAt: action.scheduledFor,
        idempotencyKey: action.externalId,
        metadata: jsonParam({
          seed: SEED_MARKER,
          caseId: demoCaseData.caseId,
          case_id: demoCaseData.caseId,
          externalId: action.externalId,
          demoActionType: action.actionType,
          demoStatus: action.status,
          approvalRequired: action.approvalRequired,
          approval_required: action.approvalRequired,
          priorityRank: action.priority,
          priority_rank: action.priority,
        }),
      },
      { transactionId },
    );

    if (action.approvalRequired) {
      await seedApprovalRecord(dataApi, transactionId, tenantId, requireId(actionRow, `action ${action.externalId}`), action);
    }
  }
}

async function seedApprovalRecord(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  tenantId: string,
  actionId: string,
  action: DemoAction,
) {
  await dataApi.executeMutation(
    `
      insert into approval_records (
        tenant_id,
        action_id,
        state,
        request_payload,
        requested_at,
        expires_at,
        idempotency_key
      )
      values (
        :tenantId,
        :actionId,
        'pending',
        :requestPayload,
        now(),
        :expiresAt,
        :idempotencyKey
      )
      on conflict (tenant_id, idempotency_key) do update set
        action_id = excluded.action_id,
        state = excluded.state,
        request_payload = excluded.request_payload,
        requested_at = excluded.requested_at,
        expires_at = excluded.expires_at,
        updated_at = now()
    `,
    {
      tenantId,
      actionId,
      requestPayload: jsonParam({
        seed: SEED_MARKER,
        actionExternalId: action.externalId,
        rationale: action.rationale,
      }),
      expiresAt: action.scheduledFor,
      idempotencyKey: `approval:${action.externalId}`,
    },
    { transactionId },
  );
}

async function resetSeededApprovalAudits(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  tenantId: string,
) {
  await dataApi.executeMutation(
    `
      delete from audit_log
      where tenant_id = :tenantId
        and target_type = 'approval_record'
        and action like 'cp4.approval.%'
        and target_id in (
          select ar.id
          from approval_records ar
          join actions a on a.id = ar.action_id and a.tenant_id = ar.tenant_id
          where ar.tenant_id = :tenantId
            and a.metadata->>'seed' = :seedMarker
        )
    `,
    {
      tenantId,
      seedMarker: SEED_MARKER,
    },
    { transactionId },
  );
}

async function seedMemoryFacts(
  dataApi: AuroraDataApiClient,
  transactionId: string,
  tenantId: string,
  companyId: string,
  customerIds: Map<string, string>,
) {
  await dataApi.executeMutation(
    `
      delete from memory_chunks
      where company_id = :companyId
        and metadata->>'seed' = :seedMarker
    `,
    {
      companyId,
      seedMarker: SEED_MARKER,
    },
    { transactionId },
  );

  for (const fact of demoCaseData.memoryFacts) {
    await dataApi.executeMutation(
      `
        insert into memory_chunks (
          tenant_id,
          external_id,
          company_id,
          customer_id,
          source_type,
          fact_type,
          content,
          embedding,
          embedding_model,
          confidence,
          metadata
        )
        values (
          :tenantId,
          :externalId,
          :companyId,
          :customerId,
          :sourceType,
          :factType,
          :content,
          cast(:embedding as vector),
          :embeddingModel,
          :confidence,
          :metadata
        )
      `,
      {
        tenantId,
        externalId: fact.externalId,
        companyId,
        customerId: requireMapValue(customerIds, fact.customerExternalId, "memory fact customer"),
        sourceType: memorySourceTypeFromDemo(fact),
        factType: memoryFactTypeFromDemo(fact),
        content: fact.factText,
        embedding: ZERO_VECTOR_1024,
        embeddingModel: "checkpoint-1-demo-zero-vector",
        confidence: decimalParam(fact.confidence, 4),
        metadata: jsonParam({
          seed: SEED_MARKER,
          externalId: fact.externalId,
          external_id: fact.externalId,
          sourceExternalId: fact.sourceExternalId,
          source_external_id: fact.sourceExternalId,
          sourceKind: fact.sourceKind,
          source_kind: fact.sourceKind,
        }),
      },
      { transactionId },
    );
  }
}

function inferSourceKind(filename: string): string {
  if (filename.includes("payroll") || filename.includes("obligation")) {
    return "obligation_csv";
  }

  return "invoice_csv";
}

function riskTierFromScore(score: number): string {
  if (score >= 70) {
    return "high";
  }
  if (score >= 55) {
    return "elevated";
  }
  if (score >= 35) {
    return "standard";
  }
  return "low";
}

function invoiceStateFromDemo(status: string): string {
  if (status === "overdue") {
    return "open";
  }

  return status;
}

function obligationTypeFromCategory(category: string): string {
  switch (category) {
    case "payroll":
      return "payroll";
    case "tax":
      return "tax";
    case "rent":
      return "rent";
    case "loan":
      return "loan";
    default:
      return "supplier";
  }
}

function obligationStateFromDemo(status: string): string {
  if (status === "due") {
    return "overdue";
  }

  return status;
}

function actionTypeFromDemo(action: DemoAction): string {
  switch (action.actionType) {
    case "email":
      return "send_reminder";
    case "call":
      return "call_customer";
    case "payment_plan":
      return "collect_invoice";
    default:
      return "manual_review";
  }
}

function actionStateFromDemo(action: DemoAction): string {
  switch (action.status) {
    case "recommended":
      return "proposed";
    case "needs_approval":
      return "needs_approval";
    case "approved":
      return "approved";
    case "sent":
      return "scheduled";
    case "completed":
      return "completed";
    default:
      return "proposed";
  }
}

function priorityLevelFromRank(priority: number): string {
  if (priority <= 1) {
    return "urgent";
  }
  if (priority === 2) {
    return "high";
  }
  if (priority === 3) {
    return "medium";
  }
  return "low";
}

function memorySourceTypeFromDemo(fact: DemoMemoryFact): string {
  switch (fact.sourceKind) {
    case "payment_event":
      return "payment";
    case "contact_note":
      return "manual_note";
    default:
      return "invoice";
  }
}

function memoryFactTypeFromDemo(fact: DemoMemoryFact): string {
  switch (fact.sourceKind) {
    case "payment_event":
      return "payment_behavior";
    case "contact_note":
      return "contact_preference";
    default:
      return "risk_signal";
  }
}

function decimalParamFromCents(cents: number) {
  return {
    value: (cents / 100).toFixed(2),
    typeHint: "DECIMAL" as const,
  };
}

function decimalParam(value: number, decimals = 2) {
  return {
    value: value.toFixed(decimals),
    typeHint: "DECIMAL" as const,
  };
}

function jsonParam(value: unknown) {
  return {
    value: JSON.stringify(value),
    typeHint: "JSON" as const,
  };
}

function requireId(row: IdRow | undefined, label: string): string {
  if (!row?.id) {
    throw new Error(`Could not resolve ${label} id while seeding demo data.`);
  }

  return row.id;
}

function requireMapValue(values: Map<string, string>, key: string, label: string): string {
  const value = values.get(key);

  if (!value) {
    throw new Error(`Could not resolve ${label} for ${key} while seeding demo data.`);
  }

  return value;
}

main().catch((error) => {
  console.error("Demo seed failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
