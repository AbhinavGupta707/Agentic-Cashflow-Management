import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import {
  CASHFLOW_AGENT_GRAPH_NAME,
  type CashflowDraft,
  type CashflowForecastSummary,
  type CashflowGraphInput,
  type CashflowGraphOutput,
  type CashflowRecommendation,
} from "../db/agent-contract";
import { DEFAULT_DEMO_CASE_ID, DEFAULT_DEMO_COMPANY_ID } from "../db/case-state-contract";
import type { ProviderStatus } from "../db/provider-status-contract";
import { scopedIdempotencyKey } from "../ingestion/idempotency";
import { createFireworksProvider, type FireworksProvider } from "../providers/fireworks";
import { createLangSmithRunConfig, getLangSmithTracingStatus } from "../providers/langsmith";
import {
  completeAgentRun,
  failAgentRun,
  saveAgentCheckpoint,
  startAgentRun,
  type AgentRunRecord,
} from "../repositories/agent-runs";
import { getCurrentCaseState, type CompanyCaseState } from "../repositories/case-state";
import type { AuroraDataApiClient } from "../aws/rds-data-api";

type ResolvedCashflowGraphInput = Required<Pick<CashflowGraphInput, "tenantId" | "companyExternalId" | "caseId">> &
  Pick<CashflowGraphInput, "companyId"> & {
    graphName: typeof CASHFLOW_AGENT_GRAPH_NAME;
    runKind: NonNullable<CashflowGraphInput["runKind"]>;
    idempotencyKey: string;
  };

type ProviderStatuses = {
  fireworks: ProviderStatus;
  langsmith: ProviderStatus;
};

const CashflowGraphState = Annotation.Root({
  input: Annotation<ResolvedCashflowGraphInput>(),
  agentRun: Annotation<AgentRunRecord | null>(),
  caseState: Annotation<CompanyCaseState | null>(),
  forecast: Annotation<CashflowForecastSummary | null>(),
  recommendations: Annotation<CashflowRecommendation[]>(),
  draft: Annotation<CashflowDraft | null>(),
  providerStatuses: Annotation<ProviderStatuses>(),
  checkpointKeys: Annotation<string[], string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  traceUrl: Annotation<string | null>(),
  output: Annotation<CashflowGraphOutput | null>(),
});

type CashflowGraphStateValue = typeof CashflowGraphState.State;

export type RunCashflowAgentGraphOptions = {
  dataApi?: AuroraDataApiClient;
  caseState?: CompanyCaseState;
  fireworksProvider?: FireworksProvider;
  env?: NodeJS.ProcessEnv;
  persist?: boolean;
};

