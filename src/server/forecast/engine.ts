import {
  type DeterministicForecastResult,
  type ForecastAction,
  type ForecastDailyPoint,
  type ForecastInput,
  type ForecastInvoice,
  type ForecastMetric,
  type ForecastObligation,
  type ForecastPayment,
  type ForecastPoint,
} from "../db/forecast-contract";
import { scopedIdempotencyKey, stableHash, slugifyIdentifier } from "../ingestion/idempotency";

export const CP3_FORECAST_MODEL_VERSION = "cp3-deterministic-forecast-v1";
export const CP3_FORECAST_GENERATOR = "cp3-deterministic-forecast-engine";
export const DEFAULT_FORECAST_HORIZON_DAYS = 30;
export const DEFAULT_MINIMUM_CASH_TARGET_CENTS = 0;
export const DEFAULT_HIGH_VALUE_RECEIVABLE_CENTS = 500_000;

type FlowDriver = {
  sourceType: "invoice" | "obligation" | "payment";
  sourceId: string;
  externalId: string;
  label: string;
  amountCents: number;
  originalDate: string;
  effectiveDate: string;
  state: string;
};

type DailyFlows = {
  inflows: FlowDriver[];
  outflows: FlowDriver[];
};

const ACTION_LIMIT = 4;

export function buildDeterministicForecast(input: ForecastInput): DeterministicForecastResult {
  assertDateRange(input.horizonStart, input.horizonEnd);

  const runKey = scopedIdempotencyKey([
    "forecast",
    input.companyExternalId,
    input.caseId,
    input.horizonStart,
    input.horizonEnd,
    input.scenario,
    input.modelVersion,
  ]);
  const runHash = stableHash(runKey).slice(0, 16);
  const forecastRunExternalId = `cp3_forecast_${slugifyIdentifier(input.companyExternalId)}_${runHash}`;
  const actionPlanExternalId = `cp3_plan_${slugifyIdentifier(input.companyExternalId)}_${runHash}`;
  const actionPlanIdempotencyKey = scopedIdempotencyKey([runKey, "action-plan"]);
  const openingCashCents = input.cashAccounts.reduce(
    (total, account) => total + account.currentBalanceCents,
    0,
  );
  const flowByDate = buildFlowMap(input);
  const dailyPoints = buildDailyPoints(input, openingCashCents, flowByDate);
  const minCashBalanceCents = Math.min(...dailyPoints.map((point) => point.cashBalanceCents));
  const maxShortfallCents = Math.max(...dailyPoints.map((point) => point.shortfallCents));
  const shortfallPoint = dailyPoints.find((point) => point.shortfallCents === maxShortfallCents && maxShortfallCents > 0);
  const totalExpectedInflowCents = dailyPoints.reduce(
    (total, point) => total + point.expectedInflowCents,
    0,
  );
  const totalExpectedOutflowCents = dailyPoints.reduce(
    (total, point) => total + point.expectedOutflowCents,
    0,
  );
  const points = flattenDailyPoints(input, dailyPoints, flowByDate);
  const actions = recommendActions(input, {
    runKey,
    forecastRunExternalId,
    maxShortfallCents,
    shortfallDate: shortfallPoint?.pointDate ?? null,
  });
  const totalExpectedImpactCents = actions.reduce(
    (total, action) => total + action.expectedCashImpactCents,
    0,
  );
  const actionPlanName =
    maxShortfallCents > 0
      ? `Cash shortfall recovery plan for ${input.companyName}`
      : `Receivables recovery plan for ${input.companyName}`;
  const actionPlanRationale = buildActionPlanRationale(input, {
    actions,
    maxShortfallCents,
    shortfallDate: shortfallPoint?.pointDate ?? null,
  });
  const inputSnapshot = buildInputSnapshot(input, openingCashCents);
  const outputSummary = buildOutputSummary(input, {
    forecastRunExternalId,
    openingCashCents,
    minCashBalanceCents,
    maxShortfallCents,
    shortfallDate: shortfallPoint?.pointDate ?? null,
    totalExpectedInflowCents,
    totalExpectedOutflowCents,
    totalExpectedImpactCents,
    actionCount: actions.length,
  });

  return {
    forecastRunExternalId,
    forecastRunIdempotencyKey: runKey,
    actionPlanExternalId,
    actionPlanIdempotencyKey,
    actionPlanName,
    actionPlanRationale,
    totalExpectedImpactCents,
    minCashBalanceCents,
    maxShortfallCents,
    shortfallDate: shortfallPoint?.pointDate ?? null,
    totalExpectedInflowCents,
    totalExpectedOutflowCents,
    inputSnapshot,
    outputSummary,
    dailyPoints,
    points,
    actions,
  };
}

