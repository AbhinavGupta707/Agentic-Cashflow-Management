import type { ProductDataSource, ProductSourceState } from "./product-overview-contract";

export type ProductScenarioAssumptions = {
  paymentAccelerationDays: number;
  receivableCollectionRateBps: number;
  supplierDeferralDays: number;
  discretionarySpendReductionBps: number;
  minimumCashTargetCents: number | null;
};

export type ProductScenarioKey = "baseline" | "optimistic" | "conservative" | "preview";

export type ProductScenarioPoint = {
  date: string;
  expectedCashCents: number;
  inflowCents: number;
  outflowCents: number;
  netCashflowCents: number;
  shortfallCents: number;
};

export type ProductScenarioProjection = {
  key: ProductScenarioKey;
  label: string;
  source: ProductDataSource;
  assumptions: ProductScenarioAssumptions;
  summary: {
    openingCashCents: number;
    minimumCashCents: number;
    minimumCashDate: string | null;
    maxShortfallCents: number;
    shortfallDate: string | null;
    totalInflowCents: number;
    totalOutflowCents: number;
    endingCashCents: number;
    endingCashDate: string | null;
    runwayDays: number | null;
  };
  series: ProductScenarioPoint[];
};

export type ProductScenarioControl = {
  key: keyof ProductScenarioAssumptions;
  label: string;
  value: number | null;
  min: number;
  max: number;
  step: number;
  unit: "days" | "bps" | "cents";
  source: ProductDataSource;
};

export type ProductScenarioComparisonCard = {
  key: ProductScenarioKey;
  label: string;
  minimumCashCents: number;
  changeVsBaselineCents: number;
  runwayDays: number | null;
  shortfallCents: number;
  source: ProductDataSource;
};

export type ProductScenarioActionPlanItem = {
  title: string;
  actionType: string;
  expectedCashImpactCents: number;
  rationale: string;
  priority: string;
  source: ProductDataSource;
};

export type ProductScenarioSensitivityRow = {
  driver: string;
  baselineValue: string;
  upsideCents: number;
  downsideCents: number;
  note: string;
  source: ProductDataSource;
};

export type ProductScenariosState = {
  company: {
    externalId: string;
    name: string;
    baseCurrency: string;
  };
  caseId: string;
  generatedAt: string;
  state: ProductSourceState;
  source: ProductDataSource;
  horizon: {
    startDate: string;
    endDate: string;
    days: number;
    source: ProductDataSource;
  };
  controls: ProductScenarioControl[];
  projections: ProductScenarioProjection[];
  comparisonCards: ProductScenarioComparisonCard[];
  recommendedActionPlan: ProductScenarioActionPlanItem[];
  sensitivityRows: ProductScenarioSensitivityRow[];
};

export type ProductScenarioPreviewRequest = {
  companyId?: string;
  caseId?: string;
  assumptions: Partial<ProductScenarioAssumptions>;
};

export type ProductScenarioPreviewState = {
  company: ProductScenariosState["company"];
  caseId: string;
  generatedAt: string;
  projection: ProductScenarioProjection;
  comparisonVsBaseline: ProductScenarioComparisonCard;
};

export type ProductScenariosApiResponse =
  | {
      status: "ok";
      data: ProductScenariosState;
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

export type ProductScenarioPreviewApiResponse =
  | {
      status: "ok";
      data: ProductScenarioPreviewState;
    }
  | {
      status: "invalid_request";
      message: string;
      issues: string[];
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
