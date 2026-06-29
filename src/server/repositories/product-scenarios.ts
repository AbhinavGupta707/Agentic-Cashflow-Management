import { z } from "zod";

import { DataApiUnavailableError, getDataApiAvailability } from "../aws/data-api-env";
import { createAuroraDataApiClient, type AuroraDataApiClient } from "../aws/rds-data-api";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";
import type {
  DeterministicForecastResult,
  ForecastInput,
  ForecastInvoice,
  ForecastObligation,
} from "../db/forecast-contract";
import type {
  ProductScenarioActionPlanItem,
  ProductScenarioAssumptions,
  ProductScenarioComparisonCard,
  ProductScenarioControl,
  ProductScenarioKey,
  ProductScenarioPoint,
  ProductScenarioPreviewRequest,
  ProductScenarioPreviewState,
  ProductScenarioProjection,
  ProductScenarioSensitivityRow,
  ProductScenariosState,
} from "../db/product-scenarios-contract";
import type { ProductDataSource } from "../db/product-overview-contract";
import { buildDeterministicForecast } from "../forecast/engine";
import { loadForecastInput } from "./forecast";

type RepositoryOptions = {
  dataApi?: AuroraDataApiClient;
  companyExternalId?: string;
  caseId?: string;
};

type ProjectionBundle = {
  projection: ProductScenarioProjection;
  forecast: DeterministicForecastResult;
};

const BASELINE_ASSUMPTIONS: ProductScenarioAssumptions = {
  paymentAccelerationDays: 0,
  receivableCollectionRateBps: 10_000,
  supplierDeferralDays: 0,
  discretionarySpendReductionBps: 0,
  minimumCashTargetCents: null,
};

const OPTIMISTIC_ASSUMPTIONS: ProductScenarioAssumptions = {
  paymentAccelerationDays: 7,
  receivableCollectionRateBps: 10_000,
  supplierDeferralDays: 7,
  discretionarySpendReductionBps: 1_000,
  minimumCashTargetCents: null,
};

const CONSERVATIVE_ASSUMPTIONS: ProductScenarioAssumptions = {
  paymentAccelerationDays: 0,
  receivableCollectionRateBps: 7_000,
  supplierDeferralDays: 0,
  discretionarySpendReductionBps: 0,
  minimumCashTargetCents: null,
};

export const scenarioPreviewRequestSchema = z.object({
  companyId: z.string().min(1).optional(),
  caseId: z.string().min(1).optional(),
  assumptions: z
    .object({
      paymentAccelerationDays: z.number().int().min(0).max(30).optional(),
      receivableCollectionRateBps: z.number().int().min(0).max(10_000).optional(),
      supplierDeferralDays: z.number().int().min(0).max(45).optional(),
      discretionarySpendReductionBps: z.number().int().min(0).max(5_000).optional(),
      minimumCashTargetCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
    })
    .strict(),
});

export async function getProductScenariosState(
  options: RepositoryOptions = {},
): Promise<ProductScenariosState> {
  const { dataApi, companyExternalId, caseId } = createScenarioContext(options);
  const input = await loadForecastInput({ dataApi, companyExternalId, caseId, scenario: "product-baseline" }, dataApi);
  const bundles = [
    buildProjectionBundle("baseline", "Baseline", input, BASELINE_ASSUMPTIONS),
    buildProjectionBundle("optimistic", "Optimistic", input, OPTIMISTIC_ASSUMPTIONS),
    buildProjectionBundle("conservative", "Conservative", input, CONSERVATIVE_ASSUMPTIONS),
  ];
  const projections = bundles.map((bundle) => bundle.projection);
  const baseline = projections[0];

  return {
    company: {
      externalId: input.companyExternalId,
      name: input.companyName,
      baseCurrency: input.currencyCode,
    },
    caseId: input.caseId,
    generatedAt: new Date().toISOString(),
    state: "ready",
    source: readyComputedSource("Scenario planner projections were computed from Aurora forecast inputs without persisting speculative runs."),
    horizon: {
      startDate: input.horizonStart,
      endDate: input.horizonEnd,
      days: diffDays(
        new Date(`${input.horizonStart}T00:00:00.000Z`),
        new Date(`${input.horizonEnd}T00:00:00.000Z`),
      ) + 1,
      source: readyComputedSource("Scenario horizon comes from the Aurora forecast input window."),
    },
    controls: buildControls(input),
    projections,
    comparisonCards: projections.map((projection) => toComparisonCard(projection, baseline)),
    recommendedActionPlan: forecastActionsToPlan(bundles[0].forecast),
    sensitivityRows: buildSensitivityRows(baseline, projections[1], projections[2]),
  };
}