function buildFlowMap(input: ForecastInput): Map<string, DailyFlows> {
  const flowByDate = new Map<string, DailyFlows>();

  for (const invoice of input.invoices) {
    if (!isReceivableForecastable(invoice, input.currencyCode)) {
      continue;
    }

    const effectiveDate = effectiveForecastDate(invoice.dueDate, input.horizonStart, input.horizonEnd);
    if (!effectiveDate) {
      continue;
    }

    flowForDate(flowByDate, effectiveDate).inflows.push({
      sourceType: "invoice",
      sourceId: invoice.id,
      externalId: invoice.externalId,
      label: `${invoice.customerName} ${invoice.invoiceNumber}`,
      amountCents: invoice.amountDueCents,
      originalDate: invoice.dueDate,
      effectiveDate,
      state: invoice.state,
    });
  }

  for (const obligation of input.obligations) {
    if (!isObligationForecastable(obligation, input.currencyCode)) {
      continue;
    }

    const effectiveDate = effectiveForecastDate(obligation.dueDate, input.horizonStart, input.horizonEnd);
    if (!effectiveDate) {
      continue;
    }

    flowForDate(flowByDate, effectiveDate).outflows.push({
      sourceType: "obligation",
      sourceId: obligation.id,
      externalId: obligation.externalId,
      label: obligation.title,
      amountCents: obligation.amountCents,
      originalDate: obligation.dueDate,
      effectiveDate,
      state: obligation.state,
    });
  }

  for (const payment of input.payments) {
    if (!isPendingPaymentForecastable(payment, input.currencyCode)) {
      continue;
    }

    const effectiveDate = effectiveForecastDate(payment.paymentDate, input.horizonStart, input.horizonEnd);
    if (!effectiveDate) {
      continue;
    }

    const driver: FlowDriver = {
      sourceType: "payment",
      sourceId: payment.id,
      externalId: payment.externalId,
      label: `${payment.provider ?? "pending"} ${payment.direction}`,
      amountCents: payment.amountCents,
      originalDate: payment.paymentDate,
      effectiveDate,
      state: payment.state,
    };

    if (payment.direction === "inflow") {
      flowForDate(flowByDate, effectiveDate).inflows.push(driver);
    } else {
      flowForDate(flowByDate, effectiveDate).outflows.push(driver);
    }
  }

  return flowByDate;
}

function buildDailyPoints(
  input: ForecastInput,
  openingCashCents: number,
  flowByDate: Map<string, DailyFlows>,
): ForecastDailyPoint[] {
  const dates = eachDate(input.horizonStart, input.horizonEnd);
  let cashBalanceCents = openingCashCents;

  return dates.map((pointDate) => {
    const flows = flowByDate.get(pointDate) ?? { inflows: [], outflows: [] };
    const expectedInflowCents = sumAmounts(flows.inflows);
    const expectedOutflowCents = sumAmounts(flows.outflows);
    const netCashflowCents = expectedInflowCents - expectedOutflowCents;

    cashBalanceCents += netCashflowCents;

    return {
      pointDate,
      cashBalanceCents,
      expectedInflowCents,
      expectedOutflowCents,
      netCashflowCents,
      shortfallCents: Math.max(0, input.minimumCashTargetCents - cashBalanceCents),
      driverNotes: buildDriverNotes(flows),
    };
  });
}