export async function runCashflowAgentGraph(
  input: CashflowGraphInput,
  options: RunCashflowAgentGraphOptions = {},
): Promise<CashflowGraphOutput> {
  const resolvedInput = resolveGraphInput(input);
  const persist = options.persist ?? true;
  const fireworksProvider = options.fireworksProvider ?? createFireworksProvider({ env: options.env });
  const langsmithStatus = getLangSmithTracingStatus(options.env);
  const runState: { startedRun: AgentRunRecord | null } = { startedRun: null };

  const initialState: CashflowGraphStateValue = {
    input: resolvedInput,
    agentRun: null,
    caseState: options.caseState ?? null,
    forecast: null,
    recommendations: [],
    draft: null,
    providerStatuses: {
      fireworks: fireworksProvider.getStatus(),
      langsmith: langsmithStatus,
    },
    checkpointKeys: [],
    traceUrl: null,
    output: null,
  };

  const persistCheckpoint = async (
    state: CashflowGraphStateValue,
    checkpointKey: string,
    statePayload: unknown,
    metadata: Record<string, unknown> = {},
  ): Promise<string[]> => {
    if (!persist || !state.agentRun) {
      return [checkpointKey];
    }

    await saveAgentCheckpoint(
      {
        tenantId: state.input.tenantId,
        agentRunId: state.agentRun.id,
        checkpointKey,
        statePayload,
        metadata: {
          graphName: state.input.graphName,
          caseId: state.input.caseId,
          ...metadata,
        },
      },
      options.dataApi,
    );

    return [checkpointKey];
  };

  const graph = new StateGraph(CashflowGraphState)
    .addNode("startRun", async (state: CashflowGraphStateValue) => {
      if (!persist) {
        return {
          checkpointKeys: ["graph.started"],
        };
      }

      const run = await startAgentRun(
        {
          tenantId: state.input.tenantId,
          companyId: state.input.companyId ?? null,
          runKind: state.input.runKind,
          graphName: state.input.graphName,
          inputPayload: state.input,
          idempotencyKey: state.input.idempotencyKey,
          traceUrl: state.traceUrl,
        },
        options.dataApi,
      );

      runState.startedRun = run;

      await saveAgentCheckpoint(
        {
          tenantId: state.input.tenantId,
          agentRunId: run.id,
          checkpointKey: "graph.started",
          statePayload: {
            input: state.input,
            providerStatuses: state.providerStatuses,
          },
          metadata: {
            graphName: state.input.graphName,
            caseId: state.input.caseId,
          },
        },
        options.dataApi,
      );

      return {
        agentRun: run,
        checkpointKeys: ["graph.started"],
      };
    })
    .addNode("loadForecast", async (state: CashflowGraphStateValue) => {
      const caseState =
        state.caseState ??
        (await getCurrentCaseState({
          dataApi: options.dataApi,
          companyExternalId: state.input.companyExternalId,
          caseId: state.input.caseId,
        }));
      const forecast = buildForecastSummary(caseState);
      const checkpointKeys = await persistCheckpoint(
        {
          ...state,
          caseState,
          forecast,
        },
        "forecast.snapshot",
        {
          company: caseState.company,
          forecast,
        },
        {
          source: forecast.source,
        },
      );

      return {
        caseState,
        forecast,
        checkpointKeys,
      };
    })
    .addNode("buildRecommendations", async (state: CashflowGraphStateValue) => {
      const caseState = requireStateValue(state.caseState, "case state");
      const recommendations = buildRecommendations(caseState);
      const checkpointKeys = await persistCheckpoint(
        {
          ...state,
          recommendations,
        },
        "recommendation.plan",
        {
          recommendationCount: recommendations.length,
          recommendations,
        },
      );

      return {
        recommendations,
        checkpointKeys,
      };
    })
    .addNode("generateDraft", async (state: CashflowGraphStateValue) => {
      const caseState = requireStateValue(state.caseState, "case state");
      const forecast = requireStateValue(state.forecast, "forecast summary");
      const topAction = state.recommendations[0] ?? null;
      const draftResult = await fireworksProvider.generateCollectionDraft({
        companyName: caseState.company.name,
        baseCurrency: caseState.company.baseCurrency,
        forecastShortfallCents: forecast.shortfallCents,
        action: topAction
          ? {
              externalId: topAction.externalId,
              title: topAction.title,
              customerExternalId: topAction.customerExternalId,
              customerName: topAction.customerName,
              invoiceExternalId: topAction.invoiceExternalId,
              expectedRecoveryCents: topAction.expectedRecoveryCents,
              rationale: topAction.rationale,
            }
          : null,
        memoryFacts: topAction ? selectMemoryFacts(caseState, topAction.customerExternalId) : [],
      });
      const providerStatuses = {
        ...state.providerStatuses,
        fireworks: draftResult.providerStatus,
      };
      const checkpointKeys = await persistCheckpoint(
        {
          ...state,
          draft: draftResult.draft,
          providerStatuses,
        },
        "draft.generated",
        {
          draft: draftResult.draft,
          providerStatus: draftResult.providerStatus,
        },
        {
          draftSource: draftResult.draft.source,
        },
      );

      return {
        draft: draftResult.draft,
        providerStatuses,
        checkpointKeys,
      };
    })
    .addNode("finalizeRun", async (state: CashflowGraphStateValue) => {
      const checkpointKey = "graph.completed";
      const output = buildGraphOutput(state, [...state.checkpointKeys, checkpointKey]);
      const checkpointKeys = await persistCheckpoint(
        {
          ...state,
          output,
        },
        checkpointKey,
        {
          output,
        },
      );

      if (!persist || !state.agentRun) {
        return {
          output,
          checkpointKeys,
        };
      }

      const completedRun = await completeAgentRun(
        {
          tenantId: state.input.tenantId,
          agentRunId: state.agentRun.id,
          outputPayload: output,
          traceUrl: output.traceUrl,
        },
        options.dataApi,
      );
      const completedOutput = {
        ...output,
        agentRunId: completedRun.id,
        traceUrl: completedRun.traceUrl,
      };

      return {
        agentRun: completedRun,
        output: completedOutput,
        checkpointKeys,
      };
    })
    .addEdge(START, "startRun")
    .addEdge("startRun", "loadForecast")
    .addEdge("loadForecast", "buildRecommendations")
    .addEdge("buildRecommendations", "generateDraft")
    .addEdge("generateDraft", "finalizeRun")
    .addEdge("finalizeRun", END)
    .compile();

  const runConfig = createLangSmithRunConfig({
    status: langsmithStatus,
    runName: resolvedInput.graphName,
    tenantId: resolvedInput.tenantId,
    companyExternalId: resolvedInput.companyExternalId,
    caseId: resolvedInput.caseId,
  });

  try {
    const finalState = await graph.invoke(initialState, runConfig);
    return requireStateValue(finalState.output, "graph output");
  } catch (error) {
    if (persist && runState.startedRun) {
      await failAgentRun(
        {
          tenantId: resolvedInput.tenantId,
          agentRunId: runState.startedRun.id,
          errorMessage: error instanceof Error ? error.message : "Cashflow agent graph failed.",
        },
        options.dataApi,
      );
    }

    throw error;
  }
}

