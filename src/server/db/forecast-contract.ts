export const FORECAST_METRICS = [
  "cash_balance",
  "expected_inflow",
  "expected_outflow",
  "net_cashflow",
  "shortfall",
] as const;

export type ForecastMetric = (typeof FORECAST_METRICS)[number];

export type ForecastCashAccount = {
  id: string;
  name: string;
  accountType: string;
  currencyCode: string;
  currentBalanceCents: number;
  balanceAsOf: string;
};

export type ForecastInvoice = {
  id: string;
  externalId: string;
  invoiceNumber: string;
  customerId: string;
  customerExternalId: string;
  customerName: string;
  dueDate: string;
  currencyCode: string;
  amountTotalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  state: string;
  riskTier: string;
  paymentTermsDays: number;
  description: string | null;
};

export type ForecastObligation = {
  id: string;
  externalId: string;
  title: string;
  counterpartyName: string;
  category: string;
  obligationType: string;
  dueDate: string;
  currencyCode: string;
  amountCents: number;
  state: string;
  priorityRank: number;
};

export type ForecastPayment = {
  id: string;
  externalId: string;
  paymentDate: string;
  direction: "inflow" | "outflow";
  currencyCode: string;
  amountCents: number;
  state: string;
  provider: string | null;
  invoiceId: string | null;
  obligationId: string | null;
  customerId: string | null;
};

export type ForecastEventLedgerSummary = {
  aggregateType: string;
  eventType: string;
  eventCount: number;
  latestOccurredAt: string;
};

export type ForecastInput = {
  tenantId: string;
  companyId: string;
  companyExternalId: string;
  companyName: string;
  caseId: string;
  currencyCode: string;
  horizonStart: string;
  horizonEnd: string;
  scenario: string;
  modelVersion: string;
  minimumCashTargetCents: number;
  highValueReceivableCents: number;
  latestEventLedgerId: string | null;
  cashAccounts: ForecastCashAccount[];
  invoices: ForecastInvoice[];
  obligations: ForecastObligation[];
  payments: ForecastPayment[];
  eventLedgerSummary: ForecastEventLedgerSummary[];
};

export type ForecastPoint = {
  pointDate: string;
  metric: ForecastMetric;
  amountCents: number;
  cashAccountId: string | null;
  confidence: number;
  drivers: Record<string, unknown>;
};

export type ForecastDailyPoint = {
  pointDate: string;
  cashBalanceCents: number;
  expectedInflowCents: number;
  expectedOutflowCents: number;
  netCashflowCents: number;
  shortfallCents: number;
  driverNotes: string[];
};

export type ForecastAction = {
  externalId: string;
  idempotencyKey: string;
  actionType: "collect_invoice" | "send_reminder" | "call_customer" | "defer_obligation" | "manual_review";
  title: string;
  rationale: string;
  priority: "low" | "medium" | "high" | "urgent";
  state: "proposed" | "needs_approval";
  currencyCode: string;
  expectedCashImpactCents: number;
  dueAt: string | null;
  customerId: string | null;
  customerExternalId: string | null;
  invoiceId: string | null;
  invoiceExternalId: string | null;
  obligationId: string | null;
  metadata: Record<string, unknown>;
};

export type DeterministicForecastResult = {
  forecastRunExternalId: string;
  forecastRunIdempotencyKey: string;
  actionPlanExternalId: string;
  actionPlanIdempotencyKey: string;
  actionPlanName: string;
  actionPlanRationale: string;
  totalExpectedImpactCents: number;
  minCashBalanceCents: number;
  maxShortfallCents: number;
  shortfallDate: string | null;
  totalExpectedInflowCents: number;
  totalExpectedOutflowCents: number;
  inputSnapshot: Record<string, unknown>;
  outputSummary: Record<string, unknown>;
  dailyPoints: ForecastDailyPoint[];
  points: ForecastPoint[];
  actions: ForecastAction[];
};
