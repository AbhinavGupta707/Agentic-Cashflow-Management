export type CompanyCaseState = {
  company: {
    externalId: string;
    name: string;
    industry: string | null;
    baseCurrency: string;
    cashBalanceCents: number;
  };
  caseId: string;
  customers: Array<{
    externalId: string;
    name: string;
    segment: string | null;
    paymentTermsDays: number | null;
    riskScore: number | null;
    primaryContact: {
      fullName: string;
      email: string;
      role: string | null;
    } | null;
  }>;
  invoices: Array<{
    externalId: string;
    invoiceNumber: string;
    customerExternalId: string;
    customerName: string;
    dueDate: string;
    currency: string;
    amountCents: number;
    amountPaidCents: number;
    outstandingCents: number;
    status: string;
    description: string | null;
  }>;
  obligations: Array<{
    externalId: string;
    title: string;
    vendorName: string;
    category: string;
    dueDate: string;
    currency: string;
    amountCents: number;
    status: string;
    priority: number;
  }>;
  forecast: {
    runExternalId: string;
    horizonStartDate: string;
    horizonEndDate: string;
    openingCashCents: number;
    minimumCashCents: number;
    points: Array<{
      pointDate: string;
      expectedCashCents: number;
      inflowCents: number;
      outflowCents: number;
      notes: string | null;
    }>;
  } | null;
  recommendedActions: Array<{
    externalId: string;
    actionType: string;
    status: string;
    priority: number;
    title: string;
    customerExternalId: string;
    customerName: string;
    invoiceExternalId: string | null;
    expectedRecoveryCents: number;
    rationale: string;
    approvalRequired: boolean;
    scheduledFor: string | null;
  }>;
  memoryFacts: Array<{
    externalId: string;
    customerExternalId: string;
    customerName: string;
    factText: string;
    confidence: number | null;
    sourceKind: string | null;
  }>;
};

export type CurrentCaseApiResponse =
  | {
      status: "ok";
      data: CompanyCaseState;
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

export const CASE_STATE_SCHEMA_ASSUMPTIONS = [
  "tenant-scoped domain rows use table ids for joins and first-class external_id columns for demo upserts/read models",
  "money is persisted in Aurora numeric currency columns and projected to integer cents in the repository contract",
  "the current demo case is identified through deterministic forecast/action metadata and idempotency keys",
  "memory_chunks stores seeded facts in content plus an optional vector(1024) embedding",
] as const;

export const DEFAULT_DEMO_COMPANY_ID = "cmp_marlow_finch";
export const DEFAULT_DEMO_CASE_ID = "case_payroll_2026_05_08";