function flattenDailyPoints(
  input: ForecastInput,
  dailyPoints: ForecastDailyPoint[],
  flowByDate: Map<string, DailyFlows>,
): ForecastPoint[] {
  return dailyPoints.flatMap((point) => {
    const flows = flowByDate.get(point.pointDate) ?? { inflows: [], outflows: [] };
    const commonDrivers = {
      generated_by: CP3_FORECAST_GENERATOR,
      case_id: input.caseId,
      caseId: input.caseId,
      scenario: input.scenario,
      notes: point.driverNotes.join("; ") || "No scheduled cash movement for this date.",
      inflowDrivers: flows.inflows.map(summarizeDriver),
      outflowDrivers: flows.outflows.map(summarizeDriver),
    };

    return [
      metricPoint(input, point.pointDate, "cash_balance", point.cashBalanceCents, {
        ...commonDrivers,
        calculation: "prior_cash_balance + expected_inflow - expected_outflow",
      }),
      metricPoint(input, point.pointDate, "expected_inflow", point.expectedInflowCents, {
        ...commonDrivers,
        calculation: "sum of open invoice receivables and pending inflow payments effective on this date",
      }),
      metricPoint(input, point.pointDate, "expected_outflow", point.expectedOutflowCents, {
        ...commonDrivers,
        calculation: "sum of scheduled obligations and pending outflow payments effective on this date",
      }),
      metricPoint(input, point.pointDate, "net_cashflow", point.netCashflowCents, {
        ...commonDrivers,
        calculation: "expected_inflow - expected_outflow",
      }),
      metricPoint(input, point.pointDate, "shortfall", point.shortfallCents, {
        ...commonDrivers,
        calculation: "max(0, minimum_cash_target - cash_balance)",
        minimumCashTargetCents: input.minimumCashTargetCents,
      }),
    ];
  });
}

function recommendActions(
  input: ForecastInput,
  context: {
    runKey: string;
    forecastRunExternalId: string;
    maxShortfallCents: number;
    shortfallDate: string | null;
  },
): ForecastAction[] {
  const invoices = input.invoices
    .filter((invoice) => isReceivableForecastable(invoice, input.currencyCode))
    .sort(compareReceivablePriority(input.horizonStart));
  const actions: ForecastAction[] = [];
  let coveredCents = 0;

  for (const invoice of invoices) {
    const shouldRecoverForShortfall =
      context.maxShortfallCents > 0 && coveredCents < context.maxShortfallCents;
    const shouldRecoverHighValue =
      context.maxShortfallCents === 0 && invoice.amountDueCents >= input.highValueReceivableCents;

    if (!shouldRecoverForShortfall && !shouldRecoverHighValue) {
      continue;
    }

    actions.push(
      receivableAction(input, invoice, {
        runKey: context.runKey,
        forecastRunExternalId: context.forecastRunExternalId,
        shortfallDate: context.shortfallDate,
        priorityRank: actions.length + 1,
        reason: shouldRecoverForShortfall ? "shortfall_recovery" : "high_value_receivable",
      }),
    );
    coveredCents += invoice.amountDueCents;

    if (actions.length >= ACTION_LIMIT) {
      break;
    }
  }

  if (context.maxShortfallCents > coveredCents && actions.length < ACTION_LIMIT) {
    const obligation = input.obligations
      .filter((item) => isObligationForecastable(item, input.currencyCode))
      .sort(compareObligationPriority)[0];

    actions.push(
      shortfallReviewAction(input, {
        runKey: context.runKey,
        forecastRunExternalId: context.forecastRunExternalId,
        shortfallDate: context.shortfallDate,
        priorityRank: actions.length + 1,
        remainingShortfallCents: context.maxShortfallCents - coveredCents,
        obligation,
      }),
    );
  }

  return actions;
}

