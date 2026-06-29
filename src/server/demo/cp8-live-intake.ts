import { Buffer } from "node:buffer";

import { runCashflowAgentGraph } from "../agents/cashflow-graph";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";
import { processEventInbox, dryRunNormalizeCsv, type ProcessEventInboxSummary } from "../ingestion/processor";
import {
  uploadSourceFile,
  type ImportKind as UploadImportKind,
  type SourceKind,
  type UploadSourceResult,
} from "../ingestion/upload";
import { scopedIdempotencyKey, stableHash } from "../ingestion/idempotency";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../aws/rds-data-api";
import { generateAndPersistForecast, type GenerateForecastResult } from "../repositories/forecast";

export const CP8_LIVE_INTAKE_VERSION = "cp8-live-intake-v1";

export type Cp8DemoIntakeMode = "finance_pack" | "payment_event";

export type Cp8DemoIntakeInput = {
  mode?: Cp8DemoIntakeMode;
  companyExternalId?: string;
  caseId?: string;
  process?: boolean;
  now?: Date;
};

export type Cp8DemoIntakeFile = {
  label: string;
  originalFilename: string;
  contentType: "text/csv";
  sourceKind: SourceKind;
  importKind: Exclude<UploadImportKind, "mixed">;
  csvText: string;
  rowsTotal: number;
};

export type Cp8DemoIntakePlan = {
  version: typeof CP8_LIVE_INTAKE_VERSION;
  mode: Cp8DemoIntakeMode;
  companyExternalId: string;
  caseId: string;
  idempotencyKey: string;
  files: Cp8DemoIntakeFile[];
};

export type Cp8DemoIntakeResult = {
  status: "ok";
  plan: Cp8DemoIntakePlan;
  processed: boolean;
  uploads: Array<{
    file: Pick<Cp8DemoIntakeFile, "label" | "originalFilename" | "sourceKind" | "importKind" | "rowsTotal">;
    upload: UploadSourceResult;
    eventProcessing: ProcessEventInboxSummary | null;
  }>;
  forecast: {
    runId: string;
    runExternalId: string;
    idempotencyKey: string;
    actionPlanId: string;
    actionCount: number;
    staleActionCount: number;
    minimumCashCents: number;
    maxShortfallCents: number;
    shortfallDate: string | null;
  } | null;
  agentGraph: {
    runId: string | null;
    idempotencyKey: string;
    checkpointKeys: string[];
    recommendationCount: number;
    draftSource: string;
    providerStatuses: unknown;
  } | null;
  outboundProvidersExecuted: false;
};

type RunOptions = {
  dataApi?: AuroraDataApiClient;
};

export async function runCp8DemoIntake(
  input: Cp8DemoIntakeInput = {},
  options: RunOptions = {},
): Promise<Cp8DemoIntakeResult> {
  const plan = buildCp8DemoIntakePlan(input);
  const dataApi = options.dataApi ?? createAuroraDataApiClient();
  const shouldProcess = input.process ?? true;
  const uploads: Cp8DemoIntakeResult["uploads"] = [];

  for (const file of plan.files) {
    const upload = await uploadSourceFile(
      {
        bytes: Buffer.from(file.csvText, "utf8"),
        originalFilename: file.originalFilename,
        contentType: file.contentType,
        sourceKind: file.sourceKind,
        importKind: file.importKind,
        companyExternalId: plan.companyExternalId,
        caseId: plan.caseId,
      },
      { dataApi, now: input.now },
    );
    const eventProcessing = shouldProcess
      ? await processEventInbox({
          dataApi,
          eventId: upload.eventId,
          limit: 1,
          workerId: "cp8-live-intake",
        })
      : null;

    uploads.push({
      file: summarizeFile(file),
      upload,
      eventProcessing,
    });
  }

  const forecastResult = shouldProcess
    ? await generateAndPersistForecast({
        dataApi,
        companyExternalId: plan.companyExternalId,
        caseId: plan.caseId,
        scenario: "base",
      })
    : null;
  const agentIdempotencyKey = scopedIdempotencyKey([
    "agent-run",
    "cp8-live-intake",
    plan.mode,
    plan.companyExternalId,
    plan.caseId,
    plan.idempotencyKey,
  ]);
  const agentGraph = forecastResult
    ? await runCashflowAgentGraph(
        {
          tenantId: forecastResult.input.tenantId,
          companyId: forecastResult.input.companyId,
          companyExternalId: plan.companyExternalId,
          caseId: plan.caseId,
          runKind: "recommendation",
          idempotencyKey: agentIdempotencyKey,
        },
        { dataApi },
      )
    : null;

  return {
    status: "ok",
    plan,
    processed: shouldProcess,
    uploads,
    forecast: forecastResult ? summarizeForecast(forecastResult) : null,
    agentGraph: agentGraph
      ? {
          runId: agentGraph.agentRunId,
          idempotencyKey: agentIdempotencyKey,
          checkpointKeys: agentGraph.checkpointKeys,
          recommendationCount: agentGraph.recommendations.length,
          draftSource: agentGraph.draft.source,
          providerStatuses: agentGraph.providerStatuses,
        }
      : null,
    outboundProvidersExecuted: false,
  };
}