function resolveGraphInput(input: CashflowGraphInput): ResolvedCashflowGraphInput {
  const companyExternalId = input.companyExternalId ?? process.env.DEMO_COMPANY_ID ?? DEFAULT_DEMO_COMPANY_ID;
  const caseId = input.caseId ?? process.env.DEMO_CASE_ID ?? DEFAULT_DEMO_CASE_ID;
  const runKind = input.runKind ?? "recommendation";

  return {
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    companyExternalId,
    caseId,
    runKind,
    graphName: CASHFLOW_AGENT_GRAPH_NAME,
    idempotencyKey:
      input.idempotencyKey ??
      scopedIdempotencyKey(["agent-run", CASHFLOW_AGENT_GRAPH_NAME, runKind, companyExternalId, caseId]),
  };
}

function buildForecastSummary(caseState: CompanyCaseState): CashflowForecastSummary {
  if (caseState.forecast) {
    return {
      source: "forecast_contract",
      runExternalId: caseState.forecast.runExternalId,
      horizonStartDate: caseState.forecast.horizonStartDate,
      horizonEndDate: caseState.forecast.horizonEndDate,
      openingCashCents: caseState.forecast.openingCashCents,
      minimumCashCents: caseState.forecast.minimumCashCents,
      shortfallCents: Math.max(0, -caseState.forecast.minimumCashCents),
      baseCurrency: caseState.company.baseCurrency,
      points: caseState.forecast.points,
    };
  }

  const events = [
    ...caseState.obligations
      .filter((obligation) => obligation.status !== "paid")
      .map((obligation) => ({
        date: obligation.dueDate,
        inflowCents: 0,
        outflowCents: obligation.amountCents,
        notes: `Obligation due: ${obligation.title}`,
      })),
    ...caseState.invoices
      .filter((invoice) => invoice.outstandingCents > 0)
      .map((invoice) => ({
        date: invoice.dueDate,
        inflowCents: invoice.outstandingCents,
        outflowCents: 0,
        notes: `Expected invoice recovery: ${invoice.invoiceNumber}`,
      })),
  ].sort((left, right) => left.date.localeCompare(right.date));

  let runningCashCents = caseState.company.cashBalanceCents;
  let minimumCashCents = runningCashCents;
  const points = events.map((event) => {
    runningCashCents += event.inflowCents - event.outflowCents;
    minimumCashCents = Math.min(minimumCashCents, runningCashCents);

    return {
      pointDate: event.date,
      expectedCashCents: runningCashCents,
      inflowCents: event.inflowCents,
      outflowCents: event.outflowCents,
      notes: event.notes,
    };
  });

  return {
    source: "deterministic_snapshot",
    runExternalId: null,
    horizonStartDate: points[0]?.pointDate ?? null,
    horizonEndDate: points.at(-1)?.pointDate ?? null,
    openingCashCents: caseState.company.cashBalanceCents,
    minimumCashCents,
    shortfallCents: Math.max(0, -minimumCashCents),
    baseCurrency: caseState.company.baseCurrency,
    points,
  };
}