function receivableAction(
  input: ForecastInput,
  invoice: ForecastInvoice,
  context: {
    runKey: string;
    forecastRunExternalId: string;
    shortfallDate: string | null;
    priorityRank: number;
    reason: "shortfall_recovery" | "high_value_receivable";
  },
): ForecastAction {
  const actionType = invoice.riskTier === "high" || invoice.riskTier === "elevated" ? "call_customer" : "send_reminder";
  const idempotencyKey = scopedIdempotencyKey([context.runKey, "action", context.reason, invoice.externalId]);
  const actionHash = stableHash(idempotencyKey).slice(0, 16);
  const dueAt = actionDueAt(input.horizonStart, context.priorityRank);

  return {
    externalId: `cp3_action_${actionHash}`,
    idempotencyKey,
    actionType,
    title: `Recover ${invoice.invoiceNumber} from ${invoice.customerName}`,
    rationale:
      context.reason === "shortfall_recovery"
        ? `Invoice ${invoice.invoiceNumber} is a recoverable receivable that can reduce the forecast cash shortfall${context.shortfallDate ? ` on ${context.shortfallDate}` : ""}.`
        : `Invoice ${invoice.invoiceNumber} is a high-value outstanding receivable due from ${invoice.customerName}.`,
    priority: context.priorityRank === 1 && context.reason === "shortfall_recovery" ? "urgent" : "high",
    state: "needs_approval",
    currencyCode: input.currencyCode,
    expectedCashImpactCents: invoice.amountDueCents,
    dueAt,
    customerId: invoice.customerId,
    customerExternalId: invoice.customerExternalId,
    invoiceId: invoice.id,
    invoiceExternalId: invoice.externalId,
    obligationId: null,
    metadata: {
      generated_by: CP3_FORECAST_GENERATOR,
      case_id: input.caseId,
      caseId: input.caseId,
      forecast_run_external_id: context.forecastRunExternalId,
      forecastRunExternalId: context.forecastRunExternalId,
      rule: context.reason,
      approval_required: true,
      approvalRequired: true,
      priority_rank: context.priorityRank,
      priorityRank: context.priorityRank,
      invoice_due_date: invoice.dueDate,
      amount_due_cents: invoice.amountDueCents,
      customer_external_id: invoice.customerExternalId,
    },
  };
}

function shortfallReviewAction(
  input: ForecastInput,
  context: {
    runKey: string;
    forecastRunExternalId: string;
    shortfallDate: string | null;
    priorityRank: number;
    remainingShortfallCents: number;
    obligation: ForecastObligation | undefined;
  },
): ForecastAction {
  const sourceKey = context.obligation?.externalId ?? "manual-cash-review";
  const idempotencyKey = scopedIdempotencyKey([context.runKey, "action", "shortfall-review", sourceKey]);
  const actionHash = stableHash(idempotencyKey).slice(0, 16);

  return {
    externalId: `cp3_action_${actionHash}`,
    idempotencyKey,
    actionType: context.obligation ? "defer_obligation" : "manual_review",
    title: context.obligation
      ? `Review timing for ${context.obligation.title}`
      : "Review remaining forecast cash gap",
    rationale: context.obligation
      ? `Receivable recovery does not fully cover the forecast shortfall; review whether ${context.obligation.title} can be deferred before approval.`
      : "Receivable recovery does not fully cover the forecast shortfall; manual finance review is required before any execution.",
    priority: "urgent",
    state: "needs_approval",
    currencyCode: input.currencyCode,
    expectedCashImpactCents: Math.max(0, context.remainingShortfallCents),
    dueAt: actionDueAt(input.horizonStart, context.priorityRank),
    customerId: null,
    customerExternalId: null,
    invoiceId: null,
    invoiceExternalId: null,
    obligationId: context.obligation?.id ?? null,
    metadata: {
      generated_by: CP3_FORECAST_GENERATOR,
      case_id: input.caseId,
      caseId: input.caseId,
      forecast_run_external_id: context.forecastRunExternalId,
      forecastRunExternalId: context.forecastRunExternalId,
      rule: "shortfall_review",
      approval_required: true,
      approvalRequired: true,
      priority_rank: context.priorityRank,
      priorityRank: context.priorityRank,
      shortfall_date: context.shortfallDate,
      remaining_shortfall_cents: context.remainingShortfallCents,
      obligation_external_id: context.obligation?.externalId ?? null,
    },
  };
}