export async function getProductScenarioPreviewState(
  request: ProductScenarioPreviewRequest,
  options: { dataApi?: AuroraDataApiClient } = {},
): Promise<ProductScenarioPreviewState> {
  const { dataApi, companyExternalId, caseId } = createScenarioContext({
    dataApi: options.dataApi,
    companyExternalId: request.companyId,
    caseId: request.caseId,
  });
  const input = await loadForecastInput({ dataApi, companyExternalId, caseId, scenario: "product-preview" }, dataApi);
  const assumptions = normalizeAssumptions(request.assumptions, input);
  const baseline = buildProjectionBundle("baseline", "Baseline", input, BASELINE_ASSUMPTIONS).projection;
  const projection = buildProjectionBundle("preview", "Preview", input, assumptions).projection;

  return {
    company: {
      externalId: input.companyExternalId,
      name: input.companyName,
      baseCurrency: input.currencyCode,
    },
    caseId: input.caseId,
    generatedAt: new Date().toISOString(),
    projection,
    comparisonVsBaseline: toComparisonCard(projection, baseline),
  };
}

function createScenarioContext(options: RepositoryOptions): {
  dataApi: AuroraDataApiClient;
  companyExternalId: string;
  caseId: string;
} {
  const availability = getDataApiAvailability();
  let dataApi = options.dataApi;

  if (!dataApi) {
    if (!availability.available) {
      throw new DataApiUnavailableError(availability.missing);
    }

    dataApi = createAuroraDataApiClient(availability.config);
  }

  return {
    dataApi,
    companyExternalId: options.companyExternalId ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID,
    caseId: options.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID,
  };
}

function buildProjectionBundle(
  key: ProductScenarioKey,
  label: string,
  input: ForecastInput,
  assumptions: ProductScenarioAssumptions,
): ProjectionBundle {
  const normalizedAssumptions = normalizeAssumptions(assumptions, input);
  const scenarioInput = applyAssumptions(input, normalizedAssumptions, key);
  const forecast = buildDeterministicForecast(scenarioInput);
  const series = forecast.dailyPoints.map(toScenarioPoint);
  const minimumPoint = minCashPoint(series);
  const runwayPoint = series.find((point) => point.expectedCashCents < 0) ?? null;
  const endingPoint = series[series.length - 1] ?? null;

  return {
    forecast,
    projection: {
      key,
      label,
      source: readyComputedSource("Projection was computed from live Aurora inputs and deterministic scenario assumptions."),
      assumptions: normalizedAssumptions,
      summary: {
        openingCashCents: scenarioInput.cashAccounts.reduce((sum, account) => sum + account.currentBalanceCents, 0),
        minimumCashCents: minimumPoint?.expectedCashCents ?? 0,
        minimumCashDate: minimumPoint?.date ?? null,
        maxShortfallCents: forecast.maxShortfallCents,
        shortfallDate: forecast.shortfallDate,
        totalInflowCents: forecast.totalExpectedInflowCents,
        totalOutflowCents: forecast.totalExpectedOutflowCents,
        endingCashCents: endingPoint?.expectedCashCents ?? 0,
        endingCashDate: endingPoint?.date ?? null,
        runwayDays: runwayPoint
          ? diffDays(new Date(`${input.horizonStart}T00:00:00.000Z`), new Date(`${runwayPoint.date}T00:00:00.000Z`))
          : null,
      },
      series,
    },
  };
}