export function buildCp8DemoIntakePlan(input: Cp8DemoIntakeInput = {}): Cp8DemoIntakePlan {
  const mode = input.mode ?? "finance_pack";
  const companyExternalId = input.companyExternalId ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID;
  const caseId = input.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const files = mode === "payment_event" ? [buildNorthstarPaymentFile()] : buildFinancePackFiles();
  const idempotencyKey = scopedIdempotencyKey([
    "cp8-live-intake",
    CP8_LIVE_INTAKE_VERSION,
    mode,
    companyExternalId,
    caseId,
    stableHash(files.map((file) => [file.importKind, file.csvText])),
  ]);

  return {
    version: CP8_LIVE_INTAKE_VERSION,
    mode,
    companyExternalId,
    caseId,
    idempotencyKey,
    files,
  };
}

export function parseCp8DemoIntakeMode(value: unknown): Cp8DemoIntakeMode {
  if (value === undefined || value === null || value === "") {
    return "finance_pack";
  }

  if (value === "finance_pack" || value === "payment_event") {
    return value;
  }

  throw new Error("mode must be one of: finance_pack, payment_event.");
}

export function validateCp8DemoIntakePlan(plan: Cp8DemoIntakePlan): void {
  for (const file of plan.files) {
    const result = dryRunNormalizeCsv(file.importKind, file.csvText);
    if (result.rowsFailed > 0) {
      throw new Error(
        `${file.originalFilename} failed normalization: ${result.errors.join("; ")}`,
      );
    }
  }
}

function buildFinancePackFiles(): Cp8DemoIntakeFile[] {
  return [
    buildCustomersFile(),
    buildInvoicesFile(),
    buildObligationsFile(),
    buildNorthstarPaymentFile(),
  ];
}

function buildCustomersFile(): Cp8DemoIntakeFile {
  return csvFile({
    label: "Customer risk refresh",
    originalFilename: "cp8-customers-risk-refresh.csv",
    sourceKind: "customer_csv",
    importKind: "customers",
    rows: [
      [
        "external_id",
        "name",
        "legal_name",
        "billing_email",
        "payment_terms_days",
        "risk_tier",
        "segment",
      ],
      [
        "cust_northstar_hotels",
        "Northstar Hotels Ltd",
        "Northstar Hotels Ltd",
        "ella.reed@example.invalid",
        "30",
        "elevated",
        "hospitality",
      ],
      [
        "cust_cairn_retail",
        "Cairn Retail Group",
        "Cairn Retail Group Ltd",
        "finance@example.invalid",
        "21",
        "standard",
        "retail",
      ],
    ],
  });
}