function buildInputSnapshot(input: ForecastInput, openingCashCents: number): Record<string, unknown> {
  return {
    generated_by: CP3_FORECAST_GENERATOR,
    model_version: input.modelVersion,
    modelVersion: input.modelVersion,
    case_id: input.caseId,
    caseId: input.caseId,
    company_external_id: input.companyExternalId,
    companyExternalId: input.companyExternalId,
    scenario: input.scenario,
    horizon_start: input.horizonStart,
    horizonStart: input.horizonStart,
    horizon_end: input.horizonEnd,
    horizonEnd: input.horizonEnd,
    currency_code: input.currencyCode,
    opening_cash_cents: openingCashCents,
    openingCashCents,
    minimum_cash_target_cents: input.minimumCashTargetCents,
    high_value_receivable_cents: input.highValueReceivableCents,
    source_counts: {
      cash_accounts: input.cashAccounts.length,
      open_invoices: input.invoices.length,
      obligations: input.obligations.length,
      pending_payments: input.payments.length,
      event_ledger_groups: input.eventLedgerSummary.length,
    },
    cash_accounts: input.cashAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      account_type: account.accountType,
      currency_code: account.currencyCode,
      current_balance_cents: account.currentBalanceCents,
      balance_as_of: account.balanceAsOf,
    })),
    invoices: input.invoices.map((invoice) => ({
      id: invoice.id,
      external_id: invoice.externalId,
      invoice_number: invoice.invoiceNumber,
      customer_external_id: invoice.customerExternalId,
      due_date: invoice.dueDate,
      currency_code: invoice.currencyCode,
      amount_due_cents: invoice.amountDueCents,
      state: invoice.state,
    })),
    obligations: input.obligations.map((obligation) => ({
      id: obligation.id,
      external_id: obligation.externalId,
      title: obligation.title,
      due_date: obligation.dueDate,
      currency_code: obligation.currencyCode,
      amount_cents: obligation.amountCents,
      state: obligation.state,
    })),
    pending_payments: input.payments.map((payment) => ({
      id: payment.id,
      external_id: payment.externalId,
      payment_date: payment.paymentDate,
      direction: payment.direction,
      currency_code: payment.currencyCode,
      amount_cents: payment.amountCents,
      state: payment.state,
    })),
    event_ledger_summary: input.eventLedgerSummary,
  };
}

function buildOutputSummary(
  input: ForecastInput,
  summary: {
    forecastRunExternalId: string;
    openingCashCents: number;
    minCashBalanceCents: number;
    maxShortfallCents: number;
    shortfallDate: string | null;
    totalExpectedInflowCents: number;
    totalExpectedOutflowCents: number;
    totalExpectedImpactCents: number;
    actionCount: number;
  },
): Record<string, unknown> {
  return {
    generated_by: CP3_FORECAST_GENERATOR,
    model_version: input.modelVersion,
    modelVersion: input.modelVersion,
    case_id: input.caseId,
    caseId: input.caseId,
    external_id: summary.forecastRunExternalId,
    externalId: summary.forecastRunExternalId,
    opening_cash_cents: summary.openingCashCents,
    openingCashCents: summary.openingCashCents,
    minimum_cash_cents: summary.minCashBalanceCents,
    minimumCashCents: summary.minCashBalanceCents,
    minimum_cash_target_cents: input.minimumCashTargetCents,
    min_cash_balance_cents: summary.minCashBalanceCents,
    max_shortfall_cents: summary.maxShortfallCents,
    shortfall_date: summary.shortfallDate,
    total_expected_inflow_cents: summary.totalExpectedInflowCents,
    total_expected_outflow_cents: summary.totalExpectedOutflowCents,
    net_cashflow_cents: summary.totalExpectedInflowCents - summary.totalExpectedOutflowCents,
    action_count: summary.actionCount,
    total_expected_impact_cents: summary.totalExpectedImpactCents,
    rules: [
      "opening cash is the sum of active cash account balances",
      "open and partially paid invoices become expected inflows on due date, or horizon start when overdue",
      "scheduled and overdue obligations become expected outflows on due date, or horizon start when overdue",
      "pending payments are included by payment date and direction",
      "approval-gated actions are proposed for forecast shortfalls first, then high-value receivables",
    ],
  };
}

function buildActionPlanRationale(
  input: ForecastInput,
  summary: {
    actions: ForecastAction[];
    maxShortfallCents: number;
    shortfallDate: string | null;
  },
): string {
  if (summary.actions.length === 0) {
    return "No approval-gated recovery action met the deterministic shortfall or high-value receivable rules.";
  }

  if (summary.maxShortfallCents > 0) {
    return `Forecast shows a ${formatCurrencyCents(summary.maxShortfallCents, input.currencyCode)} cash shortfall${summary.shortfallDate ? ` on ${summary.shortfallDate}` : ""}; recommended actions remain approval-gated.`;
  }

  return `No cash shortfall is projected, but high-value receivables above ${formatCurrencyCents(input.highValueReceivableCents, input.currencyCode)} are ready for review.`;
}