function applyAssumptions(
  input: ForecastInput,
  assumptions: ProductScenarioAssumptions,
  scenario: ProductScenarioKey,
): ForecastInput {
  return {
    ...input,
    scenario,
    minimumCashTargetCents: assumptions.minimumCashTargetCents ?? input.minimumCashTargetCents,
    invoices: input.invoices.map((invoice) => applyInvoiceAssumptions(invoice, assumptions, input.horizonStart)),
    obligations: input.obligations.map((obligation) => applyObligationAssumptions(obligation, assumptions)),
  };
}

function applyInvoiceAssumptions(
  invoice: ForecastInvoice,
  assumptions: ProductScenarioAssumptions,
  horizonStart: string,
): ForecastInvoice {
  const adjustedDueDate = subtractDays(invoice.dueDate, assumptions.paymentAccelerationDays);
  const amountDueCents = Math.round(invoice.amountDueCents * (assumptions.receivableCollectionRateBps / 10_000));

  return {
    ...invoice,
    dueDate: adjustedDueDate < horizonStart ? horizonStart : adjustedDueDate,
    amountDueCents,
  };
}

function applyObligationAssumptions(
  obligation: ForecastObligation,
  assumptions: ProductScenarioAssumptions,
): ForecastObligation {
  const deferrable = !["payroll", "tax", "loan"].includes(obligation.obligationType);
  const reducible = !["payroll", "tax", "loan", "rent"].includes(obligation.obligationType);
  const amountMultiplier = reducible ? (10_000 - assumptions.discretionarySpendReductionBps) / 10_000 : 1;

  return {
    ...obligation,
    dueDate: deferrable ? addDays(obligation.dueDate, assumptions.supplierDeferralDays) : obligation.dueDate,
    amountCents: Math.round(obligation.amountCents * amountMultiplier),
  };
}

function normalizeAssumptions(
  partial: Partial<ProductScenarioAssumptions>,
  input: ForecastInput,
): ProductScenarioAssumptions {
  return {
    paymentAccelerationDays: partial.paymentAccelerationDays ?? BASELINE_ASSUMPTIONS.paymentAccelerationDays,
    receivableCollectionRateBps: partial.receivableCollectionRateBps ?? BASELINE_ASSUMPTIONS.receivableCollectionRateBps,
    supplierDeferralDays: partial.supplierDeferralDays ?? BASELINE_ASSUMPTIONS.supplierDeferralDays,
    discretionarySpendReductionBps:
      partial.discretionarySpendReductionBps ?? BASELINE_ASSUMPTIONS.discretionarySpendReductionBps,
    minimumCashTargetCents: partial.minimumCashTargetCents ?? input.minimumCashTargetCents,
  };
}

function buildControls(input: ForecastInput): ProductScenarioControl[] {
  const assumptions = normalizeAssumptions(BASELINE_ASSUMPTIONS, input);

  return [
    {
      key: "paymentAccelerationDays",
      label: "Payment acceleration",
      value: assumptions.paymentAccelerationDays,
      min: 0,
      max: 30,
      step: 1,
      unit: "days",
      source: readyComputedSource("Adjusts open invoice due dates earlier before forecast computation."),
    },
    {
      key: "receivableCollectionRateBps",
      label: "Receivable collection rate",
      value: assumptions.receivableCollectionRateBps,
      min: 0,
      max: 10_000,
      step: 500,
      unit: "bps",
      source: readyComputedSource("Scales open receivable inflows in basis points."),
    },
    {
      key: "supplierDeferralDays",
      label: "Supplier deferral",
      value: assumptions.supplierDeferralDays,
      min: 0,
      max: 45,
      step: 1,
      unit: "days",
      source: readyComputedSource("Defers non-payroll, non-tax, non-loan obligations by the selected days."),
    },
    {
      key: "discretionarySpendReductionBps",
      label: "Discretionary spend reduction",
      value: assumptions.discretionarySpendReductionBps,
      min: 0,
      max: 5_000,
      step: 250,
      unit: "bps",
      source: readyComputedSource("Reduces non-payroll, non-tax, non-loan, non-rent outflows in basis points."),
    },
    {
      key: "minimumCashTargetCents",
      label: "Minimum cash target",
      value: assumptions.minimumCashTargetCents,
      min: 0,
      max: 100_000_000,
      step: 50_000,
      unit: "cents",
      source: readyComputedSource("Sets the shortfall target used by the deterministic forecast engine."),
    },
  ];
}

