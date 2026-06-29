import type { Cp3ProviderStatus } from "./cp3-forecast-cockpit-contract";

export type ProductSourceState = "ready" | "unavailable" | "partial";

export type ProductDataSource = {
  state: ProductSourceState;
  source: "aurora" | "provider_env" | "computed";
  message: string;
  unavailableReason: string | null;
};

export type ProductMoneyMetric = {
  label: string;
  valueCents: number | null;
  currency: string;
  source: ProductDataSource;
};

export type ProductDateMetric = {
  label: string;
  date: string | null;
  daysFromToday: number | null;
  source: ProductDataSource;
};

export type ProductOverviewChartPoint = {
  date: string;
  expectedCashCents: number;
  inflowCents: number;
  outflowCents: number;
  netCashflowCents: number;
  shortfallCents: number;
};

export type ProductOverviewAction = {
  externalId: string;
  title: string;
  priority: string;
  actionType: string;
  expectedCashImpactCents: number;
  rationale: string | null;
  customerName: string | null;
  approvalState: string;
  dueAt: string | null;
  source: ProductDataSource;
};

export type ProductOverviewApproval = {
  actionExternalId: string;
  title: string;
  approvalState: string;
  requestedAt: string | null;
  expiresAt: string | null;
  customerName: string | null;
  draftSubject: string | null;
  blockers: string[];
  source: ProductDataSource;
};

export type ProductOverviewAgentStatus = {
  key: string;
  label: string;
  state: string;
  lastUpdatedAt: string | null;
  traceAvailable: boolean;
  message: string;
  source: ProductDataSource;
};

export type ProductOverviewState = {
  company: {
    externalId: string;
    name: string;
    industry: string | null;
    baseCurrency: string;
    timezone: string;
  };
  case: {
    id: string;
    label: string;
  };
  source: ProductDataSource;
  lastUpdatedAt: string;
  cash: {
    currentCash: ProductMoneyMetric;
    projectedLowPoint: ProductMoneyMetric & {
      date: string | null;
    };
    runway: ProductDateMetric & {
      status: "safe" | "watch" | "critical" | "unknown";
    };
    upcomingPayroll: ProductMoneyMetric & {
      dueDate: string | null;
      obligationExternalId: string | null;
    };
    upcomingObligations: ProductMoneyMetric & {
      count: number;
      nextDueDate: string | null;
    };
  };
  chart: {
    state: ProductSourceState;
    source: ProductDataSource;
    series: ProductOverviewChartPoint[];
  };
  criticalActions: ProductOverviewAction[];
  approvalsNeeded: ProductOverviewApproval[];
  agentStatuses: ProductOverviewAgentStatus[];
  providerReadiness: {
    source: ProductDataSource;
    providers: Cp3ProviderStatus[];
    configuredCount: number;
    unavailableCount: number;
  };
};

export type ProductOverviewApiResponse =
  | {
      status: "ok";
      data: ProductOverviewState;
    }
  | {
      status: "unavailable";
      message: string;
      missingEnv: string[];
    }
  | {
      status: "error";
      message: string;
    };