function metricPoint(
  input: ForecastInput,
  pointDate: string,
  metric: ForecastMetric,
  amountCents: number,
  drivers: Record<string, unknown>,
): ForecastPoint {
  return {
    pointDate,
    metric,
    amountCents,
    cashAccountId: null,
    confidence: 0.9,
    drivers,
  };
}

function isReceivableForecastable(invoice: ForecastInvoice, currencyCode: string): boolean {
  return (
    invoice.currencyCode === currencyCode &&
    invoice.amountDueCents > 0 &&
    ["open", "partially_paid", "disputed"].includes(invoice.state)
  );
}

function isObligationForecastable(obligation: ForecastObligation, currencyCode: string): boolean {
  return (
    obligation.currencyCode === currencyCode &&
    obligation.amountCents > 0 &&
    ["scheduled", "overdue"].includes(obligation.state)
  );
}

function isPendingPaymentForecastable(payment: ForecastPayment, currencyCode: string): boolean {
  return payment.currencyCode === currencyCode && payment.amountCents > 0 && payment.state === "pending";
}

function effectiveForecastDate(date: string, horizonStart: string, horizonEnd: string): string | null {
  if (date > horizonEnd) {
    return null;
  }

  if (date < horizonStart) {
    return horizonStart;
  }

  return date;
}

function flowForDate(flowByDate: Map<string, DailyFlows>, pointDate: string): DailyFlows {
  const existing = flowByDate.get(pointDate);
  if (existing) {
    return existing;
  }

  const flows = { inflows: [], outflows: [] };
  flowByDate.set(pointDate, flows);
  return flows;
}

function sumAmounts(drivers: FlowDriver[]): number {
  return drivers.reduce((total, driver) => total + driver.amountCents, 0);
}

function summarizeDriver(driver: FlowDriver): Record<string, unknown> {
  return {
    source_type: driver.sourceType,
    source_id: driver.sourceId,
    external_id: driver.externalId,
    label: driver.label,
    amount_cents: driver.amountCents,
    original_date: driver.originalDate,
    effective_date: driver.effectiveDate,
    state: driver.state,
  };
}

function buildDriverNotes(flows: DailyFlows): string[] {
  const notes: string[] = [];

  if (flows.inflows.length > 0) {
    notes.push(`${flows.inflows.length} expected inflow driver(s): ${flows.inflows.map((flow) => flow.label).join(", ")}`);
  }

  if (flows.outflows.length > 0) {
    notes.push(`${flows.outflows.length} expected outflow driver(s): ${flows.outflows.map((flow) => flow.label).join(", ")}`);
  }

  return notes;
}

function compareReceivablePriority(horizonStart: string) {
  return (left: ForecastInvoice, right: ForecastInvoice): number => {
    const leftOverdue = left.dueDate < horizonStart ? 1 : 0;
    const rightOverdue = right.dueDate < horizonStart ? 1 : 0;

    if (leftOverdue !== rightOverdue) {
      return rightOverdue - leftOverdue;
    }

    if (left.amountDueCents !== right.amountDueCents) {
      return right.amountDueCents - left.amountDueCents;
    }

    return left.dueDate.localeCompare(right.dueDate) || left.invoiceNumber.localeCompare(right.invoiceNumber);
  };
}

function compareObligationPriority(left: ForecastObligation, right: ForecastObligation): number {
  if (left.priorityRank !== right.priorityRank) {
    return left.priorityRank - right.priorityRank;
  }

  if (left.amountCents !== right.amountCents) {
    return right.amountCents - left.amountCents;
  }

  return left.dueDate.localeCompare(right.dueDate);
}

function actionDueAt(horizonStart: string, priorityRank: number): string {
  const date = new Date(`${horizonStart}T09:00:00.000Z`);
  date.setUTCHours(9 + Math.min(priorityRank - 1, 6), 0, 0, 0);
  return date.toISOString();
}

function eachDate(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    dates.push(toDateString(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function assertDateRange(startDate: string, endDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("Forecast horizon dates must use YYYY-MM-DD.");
  }

  if (endDate < startDate) {
    throw new Error(`Forecast horizon end ${endDate} is before start ${startDate}.`);
  }
}

function formatCurrencyCents(cents: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