function buildRecommendations(caseState: CompanyCaseState): CashflowRecommendation[] {
  if (caseState.recommendedActions.length > 0) {
    return caseState.recommendedActions
      .slice()
      .sort((left, right) => left.priority - right.priority)
      .map((action) => ({
        externalId: action.externalId,
        actionType: action.actionType,
        priority: action.priority,
        title: action.title,
        customerExternalId: action.customerExternalId,
        customerName: action.customerName,
        invoiceExternalId: action.invoiceExternalId,
        expectedRecoveryCents: action.expectedRecoveryCents,
        rationale: action.rationale,
        approvalRequired: action.approvalRequired,
        scheduledFor: action.scheduledFor,
        source: "action_plan",
      }));
  }

  return caseState.invoices
    .filter((invoice) => invoice.outstandingCents > 0)
    .sort((left, right) => {
      const dueDateComparison = left.dueDate.localeCompare(right.dueDate);
      if (dueDateComparison !== 0) {
        return dueDateComparison;
      }
      return right.outstandingCents - left.outstandingCents;
    })
    .slice(0, 3)
    .map((invoice, index) => ({
      externalId: scopedIdempotencyKey(["agent-action", invoice.externalId]),
      actionType: "send_reminder",
      priority: index + 1,
      title: `Follow up on invoice ${invoice.invoiceNumber}`,
      customerExternalId: invoice.customerExternalId,
      customerName: invoice.customerName,
      invoiceExternalId: invoice.externalId,
      expectedRecoveryCents: invoice.outstandingCents,
      rationale: `Invoice ${invoice.invoiceNumber} has ${formatMoney(
        invoice.outstandingCents,
        invoice.currency,
      )} outstanding and is due on ${invoice.dueDate}.`,
      approvalRequired: true,
      scheduledFor: null,
      source: "deterministic_invoice",
    }));
}

function selectMemoryFacts(caseState: CompanyCaseState, customerExternalId: string): string[] {
  return caseState.memoryFacts
    .filter((fact) => fact.customerExternalId === customerExternalId)
    .map((fact) => fact.factText)
    .slice(0, 3);
}

function buildGraphOutput(
  state: CashflowGraphStateValue,
  checkpointKeys: string[],
): CashflowGraphOutput {
  const forecast = requireStateValue(state.forecast, "forecast summary");
  const draft = requireStateValue(state.draft, "draft");

  return {
    graphName: state.input.graphName,
    runKind: state.input.runKind,
    agentRunId: state.agentRun?.id ?? null,
    tenantId: state.input.tenantId,
    companyId: state.input.companyId ?? null,
    companyExternalId: state.input.companyExternalId,
    caseId: state.input.caseId,
    forecast,
    recommendations: state.recommendations,
    draft,
    providerStatuses: state.providerStatuses,
    checkpointKeys,
    traceUrl: state.traceUrl,
  };
}

function requireStateValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Cashflow agent graph missing ${label}.`);
  }

  return value;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
