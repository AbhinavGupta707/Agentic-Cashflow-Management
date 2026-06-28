import { getDataApiAvailability } from "../src/server/aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../src/server/aws/rds-data-api";
import { demoCaseData } from "../src/server/demo-data/cashflow-demo";

const ZERO_VECTOR_1024 = `[${Array.from({ length: 1024 }, () => "0").join(",")}]`;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const availability = getDataApiAvailability();

  if (dryRun || !availability.available) {
    printDryRun(availability.available ? [] : availability.missing);
    return;
  }

  const dataApi = createAuroraDataApiClient(availability.config);

  await dataApi.transaction(async (transactionId) => {
    await seedCompany(dataApi, transactionId);
    await seedImportSources(dataApi, transactionId);
    await seedCustomersAndContacts(dataApi, transactionId);
    await seedInvoices(dataApi, transactionId);
    await seedObligations(dataApi, transactionId);
    await seedForecast(dataApi, transactionId);
    await seedActions(dataApi, transactionId);
    await seedMemoryFacts(dataApi, transactionId);
  });

  console.log("Demo cashflow case seeded successfully.");
  console.log(`Company: ${demoCaseData.company.externalId}`);
  console.log(`Case: ${demoCaseData.caseId}`);
}

function printDryRun(missing: string[]) {
  console.log("Demo seed dry run.");
  if (missing.length > 0) {
    console.log(`Live seed skipped because Data API env is missing: ${missing.join(", ")}`);
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

async function seedCompany(dataApi: AuroraDataApiClient, transactionId: string) {
  await dataApi.executeMutation(
    `
      insert into companies (
        external_id,
        name,
        industry,
        base_currency,
        timezone,
        cash_balance_cents,
        metadata
      )
      values (
        :externalId,
        :name,
        :industry,
        :baseCurrency,
        :timezone,
        :cashBalanceCents,
        :metadata
      )
      on conflict (external_id) do update set
        name = excluded.name,
        industry = excluded.industry,
        base_currency = excluded.base_currency,
        timezone = excluded.timezone,
        cash_balance_cents = excluded.cash_balance_cents,
        metadata = excluded.metadata,
        updated_at = now()
    `,
    {
      externalId: demoCaseData.company.externalId,
      name: demoCaseData.company.name,
      industry: demoCaseData.company.industry,
      baseCurrency: demoCaseData.company.baseCurrency,
      timezone: demoCaseData.company.timezone,
      cashBalanceCents: demoCaseData.company.cashBalanceCents,
      metadata: { value: JSON.stringify({ seed: "checkpoint-1-demo" }), typeHint: "JSON" },
    },
    { transactionId },
  );
}

async function seedImportSources(dataApi: AuroraDataApiClient, transactionId: string) {
  await dataApi.executeMutation(
    `
      insert into import_batches (
        external_id,
        company_id,
        source_name,
        source_type,
        status
      )
      values (
        :externalId,
        (select id from companies where external_id = :companyExternalId),
        :sourceName,
        :sourceType,
        'completed'
      )
      on conflict (external_id) do update set
        source_name = excluded.source_name,
        source_type = excluded.source_type,
        status = excluded.status,
        updated_at = now()
    `,
    {
      externalId: demoCaseData.importBatch.externalId,
      companyExternalId: demoCaseData.company.externalId,
      sourceName: demoCaseData.importBatch.sourceName,
      sourceType: demoCaseData.importBatch.sourceType,
    },
    { transactionId },
  );

  for (const sourceFile of demoCaseData.sourceFiles) {
    await dataApi.executeMutation(
      `
        insert into source_files (
          external_id,
          company_id,
          import_batch_id,
          storage_key,
          original_filename,
          content_type,
          size_bytes,
          status
        )
        values (
          :externalId,
          (select id from companies where external_id = :companyExternalId),
          (select id from import_batches where external_id = :importBatchExternalId),
          :storageKey,
          :originalFilename,
          :contentType,
          :sizeBytes,
          'available'
        )
        on conflict (external_id) do update set
          storage_key = excluded.storage_key,
          original_filename = excluded.original_filename,
          content_type = excluded.content_type,
          size_bytes = excluded.size_bytes,
          status = excluded.status,
          updated_at = now()
      `,
      {
        ...sourceFile,
        companyExternalId: demoCaseData.company.externalId,
        importBatchExternalId: demoCaseData.importBatch.externalId,
      },
      { transactionId },
    );
  }
}

async function seedCustomersAndContacts(dataApi: AuroraDataApiClient, transactionId: string) {
  for (const customer of demoCaseData.customers) {
    await dataApi.executeMutation(
      `
        insert into customers (
          external_id,
          company_id,
          name,
          segment,
          payment_terms_days,
          risk_score,
          metadata
        )
        values (
          :externalId,
          (select id from companies where external_id = :companyExternalId),
          :name,
          :segment,
          :paymentTermsDays,
          :riskScore,
          :metadata
        )
        on conflict (external_id) do update set
          name = excluded.name,
          segment = excluded.segment,
          payment_terms_days = excluded.payment_terms_days,
          risk_score = excluded.risk_score,
          metadata = excluded.metadata,
          updated_at = now()
      `,
      {
        externalId: customer.externalId,
        companyExternalId: demoCaseData.company.externalId,
        name: customer.name,
        segment: customer.segment,
        paymentTermsDays: customer.paymentTermsDays,
        riskScore: customer.riskScore,
        metadata: { value: JSON.stringify({ seed: "checkpoint-1-demo" }), typeHint: "JSON" },
      },
      { transactionId },
    );

    for (const contact of customer.contacts) {
      await dataApi.executeMutation(
        `
          insert into contacts (
            external_id,
            company_id,
            customer_id,
            full_name,
            email,
            phone,
            role
          )
          values (
            :externalId,
            (select id from companies where external_id = :companyExternalId),
            (select id from customers where external_id = :customerExternalId),
            :fullName,
            :email,
            :phone,
            :role
          )
          on conflict (external_id) do update set
            full_name = excluded.full_name,
            email = excluded.email,
            phone = excluded.phone,
            role = excluded.role,
            updated_at = now()
        `,
        {
          ...contact,
          companyExternalId: demoCaseData.company.externalId,
          customerExternalId: customer.externalId,
        },
        { transactionId },
      );
    }
  }
}

async function seedInvoices(dataApi: AuroraDataApiClient, transactionId: string) {
  for (const invoice of demoCaseData.invoices) {
    await dataApi.executeMutation(
      `
        insert into invoices (
          external_id,
          company_id,
          customer_id,
          invoice_number,
          issue_date,
          due_date,
          currency,
          amount_cents,
          amount_paid_cents,
          status,
          description
        )
        values (
          :externalId,
          (select id from companies where external_id = :companyExternalId),
          (select id from customers where external_id = :customerExternalId),
          :invoiceNumber,
          :issueDate,
          :dueDate,
          :currency,
          :amountCents,
          :amountPaidCents,
          :status,
          :description
        )
        on conflict (external_id) do update set
          invoice_number = excluded.invoice_number,
          issue_date = excluded.issue_date,
          due_date = excluded.due_date,
          currency = excluded.currency,
          amount_cents = excluded.amount_cents,
          amount_paid_cents = excluded.amount_paid_cents,
          status = excluded.status,
          description = excluded.description,
          updated_at = now()
      `,
      {
        ...invoice,
        companyExternalId: demoCaseData.company.externalId,
      },
      { transactionId },
    );
  }
}

async function seedObligations(dataApi: AuroraDataApiClient, transactionId: string) {
  for (const obligation of demoCaseData.obligations) {
    await dataApi.executeMutation(
      `
        insert into obligations (
          external_id,
          company_id,
          title,
          vendor_name,
          category,
          due_date,
          currency,
          amount_cents,
          status,
          priority
        )
        values (
          :externalId,
          (select id from companies where external_id = :companyExternalId),
          :title,
          :vendorName,
          :category,
          :dueDate,
          :currency,
          :amountCents,
          :status,
          :priority
        )
        on conflict (external_id) do update set
          title = excluded.title,
          vendor_name = excluded.vendor_name,
          category = excluded.category,
          due_date = excluded.due_date,
          currency = excluded.currency,
          amount_cents = excluded.amount_cents,
          status = excluded.status,
          priority = excluded.priority,
          updated_at = now()
      `,
      {
        ...obligation,
        companyExternalId: demoCaseData.company.externalId,
      },
      { transactionId },
    );
  }
}

async function seedForecast(dataApi: AuroraDataApiClient, transactionId: string) {
  await dataApi.executeMutation(
    `
      insert into forecast_runs (
        external_id,
        company_id,
        case_id,
        horizon_start_date,
        horizon_end_date,
        opening_cash_cents,
        minimum_cash_cents,
        status
      )
      values (
        :externalId,
        (select id from companies where external_id = :companyExternalId),
        :caseId,
        :horizonStartDate,
        :horizonEndDate,
        :openingCashCents,
        :minimumCashCents,
        'completed'
      )
      on conflict (external_id) do update set
        case_id = excluded.case_id,
        horizon_start_date = excluded.horizon_start_date,
        horizon_end_date = excluded.horizon_end_date,
        opening_cash_cents = excluded.opening_cash_cents,
        minimum_cash_cents = excluded.minimum_cash_cents,
        status = excluded.status,
        updated_at = now()
    `,
    {
      externalId: demoCaseData.forecastRun.externalId,
      companyExternalId: demoCaseData.company.externalId,
      caseId: demoCaseData.caseId,
      horizonStartDate: demoCaseData.forecastRun.horizonStartDate,
      horizonEndDate: demoCaseData.forecastRun.horizonEndDate,
      openingCashCents: demoCaseData.forecastRun.openingCashCents,
      minimumCashCents: demoCaseData.forecastRun.minimumCashCents,
    },
    { transactionId },
  );

  for (const point of demoCaseData.forecastRun.points) {
    await dataApi.executeMutation(
      `
        insert into forecast_points (
          forecast_run_id,
          point_date,
          expected_cash_cents,
          inflow_cents,
          outflow_cents,
          notes
        )
        values (
          (select id from forecast_runs where external_id = :forecastRunExternalId),
          :pointDate,
          :expectedCashCents,
          :inflowCents,
          :outflowCents,
          :notes
        )
        on conflict (forecast_run_id, point_date) do update set
          expected_cash_cents = excluded.expected_cash_cents,
          inflow_cents = excluded.inflow_cents,
          outflow_cents = excluded.outflow_cents,
          notes = excluded.notes,
          updated_at = now()
      `,
      {
        ...point,
        forecastRunExternalId: demoCaseData.forecastRun.externalId,
      },
      { transactionId },
    );
  }
}

async function seedActions(dataApi: AuroraDataApiClient, transactionId: string) {
  await dataApi.executeMutation(
    `
      insert into action_plans (
        external_id,
        company_id,
        case_id,
        status,
        summary,
        projected_recovery_cents
      )
      values (
        :externalId,
        (select id from companies where external_id = :companyExternalId),
        :caseId,
        'recommended',
        :summary,
        :projectedRecoveryCents
      )
      on conflict (external_id) do update set
        case_id = excluded.case_id,
        status = excluded.status,
        summary = excluded.summary,
        projected_recovery_cents = excluded.projected_recovery_cents,
        updated_at = now()
    `,
    {
      externalId: demoCaseData.actionPlan.externalId,
      companyExternalId: demoCaseData.company.externalId,
      caseId: demoCaseData.caseId,
      summary: demoCaseData.actionPlan.summary,
      projectedRecoveryCents: demoCaseData.actionPlan.projectedRecoveryCents,
    },
    { transactionId },
  );

  for (const action of demoCaseData.actionPlan.actions) {
    await dataApi.executeMutation(
      `
        insert into actions (
          external_id,
          action_plan_id,
          customer_id,
          invoice_id,
          action_type,
          status,
          priority,
          scheduled_for,
          expected_recovery_cents,
          title,
          rationale,
          approval_required
        )
        values (
          :externalId,
          (select id from action_plans where external_id = :actionPlanExternalId),
          (select id from customers where external_id = :customerExternalId),
          (select id from invoices where external_id = :invoiceExternalId),
          :actionType,
          :status,
          :priority,
          :scheduledFor,
          :expectedRecoveryCents,
          :title,
          :rationale,
          :approvalRequired
        )
        on conflict (external_id) do update set
          action_type = excluded.action_type,
          status = excluded.status,
          priority = excluded.priority,
          scheduled_for = excluded.scheduled_for,
          expected_recovery_cents = excluded.expected_recovery_cents,
          title = excluded.title,
          rationale = excluded.rationale,
          approval_required = excluded.approval_required,
          updated_at = now()
      `,
      {
        ...action,
        actionPlanExternalId: demoCaseData.actionPlan.externalId,
      },
      { transactionId },
    );
  }
}

async function seedMemoryFacts(dataApi: AuroraDataApiClient, transactionId: string) {
  for (const fact of demoCaseData.memoryFacts) {
    await dataApi.executeMutation(
      `
        insert into memory_chunks (
          external_id,
          company_id,
          customer_id,
          source_kind,
          source_external_id,
          fact_text,
          confidence,
          embedding
        )
        values (
          :externalId,
          (select id from companies where external_id = :companyExternalId),
          (select id from customers where external_id = :customerExternalId),
          :sourceKind,
          :sourceExternalId,
          :factText,
          :confidence,
          cast(:embedding as vector)
        )
        on conflict (external_id) do update set
          source_kind = excluded.source_kind,
          source_external_id = excluded.source_external_id,
          fact_text = excluded.fact_text,
          confidence = excluded.confidence,
          embedding = excluded.embedding,
          updated_at = now()
      `,
      {
        ...fact,
        companyExternalId: demoCaseData.company.externalId,
        embedding: ZERO_VECTOR_1024,
      },
      { transactionId },
    );
  }
}

main().catch((error) => {
  console.error("Demo seed failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
