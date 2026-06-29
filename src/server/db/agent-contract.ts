import type { ProviderStatus } from "./provider-status-contract";

export const CASHFLOW_AGENT_GRAPH_NAME = "cashflow.forecast_recommendation_draft.v1";

export type CashflowAgentRunKind = "forecast" | "recommendation";

export type CashflowGraphInput = {
  tenantId: string;
  companyId?: string | null;
  companyExternalId?: string;
  caseId?: string;
  runKind?: CashflowAgentRunKind;
  idempotencyKey?: string;
};

export type CashflowForecastSummary = {
  source: "forecast_contract" | "case_state" | "deterministic_snapshot";
  runExternalId: string | null;
  horizonStartDate: string | null;
  horizonEndDate: string | null;
  openingCashCents: number;
  minimumCashCents: number;
  shortfallCents: number;
  baseCurrency: string;
  points: Array<{
    pointDate: string;
    expectedCashCents: number;
    inflowCents: number;
    outflowCents: number;
    notes: string | null;
  }>;
};

export type CashflowRecommendation = {
  externalId: string;
  actionType: string;
  priority: number;
  title: string;
  customerExternalId: string;
  customerName: string;
  invoiceExternalId: string | null;
  expectedRecoveryCents: number;
  rationale: string;
  approvalRequired: boolean;
  scheduledFor: string | null;
  source: "action_plan" | "deterministic_invoice";
};

export type CashflowDraft = {
  source: "fireworks" | "deterministic_fallback";
  channel: "email";
  subject: string;
  body: string;
  actionExternalId: string | null;
  customerExternalId: string | null;
};

export type CashflowGraphOutput = {
  graphName: typeof CASHFLOW_AGENT_GRAPH_NAME;
  runKind: CashflowAgentRunKind;
  agentRunId: string | null;
  tenantId: string;
  companyId: string | null;
  companyExternalId: string;
  caseId: string;
  forecast: CashflowForecastSummary;
  recommendations: CashflowRecommendation[];
  draft: CashflowDraft;
  providerStatuses: {
    fireworks: ProviderStatus;
    langsmith: ProviderStatus;
  };
  checkpointKeys: string[];
  traceUrl: string | null;
};