function buildInvoicesFile(): Cp8DemoIntakeFile {
  return csvFile({
    label: "Fresh receivables export",
    originalFilename: "cp8-invoices-june-refresh.csv",
    sourceKind: "invoice_csv",
    importKind: "invoices",
    rows: [
      [
        "external_id",
        "invoice_number",
        "customer_external_id",
        "customer_name",
        "issue_date",
        "due_date",
        "currency",
        "amount_total",
        "amount_paid",
        "state",
      ],
      [
        "inv_cp8_ns_1052",
        "NS-1052",
        "cust_northstar_hotels",
        "Northstar Hotels Ltd",
        "2026-06-12",
        "2026-06-30",
        "GBP",
        "8900.00",
        "0.00",
        "open",
      ],
      [
        "inv_cp8_cr_101",
        "CR-101",
        "cust_cairn_retail",
        "Cairn Retail Group",
        "2026-06-18",
        "2026-07-09",
        "GBP",
        "6400.00",
        "0.00",
        "open",
      ],
    ],
  });
}

function buildObligationsFile(): Cp8DemoIntakeFile {
  return csvFile({
    label: "Upcoming supplier obligations",
    originalFilename: "cp8-obligations-june-refresh.csv",
    sourceKind: "obligation_csv",
    importKind: "obligations",
    rows: [
      [
        "external_id",
        "counterparty_name",
        "category",
        "obligation_type",
        "due_date",
        "currency",
        "amount",
        "state",
      ],
      [
        "obl_cp8_atlas_payroll_reserve",
        "Atlas Payroll Reserve",
        "payroll",
        "payroll_buffer",
        "2026-07-03",
        "GBP",
        "3200.00",
        "scheduled",
      ],
    ],
  });
}

function buildNorthstarPaymentFile(): Cp8DemoIntakeFile {
  return csvFile({
    label: "Northstar payment confirmation",
    originalFilename: "cp8-northstar-payment-confirmation.csv",
    sourceKind: "bank_csv",
    importKind: "payments",
    rows: [
      [
        "external_id",
        "provider",
        "customer_external_id",
        "invoice_external_id",
        "invoice_number",
        "payment_date",
        "direction",
        "currency",
        "amount",
        "state",
      ],
      [
        "pay_cp8_ns_1048_full",
        "bank_feed",
        "cust_northstar_hotels",
        "inv_ns_1048",
        "NS-1048",
        "2026-06-29",
        "inflow",
        "GBP",
        "18600.00",
        "posted",
      ],
    ],
  });
}

function csvFile(input: {
  label: string;
  originalFilename: string;
  sourceKind: SourceKind;
  importKind: Exclude<UploadImportKind, "mixed">;
  rows: string[][];
}): Cp8DemoIntakeFile {
  return {
    label: input.label,
    originalFilename: input.originalFilename,
    contentType: "text/csv",
    sourceKind: input.sourceKind,
    importKind: input.importKind,
    csvText: `${input.rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
    rowsTotal: Math.max(0, input.rows.length - 1),
  };
}

function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function summarizeFile(file: Cp8DemoIntakeFile) {
  return {
    label: file.label,
    originalFilename: file.originalFilename,
    sourceKind: file.sourceKind,
    importKind: file.importKind,
    rowsTotal: file.rowsTotal,
  };
}

function summarizeForecast(result: GenerateForecastResult): NonNullable<Cp8DemoIntakeResult["forecast"]> {
  return {
    runId: result.persistence.forecastRunId,
    runExternalId: result.persistence.forecastRunExternalId,
    idempotencyKey: result.persistence.forecastRunIdempotencyKey,
    actionPlanId: result.persistence.actionPlanId,
    actionCount: result.persistence.actionCount,
    staleActionCount: result.persistence.staleActionCount,
    minimumCashCents: result.forecast.minCashBalanceCents,
    maxShortfallCents: result.forecast.maxShortfallCents,
    shortfallDate: result.forecast.shortfallDate,
  };
}
