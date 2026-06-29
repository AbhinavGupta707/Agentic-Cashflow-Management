export type Cp3SectionState = "ready" | "unavailable";

export type Cp3ForecastDriver = {
  label: string;
  detail: string | null;
  amountCents: number | null;
  sourceKind: string | null;
};

export type Cp3ForecastPoint = {
  pointDate: string;
  expectedCashCents: number;
  inflowCents: number;
  outflowCents: number;
  netCashflowCents: number;
  shortfallCents: number;
  confidence: number | null;
  notes: string | null;
  drivers: Cp3ForecastDriver[];
};

export type Cp3ForecastRunSummary = {
  externalId: string;
  state: string;
  scenario: string;
  modelVersion: string;
  horizonStartDate: string;
  horizonEndDate: string;
  openingCashCents: number;
  minimumCashCents: number;
  minimumProjectedCashCents: number | null;
  totalShortfallCents: number;
  pointCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type Cp3ForecastState = {
  state: Cp3SectionState;
  message: string;
  run: Cp3ForecastRunSummary | null;
  points: Cp3ForecastPoint[];
  shortfallPoints: Cp3ForecastPoint[];
  drivers: Cp3ForecastDriver[];
};

export type Cp3ActionPlanSummary = {
  externalId: string;
  name: string;
  state: string;
  totalExpectedImpactCents: number;
  rationale: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Cp3RecommendedAction = {
  externalId: string;
  actionType: string;
  state: string;
  priority: string;
  priorityRank: number;
  title: string;
  rationale: string | null;
  expectedCashImpactCents: number;
  scheduledFor: string | null;
  customer: {
    externalId: string | null;
    name: string | null;
  };
  invoice: {
    externalId: string | null;
    invoiceNumber: string | null;
  };
  obligation: {
    externalId: string | null;
    title: string | null;
  };
  approval: {
    required: boolean;
    state: string;
    requestedAt: string | null;
    decidedAt: string | null;
    expiresAt: string | null;
    message: string;
  };
  execution: {
    state: "not_enabled_cp3" | "provider_log_present";
    message: string;
    providerExecutionCount: number;
  };
};

export type Cp3ActionState = {
  state: Cp3SectionState;
  message: string;
  plan: Cp3ActionPlanSummary | null;
  recommendedActions: Cp3RecommendedAction[];
  totals: {
    actionCount: number;
    needsApprovalCount: number;
    expectedImpactCents: number;
  };
};

export type Cp3AgentRunSummary = {
  id: string;
  runKind: string;
  graphName: string;
  state: string;
  errorMessage: string | null;
  traceAvailable: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Cp3AgentCheckpointSummary = {
  checkpointKey: string;
  label: string;
  stage: string | null;
  createdAt: string;
};

export type Cp3AgentState = {
  state: Cp3SectionState;
  message: string;
  runs: Cp3AgentRunSummary[];
  checkpoints: Cp3AgentCheckpointSummary[];
};

export type Cp3ProviderKey = "aurora" | "fireworks" | "langsmith" | "gmail" | "voice";

export type Cp3ProviderStatus = {
  key: Cp3ProviderKey;
  name: string;
  status: "connected" | "configured" | "optional_unconfigured" | "unavailable";
  capability: string;
  configured: boolean;
  executionEnabled: boolean;
  message: string;
  lastExecution: {
    provider: string;
    operation: string;
    state: string;
    attempts: number;
    lastError: string | null;
    updatedAt: string;
  } | null;
};

export type Cp4EmailDraftPreview = {
  idempotencyKey: string;
  channel: "email";
  provider: string | null;
  subject: string | null;
  bodyPreview: string;
  state: string;
  generatedByAgentRunId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Cp4CommunicationMessageSummary = {
  provider: string | null;
  providerMessageId: string | null;
  direction: string;
  state: string;
  subject: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  updatedAt: string;
};

export type Cp4ProviderExecutionSummary = {
  provider: string;
  operation: string;
  state: string;
  providerExecutionId: string | null;
  attempts: number;
  lastError: string | null;
  attemptedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type Cp4EmailApprovalItem = {
  actionExternalId: string;
  actionState: string;
  actionType: string;
  title: string;
  expectedCashImpactCents: number;
  customer: {
    externalId: string | null;
    name: string | null;
  };
  contact: {
    fullName: string | null;
    email: string | null;
    role: string | null;
  };
  invoice: {
    externalId: string | null;
    invoiceNumber: string | null;
  };
  approval: {
    required: boolean;
    state: string;
    requestedAt: string | null;
    decidedAt: string | null;
    expiresAt: string | null;
    message: string;
  };
  draft: Cp4EmailDraftPreview | null;
  sendEligibility: {
    eligible: boolean;
    reason: string;
    blockers: string[];
  };
  lastMessage: Cp4CommunicationMessageSummary | null;
  lastProviderExecution: Cp4ProviderExecutionSummary | null;
};

export type Cp4EmailApprovalState = {
  state: Cp3SectionState;
  message: string;
  provider: Cp3ProviderStatus;
  items: Cp4EmailApprovalItem[];
  totals: {
    actionCount: number;
    draftCount: number;
    approvedCount: number;
    rejectedCount: number;
    sendEligibleCount: number;
    providerExecutionCount: number;
  };
};

export type Cp3ForecastCockpitState = {
  companyExternalId: string;
  caseId: string;
  currency: string;
  generatedAt: string;
  forecast: Cp3ForecastState;
  actionPlan: Cp3ActionState;
  cp4EmailApproval: Cp4EmailApprovalState;
  agent: Cp3AgentState;
  providers: Cp3ProviderStatus[];
};

export type Cp3ForecastCockpitApiResponse =
  | {
      status: "ok";
      data: Cp3ForecastCockpitState;
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

export const CP3_FORECAST_COCKPIT_CONTRACT_NOTES = [
  "GET /api/cp3/forecast-cockpit is read-only and never executes provider actions",
  "top-level unavailable means Aurora Data API configuration is absent; section-level unavailable means CP3 data is not persisted yet",
  "provider request/response payloads, OAuth tokens, raw uploaded bytes, and hidden env values are intentionally excluded",
  "Gmail execution stays approval-gated and disabled unless an action is approved and the provider status explicitly permits execution",
] as const;
