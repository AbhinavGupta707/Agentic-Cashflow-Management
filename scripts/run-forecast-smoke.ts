import "./load-local-env";

import { DataApiUnavailableError, getDataApiAvailability } from "../src/server/aws/data-api-env";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../src/server/db/case-state-contract";
import { type ForecastInput } from "../src/server/db/forecast-contract";
import {
  buildDeterministicForecast,
  CP3_FORECAST_MODEL_VERSION,
  DEFAULT_HIGH_VALUE_RECEIVABLE_CENTS,
  DEFAULT_MINIMUM_CASH_TARGET_CENTS,
} from "../src/server/forecast/engine";
import { generateAndPersistForecast, type GenerateForecastOptions } from "../src/server/repositories/forecast";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun) {
    runDrySmoke();
    return;
  }

  const availability = getDataApiAvailability();

  if (!availability.available) {
    console.log("CP3 forecast live smoke unavailable.");
    console.log(`Missing environment variables: ${availability.missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const options: GenerateForecastOptions = {
    companyExternalId: args.companyExternalId ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID,
    caseId: args.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID,
    horizonStart: args.horizonStart,
    horizonEnd: args.horizonEnd,
    horizonDays: args.horizonDays,
    scenario: args.scenario,
  };
  const first = await generateAndPersistForecast(options);

  printLiveResult("CP3 forecast live smoke passed.", first);

  if (args.replay) {
    const second = await generateAndPersistForecast(options);

    assert(
      first.persistence.forecastRunId === second.persistence.forecastRunId,
      "forecast run id stays stable on replay",
    );
    assert(
      first.persistence.actionPlanId === second.persistence.actionPlanId,
      "action plan id stays stable on replay",
    );
    assert(
      first.persistence.forecastPointCount === second.persistence.forecastPointCount,
      "forecast point count stays stable on replay",
    );
    assert(
      first.persistence.actionCount === second.persistence.actionCount,
      "action count stays stable on replay",
    );
    assert(
      stableList(first.persistence.actionIds) === stableList(second.persistence.actionIds),
      "action ids stay stable on replay",
    );

    printLiveResult("CP3 forecast idempotent replay passed.", second);
  }
}

function runDrySmoke() {
  const input: ForecastInput = {
    tenantId: "dry_tenant",
    companyId: "dry_company",
    companyExternalId: "cmp_dry_run",
    companyName: "Dry Run Ltd",
    caseId: "case_cp3_dry_run",
    currencyCode: "GBP",
    horizonStart: "2026-05-01",
    horizonEnd: "2026-05-03",
    scenario: "base",
    modelVersion: CP3_FORECAST_MODEL_VERSION,
    minimumCashTargetCents: DEFAULT_MINIMUM_CASH_TARGET_CENTS,
    highValueReceivableCents: DEFAULT_HIGH_VALUE_RECEIVABLE_CENTS,
    latestEventLedgerId: null,
    cashAccounts: [
      {
        id: "cash_dry_operating",
        name: "Dry Operating",
        accountType: "operating",
        currencyCode: "GBP",
        currentBalanceCents: 10_000,
        balanceAsOf: "2026-05-01 00:00:00+00",
      },
    ],
    invoices: [
      {
        id: "inv_dry_001",
        externalId: "inv_dry_001",
        invoiceNumber: "DRY-001",
        customerId: "cust_dry",
        customerExternalId: "cust_dry",
        customerName: "Dry Customer",
        dueDate: "2026-05-03",
        currencyCode: "GBP",
        amountTotalCents: 25_000,
        amountPaidCents: 0,
        amountDueCents: 25_000,
        state: "open",
        riskTier: "standard",
        paymentTermsDays: 30,
        description: "Dry-run receivable",
      },
    ],
    obligations: [
      {
        id: "obl_dry_payroll",
        externalId: "obl_dry_payroll",
        title: "Dry payroll",
        counterpartyName: "Dry payroll",
        category: "payroll",
        obligationType: "payroll",
        dueDate: "2026-05-02",
        currencyCode: "GBP",
        amountCents: 18_000,
        state: "scheduled",
        priorityRank: 1,
      },
    ],
    payments: [],
    eventLedgerSummary: [],
  };
  const forecast = buildDeterministicForecast(input);

  assert(forecast.dailyPoints.length === 3, "dry forecast has three daily points");
  assert(forecast.points.length === 15, "dry forecast writes five metrics per day");
  assert(forecast.maxShortfallCents === 8_000, "dry forecast computes the expected shortfall");
  assert(forecast.actions.length === 1, "dry forecast recommends one receivable action");
  assert(forecast.actions[0]?.state === "needs_approval", "dry action remains approval gated");

  console.log("CP3 forecast dry smoke passed.");
  console.log("No Aurora reads or writes were performed.");
  console.log(`Forecast points: ${forecast.points.length}`);
  console.log(`Recommended actions: ${forecast.actions.length}`);
  console.log(`Max shortfall cents: ${forecast.maxShortfallCents}`);
}

function printLiveResult(label: string, result: Awaited<ReturnType<typeof generateAndPersistForecast>>) {
  console.log(label);
  console.log(`Company: ${result.input.companyName} (${result.input.companyExternalId})`);
  console.log(`Case: ${result.input.caseId}`);
  console.log(`Forecast run: ${result.persistence.forecastRunExternalId}`);
  console.log(`Forecast run id: ${result.persistence.forecastRunId}`);
  console.log(`Horizon: ${result.input.horizonStart} to ${result.input.horizonEnd}`);
  console.log(`Forecast points written: ${result.persistence.forecastPointCount}`);
  console.log(`Action plan: ${result.persistence.actionPlanExternalId}`);
  console.log(`Actions written: ${result.persistence.actionCount}`);
  console.log(`Stale proposed actions removed: ${result.persistence.staleActionCount}`);
  console.log(`Max shortfall cents: ${result.forecast.maxShortfallCents}`);
  console.log(`Total expected impact cents: ${result.forecast.totalExpectedImpactCents}`);
}

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes("--dry-run"),
    replay: argv.includes("--replay"),
    companyExternalId: valueFor(argv, "--company") ?? valueFor(argv, "--company-external-id"),
    caseId: valueFor(argv, "--case-id"),
    horizonStart: valueFor(argv, "--horizon-start"),
    horizonEnd: valueFor(argv, "--horizon-end"),
    horizonDays: numberFor(argv, "--horizon-days"),
    scenario: valueFor(argv, "--scenario"),
  };
}

function valueFor(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);

  if (index === -1) {
    return undefined;
  }

  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function numberFor(argv: string[], flag: string): number | undefined {
  const value = valueFor(argv, flag);

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return parsed;
}

function stableList(values: string[]): string {
  return [...values].sort().join(",");
}

function assert(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`CP3 forecast smoke failed: ${label}`);
  }
}

main().catch((error) => {
  if (error instanceof DataApiUnavailableError) {
    console.log("CP3 forecast live smoke unavailable.");
    console.log(`Missing environment variables: ${error.missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  console.error("CP3 forecast smoke failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