function toScenarioPoint(point: DeterministicForecastResult["dailyPoints"][number]): ProductScenarioPoint {
  return {
    date: point.pointDate,
    expectedCashCents: point.cashBalanceCents,
    inflowCents: point.expectedInflowCents,
    outflowCents: point.expectedOutflowCents,
    netCashflowCents: point.netCashflowCents,
    shortfallCents: point.shortfallCents,
  };
}

function toComparisonCard(
  projection: ProductScenarioProjection,
  baseline: ProductScenarioProjection,
): ProductScenarioComparisonCard {
  return {
    key: projection.key,
    label: projection.label,
    minimumCashCents: projection.summary.minimumCashCents,
    changeVsBaselineCents: projection.summary.minimumCashCents - baseline.summary.minimumCashCents,
    runwayDays: projection.summary.runwayDays,
    shortfallCents: projection.summary.maxShortfallCents,
    source: projection.source,
  };
}

function forecastActionsToPlan(forecast: DeterministicForecastResult): ProductScenarioActionPlanItem[] {
  const source = readyComputedSource("Recommended plan is derived from the baseline deterministic action recommendations.");

  return forecast.actions.map((action) => ({
    title: action.title,
    actionType: action.actionType,
    expectedCashImpactCents: action.expectedCashImpactCents,
    rationale: action.rationale,
    priority: action.priority,
    source,
  }));
}

function buildSensitivityRows(
  baseline: ProductScenarioProjection,
  optimistic: ProductScenarioProjection,
  conservative: ProductScenarioProjection,
): ProductScenarioSensitivityRow[] {
  return [
    {
      driver: "Receivable timing and collection",
      baselineValue: `${baseline.assumptions.receivableCollectionRateBps / 100}% collected`,
      upsideCents: optimistic.summary.minimumCashCents - baseline.summary.minimumCashCents,
      downsideCents: conservative.summary.minimumCashCents - baseline.summary.minimumCashCents,
      note: "Upside accelerates receipts; downside reduces collected receivables in the forecast horizon.",
      source: readyComputedSource("Sensitivity is computed by comparing scenario minimum cash against baseline."),
    },
    {
      driver: "Supplier and discretionary outflow timing",
      baselineValue: `${baseline.assumptions.supplierDeferralDays} day deferral`,
      upsideCents: baseline.summary.totalOutflowCents - optimistic.summary.totalOutflowCents,
      downsideCents: conservative.summary.totalOutflowCents - baseline.summary.totalOutflowCents,
      note: "Positive upside means the scenario lowers forecast outflows during the horizon.",
      source: readyComputedSource("Sensitivity is computed from deterministic forecast outflow totals."),
    },
    {
      driver: "Minimum cash buffer",
      baselineValue: `${baseline.assumptions.minimumCashTargetCents ?? 0} cents`,
      upsideCents: Math.max(0, baseline.summary.maxShortfallCents - optimistic.summary.maxShortfallCents),
      downsideCents: conservative.summary.maxShortfallCents - baseline.summary.maxShortfallCents,
      note: "Shows how scenario assumptions change the largest cash target shortfall.",
      source: readyComputedSource("Sensitivity is computed from deterministic shortfall outputs."),
    },
  ];
}

function minCashPoint(series: ProductScenarioPoint[]): ProductScenarioPoint | null {
  return series.reduce<ProductScenarioPoint | null>((lowest, point) => {
    if (!lowest || point.expectedCashCents < lowest.expectedCashCents) {
      return point;
    }

    return lowest;
  }, null);
}

function readyComputedSource(message: string): ProductDataSource {
  return {
    state: "ready",
    source: "computed",
    message,
    unavailableReason: null,
  };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return toDateString(value);
}

function subtractDays(date: string, days: number): string {
  return addDays(date, -days);
}

function diffDays(left: Date, right: Date): number {
  const start = Date.UTC(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate());
  const end = Date.UTC(right.getUTCFullYear(), right.getUTCMonth(), right.getUTCDate());

  return Math.ceil((end - start) / 86_400_000);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
