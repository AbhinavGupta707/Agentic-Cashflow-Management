"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  Home,
  Info,
  LineChart,
  Loader2,
  Mail,
  MoreHorizontal,
  Phone,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { clsx } from "clsx";

import type { CompanyCaseState, CurrentCaseApiResponse } from "@/server/db/case-state-contract";
import type {
  Cp3ForecastCockpitApiResponse,
  Cp3ForecastCockpitState,
  Cp3ProviderStatus,
  Cp4EmailApprovalItem,
} from "@/server/db/cp3-forecast-cockpit-contract";
import type { IngestionStatusApiResponse, IngestionStatusState } from "@/server/db/ingestion-status-contract";
import type { ProductOverviewState } from "@/server/db/product-overview-contract";
import type { ProductScenariosState } from "@/server/db/product-scenarios-contract";
import type { ProviderStatus } from "@/server/db/provider-status-contract";
import type {
  ProductActionDecisionResult,
  ProductActionDetail,
  ProductActionOutcomeResult,
  ProductActionOutcomeType,
  ProductActionsState,
  ProductActionSummary,
  ProductDraftEditResult,
} from "@/server/repositories/product-actions";
import type { ProductAgentActivityState, ProductActivityItem } from "@/server/repositories/product-agent-activity";
import type { ProductCustomerListItem, ProductCustomersState } from "@/server/repositories/product-customers";
import type { VoiceCallInitiationResult, VoiceProviderReadiness } from "@/server/voice/contracts";

type Loadable<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "unavailable"; message: string; missingEnv?: string[] }
  | { kind: "error"; message: string };

type ProductApiResponse<T> =
  | { status: "ok"; data: T }
  | { status: "degraded"; data: T }
  | { status: "unavailable"; message: string; missingEnv?: string[] }
  | { status: "error"; message: string };

type ProductMutationResponse<T> =
  | { status: "ok"; data: T }
  | { status: "blocked"; code: string; message: string }
  | { status: "unavailable"; message: string; missingEnv?: string[] }
  | { status: "error"; message: string };

type ScreenKey = "overview" | "cases" | "actions" | "customers" | "forecasts" | "activity" | "settings";

type StatusTone = "good" | "watch" | "risk" | "neutral" | "accent";

type ProductAction = {
  id: string;
  title: string;
  customer: string;
  detail: string;
  channel: "Email" | "Phone" | "Portal";
  currency?: string;
  priority: "High" | "Medium" | "Watch";
  impactCents: number;
  approvalState: string;
  rationale: string;
  draftPreview: string;
  confidence: "High" | "Medium" | "Low";
  isNegative?: boolean;
  providerNote: string;
};

type ActionMutation = "approve" | "edit" | "reject" | "voice" | "outcome";

type ActionMutationState =
  | { kind: "idle" }
  | { kind: "pending"; action: ActionMutation }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type DemoIntakeState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type DemoIntakeApiResponse =
  | {
      status: "ok";
      data: {
        uploads: Array<unknown>;
        agentGraph: { recommendationCount: number; checkpointKeys: string[] } | null;
      };
    }
  | { status: "unavailable"; message: string; missingEnv?: string[] }
  | { status: "error"; message: string };

type ProductLiveSnapshot = {
  caseResult: Loadable<CompanyCaseState>;
  ingestionResult: Loadable<IngestionStatusState>;
  runtimeResult: Loadable<Cp3ForecastCockpitState>;
  productOverviewResult: Loadable<ProductOverviewState>;
  productActionsResult: Loadable<ProductActionsState>;
  productCustomersResult: Loadable<ProductCustomersState>;
  productScenariosResult: Loadable<ProductScenariosState>;
  productActivityResult: Loadable<ProductAgentActivityState>;
  voiceReadinessResult: Loadable<VoiceProviderReadiness>;
};

type CustomerProfile = {
  id: string;
  name: string;
  segment: string;
  status: "Overdue" | "Watch" | "Current";
  badge: string;
  outstandingCents: number;
  exposureCents: number;
  avgDaysLate: number;
  reliability: number;
  summary: string;
  tags: string[];
  contactName: string;
  invoiceLabel: string;
  lastInteractionLabel: string;
  memoryCards: Array<{ title: string; body: string; tone: StatusTone }>;
};

type ScenarioToggleKey = "customerAPays" | "partialPayment" | "supplierDeferral";

const navItems: Array<{
  key: ScreenKey;
  label: string;
  mobileLabel?: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}> = [
  { key: "overview", label: "Overview", icon: Home },
  { key: "cases", label: "Cases", icon: FileText },
  { key: "actions", label: "Actions", icon: CheckCircle2 },
  { key: "customers", label: "Customers", icon: UsersRound },
  { key: "forecasts", label: "Forecasts", icon: BarChart3 },
  { key: "activity", label: "Agent Activity", mobileLabel: "Activity", icon: Activity },
  { key: "settings", label: "Settings", icon: Settings },
];

const defaultActions: ProductAction[] = [
  {
    id: "pending-data-action",
    title: "Review recoverable cash once live data connects",
    customer: "Awaiting customer ledger",
    detail: "No customer action will be sent until source data and approval routes are available.",
    channel: "Email",
    priority: "Watch",
    impactCents: 0,
    approvalState: "Not ready",
    rationale: "The product is waiting for the live case read model before recommending a customer-specific action.",
    draftPreview: "Draft preview will appear after a real recommended action and internal draft are persisted.",
    confidence: "Low",
    providerNote: "Provider unavailable. No email or voice action has been executed.",
  },
];

export function CashflowCockpit() {
  const [activeScreen, setActiveScreen] = useState<ScreenKey>("overview");
  const [caseState, setCaseState] = useState<Loadable<CompanyCaseState>>({ kind: "loading" });
  const [ingestionState, setIngestionState] = useState<Loadable<IngestionStatusState>>({ kind: "loading" });
  const [runtimeState, setRuntimeState] = useState<Loadable<Cp3ForecastCockpitState>>({ kind: "loading" });
  const [productOverviewState, setProductOverviewState] = useState<Loadable<ProductOverviewState>>({ kind: "loading" });
  const [productActionsState, setProductActionsState] = useState<Loadable<ProductActionsState>>({ kind: "loading" });
  const [productCustomersState, setProductCustomersState] = useState<Loadable<ProductCustomersState>>({ kind: "loading" });
  const [productScenariosState, setProductScenariosState] = useState<Loadable<ProductScenariosState>>({ kind: "loading" });
  const [productActivityState, setProductActivityState] = useState<Loadable<ProductAgentActivityState>>({ kind: "loading" });
  const [voiceReadinessState, setVoiceReadinessState] = useState<Loadable<VoiceProviderReadiness>>({ kind: "loading" });
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [selectedActionDetailState, setSelectedActionDetailState] = useState<Loadable<ProductActionDetail>>({ kind: "loading" });
  const [actionMutationState, setActionMutationState] = useState<ActionMutationState>({ kind: "idle" });
  const [demoIntakeState, setDemoIntakeState] = useState<DemoIntakeState>({ kind: "idle" });
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [scenarioToggles, setScenarioToggles] = useState<Record<ScenarioToggleKey, boolean>>({
    customerAPays: true,
    partialPayment: true,
    supplierDeferral: true,
  });

  useEffect(() => {
    let active = true;

    async function loadAll() {
      const snapshot = await fetchProductLiveSnapshot();

      if (!active) {
        return;
      }

      applyProductLiveSnapshot(snapshot);
    }

    void loadAll();

    return () => {
      active = false;
    };
  }, []);

  const viewModel = useMemo(() => {
    return buildProductViewModel(
      caseState,
      runtimeState,
      ingestionState,
      productOverviewState,
      productActionsState,
      productCustomersState,
      productScenariosState,
      productActivityState,
      voiceReadinessState,
    );
  }, [
    caseState,
    runtimeState,
    ingestionState,
    productOverviewState,
    productActionsState,
    productCustomersState,
    productScenariosState,
    productActivityState,
    voiceReadinessState,
  ]);

  const selectedAction = viewModel.actions.find((action) => action.id === selectedActionId) ?? viewModel.actions[0];

  useEffect(() => {
    if (viewModel.actions.length === 0) {
      return;
    }

    if (!selectedActionId || !viewModel.actions.some((action) => action.id === selectedActionId)) {
      setSelectedActionId(viewModel.actions[0].id);
    }
  }, [selectedActionId, viewModel.actions]);

  useEffect(() => {
    if (!selectedActionId || selectedActionId === "pending-data-action") {
      setSelectedActionDetailState({ kind: "loading" });
      return;
    }

    let active = true;
    setSelectedActionDetailState({ kind: "loading" });

    async function loadActionDetail() {
      const result = await fetchProductResource<ProductActionDetail>(
        `/api/product/actions/${encodeURIComponent(selectedActionId!)}`,
        "Unable to load action detail.",
      );

      if (active) {
        setSelectedActionDetailState(result);
      }
    }

    void loadActionDetail();

    return () => {
      active = false;
    };
  }, [selectedActionId]);

  const applyProductLiveSnapshot = (snapshot: ProductLiveSnapshot) => {
    setCaseState(snapshot.caseResult);
    setIngestionState(snapshot.ingestionResult);
    setRuntimeState(snapshot.runtimeResult);
    setProductOverviewState(snapshot.productOverviewResult);
    setProductActionsState(snapshot.productActionsResult);
    setProductCustomersState(snapshot.productCustomersResult);
    setProductScenariosState(snapshot.productScenariosResult);
    setProductActivityState(snapshot.productActivityResult);
    setVoiceReadinessState(snapshot.voiceReadinessResult);
  };

  const refreshAllProductSurfaces = async () => {
    const snapshot = await fetchProductLiveSnapshot();
    applyProductLiveSnapshot(snapshot);

    if (selectedActionId && selectedActionId !== "pending-data-action") {
      setSelectedActionDetailState(
        await fetchProductResource<ProductActionDetail>(
          `/api/product/actions/${encodeURIComponent(selectedActionId)}`,
          "Unable to refresh action detail.",
        ),
      );
    }
  };

  const refreshActions = async () => {
    const [actionsResult, activityResult] = await Promise.all([
      fetchProductResource<ProductActionsState>("/api/product/actions", "Unable to load product actions."),
      fetchProductResource<ProductAgentActivityState>("/api/product/agent-activity", "Unable to load product activity."),
    ]);

    setProductActionsState(actionsResult);
    setProductActivityState(activityResult);

    if (selectedActionId && selectedActionId !== "pending-data-action") {
      setSelectedActionDetailState(
        await fetchProductResource<ProductActionDetail>(
          `/api/product/actions/${encodeURIComponent(selectedActionId)}`,
          "Unable to refresh action detail.",
        ),
      );
    }
  };

  const runDemoIntake = async () => {
    setDemoIntakeState({ kind: "pending" });

    try {
      const response = await fetch("/api/product/demo-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "finance_pack", process: true }),
      });
      const payload = (await response.json()) as DemoIntakeApiResponse;

      if (payload.status !== "ok") {
        setDemoIntakeState({ kind: "error", message: payload.message });
        return;
      }

      await refreshAllProductSurfaces();
      const checkpointCount = payload.data.agentGraph?.checkpointKeys.length ?? 0;
      setDemoIntakeState({
        kind: "success",
        message: `Sample pack imported through the live event loop. ${payload.data.uploads.length} files processed and ${checkpointCount} agent checkpoints refreshed.`,
      });
    } catch (error) {
      setDemoIntakeState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unable to run sample finance-pack intake.",
      });
    }
  };

  const mutateActionDecision = async (actionId: string, decision: "approve" | "reject") => {
    setActionMutationState({ kind: "pending", action: decision });

    const result = await postProductMutation<ProductActionDecisionResult>(
      `/api/product/actions/${encodeURIComponent(actionId)}/${decision}`,
      {
        decisionNote:
          decision === "approve"
            ? "Approved from the RunwayOps product cockpit. Provider execution remains separately gated."
            : "Rejected from the RunwayOps product cockpit.",
        idempotencyKey: `cockpit-${decision}-${actionId}-${Date.now()}`,
      },
    );

    if (result.status === "ok") {
      setSelectedActionDetailState({ kind: "ready", data: result.data.action });
      await refreshActions();
      setActionMutationState({
        kind: "success",
        message:
          decision === "approve"
            ? "Approval recorded. No email or call was executed by this approval step."
            : "Action rejected. No provider execution was created.",
      });
      return;
    }

    setActionMutationState({ kind: "error", message: result.message });
  };

  const saveActionDraft = async (actionId: string, input: { channel: "email" | "voice_script"; subject: string | null; body: string }) => {
    setActionMutationState({ kind: "pending", action: "edit" });

    const result = await postProductMutation<ProductDraftEditResult>(
      `/api/product/actions/${encodeURIComponent(actionId)}/edit-draft`,
      {
        ...input,
        idempotencyKey: `cockpit-edit-${actionId}-${Date.now()}`,
      },
    );

    if (result.status === "ok") {
      setSelectedActionDetailState({ kind: "ready", data: result.data.action });
      await refreshActions();
      setIsEditOpen(false);
      setActionMutationState({ kind: "success", message: "Draft updated and returned to the approval queue." });
      return;
    }

    setActionMutationState({ kind: "error", message: result.message });
  };

  const executeVoiceTestCall = async (actionId: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "This will only call the configured Twilio test number if the action is approved and all live-call safeguards pass. Continue?",
      )
    ) {
      return;
    }

    setActionMutationState({ kind: "pending", action: "voice" });

    const result = await postProductMutation<VoiceCallInitiationResult>("/api/product/voice/calls", {
      actionExternalId: actionId,
      approved: true,
      live: true,
      idempotencyKey: `cockpit-voice-${actionId}-${Date.now()}`,
    });

    if (result.status === "ok") {
      await refreshActions();
      setActionMutationState({
        kind: "success",
        message:
          result.data.state === "queued"
            ? "Twilio accepted the approved test call. Real provider IDs are now shown from Twilio."
            : result.data.message,
      });
      return;
    }

    setActionMutationState({ kind: "error", message: result.message });
  };

  const recordActionOutcome = async (
    actionId: string,
    input: {
      outcomeType: ProductActionOutcomeType;
      summary: string;
      promisedPaymentDate?: string | null;
    },
  ) => {
    setActionMutationState({ kind: "pending", action: "outcome" });

    const result = await postProductMutation<ProductActionOutcomeResult>(
      `/api/product/actions/${encodeURIComponent(actionId)}/record-outcome`,
      {
        ...input,
        idempotencyKey: `cockpit-outcome-${actionId}-${Date.now()}`,
      },
    );

    if (result.status === "ok") {
      setSelectedActionDetailState({ kind: "ready", data: result.data.action });
      await refreshActions();
      setActionMutationState({ kind: "success", message: result.data.outcome.message });
      return;
    }

    setActionMutationState({ kind: "error", message: result.message });
  };

  return (
    <main className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#050914] text-slate-100">
      <div className="flex min-h-screen">
        <Sidebar activeScreen={activeScreen} onScreenChange={setActiveScreen} readiness={viewModel.readinessSummary} />
        <section className="min-w-0 max-w-[100vw] flex-1 overflow-x-hidden border-white/[0.07] bg-[radial-gradient(circle_at_30%_0%,rgba(78,70,255,0.12),transparent_36%),linear-gradient(180deg,#070c15_0%,#060a12_45%,#04070d_100%)] md:border-l">
          <TopCaseBar
            companyName={viewModel.companyName}
            caseName={viewModel.caseName}
            generatedAt={viewModel.generatedAt}
            liveState={viewModel.liveState}
          />
          <MobileNav activeScreen={activeScreen} onScreenChange={setActiveScreen} />
          <div className="mx-auto w-full max-w-[1240px] px-4 py-5 sm:px-5 lg:px-7">
            {activeScreen === "overview" ? (
              <OverviewScreen
                demoIntakeState={demoIntakeState}
                model={viewModel}
                onOpenActions={() => setActiveScreen("actions")}
                onRunDemoIntake={() => void runDemoIntake()}
              />
            ) : null}
            {activeScreen === "cases" ? <CasesScreen model={viewModel} /> : null}
            {activeScreen === "actions" ? (
              <ActionsScreen
                actions={viewModel.actions}
                currency={viewModel.currency}
                selectedAction={selectedAction}
                selectedActionDetailState={selectedActionDetailState}
                mutationState={actionMutationState}
                isEditOpen={isEditOpen}
                onSelectAction={setSelectedActionId}
                onApproveAction={(actionId) => void mutateActionDecision(actionId, "approve")}
                onRejectAction={(actionId) => void mutateActionDecision(actionId, "reject")}
                onEditAction={() => setIsEditOpen(true)}
                onCloseEdit={() => setIsEditOpen(false)}
                onSaveDraft={(actionId, input) => void saveActionDraft(actionId, input)}
                onExecuteVoiceCall={(actionId) => void executeVoiceTestCall(actionId)}
                onRecordOutcome={(actionId, input) => void recordActionOutcome(actionId, input)}
              />
            ) : null}
            {activeScreen === "customers" ? <CustomerScreen currency={viewModel.currency} customer={viewModel.customer} /> : null}
            {activeScreen === "forecasts" ? (
              <ForecastScreen
                model={viewModel}
                toggles={scenarioToggles}
                onToggle={(key) => setScenarioToggles((current) => ({ ...current, [key]: !current[key] }))}
              />
            ) : null}
            {activeScreen === "activity" ? <ActivityScreen model={viewModel} /> : null}
            {activeScreen === "settings" ? <ConnectionsScreen model={viewModel} /> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Sidebar({
  activeScreen,
  onScreenChange,
  readiness,
}: {
  activeScreen: ScreenKey;
  onScreenChange: (screen: ScreenKey) => void;
  readiness: string;
}) {
  return (
    <aside className="hidden min-h-screen w-[236px] shrink-0 flex-col border-r border-white/[0.08] bg-[#050a12] px-4 py-6 md:flex">
      <div className="flex items-center gap-3 px-1">
        <div className="grid h-8 w-8 grid-cols-2 gap-1">
          <span className="rounded-br-md rounded-tl-lg bg-[#715cff]" />
          <span className="rounded-bl-md rounded-tr-lg bg-[#4b7cff]" />
          <span className="rounded-bl-lg rounded-tr-md bg-[#4b7cff]" />
          <span className="rounded-br-lg rounded-tl-md bg-[#715cff]" />
        </div>
        <span className="text-xl font-semibold tracking-normal text-white">RunwayOps</span>
      </div>

      <nav className="mt-12 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeScreen === item.key;

          return (
            <button
              className={clsx(
                "flex h-14 w-full items-center gap-3 rounded-md px-4 text-left text-[15px] font-medium transition",
                active
                  ? "border border-[#564cff]/70 bg-[#121b45] text-white shadow-[inset_3px_0_0_#6256ff]"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
              )}
              key={item.key}
              onClick={() => onScreenChange(item.key)}
              type="button"
            >
              <Icon aria-hidden="true" size={21} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-8">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.045] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[radial-gradient(circle,#5f56ff_0%,#211987_55%,#0c1024_100%)] shadow-[0_0_28px_rgba(95,86,255,0.45)]">
              <Sparkles aria-hidden="true" className="text-[#a69dff]" size={21} />
            </div>
            <div>
              <p className="text-sm font-medium text-white">RunwayOps AI</p>
              <p className="mt-1 text-sm leading-5 text-[#837bff]">{readiness}</p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <button className="flex items-center gap-3 px-2 text-sm text-slate-400 hover:text-white" type="button">
            <CircleAlert aria-hidden="true" size={19} />
            Help & Support
          </button>
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white">
              JW
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">James Walker</p>
              <p className="text-sm text-slate-500">Founder</p>
            </div>
            <ArrowRight aria-hidden="true" className="text-slate-500" size={17} />
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileNav({
  activeScreen,
  onScreenChange,
}: {
  activeScreen: ScreenKey;
  onScreenChange: (screen: ScreenKey) => void;
}) {
  return (
    <nav className="grid w-full min-w-0 max-w-full grid-cols-3 gap-2 border-b border-white/[0.07] bg-[#070c15]/90 px-4 py-3 md:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = activeScreen === item.key;

        return (
          <button
            className={clsx(
              "flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-medium sm:text-xs",
              active
                ? "border-[#6256ff]/70 bg-[#121b45] text-white"
                : "border-white/[0.08] bg-white/[0.025] text-slate-400",
            )}
            key={item.key}
            onClick={() => onScreenChange(item.key)}
            type="button"
          >
            <Icon aria-hidden="true" size={16} />
            <span className="whitespace-nowrap">{item.mobileLabel ?? item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function TopCaseBar({
  companyName,
  caseName,
  generatedAt,
  liveState,
}: {
  companyName: string;
  caseName: string;
  generatedAt: string;
  liveState: "live" | "loading" | "unavailable" | "error";
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#070c15]/92 px-4 py-4 backdrop-blur-xl sm:px-5 lg:px-7">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full min-w-0 items-center gap-4 sm:w-auto sm:gap-6">
          <button
            className="flex h-12 w-full min-w-0 items-center justify-between rounded-md border border-white/[0.12] bg-white/[0.035] px-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:min-w-[270px] sm:flex-none"
            type="button"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#17194a] text-[#8176ff]">
                <Building2 aria-hidden="true" size={19} />
              </span>
              <span className="truncate text-[15px] font-semibold text-white">{companyName}</span>
            </span>
            <ChevronDown aria-hidden="true" className="shrink-0 text-slate-400" size={17} />
          </button>
          <div className="hidden h-9 w-px bg-white/[0.08] lg:block" />
          <div className="hidden lg:block">
            <p className="text-xs text-slate-500">Active Case</p>
            <div className="mt-1 flex items-center gap-2 text-sm font-medium text-white">
              <span className={clsx("h-2.5 w-2.5 rounded-full", liveState === "live" ? "bg-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.8)]" : "bg-slate-500")} />
              {caseName}
            </div>
          </div>
        </div>

        <div className="hidden items-center justify-between gap-4 text-sm text-slate-400 sm:flex sm:justify-end">
          <span className="hidden sm:inline">{generatedAt}</span>
          <button className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-white/[0.05] hover:text-white" type="button">
            <RefreshCw aria-hidden="true" size={17} />
          </button>
          <div className="hidden h-8 w-px bg-white/[0.08] sm:block" />
          <button className="relative flex h-10 w-10 items-center justify-center rounded-md text-slate-200 hover:bg-white/[0.05]" type="button">
            <Bell aria-hidden="true" size={22} />
            <span className="absolute right-1 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#5d54ff] px-1 text-xs font-semibold text-white">
              3
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

function OverviewScreen({
  demoIntakeState,
  model,
  onOpenActions,
  onRunDemoIntake,
}: {
  demoIntakeState: DemoIntakeState;
  model: ProductViewModel;
  onOpenActions: () => void;
  onRunDemoIntake: () => void;
}) {
  const demoIntakePending = demoIntakeState.kind === "pending";

  return (
    <div className="space-y-5">
      <KpiStrip metrics={model.overviewMetrics} />

      {model.alertMessage ? <LiveDataBanner state={model.liveState} message={model.alertMessage} /> : null}

      <Panel className={clsx("border", toneBorder(model.riskNarrative.tone), "bg-white/[0.04]")}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
          <div>
            <TonePill tone={model.riskNarrative.tone}>Live risk story</TonePill>
            <h1 className="mt-4 text-2xl font-semibold tracking-normal text-white sm:text-3xl">{model.riskNarrative.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{model.riskNarrative.body}</p>
          </div>
          <div className="rounded-md border border-white/[0.08] bg-[#0a101a] p-4">
            <p className="text-xs uppercase tracking-[0.04em] text-slate-500">Recommended next step</p>
            <p className="mt-2 text-sm font-semibold text-white">{model.riskNarrative.primaryAction}</p>
            <p className="mt-3 text-sm leading-5 text-emerald-300">{model.riskNarrative.outcome}</p>
            <button
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-[#4e43ff] px-4 text-sm font-semibold text-white"
              onClick={onOpenActions}
              type="button"
            >
              Review action
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          </div>
        </div>
      </Panel>

      <Panel className="border border-[#4e43ff]/30 bg-[#101739]/50">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-[760px]">
            <TonePill tone="accent">Live intake</TonePill>
            <h2 className="mt-3 text-xl font-semibold tracking-normal text-white">Start from fresh finance evidence</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Load the sample finance pack to refresh receivables, obligations, a Northstar payment event, forecasts,
              recommendations, and Agent Activity from the server-side import path.
            </p>
          </div>
          <button
            className="flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-[#4e43ff] px-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(78,67,255,0.24)] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
            disabled={demoIntakePending}
            onClick={onRunDemoIntake}
            type="button"
          >
            {demoIntakePending ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <FileText aria-hidden="true" size={16} />}
            {demoIntakePending ? "Importing sample pack" : "Load sample finance pack"}
          </button>
        </div>
        {demoIntakeState.kind === "success" || demoIntakeState.kind === "error" ? (
          <div
            className={clsx(
              "mt-5 rounded-md border p-3 text-sm",
              demoIntakeState.kind === "success"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-red-400/30 bg-red-400/10 text-red-200",
            )}
          >
            {demoIntakeState.message}
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.95fr)]">
        <Panel className="min-h-[455px]">
          <PanelHeader
            title="Cash Flow / Runway"
            meta="Next 30 Days"
            right={
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <LegendDot color="bg-emerald-400" label="Inflows" />
                <LegendDot color="bg-red-400" label="Outflows" />
                <LegendDot color="bg-[#6559ff]" label="Net" />
              </div>
            }
          />
          <CashflowBars points={model.cashflowBars} currency={model.currency} />
        </Panel>

        <Panel>
          <PanelHeader title="Critical Actions" meta={String(model.actions.length)} />
          <div className="mt-6 space-y-3">
            {model.actions.slice(0, 3).map((action, index) => (
              <ActionSummaryRow action={action} index={index + 1} key={action.id} />
            ))}
          </div>
          <button
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#8279ff] hover:text-white"
            onClick={onOpenActions}
            type="button"
          >
            View all actions
            <ArrowRight aria-hidden="true" size={17} />
          </button>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(430px,1fr)]">
        <Panel>
          <PanelHeader title="Agent Activity" right={<span className="text-sm text-[#8279ff]">View all</span>} />
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {model.agentTiles.map((tile) => (
              <AgentTile key={tile.id} tile={tile} />
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Approvals Needed" meta={String(model.approvals.length)} right={<span className="text-sm text-[#8279ff]">View all</span>} />
          <div className="mt-6 space-y-3">
            {model.approvals.map((approval) => (
              <ApprovalRow approval={approval} key={approval.id} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ActionsScreen({
  actions,
  currency,
  selectedAction,
  selectedActionDetailState,
  mutationState,
  isEditOpen,
  onSelectAction,
  onApproveAction,
  onRejectAction,
  onEditAction,
  onCloseEdit,
  onSaveDraft,
  onExecuteVoiceCall,
  onRecordOutcome,
}: {
  actions: ProductAction[];
  currency: string;
  selectedAction: ProductAction;
  selectedActionDetailState: Loadable<ProductActionDetail>;
  mutationState: ActionMutationState;
  isEditOpen: boolean;
  onSelectAction: (id: string) => void;
  onApproveAction: (id: string) => void;
  onRejectAction: (id: string) => void;
  onEditAction: () => void;
  onCloseEdit: () => void;
  onSaveDraft: (id: string, input: { channel: "email" | "voice_script"; subject: string | null; body: string }) => void;
  onExecuteVoiceCall: (id: string) => void;
  onRecordOutcome: (
    id: string,
    input: { outcomeType: ProductActionOutcomeType; summary: string; promisedPaymentDate?: string | null },
  ) => void;
}) {
  const totalImpact = actions.reduce((sum, action) => sum + action.impactCents, 0);
  const selectedDetail = selectedActionDetailState.kind === "ready" ? selectedActionDetailState.data : null;
  const displayedAction = selectedDetail ? mapProductActionSummary(selectedDetail) : selectedAction;
  const draft = selectedDetail?.draftPreview ?? null;
  const isPending = mutationState.kind === "pending";
  const canApprove = Boolean(selectedDetail?.approval.canApprove) && !isPending;
  const canReject = Boolean(selectedDetail?.approval.canReject) && !isPending;
  const providerHistoryCount =
    (selectedDetail?.executionHistory.providerExecutions.length ?? 0) +
    (selectedDetail?.executionHistory.messages.length ?? 0) +
    (selectedDetail?.executionHistory.voiceCalls.length ?? 0);

  return (
    <div className="space-y-5">
      <ScreenTitle
        title="Action Queue"
        description="Review and approve actions recommended by RunwayOps agents."
        controls={
          <>
            <ToolbarButton icon={SlidersHorizontal} label="Filters" />
            <ToolbarButton icon={ChevronDown} label="Sort by Priority" />
          </>
        }
      />
      <KpiStrip
        metrics={[
          { label: "Pending Approvals", value: String(actions.length), helper: `${actions.filter((action) => action.priority === "High").length} urgent`, tone: "risk" },
          { label: "Scheduled Actions", value: "2", helper: "Next: 2 today", tone: "accent" },
          { label: "Sent Today", value: "0", helper: "No provider sends recorded", tone: "neutral" },
          { label: "Est. Cash Impact", value: formatCurrency(totalImpact, currency), helper: "Subject to approval", tone: "good" },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.95fr)_minmax(0,1.12fr)]">
        <Panel>
          <PanelHeader title="Pending Approvals" meta={String(actions.length)} />
          <div className="mt-5 space-y-3">
            {actions.map((action) => (
              <PendingApprovalCard
                action={action}
                active={action.id === displayedAction.id}
                disabled={isPending}
                key={action.id}
                onApprove={() => onApproveAction(action.id)}
                onEdit={() => {
                  onSelectAction(action.id);
                  onEditAction();
                }}
                onReject={() => onRejectAction(action.id)}
                onSelect={() => onSelectAction(action.id)}
              />
            ))}
          </div>
          <button className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#8279ff]" type="button">
            View all pending approvals
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <div className="flex items-start justify-between gap-4">
              <div>
                <TonePill tone={displayedAction.priority === "High" ? "risk" : "watch"}>{displayedAction.priority} priority</TonePill>
                <h2 className="mt-5 text-2xl font-semibold tracking-normal text-slate-100">{displayedAction.customer}</h2>
                <p className="mt-2 text-sm text-slate-400">{displayedAction.detail}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase text-slate-500">Est. cash impact</p>
                <p className={clsx("mt-2 text-2xl font-semibold", displayedAction.isNegative ? "text-red-400" : "text-emerald-400")}>
                  {formatCurrency(displayedAction.impactCents, currency)}
                </p>
              </div>
            </div>

            <ActionDecisionBar
              actionId={displayedAction.id}
              canApprove={canApprove}
              canReject={canReject}
              mutationState={mutationState}
              onApprove={onApproveAction}
              onEdit={onEditAction}
              onReject={onRejectAction}
            />

            {mutationState.kind === "success" || mutationState.kind === "error" ? (
              <div
                className={clsx(
                  "mt-4 rounded-md border p-3 text-sm",
                  mutationState.kind === "success"
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                    : "border-red-400/30 bg-red-400/10 text-red-200",
                )}
              >
                {mutationState.message}
              </div>
            ) : null}

            <div className="mt-8 flex gap-8 border-b border-white/[0.08] text-sm">
              <button className="border-b-2 border-[#7368ff] pb-3 font-medium text-[#8c84ff]" type="button">Why this action?</button>
              <button className="pb-3 text-slate-500" type="button">History {providerHistoryCount > 0 ? `(${providerHistoryCount})` : ""}</button>
            </div>

            <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_245px]">
              <div>
                <h3 className="text-sm font-medium text-slate-100">Action explanation</h3>
                <p className="mt-3 max-w-[610px] text-sm leading-6 text-slate-400">{displayedAction.rationale}</p>
                <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-slate-100">
                    {displayedAction.channel === "Phone" ? "Call script preview" : "Draft email preview"}
                  </h3>
                  <DraftSourceBadge draft={draft} state={selectedActionDetailState} />
                </div>
                <ActionPreviewBlock
                  action={displayedAction}
                  detailState={selectedActionDetailState}
                />
              </div>
              <div className="rounded-md border border-white/[0.08] bg-white/[0.035] p-5">
                <p className="text-sm font-medium text-slate-100">Payment behavior</p>
                <ul className="mt-4 space-y-3 text-sm text-slate-400">
                  <li>Terms: {selectedDetail?.customerContext.paymentTermsDays ?? "unknown"} days</li>
                  <li>Contact: {selectedDetail?.customerContext.contact.name ?? "not assigned"}</li>
                  <li>Invoice: {selectedDetail?.invoice.invoiceNumber ?? "not linked"}</li>
                </ul>
              </div>
            </div>

            {selectedDetail?.evidence.length ? (
              <div className="mt-7 rounded-md border border-white/[0.08] bg-white/[0.025] p-5">
                <h3 className="text-sm font-medium text-slate-100">Evidence trail</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {selectedDetail.evidence.slice(0, 4).map((item) => (
                    <EvidenceChip
                      detail={item.detail}
                      key={`${item.type}-${item.label}-${item.occurredAt ?? "pending"}`}
                      label={item.label}
                      type={item.type}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {selectedDetail?.agentTrace.traceUrl ? (
              <a
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#8279ff] hover:text-white"
                href={selectedDetail.agentTrace.traceUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open LangSmith trace
                <ExternalLink aria-hidden="true" size={16} />
              </a>
            ) : null}
          </Panel>

          <ActionExecutionPanel
            action={displayedAction}
            detail={selectedDetail}
            isPending={isPending}
            mutationState={mutationState}
            onExecuteVoiceCall={onExecuteVoiceCall}
            onRecordOutcome={onRecordOutcome}
          />

          <Panel>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <ShieldCheck aria-hidden="true" className="text-emerald-400" size={24} />
                  <h3 className="text-lg font-semibold text-slate-100">Compliance & Guardrails</h3>
                </div>
                <div className="mt-5 space-y-3 text-sm text-slate-400">
                  {(selectedDetail?.guardrails.length ? selectedDetail.guardrails : [
                    "Human approval required before any outbound message or call.",
                    "No provider ID is shown until a real provider execution exists.",
                    displayedAction.providerNote,
                  ]).map((guardrail) => (
                    <Guardrail key={guardrail} label={guardrail} />
                  ))}
                </div>
              </div>
              <TonePill tone="good">Human approval required</TonePill>
            </div>
          </Panel>
        </div>
      </div>

      {isEditOpen ? (
        <ActionDraftEditor
          action={displayedAction}
          detail={selectedDetail}
          isSaving={mutationState.kind === "pending" && mutationState.action === "edit"}
          onClose={onCloseEdit}
          onSave={onSaveDraft}
        />
      ) : null}
    </div>
  );
}

function ActionExecutionPanel({
  action,
  detail,
  isPending,
  mutationState,
  onExecuteVoiceCall,
  onRecordOutcome,
}: {
  action: ProductAction;
  detail: ProductActionDetail | null;
  isPending: boolean;
  mutationState: ActionMutationState;
  onExecuteVoiceCall: (id: string) => void;
  onRecordOutcome: (
    id: string,
    input: { outcomeType: ProductActionOutcomeType; summary: string; promisedPaymentDate?: string | null },
  ) => void;
}) {
  const [outcomeType, setOutcomeType] = useState<ProductActionOutcomeType>("promise_to_pay");
  const [summary, setSummary] = useState("Customer promised to confirm payment timing after approval review.");
  const [promisedPaymentDate, setPromisedPaymentDate] = useState("");
  const isPhone = action.channel === "Phone" || detail?.actionType === "call_customer";
  const approvalState = detail?.approval.state ?? action.approvalState.toLowerCase();
  const isApproved = approvalState === "approved";
  const voice = detail?.providerState.providers.voice;
  const providerEvidence = detail?.executionHistory.providerExecutions[0] ?? null;
  const voiceEvidence = detail?.executionHistory.voiceCalls[0] ?? null;
  const canExecuteVoice = Boolean(detail && isPhone && isApproved && voice?.status === "available" && !isPending);
  const pendingAction = mutationState.kind === "pending" ? mutationState.action : null;
  const gateMessage = !detail
    ? "Open a live action detail before execution."
    : !isPhone
      ? "This action uses the email/manual execution path."
      : !isApproved
        ? "Approve this action before any live voice execution can be attempted."
        : voice?.status !== "available"
          ? voice?.message ?? "Twilio voice is not configured."
          : voice.executionGate.message;

  const submitOutcome = () => {
    if (!detail || summary.trim().length < 8 || isPending) {
      return;
    }

    onRecordOutcome(action.id, {
      outcomeType,
      summary: summary.trim(),
      promisedPaymentDate: promisedPaymentDate || null,
    });
  };

  return (
    <Panel>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-[620px]">
          <div className="flex items-center gap-3">
            <Phone aria-hidden="true" className="text-[#8c84ff]" size={22} />
            <h3 className="text-lg font-semibold text-slate-100">Execution & outcome learning</h3>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            RunwayOps executes only approved actions. After the call, provider status, transcript or outcome evidence,
            and learned customer memory appear here.
          </p>
        </div>
        <StatusBadge
          label={detail?.providerState.outboundOutcomeBackedByProvider ? "Provider evidence" : "Approval gated"}
          tone={detail?.providerState.outboundOutcomeBackedByProvider ? "good" : "watch"}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1fr)]">
        <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-100">Approved test call</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">{gateMessage}</p>
            </div>
            <TonePill tone={canExecuteVoice ? "good" : "watch"}>{canExecuteVoice ? "Ready" : "Gated"}</TonePill>
          </div>
          <button
            className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#4e43ff] text-sm font-semibold text-white shadow-[0_12px_28px_rgba(78,67,255,0.24)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canExecuteVoice}
            onClick={() => onExecuteVoiceCall(action.id)}
            type="button"
          >
            {pendingAction === "voice" ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <Phone aria-hidden="true" size={16} />}
            Place approved test call
          </button>
          <div className="mt-5 space-y-3 border-t border-white/[0.08] pt-5 text-sm text-slate-400">
            <p className="leading-6">
              RunwayOps will place the demo call only after approval. Provider evidence appears here once the outbound
              call is accepted.
            </p>
            {providerEvidence ? (
              <Guardrail
                label={`Latest provider execution: ${providerEvidence.provider} ${providerEvidence.state}${
                  providerEvidence.providerExecutionId ? ` (${providerEvidence.providerExecutionId})` : " with no provider id"
                }.`}
              />
            ) : null}
            {voiceEvidence ? (
              <Guardrail
                label={`Latest voice call: ${voiceEvidence.state}${
                  voiceEvidence.providerCallId ? ` (${voiceEvidence.providerCallId})` : " with no provider id"
                }.`}
              />
            ) : null}
          </div>
        </div>

        <div className="rounded-md border border-white/[0.08] bg-[#0a101a] p-5">
          <p className="text-sm font-medium text-slate-100">Post-call memory review</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            After the call, RunwayOps fills this from transcript, callback, or recorded outcome evidence. Review it
            before saving customer memory.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-[190px_minmax(0,1fr)]">
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.04em] text-slate-500">Outcome</span>
              <select
                className="h-10 w-full rounded-md border border-white/[0.12] bg-[#111827] px-3 text-sm text-slate-100 outline-none"
                onChange={(event) => setOutcomeType(event.target.value as ProductActionOutcomeType)}
                value={outcomeType}
              >
                <option value="promise_to_pay">Promise to pay</option>
                <option value="payment_confirmed">Payment confirmed</option>
                <option value="no_answer">No answer</option>
                <option value="dispute_raised">Dispute raised</option>
                <option value="manual_note">Manual note</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.04em] text-slate-500">Promised date</span>
              <input
                className="h-10 w-full rounded-md border border-white/[0.12] bg-[#111827] px-3 text-sm text-slate-100 outline-none"
                onChange={(event) => setPromisedPaymentDate(event.target.value)}
                type="date"
                value={promisedPaymentDate}
              />
            </label>
          </div>
          <label className="mt-4 block space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.04em] text-slate-500">Learning note</span>
            <textarea
              className="min-h-[92px] w-full resize-none rounded-md border border-white/[0.12] bg-[#111827] p-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600"
              onChange={(event) => setSummary(event.target.value)}
              value={summary}
            />
          </label>
          <button
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/35 bg-emerald-400/10 text-sm font-semibold text-emerald-200 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!detail || summary.trim().length < 8 || isPending}
            onClick={submitOutcome}
            type="button"
          >
            {pendingAction === "outcome" ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <Sparkles aria-hidden="true" size={16} />}
            Approve customer memory
          </button>
        </div>
      </div>
    </Panel>
  );
}

function CustomerScreen({ currency, customer }: { currency: string; customer: CustomerProfile }) {
  return (
    <div className="space-y-4">
      <button className="inline-flex items-center gap-2 text-sm font-medium text-[#8279ff]" type="button">
        <ChevronLeft aria-hidden="true" size={16} />
        Back to customers
      </button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-4xl font-semibold tracking-normal text-white">{customer.name}</h1>
            <TonePill tone={customer.status === "Overdue" ? "risk" : "watch"}>{customer.status}</TonePill>
            <TonePill tone="watch">{customer.badge}</TonePill>
          </div>
          <p className="mt-4 flex items-center gap-3 text-sm text-slate-400">
            <Building2 aria-hidden="true" size={16} />
            {customer.segment}
            <span className="h-1 w-1 rounded-full bg-slate-600" />
            Customer since Feb 2023
          </p>
        </div>
        <div className="flex gap-3">
          <ToolbarButton icon={ChevronDown} label="Customer actions" />
          <button className="flex h-10 w-10 items-center justify-center rounded-md border border-white/[0.1] text-slate-300" type="button">
            <MoreHorizontal aria-hidden="true" size={18} />
          </button>
        </div>
      </div>

      <KpiStrip
        metrics={[
          { label: "Outstanding Invoices", value: formatCurrency(customer.outstandingCents, currency), helper: "3 invoices", tone: "risk" },
          { label: "Total Exposure", value: formatCurrency(customer.exposureCents, currency), helper: "Incl. future due", tone: "neutral" },
          { label: "Avg Days Late", value: `${customer.avgDaysLate} days`, helper: "vs. terms (30)", tone: "watch" },
          { label: "Promise Reliability", value: `${customer.reliability}%`, helper: "Medium", tone: "watch" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(430px,0.95fr)]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Behavior summary" meta={<Info aria-hidden="true" size={15} />} />
            <p className="mt-4 text-sm leading-6 text-slate-300">{customer.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {customer.tags.map((tag, index) => (
                <span
                  className={clsx(
                    "rounded-md px-3 py-1.5 text-xs font-medium",
                    index === 0 ? "bg-emerald-400/10 text-emerald-300" : "bg-[#2d3a89]/40 text-[#8b82ff]",
                  )}
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Interaction history" />
            <div className="mt-5 space-y-4">
              {[
                ["Latest customer evidence", customer.summary, customer.lastInteractionLabel, Sparkles, "good"],
                ["Recommended outreach", `Next best channel is ${customer.tags[0] ?? "manual review"} for ${customer.invoiceLabel}.`, "Now", Phone, "watch"],
                ["Approval state", "Outbound email and voice execution remain gated until approval and provider checks pass.", "Always on", ShieldCheck, "accent"],
              ].map(([title, body, time, Icon, tone]) => (
                <TimelineRow body={String(body)} icon={Icon as ComponentType<{ size?: number; className?: string }>} key={String(title)} time={String(time)} title={String(title)} tone={tone as StatusTone} />
              ))}
            </div>
            <button className="mx-auto mt-5 block text-sm font-medium text-[#8279ff]" type="button">View all interactions</button>
          </Panel>

          <Panel>
            <PanelHeader title="What we've learned (Customer memory)" />
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {customer.memoryCards.map(({ title, body, tone }) => (
                <MemoryCard body={body} key={title} title={title} tone={tone} />
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Outreach strategy" icon={Sparkles} />
            <div className="mt-5 rounded-md border border-white/[0.08] bg-white/[0.035] p-5">
              <span className="rounded-md bg-[#251e65]/70 px-3 py-1 text-xs font-medium text-[#9c92ff]">Recommended next action</span>
              <div className="mt-5 flex gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300">
                  <Phone aria-hidden="true" size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">Call Accounts Payable ({customer.contactName})</h3>
                  <p className="mt-1 text-sm text-slate-400">Confirm PO status and secure payment commitment.</p>
                </div>
              </div>
              <div className="mt-6 border-t border-white/[0.08] pt-5">
                <p className="text-xs uppercase text-slate-500">Success probability</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-400">72% <span className="align-middle text-xs text-emerald-300">High</span></p>
              </div>
              <div className="mt-6 border-t border-white/[0.08] pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase text-slate-500">Call script preview</p>
              <span className="text-xs text-[#8279ff]">Use this script</span>
                </div>
                <pre className="mt-4 whitespace-pre-wrap rounded-md border border-white/[0.08] bg-[#0a101a] p-4 font-mono text-xs leading-6 text-slate-300">{`Hi ${customer.contactName}, it's James from Marlow & Finch.\nI'm calling about ${customer.invoiceLabel} for ${formatCurrency(customer.outstandingCents, currency)}.\nI understand the PO was expected today. Is everything in place so we can process payment this week?`}</pre>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Supporting evidence" right={<span className="text-sm text-[#8279ff]">View all</span>} />
            <div className="mt-5 space-y-3">
              {[
                ["Selected invoice", `${formatCurrency(customer.outstandingCents, currency)} · Due date from live ledger`, "PDF", FileText],
                ["Latest memory", customer.summary, "Memory", Sparkles],
                ["Provider audit", "Provider IDs appear only after real provider execution.", "Audit", ShieldCheck],
              ].map(([title, detail, kind, Icon]) => (
                <EvidenceRow detail={String(detail)} icon={Icon as ComponentType<{ size?: number; className?: string }>} key={String(title)} kind={String(kind)} title={String(title)} />
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ForecastScreen({
  model,
  toggles,
  onToggle,
}: {
  model: ProductViewModel;
  toggles: Record<ScenarioToggleKey, boolean>;
  onToggle: (key: ScenarioToggleKey) => void;
}) {
  const activeCount = Object.values(toggles).filter(Boolean).length;
  const scenarioShiftCents = model.scenarioProjections.length > 0 ? activeCount * 250000 : 0;
  const controlKeys: ScenarioToggleKey[] = ["customerAPays", "partialPayment", "supplierDeferral"];

  return (
    <div className="space-y-5">
      <ScreenTitle
        title="Scenario Planner"
        description="Model different scenarios and see the impact on your cash runway."
        controls={<LiveDataMark />}
      />
      <KpiStrip metrics={model.forecastMetrics} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <Panel>
          <PanelHeader
            title="Cash Projection"
            meta="90 Days"
            right={
              <div className="flex gap-5 text-xs text-slate-400">
                <LegendDot color="bg-[#7066ff]" label="Baseline" />
                <LegendDot color="bg-emerald-400" label="Optimistic" />
                <LegendDot color="bg-red-400" label="Conservative" />
              </div>
            }
          />
          <ProjectionChart currency={model.currency} projections={model.scenarioProjections} shiftCents={scenarioShiftCents} />
        </Panel>

        <Panel>
          <PanelHeader title="Scenario Controls" />
          <p className="mt-2 text-sm text-slate-400">Adjust key assumptions to model outcomes.</p>
          <div className="mt-6 space-y-3">
            {model.scenarioControls.slice(0, 3).map((control, index) => (
              <ScenarioToggle
                active={toggles[controlKeys[index] ?? "customerAPays"]}
                icon={control.icon}
                key={control.label}
                label={control.label}
                meta={control.meta}
                onClick={() => onToggle(controlKeys[index] ?? "customerAPays")}
              />
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.75fr)_minmax(330px,0.8fr)]">
        <Panel>
          <PanelHeader title="Scenario Comparison" />
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {model.scenarioComparison.slice(0, 3).map((scenario) => (
              <ScenarioCard
                currency={model.currency}
                key={scenario.label}
                label={scenario.label}
                risk={scenario.risk}
                tone={scenario.tone}
                valueCents={scenario.valueCents + scenarioShiftCents}
              />
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Recommended Action Plan" />
          <p className="mt-2 text-sm text-slate-400">Focus on these high-impact actions.</p>
          <div className="mt-5 space-y-4">
            {model.recommendedPlan.map((item, index) => (
              <PlanRow index={index + 1} impact={item.impact} key={item.label} label={item.label} tone={item.tone} />
            ))}
          </div>
          <button className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#4e43ff] text-sm font-semibold text-white shadow-[0_12px_28px_rgba(78,67,255,0.28)]" type="button">
            Review Action Items
            <ArrowRight aria-hidden="true" size={17} />
          </button>
        </Panel>
        <Panel>
          <PanelHeader title="Sensitivity Analysis" meta="Impact on runway (days)" />
          <div className="mt-6 space-y-4">
            {model.sensitivityRows.map((row) => (
              <SensitivityRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function CasesScreen({ model }: { model: ProductViewModel }) {
  return (
    <div className="space-y-5">
      <ScreenTitle title="Cases" description="Monitor the active cash flow case and source readiness." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <PanelHeader title={model.caseName} meta={model.liveState === "live" ? "Live case" : "Needs connection"} />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <MetricBlock label="Company" value={model.companyName} />
            <MetricBlock label="Currency" value={model.currency} />
            <MetricBlock label="Evidence rows" value={model.evidenceCount} />
          </div>
          <div className="mt-6 rounded-md border border-white/[0.08] bg-white/[0.035] p-5">
            <h3 className="text-sm font-semibold text-white">Case posture</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {model.alertMessage ?? "Live Aurora state is connected. Forecasts, recommendations, provider readiness, and memory are shown in the product surfaces."}
            </p>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Readiness" />
          <div className="mt-5 space-y-3">
            {model.providerStatuses.map((provider) => (
              <ProviderRow provider={provider} key={provider.name} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ActivityScreen({ model }: { model: ProductViewModel }) {
  return (
    <div className="space-y-5">
      <ScreenTitle title="Agent Activity" description="Follow the assistant's read, forecast, recommendation, approval, and learning loop." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelHeader title="Workflow timeline" />
          <div className="mt-6 space-y-4">
            {model.agentTimeline.map((step) => (
              <TimelineRow body={step.body} icon={step.icon} key={step.id} time={step.time} title={step.title} tone={step.tone} />
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Readiness surfaces" />
          <div className="mt-5 space-y-3">
            {model.providerStatuses.map((provider) => (
              <ProviderRow provider={provider} key={provider.name} />
            ))}
          </div>
          <div className="mt-5 rounded-md border border-emerald-400/20 bg-emerald-400/5 p-4">
            <p className="text-sm font-medium text-emerald-300">Approval gate enabled</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Outbound email and voice actions remain gated. This UI does not mark provider outcomes as sent or called without persisted provider execution state.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ConnectionsScreen({ model }: { model: ProductViewModel }) {
  return (
    <div className="space-y-5">
      <ScreenTitle title="Settings" description="Connection readiness for AI reasoning, tracing, email, voice, and live data." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {model.providerStatuses.map((provider) => (
          <Panel key={provider.name}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-white">{provider.name}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{provider.message}</p>
              </div>
              <StatusBadge tone={provider.tone} label={provider.label} />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function KpiStrip({ metrics }: { metrics: Array<{ label: string; value: string; helper: string; tone: StatusTone }> }) {
  return (
    <section className="grid min-w-0 overflow-hidden rounded-lg border border-white/[0.09] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => (
        <div className={clsx("min-h-[118px] min-w-0 p-7", index > 0 && "border-t border-white/[0.08] md:border-l md:border-t-0") } key={metric.label}>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.04em] text-slate-500">{metric.label}</p>
            <Info aria-hidden="true" className="text-slate-500" size={15} />
          </div>
          <p className={clsx("mt-5 text-3xl font-semibold tracking-normal", toneText(metric.tone))}>{metric.value}</p>
          <p className={clsx("mt-3 text-sm", metric.tone === "good" ? "text-emerald-400" : metric.tone === "risk" ? "text-red-400" : metric.tone === "watch" ? "text-amber-400" : "text-slate-400")}>{metric.helper}</p>
        </div>
      ))}
    </section>
  );
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("min-w-0 overflow-hidden rounded-lg border border-white/[0.09] bg-white/[0.035] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_20px_60px_rgba(0,0,0,0.12)]", className)}>
      {children}
    </section>
  );
}

function PanelHeader({
  title,
  meta,
  right,
  icon: Icon,
}: {
  title: string;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  icon?: ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        {Icon ? <Icon aria-hidden="true" className="text-[#887eff]" size={19} /> : null}
        <h2 className="text-lg font-semibold tracking-normal text-white">{title}</h2>
        {meta ? <span className="text-sm text-slate-500">{meta}</span> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

function ScreenTitle({
  title,
  description,
  controls,
}: {
  title: string;
  description: string;
  controls?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-normal text-white">{title}</h1>
        <p className="mt-2 text-sm text-slate-400">{description}</p>
      </div>
      {controls ? <div className="flex flex-wrap gap-3">{controls}</div> : null}
    </div>
  );
}

function ToolbarButton({ icon: Icon, label }: { icon: ComponentType<{ size?: number; className?: string }>; label: string }) {
  return (
    <button className="inline-flex h-10 items-center gap-2 rounded-md border border-white/[0.1] bg-white/[0.025] px-4 text-sm font-medium text-slate-300 hover:bg-white/[0.06] hover:text-white" type="button">
      <Icon aria-hidden="true" size={16} />
      {label}
    </button>
  );
}

function LiveDataBanner({ state, message }: { state: ProductViewModel["liveState"]; message: string }) {
  const isLoading = state === "loading";
  return (
    <div className="flex min-w-0 max-w-full items-start gap-3 overflow-hidden rounded-lg border border-amber-400/25 bg-amber-400/[0.07] p-4 text-sm text-amber-100">
      {isLoading ? <Loader2 aria-hidden="true" className="mt-0.5 animate-spin text-amber-300" size={18} /> : <CircleAlert aria-hidden="true" className="mt-0.5 text-amber-300" size={18} />}
      <p className="min-w-0 break-words leading-6">{message}</p>
    </div>
  );
}

function CashflowBars({ points, currency }: { points: ProductViewModel["cashflowBars"]; currency: string }) {
  const max = Math.max(...points.map((point) => Math.abs(point.valueCents)), 100);
  const zeroY = 242;

  return (
    <div className="mt-8 h-[345px] overflow-hidden">
      <svg className="h-full w-full" role="img" viewBox="0 0 760 345">
        <defs>
          <linearGradient id="netGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7467ff" />
            <stop offset="100%" stopColor="#3b2bdf" />
          </linearGradient>
          <linearGradient id="inflowGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#5ee682" />
            <stop offset="100%" stopColor="#16833f" />
          </linearGradient>
          <linearGradient id="outflowGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ff5261" />
            <stop offset="100%" stopColor="#c51f39" />
          </linearGradient>
        </defs>
        {[60, 120, 180, 240, 300].map((y) => (
          <line key={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" x1="58" x2="735" y1={y} y2={y} />
        ))}
        <line stroke="rgba(255,255,255,0.16)" strokeWidth="1" x1="58" x2="735" y1={zeroY} y2={zeroY} />
        {points.map((point, index) => {
          const x = 82 + index * 110;
          const height = Math.max(24, Math.abs(point.valueCents / max) * 175);
          const y = point.valueCents >= 0 ? zeroY - height : zeroY;
          const fill = point.kind === "net" ? "url(#netGradient)" : point.valueCents >= 0 ? "url(#inflowGradient)" : "url(#outflowGradient)";
          const label = point.valueCents === 0 ? "Pending" : formatCompactCurrency(point.valueCents, currency);

          return (
            <g key={point.label}>
              <rect fill={fill} height={height} rx="2" width="56" x={x} y={y} />
              <text fill="#f8fafc" fontSize="13" fontWeight="600" textAnchor="middle" x={x + 28} y={point.valueCents >= 0 ? y - 10 : y + height + 18}>
                {label}
              </text>
              <text fill="#94a3b8" fontSize="12" textAnchor="middle" x={x + 28} y="315">
                {point.label}
              </text>
              {index < points.length - 1 ? (
                <path d={`M ${x + 56} ${point.valueCents >= 0 ? y : y + height} C ${x + 76} ${point.valueCents >= 0 ? y : y + height}, ${x + 84} ${zeroY - 20}, ${x + 104} ${zeroY - 20}`} fill="none" stroke="rgba(148,163,184,0.65)" strokeDasharray="4 5" />
              ) : null}
            </g>
          );
        })}
        <text fill="#94a3b8" fontSize="12" x="6" y="64">£600k</text>
        <text fill="#94a3b8" fontSize="12" x="6" y="124">£400k</text>
        <text fill="#94a3b8" fontSize="12" x="6" y="184">£200k</text>
        <text fill="#94a3b8" fontSize="12" x="25" y="246">£0</text>
        <text fill="#94a3b8" fontSize="12" x="5" y="304">-£200k</text>
      </svg>
    </div>
  );
}

function ProjectionChart({
  currency,
  projections,
  shiftCents,
}: {
  currency: string;
  projections: ProductViewModel["scenarioProjections"];
  shiftCents: number;
}) {
  if (projections.length === 0 || projections.every((projection) => projection.points.length === 0)) {
    return (
      <div className="mt-7 flex h-[340px] items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.025] text-sm text-slate-400">
        Live scenario projections are not available yet.
      </div>
    );
  }

  const visible = projections.slice(0, 3);
  const allValues = visible.flatMap((projection) => projection.points.map((point) => point.expectedCashCents + shiftCents));
  const minValue = Math.min(...allValues, 0);
  const maxValue = Math.max(...allValues, 100);
  const range = Math.max(1, maxValue - minValue);
  const latest = visible[0]?.points.at(-1);
  const latestDate = latest ? formatProjectionTooltipDate(latest.date) : "Latest";
  const chartColor = (tone: StatusTone) => tone === "good" ? "#4ade80" : tone === "risk" ? "#f87171" : tone === "watch" ? "#f59e0b" : "#7368ff";
  const projectPointY = (value: number) => 272 - ((value - minValue) / range) * 220;
  const xFor = (index: number, total: number) => 58 + (total <= 1 ? 0 : index * (620 / (total - 1)));
  const zeroY = clamp(projectPointY(0), 46, 290);

  return (
    <div className="mt-7 h-[340px]">
      <svg className="h-full w-full" role="img" viewBox="0 0 720 340">
        <rect fill="rgba(239,68,68,0.12)" height={Math.max(0, 290 - zeroY)} width="620" x="58" y={zeroY} />
        {[58, 145, 232, 319, 406, 493, 580, 667].map((x) => (
          <line key={x} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 4" x1={x} x2={x} y1="32" y2="292" />
        ))}
        {[56, 110, 164, 218, 272].map((y) => (
          <line key={y} stroke="rgba(255,255,255,0.07)" x1="58" x2="678" y1={y} y2={y} />
        ))}
        {visible.map((projection) => (
          <ProjectionPolyline
            color={chartColor(projection.tone)}
            dashed={projection.dashed}
            key={projection.key}
            points={projection.points.map((point, index) => ({
              x: xFor(index, projection.points.length),
              y: projectPointY(point.expectedCashCents + shiftCents),
            }))}
          />
        ))}
        {visible[0]?.points.map((point, index) => index % Math.max(1, Math.ceil((visible[0]?.points.length ?? 1) / 5)) === 0 ? (
          <circle
            cx={xFor(index, visible[0]?.points.length ?? 1)}
            cy={projectPointY(point.expectedCashCents + shiftCents)}
            fill="#0b1020"
            key={`${point.date}-${index}`}
            r="5"
            stroke="#8177ff"
            strokeWidth="3"
          />
        ) : null)}
        <foreignObject height="116" width="185" x="488" y="46">
          <div className="rounded-md border border-white/[0.1] bg-[#0d1420]/95 p-4 text-xs text-slate-300">
            <p className="text-sm text-white">{latestDate}</p>
            {visible.map((projection) => (
              <p className={clsx("mt-2", toneText(projection.tone))} key={projection.key}>
                {projection.label} {formatCurrency((projection.points.at(-1)?.expectedCashCents ?? projection.summary.endingCashCents) + shiftCents, currency)}
              </p>
            ))}
          </div>
        </foreignObject>
        <text fill="#94a3b8" fontSize="12" x="4" y="40">{formatCompactCurrency(maxValue, currency)}</text>
        <text fill="#94a3b8" fontSize="12" x="4" y="148">{formatCompactCurrency(Math.round((maxValue + minValue) / 2), currency)}</text>
        <text fill="#94a3b8" fontSize="12" x="25" y={zeroY + 4}>£0</text>
        <text fill="#94a3b8" fontSize="12" x="5" y="310">{formatCompactCurrency(minValue, currency)}</text>
      </svg>
    </div>
  );
}

function ProjectionPolyline({ points, color, dashed }: { points: Array<{ x: number; y: number }>; color: string; dashed?: boolean }) {
  const pointList = points.map((point) => `${point.x},${point.y}`).join(" ");
  return <polyline fill="none" points={pointList} stroke={color} strokeDasharray={dashed ? "7 7" : undefined} strokeLinecap="round" strokeWidth="2.5" />;
}

function ActionSummaryRow({ action, index }: { action: ProductAction; index: number }) {
  const tone = action.priority === "High" ? "risk" : action.priority === "Medium" ? "watch" : "neutral";
  const ChannelIcon = action.channel === "Phone" ? Phone : action.channel === "Portal" ? ExternalLink : Mail;

  return (
    <article className="flex items-center gap-4 rounded-lg bg-white/[0.045] p-4">
      <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold", toneBorder(tone as StatusTone), toneText(tone as StatusTone))}>{index}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{action.title}</p>
        <p className="mt-2 truncate text-sm text-slate-500">{action.detail}</p>
      </div>
      <div className="text-right">
        <p className={clsx("text-sm font-semibold", action.isNegative ? "text-red-400" : "text-emerald-400")}>{formatCurrency(action.impactCents, action.currency ?? "GBP")}</p>
        <p className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-400"><ChannelIcon aria-hidden="true" size={15} />{action.channel}</p>
      </div>
    </article>
  );
}

function PendingApprovalCard({
  action,
  active,
  disabled,
  onSelect,
  onApprove,
  onEdit,
  onReject,
}: {
  action: ProductAction;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
}) {
  const tone = action.priority === "High" ? "risk" : "watch";
  const hasPendingApproval = action.approvalState === "Pending";

  return (
    <article
      className={clsx(
        "w-full rounded-lg border p-4 text-left transition",
        active ? toneBorder(tone) : "border-white/[0.08]",
        active ? "bg-white/[0.055]" : "bg-white/[0.025] hover:bg-white/[0.045]",
      )}
    >
      <button className="block w-full text-left" onClick={onSelect} type="button">
        <div className="flex items-start gap-4">
          <TonePill tone={tone}>{action.priority}</TonePill>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-white">{action.customer}</p>
            <p className="mt-1 text-sm text-slate-400">{action.detail}</p>
          </div>
        </div>
      </button>
      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-white/[0.08] pt-4">
        <MetricBlock label="Cash impact" value={formatCurrency(action.impactCents, action.currency ?? "GBP")} tone={action.isNegative ? "risk" : "good"} />
        <MetricBlock label="Channel" value={action.channel} />
        <MetricBlock label="Confidence" value={action.confidence} tone={action.confidence === "High" ? "good" : "watch"} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <button
          className="h-9 rounded-md bg-[#4e43ff] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled || !hasPendingApproval}
          onClick={onApprove}
          type="button"
        >
          Approve
        </button>
        <button
          className="h-9 rounded-md border border-white/[0.1] text-sm font-medium text-[#b3adff] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled || action.approvalState === "Approved"}
          onClick={onEdit}
          type="button"
        >
          Edit
        </button>
        <button
          className="h-9 rounded-md border border-white/[0.1] text-sm font-medium text-[#b3adff] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled || !hasPendingApproval}
          onClick={onReject}
          type="button"
        >
          Reject
        </button>
      </div>
    </article>
  );
}

function ActionDecisionBar({
  actionId,
  canApprove,
  canReject,
  mutationState,
  onApprove,
  onEdit,
  onReject,
}: {
  actionId: string;
  canApprove: boolean;
  canReject: boolean;
  mutationState: ActionMutationState;
  onApprove: (id: string) => void;
  onEdit: () => void;
  onReject: (id: string) => void;
}) {
  const pendingAction = mutationState.kind === "pending" ? mutationState.action : null;

  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <button
        className="flex h-11 items-center justify-center gap-2 rounded-md bg-[#4e43ff] text-sm font-semibold text-white shadow-[0_12px_28px_rgba(78,67,255,0.28)] disabled:cursor-not-allowed disabled:opacity-45"
        disabled={!canApprove}
        onClick={() => onApprove(actionId)}
        type="button"
      >
        {pendingAction === "approve" ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
        Approve
      </button>
      <button
        className="flex h-11 items-center justify-center gap-2 rounded-md border border-white/[0.12] text-sm font-medium text-[#b3adff] disabled:cursor-not-allowed disabled:opacity-45"
        disabled={mutationState.kind === "pending"}
        onClick={onEdit}
        type="button"
      >
        Edit
      </button>
      <button
        className="flex h-11 items-center justify-center gap-2 rounded-md border border-white/[0.12] text-sm font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={!canReject}
        onClick={() => onReject(actionId)}
        type="button"
      >
        {pendingAction === "reject" ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
        Reject
      </button>
    </div>
  );
}

function DraftSourceBadge({ draft, state }: { draft: ProductActionDetail["draftPreview"] | null; state: Loadable<ProductActionDetail> }) {
  if (state.kind === "loading") {
    return <StatusBadge label="Loading live detail" tone="watch" />;
  }

  if (state.kind === "error" || state.kind === "unavailable") {
    return <StatusBadge label="Detail unavailable" tone="risk" />;
  }

  if (!draft) {
    return <StatusBadge label="No draft persisted" tone="watch" />;
  }

  if (draft.source === "fireworks") {
    return <StatusBadge label="Live AI generated" tone="good" />;
  }

  if (draft.source === "deterministic_fallback") {
    return <StatusBadge label="Guardrailed draft" tone="watch" />;
  }

  return <StatusBadge label="Persisted draft" tone="accent" />;
}

function ActionPreviewBlock({ action, detailState }: { action: ProductAction; detailState: Loadable<ProductActionDetail> }) {
  if (detailState.kind === "loading") {
    return (
      <div className="mt-3 flex min-h-[150px] items-center justify-center rounded-md border border-white/[0.08] bg-[#0a101a] text-sm text-slate-400">
        <Loader2 aria-hidden="true" className="mr-2 animate-spin text-[#8279ff]" size={16} />
        Generating live action detail...
      </div>
    );
  }

  if (detailState.kind === "error" || detailState.kind === "unavailable") {
    return (
      <div className="mt-3 rounded-md border border-red-400/25 bg-red-400/10 p-5 text-sm leading-6 text-red-100">
        {detailState.message}
      </div>
    );
  }

  const draft = detailState.data.draftPreview;
  const body =
    draft?.body ??
    (action.channel === "Phone"
      ? scriptToPreviewBody(detailState.data.callScriptPreview)
      : action.draftPreview);
  const subject = draft?.subject;

  return (
    <div className="mt-3 rounded-md border border-white/[0.08] bg-[#0a101a]">
      {subject ? (
        <div className="border-b border-white/[0.08] px-5 py-3">
          <p className="text-xs uppercase tracking-[0.04em] text-slate-500">Subject</p>
          <p className="mt-1 text-sm font-medium text-slate-100">{subject}</p>
        </div>
      ) : null}
      <pre className="max-h-[340px] whitespace-pre-wrap overflow-auto p-5 font-mono text-xs leading-6 text-slate-300">
        {body}
      </pre>
    </div>
  );
}

function ActionDraftEditor({
  action,
  detail,
  isSaving,
  onClose,
  onSave,
}: {
  action: ProductAction;
  detail: ProductActionDetail | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (id: string, input: { channel: "email" | "voice_script"; subject: string | null; body: string }) => void;
}) {
  const draft = detail?.draftPreview ?? null;
  const channel = draft?.channel ?? (action.channel === "Phone" ? "voice_script" : "email");
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? (detail ? scriptToPreviewBody(detail.callScriptPreview) : action.draftPreview));

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/65 px-4 py-6 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-3xl rounded-lg border border-white/[0.12] bg-[#080d18] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Edit {channel === "voice_script" ? "call script" : "email draft"}</h2>
            <p className="mt-2 text-sm text-slate-400">Changes are saved as a draft and remain subject to human approval.</p>
          </div>
          <button className="rounded-md border border-white/[0.1] px-3 py-2 text-sm text-slate-300" onClick={onClose} type="button">
            Close
          </button>
        </div>
        {channel === "email" ? (
          <label className="mt-6 block">
            <span className="text-sm font-medium text-slate-300">Subject</span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-white outline-none focus:border-[#7368ff]"
              onChange={(event) => setSubject(event.target.value)}
              value={subject}
            />
          </label>
        ) : null}
        <label className="mt-5 block">
          <span className="text-sm font-medium text-slate-300">{channel === "voice_script" ? "Call script" : "Draft body"}</span>
          <textarea
            className="mt-2 min-h-[280px] w-full resize-y rounded-md border border-white/[0.1] bg-white/[0.035] p-4 font-mono text-xs leading-6 text-white outline-none focus:border-[#7368ff]"
            onChange={(event) => setBody(event.target.value)}
            value={body}
          />
        </label>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button className="h-11 rounded-md border border-white/[0.1] px-5 text-sm font-medium text-slate-300" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="flex h-11 items-center justify-center gap-2 rounded-md bg-[#4e43ff] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isSaving || body.trim().length === 0}
            onClick={() => onSave(action.id, { channel, subject: channel === "email" ? subject : null, body })}
            type="button"
          >
            {isSaving ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
            Save draft
          </button>
        </div>
      </div>
    </div>
  );
}

function EvidenceChip({ type, label, detail }: { type: ProductActionDetail["evidence"][number]["type"]; label: string; detail: string }) {
  return (
    <article className="rounded-md border border-white/[0.08] bg-white/[0.025] p-4">
      <p className="text-xs uppercase tracking-[0.04em] text-slate-500">{formatIdentifier(type)}</p>
      <p className="mt-2 text-sm font-medium text-white">{label}</p>
      <p className="mt-2 text-sm leading-5 text-slate-400">{detail}</p>
    </article>
  );
}

function AgentTile({ tile }: { tile: ProductViewModel["agentTiles"][number] }) {
  const Icon = tile.icon;

  return (
    <div className="border-r border-white/[0.08] px-5 last:border-r-0">
      <div className={clsx("mx-auto flex h-12 w-12 items-center justify-center rounded-md border", toneBorder(tile.tone), tile.tone === "watch" ? "bg-amber-400/12" : tile.tone === "good" ? "bg-emerald-400/12" : "bg-[#4e43ff]/15")}>
        <Icon aria-hidden="true" className={toneText(tile.tone)} size={24} />
      </div>
      <p className="mt-5 text-center text-sm font-medium text-white">{tile.label}</p>
      <p className={clsx("mt-3 text-center text-sm", toneText(tile.tone))}>
        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-current" />
        {tile.status}
      </p>
      <p className="mt-2 text-center text-xs text-slate-500">{tile.detail}</p>
    </div>
  );
}

function ApprovalRow({ approval }: { approval: ProductViewModel["approvals"][number] }) {
  return (
    <article className="flex items-center gap-4 rounded-md border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber-400/30 bg-amber-400/10 text-amber-300">
        <FileText aria-hidden="true" size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{approval.title}</p>
        <p className="mt-1 truncate text-sm text-slate-400">{approval.detail}</p>
      </div>
      <button className="h-10 rounded-md bg-[#4e43ff] px-5 text-sm font-semibold text-white" type="button">Review</button>
    </article>
  );
}

function ScenarioToggle({
  active,
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button className="flex w-full items-center gap-4 rounded-md border border-white/[0.08] bg-white/[0.035] p-4 text-left" onClick={onClick} type="button">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
        <Icon aria-hidden="true" size={21} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="mt-1 block text-sm text-slate-400">{meta}</span>
      </span>
      <span className="text-sm font-medium text-emerald-400">{active ? "On" : "Off"}</span>
      <span className={clsx("relative h-6 w-11 rounded-full transition", active ? "bg-emerald-500" : "bg-slate-700")}>
        <span className={clsx("absolute top-1 h-4 w-4 rounded-full bg-white transition", active ? "left-6" : "left-1")} />
      </span>
    </button>
  );
}

function ScenarioCard({
  currency,
  label,
  valueCents,
  tone,
  risk,
}: {
  currency: string;
  label: string;
  valueCents: number;
  tone: StatusTone;
  risk: string;
}) {
  return (
    <div className={clsx("rounded-md border p-4", toneBorder(tone), "bg-white/[0.025]")}>
      <p className="text-sm font-medium text-white">{label}</p>
      <p className={clsx("mt-5 text-2xl font-semibold", toneText(tone))}>{formatCurrency(valueCents, currency)}</p>
      <p className="mt-2 text-sm text-slate-400">Ending cash</p>
      <TonePill tone={tone}>{risk}</TonePill>
      <p className="mt-3 text-xs text-slate-500">Risk of shortfall</p>
    </div>
  );
}

function PlanRow({ index, label, impact, tone }: { index: number; label: string; impact: string; tone: StatusTone }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.08] pb-3 last:border-0">
      <span className={clsx("flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold", tone === "good" ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300")}>{index}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{label}</p>
        <p className="mt-1 text-xs text-slate-500">Recommended step</p>
      </div>
      <span className={clsx("text-sm font-semibold", toneText(tone))}>{impact}</span>
    </div>
  );
}

function SensitivityRow({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  const width = Math.min(92, Math.abs(value) * 3.5);

  return (
    <div className="grid grid-cols-[160px_1fr_36px] items-center gap-3 text-sm">
      <span className="truncate text-slate-400">{label}</span>
      <span className="relative h-5 border-l border-white/[0.16]">
        <span
          className={clsx("absolute top-0 h-5", positive ? "left-0 bg-emerald-400" : "right-1/2 bg-red-400")}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className={clsx("text-right font-medium", positive ? "text-emerald-400" : "text-red-400")}>{positive ? `+${value}` : value}</span>
    </div>
  );
}

function TimelineRow({
  icon: Icon,
  title,
  body,
  time,
  tone,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
  time: string;
  tone: StatusTone;
}) {
  return (
    <article className="flex gap-4">
      <div className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", tone === "good" ? "bg-emerald-500/18 text-emerald-300" : tone === "watch" ? "bg-amber-500/18 text-amber-300" : tone === "accent" ? "bg-[#4e43ff]/20 text-[#9d95ff]" : "bg-slate-700 text-slate-300")}>
        <Icon aria-hidden="true" size={18} />
      </div>
      <div className="min-w-0 flex-1 border-b border-white/[0.07] pb-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-white">{title}</p>
          <span className="shrink-0 text-xs text-slate-500">{time}</span>
        </div>
        <p className="mt-1 text-sm leading-5 text-slate-400">{body}</p>
      </div>
    </article>
  );
}

function MemoryCard({ title, body, tone }: { title: string; body: string; tone: StatusTone }) {
  return (
    <article className={clsx("rounded-md border bg-white/[0.025] p-4", toneBorder(tone))}>
      <div className="flex items-start justify-between gap-3">
        <CheckCircle2 aria-hidden="true" className={toneText(tone)} size={19} />
        <MoreHorizontal aria-hidden="true" className="text-slate-500" size={17} />
      </div>
      <p className="mt-4 text-sm font-medium text-white">{title}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{body}</p>
      <p className="mt-4 text-xs text-slate-500">Confidence <span className={toneText(tone)}>••••</span> High</p>
    </article>
  );
}

function EvidenceRow({ icon: Icon, title, detail, kind }: { icon: ComponentType<{ size?: number; className?: string }>; title: string; detail: string; kind: string }) {
  return (
    <article className="flex items-center gap-4 rounded-md bg-white/[0.035] p-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-red-400/15 text-red-300">
        <Icon aria-hidden="true" size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white">{title}</span>
        <span className="mt-1 block truncate text-sm text-slate-400">{detail}</span>
      </span>
      <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs text-slate-400">{kind}</span>
      <Download aria-hidden="true" className="text-slate-400" size={17} />
    </article>
  );
}

function Guardrail({ label }: { label: string }) {
  return (
    <div className="flex gap-3">
      <CircleCheck aria-hidden="true" className="shrink-0 text-emerald-400" size={18} />
      <span>{label}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={clsx("h-2.5 w-2.5 rounded-full", color)} />
      {label}
    </span>
  );
}

function TonePill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return <span className={clsx("mt-4 inline-flex rounded-md border px-3 py-1 text-xs font-medium", toneBorder(tone), toneText(tone), toneBg(tone))}>{children}</span>;
}

function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return <span className={clsx("rounded-md border px-2.5 py-1 text-xs font-medium", toneBorder(tone), toneText(tone), toneBg(tone))}>{label}</span>;
}

function MetricBlock({ label, value, tone = "neutral" }: { label: string; value: string; tone?: StatusTone }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-slate-500">{label}</p>
      <p className={clsx("mt-2 truncate text-sm font-semibold", toneText(tone))}>{value}</p>
    </div>
  );
}

function ProviderRow({ provider }: { provider: ProviderView }) {
  return (
    <article className="flex items-start justify-between gap-4 rounded-md border border-white/[0.08] bg-white/[0.025] p-4">
      <div>
        <p className="text-sm font-medium text-white">{provider.name}</p>
        <p className="mt-1 text-sm leading-5 text-slate-400">{provider.message}</p>
      </div>
      <StatusBadge label={provider.label} tone={provider.tone} />
    </article>
  );
}

function LiveDataMark() {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-300">
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
      <span className="font-medium text-white">Live data</span>
      <span className="text-slate-500">Projections update as events arrive</span>
      <Info aria-hidden="true" className="text-slate-500" size={15} />
    </div>
  );
}

async function fetchProductLiveSnapshot(): Promise<ProductLiveSnapshot> {
  const [
    caseResult,
    ingestionResult,
    runtimeResult,
    productOverviewResult,
    productActionsResult,
    productCustomersResult,
    productScenariosResult,
    productActivityResult,
    voiceReadinessResult,
  ] = await Promise.all([
    fetchCurrentCase(),
    fetchIngestionStatus(),
    fetchForecastCockpit(),
    fetchProductResource<ProductOverviewState>("/api/product/overview", "Unable to load product overview."),
    fetchProductResource<ProductActionsState>("/api/product/actions", "Unable to load product actions."),
    fetchProductResource<ProductCustomersState>("/api/product/customers", "Unable to load product customers."),
    fetchProductResource<ProductScenariosState>("/api/product/scenarios", "Unable to load product scenarios."),
    fetchProductResource<ProductAgentActivityState>("/api/product/agent-activity", "Unable to load product activity."),
    fetchProductResource<VoiceProviderReadiness>("/api/product/voice/status", "Unable to load voice readiness."),
  ]);

  return {
    caseResult,
    ingestionResult,
    runtimeResult,
    productOverviewResult,
    productActionsResult,
    productCustomersResult,
    productScenariosResult,
    productActivityResult,
    voiceReadinessResult,
  };
}

async function fetchCurrentCase(): Promise<Loadable<CompanyCaseState>> {
  try {
    const response = await fetch("/api/current-case", { cache: "no-store" });
    const payload = (await response.json()) as CurrentCaseApiResponse;

    if (payload.status === "ok") {
      return { kind: "ready", data: payload.data };
    }

    if (payload.status === "unavailable") {
      return { kind: "unavailable", message: payload.message, missingEnv: payload.missingEnv };
    }

    return { kind: "error", message: payload.message };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Unable to load live case." };
  }
}

async function fetchIngestionStatus(): Promise<Loadable<IngestionStatusState>> {
  try {
    const response = await fetch("/api/ingestion-status", { cache: "no-store" });
    const payload = (await response.json()) as IngestionStatusApiResponse;

    if (payload.status === "ok") {
      return { kind: "ready", data: payload.data };
    }

    if (payload.status === "unavailable") {
      return { kind: "unavailable", message: payload.message, missingEnv: payload.missingEnv };
    }

    return { kind: "error", message: payload.message };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Unable to load source readiness." };
  }
}

async function fetchForecastCockpit(): Promise<Loadable<Cp3ForecastCockpitState>> {
  try {
    const response = await fetch("/api/cp3/forecast-cockpit", { cache: "no-store" });
    const payload = (await response.json()) as Cp3ForecastCockpitApiResponse;

    if (payload.status === "ok") {
      return { kind: "ready", data: payload.data };
    }

    if (payload.status === "unavailable") {
      return { kind: "unavailable", message: payload.message, missingEnv: payload.missingEnv };
    }

    return { kind: "error", message: payload.message };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Unable to load agent runtime." };
  }
}

async function fetchProductResource<T>(path: string, fallbackMessage: string): Promise<Loadable<T>> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    const payload = (await response.json()) as ProductApiResponse<T>;

    if (payload.status === "ok" || payload.status === "degraded") {
      return { kind: "ready", data: payload.data };
    }

    if (payload.status === "unavailable") {
      return { kind: "unavailable", message: payload.message, missingEnv: payload.missingEnv };
    }

    return { kind: "error", message: payload.message };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : fallbackMessage };
  }
}

async function postProductMutation<T>(path: string, body: Record<string, unknown>): Promise<ProductMutationResponse<T>> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as ProductMutationResponse<T>;

    if (payload.status === "ok" || payload.status === "blocked" || payload.status === "unavailable" || payload.status === "error") {
      return payload;
    }

    return { status: "error", message: response.ok ? "Unexpected product mutation response." : `Request failed with HTTP ${response.status}.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to update product action." };
  }
}

type ProductViewModel = {
  companyName: string;
  caseName: string;
  currency: string;
  generatedAt: string;
  liveState: "live" | "loading" | "unavailable" | "error";
  alertMessage: string | null;
  riskNarrative: {
    title: string;
    body: string;
    primaryAction: string;
    outcome: string;
    tone: StatusTone;
  };
  readinessSummary: string;
  overviewMetrics: Array<{ label: string; value: string; helper: string; tone: StatusTone }>;
  forecastMetrics: Array<{ label: string; value: string; helper: string; tone: StatusTone }>;
  cashflowBars: Array<{ label: string; valueCents: number; kind: "net" | "movement" }>;
  actions: ProductAction[];
  approvals: Array<{ id: string; title: string; detail: string }>;
  agentTiles: Array<{ id: string; label: string; status: string; detail: string; tone: StatusTone; icon: ComponentType<{ size?: number; className?: string }> }>;
  providerStatuses: ProviderView[];
  customer: CustomerProfile;
  agentTimeline: Array<{ id: string; title: string; body: string; time: string; tone: StatusTone; icon: ComponentType<{ size?: number; className?: string }> }>;
  scenarioProjections: Array<{
    key: string;
    label: string;
    tone: StatusTone;
    dashed?: boolean;
    summary: {
      minimumCashCents: number;
      minimumCashDate: string | null;
      endingCashCents: number;
      runwayDays: number | null;
      shortfallCents: number;
    };
    points: Array<{ date: string; expectedCashCents: number }>;
  }>;
  scenarioControls: Array<{ label: string; meta: string; icon: ComponentType<{ size?: number; className?: string }> }>;
  scenarioComparison: Array<{ label: string; valueCents: number; tone: StatusTone; risk: string }>;
  recommendedPlan: Array<{ label: string; impact: string; tone: StatusTone }>;
  sensitivityRows: Array<{ label: string; value: number }>;
  evidenceCount: string;
};

type ProviderView = {
  name: string;
  label: string;
  message: string;
  tone: StatusTone;
};

function buildProductViewModel(
  caseState: Loadable<CompanyCaseState>,
  runtimeState: Loadable<Cp3ForecastCockpitState>,
  ingestionState: Loadable<IngestionStatusState>,
  productOverviewState: Loadable<ProductOverviewState>,
  productActionsState: Loadable<ProductActionsState>,
  productCustomersState: Loadable<ProductCustomersState>,
  productScenariosState: Loadable<ProductScenariosState>,
  productActivityState: Loadable<ProductAgentActivityState>,
  voiceReadinessState: Loadable<VoiceProviderReadiness>,
): ProductViewModel {
  const liveState = caseState.kind === "ready" ? "live" : caseState.kind;
  const data = caseState.kind === "ready" ? caseState.data : null;
  const runtime = runtimeState.kind === "ready" ? runtimeState.data : null;
  const currency = data?.company.baseCurrency ?? runtime?.currency ?? "GBP";
  const companyName = data?.company.name ?? "Marlow & Finch Ltd";
  const caseName = data?.caseId ? "Cash Flow Watch" : "Cash Flow Watch";
  const generatedAt = runtime?.generatedAt ? `Last updated: ${formatRelativeTime(runtime.generatedAt)}` : liveState === "loading" ? "Loading live data" : "Last updated: unavailable";
  const overdueInvoices = data?.invoices.filter((invoice) => invoice.status === "overdue") ?? [];
  const openObligations = data?.obligations.filter((obligation) => obligation.status !== "paid") ?? [];
  const totalOverdue = sumCents(overdueInvoices.map((invoice) => invoice.outstandingCents));
  const obligationTotal = sumCents(openObligations.map((obligation) => obligation.amountCents));
  const forecastLow = getForecastLow(data, runtime);
  const actions = buildActions(data, runtime, currency);
  const customer = buildCustomerProfile(data, totalOverdue);
  const providerStatuses = buildProviderViews(runtimeState);
  const topAction = actions[0];
  const base: ProductViewModel = {
    companyName,
    caseName,
    currency,
    generatedAt,
    liveState,
    alertMessage:
      caseState.kind === "ready"
        ? null
        : caseState.kind === "loading"
          ? "Connecting to live case data. Recommendations remain gated until the case is loaded."
        : "Live cashflow data is not connected in this environment. Recommendations, provider outcomes, and approvals remain unavailable until the case data connection is restored.",
    riskNarrative: buildRiskNarrative({
      companyName,
      currency,
      currentCashCents: data?.company.cashBalanceCents ?? null,
      forecastLowCents: forecastLow,
      obligationCents: obligationTotal,
      obligationDate: openObligations[0]?.dueDate ?? null,
      action: topAction,
      liveState,
    }),
    readinessSummary: providerStatuses.some((provider) => provider.tone === "risk")
      ? "Needs connection."
      : providerStatuses.some((provider) => provider.tone === "watch")
        ? "Partially ready."
        : "Always on.",
    overviewMetrics: [
      {
        label: "Current Cash",
        value: data ? formatCurrency(data.company.cashBalanceCents, currency) : "Pending",
        helper: data ? `${formatCurrency(Math.max(totalOverdue, 0), currency)} recoverable` : "Connect live data",
        tone: data ? "good" : "neutral",
      },
      {
        label: "Runway",
        value: data?.forecast?.points.length ? `${Math.max(18, data.forecast.points.length * 4)} days` : "Pending",
        helper: data?.forecast ? `to ${formatShortDate(data.forecast.horizonEndDate)}` : "Awaiting projection",
        tone: data ? "neutral" : "neutral",
      },
      {
        label: "Payroll Due",
        value: obligationTotal > 0 ? formatCurrency(obligationTotal, currency) : "Pending",
        helper: openObligations[0] ? `in ${daysUntil(openObligations[0].dueDate)} days` : "No obligation loaded",
        tone: "neutral",
      },
      {
        label: "Cash Risk",
        value: forecastLow < 0 ? "HIGH" : overdueInvoices.length > 0 ? "WATCH" : data ? "LOW" : "PENDING",
        helper: forecastLow < 0 ? "Projected shortfall" : overdueInvoices.length > 0 ? "Elevated risk in 18-35 days" : "Waiting for live forecast",
        tone: forecastLow < 0 ? "risk" : overdueInvoices.length > 0 ? "watch" : "neutral",
      },
    ],
    forecastMetrics: [
      {
        label: "Current Cash",
        value: data ? formatCurrency(data.company.cashBalanceCents, currency) : "Pending",
        helper: data ? `${formatCurrency(forecastLow, currency)} projected low` : "Connect live data",
        tone: data ? "good" : "neutral",
      },
      {
        label: "Payroll Due",
        value: obligationTotal > 0 ? formatCurrency(obligationTotal, currency) : "Pending",
        helper: openObligations[0] ? `due ${formatShortDate(openObligations[0].dueDate)}` : "No obligation loaded",
        tone: "neutral",
      },
      {
        label: "Best-Case Runway",
        value: "Pending",
        helper: "Awaiting scenario projection",
        tone: "watch",
      },
      {
        label: "Worst-Case Runway",
        value: "Pending",
        helper: "Awaiting scenario projection",
        tone: "watch",
      },
    ],
    cashflowBars: buildCashflowBars(data, runtime),
    actions,
    approvals: buildApprovals(actions, runtime?.cp4EmailApproval.items ?? []),
    agentTiles: buildAgentTiles(runtime),
    providerStatuses,
    customer,
    agentTimeline: buildAgentTimeline(runtime, ingestionState),
    scenarioProjections: [],
    scenarioControls: [
      { label: "Live scenario controls unavailable", meta: "Connect product scenarios to model assumptions.", icon: SlidersHorizontal },
    ],
    scenarioComparison: [
      { label: "Baseline", valueCents: 8400000, tone: "accent", risk: "Medium risk" },
      { label: "Optimistic", valueCents: 31200000, tone: "good", risk: "Low risk" },
      { label: "Conservative", valueCents: -4200000, tone: "risk", risk: "High risk" },
    ],
    recommendedPlan: [
      { label: "Secure highest-impact receivable", impact: "+7 days", tone: "good" },
      { label: "Confirm supplier deferral", impact: "+6 days", tone: "good" },
      { label: "Activate payroll financing", impact: "+25 days", tone: "watch" },
    ],
    sensitivityRows: [
      { label: "Payroll financing", value: 25 },
      { label: "Priority receivable collected", value: 7 },
      { label: "Supplier deferred 5 days", value: 6 },
      { label: "Partial payment slips", value: -8 },
      { label: "Priority receipt delayed", value: -14 },
      { label: "Expected receipt lost", value: -18 },
    ],
    evidenceCount:
      ingestionState.kind === "ready"
        ? String(ingestionState.data.sourceFiles.total + ingestionState.data.imports.rows.total + ingestionState.data.events.recent.length)
        : data
          ? String(data.invoices.length + data.obligations.length + data.memoryFacts.length)
          : "Pending",
  };

  return applyProductApiData(base, {
    productOverviewState,
    productActionsState,
    productCustomersState,
    productScenariosState,
    productActivityState,
    voiceReadinessState,
  });
}

function applyProductApiData(
  model: ProductViewModel,
  states: {
    productOverviewState: Loadable<ProductOverviewState>;
    productActionsState: Loadable<ProductActionsState>;
    productCustomersState: Loadable<ProductCustomersState>;
    productScenariosState: Loadable<ProductScenariosState>;
    productActivityState: Loadable<ProductAgentActivityState>;
    voiceReadinessState: Loadable<VoiceProviderReadiness>;
  },
): ProductViewModel {
  let next = { ...model };
  const productProviders: ProviderView[] = [];

  if (states.productOverviewState.kind === "ready") {
    const overview = states.productOverviewState.data;
    const overviewProviders = overview.providerReadiness.providers.map((provider) => mapProvider(provider));
    productProviders.push({
      name: "Aurora / S3",
      label: overview.source.state === "ready" ? "Ready" : overview.source.state === "partial" ? "Partial" : "Unavailable",
      message: overview.source.message,
      tone: sourceTone(overview.source.state),
    });
    productProviders.push(...overviewProviders);

    const currency = overview.company.baseCurrency;
    const runway = overview.cash.runway;
    const projectedLow = overview.cash.projectedLowPoint;
    const upcomingPayroll = overview.cash.upcomingPayroll;
    const upcomingObligations = overview.cash.upcomingObligations;
    const chart = overview.chart.series;
    const overviewActions = overview.criticalActions.map((action) => ({
      id: action.externalId,
      title: action.title,
      customer: action.customerName ?? "Cash action",
      detail: `${formatChannel(action.actionType)} · ${action.dueAt ? `Due ${formatShortDate(action.dueAt)}` : "Schedule pending"}`,
      channel: channelFromActionType(action.actionType),
      currency,
      priority: normalizePriority(action.priority),
      impactCents: action.expectedCashImpactCents,
      approvalState: formatIdentifier(action.approvalState),
      rationale: action.rationale ?? "The assistant ranked this action from forecast pressure, customer context, and expected cash impact.",
      draftPreview: "Draft preview appears after the action detail loads and a generated draft is available.",
      confidence: action.source.state === "ready" ? "High" : "Medium",
      isNegative: action.expectedCashImpactCents < 0,
      providerNote: action.source.message,
    })) satisfies ProductAction[];

    next = {
      ...next,
      companyName: overview.company.name,
      caseName: overview.case.label,
      currency,
      generatedAt: formatRelativeTime(overview.lastUpdatedAt),
      liveState: overview.source.state === "unavailable" ? next.liveState : "live",
      alertMessage: overview.source.state === "ready" ? null : overview.source.message,
      riskNarrative: buildRiskNarrative({
        companyName: overview.company.name,
        currency,
        currentCashCents: overview.cash.currentCash.valueCents,
        forecastLowCents: projectedLow.valueCents,
        obligationCents: upcomingPayroll.valueCents,
        obligationDate: upcomingPayroll.dueDate,
        action: overviewActions[0] ?? next.actions[0],
        liveState: overview.source.state === "unavailable" ? next.liveState : "live",
      }),
      overviewMetrics: [
        {
          label: "Current Cash",
          value:
            overview.cash.currentCash.valueCents === null
              ? "Pending"
              : formatCurrency(overview.cash.currentCash.valueCents, currency),
          helper:
            projectedLow.valueCents === null
              ? overview.cash.currentCash.source.message
              : `${formatCurrency(projectedLow.valueCents, currency)} low point`,
          tone: overview.cash.currentCash.valueCents === null ? "neutral" : "good",
        },
        {
          label: "Runway",
          value: runway.daysFromToday === null ? "Pending" : `${runway.daysFromToday} days`,
          helper: runway.date ? `to ${formatShortDate(runway.date)}` : runway.source.message,
          tone: runwayTone(runway.status),
        },
        {
          label: "Payroll Due",
          value:
            upcomingPayroll.valueCents === null
              ? "Pending"
              : formatCurrency(upcomingPayroll.valueCents, currency),
          helper: upcomingPayroll.dueDate ? `due ${formatShortDate(upcomingPayroll.dueDate)}` : upcomingPayroll.source.message,
          tone: upcomingPayroll.valueCents === null ? "neutral" : "neutral",
        },
        {
          label: "Cash Risk",
          value: runway.status === "unknown" ? "PENDING" : runway.status.toUpperCase(),
          helper:
            upcomingObligations.valueCents === null
              ? runway.source.message
              : `${formatCurrency(upcomingObligations.valueCents, currency)} obligations`,
          tone: runwayTone(runway.status),
        },
      ],
      cashflowBars:
        chart.length > 0
          ? chart.slice(0, 6).map((point, index) => ({
              label: index === 0 ? "Today" : formatShortDate(point.date),
              valueCents: index === 0 ? point.expectedCashCents : point.netCashflowCents,
              kind: index === 0 ? "net" : "movement",
            }))
          : next.cashflowBars,
      actions: overviewActions.length > 0 ? overviewActions : next.actions,
      approvals:
        overview.approvalsNeeded.length > 0
          ? overview.approvalsNeeded.slice(0, 4).map((approval) => ({
              id: approval.actionExternalId,
              title: `${formatIdentifier(approval.approvalState)} - ${approval.customerName ?? approval.title}`,
              detail: approval.draftSubject ?? approval.blockers[0] ?? "Approval is required before outbound execution.",
            }))
          : next.approvals,
      agentTiles:
        overview.agentStatuses.length > 0
          ? overview.agentStatuses.map((agent, index) => ({
              id: `${agent.key}-${agent.state}-${index}`,
              label: agent.label,
              status: formatIdentifier(agent.state),
              detail: agent.message,
              tone: statusTone(agent.state),
              icon: iconForAgent(agent.key),
            }))
          : next.agentTiles,
      evidenceCount: String(chart.length + overview.criticalActions.length + overview.approvalsNeeded.length),
    };
  }

  if (states.productActionsState.kind === "ready") {
    const actionState = states.productActionsState.data;
    const mappedActions = actionState.actions.map((action) => mapProductActionSummary(action));
    productProviders.push(
      mapAvailabilityProvider(actionState.providers.fireworks, "AI reasoning"),
      mapAvailabilityProvider(actionState.providers.langsmith, "Trace review"),
      {
        name: "Gmail",
        label: actionState.providers.gmail.status === "available" ? "Ready" : "Requires approval",
        message: actionState.providers.gmail.message,
        tone: actionState.providers.gmail.status === "available" ? "good" : "watch",
      },
      {
        name: "Voice",
        label: actionState.providers.voice.status === "available" ? "Ready" : "Needs setup",
        message: actionState.providers.voice.message,
        tone: actionState.providers.voice.status === "available" ? "good" : "watch",
      },
    );

    next = {
      ...next,
      generatedAt: formatRelativeTime(actionState.generatedAt),
      actions: mappedActions.length > 0 ? mappedActions : next.actions,
      approvals: mappedActions.length > 0 ? buildApprovals(mappedActions, []) : next.approvals,
    };
  }

  if (states.productCustomersState.kind === "ready" && states.productCustomersState.data.customers.length > 0) {
    const customer = [...states.productCustomersState.data.customers].sort(
      (left, right) => right.overdueCents + right.exposureCents - (left.overdueCents + left.exposureCents),
    )[0];

    next = {
      ...next,
      customer: mapProductCustomer(customer),
    };
  }

  if (states.productScenariosState.kind === "ready") {
    const scenarios = states.productScenariosState.data;
    const projections = scenarios.projections.map((projection) => ({
      key: projection.key,
      label: projection.label,
      tone: scenarioTone(projection.key, projection.summary.maxShortfallCents),
      dashed: projection.key !== "baseline",
      summary: {
        minimumCashCents: projection.summary.minimumCashCents,
        minimumCashDate: projection.summary.minimumCashDate,
        endingCashCents: projection.summary.endingCashCents,
        runwayDays: projection.summary.runwayDays,
        shortfallCents: projection.summary.maxShortfallCents,
      },
      points: projection.series.map((point) => ({
        date: point.date,
        expectedCashCents: point.expectedCashCents,
      })),
    }));
    const ranked = [...projections].sort((left, right) => (right.summary.runwayDays ?? 0) - (left.summary.runwayDays ?? 0));
    const best = ranked[0] ?? projections[0];
    const worst = [...projections].sort((left, right) => (left.summary.minimumCashCents - right.summary.minimumCashCents))[0] ?? projections[0];

    next = {
      ...next,
      forecastMetrics:
        projections.length > 0
          ? [
              next.forecastMetrics[0],
              next.forecastMetrics[1],
              {
                label: "Best-Case Runway",
                value: best?.summary.runwayDays === null || best?.summary.runwayDays === undefined ? "Watch" : `${best.summary.runwayDays} days`,
                helper: best?.summary.minimumCashDate ? `low ${formatShortDate(best.summary.minimumCashDate)}` : "No projected shortfall date",
                tone: best ? best.tone : "watch",
              },
              {
                label: "Worst-Case Runway",
                value: worst?.summary.runwayDays === null || worst?.summary.runwayDays === undefined ? "Watch" : `${worst.summary.runwayDays} days`,
                helper: worst?.summary.minimumCashDate ? `low ${formatShortDate(worst.summary.minimumCashDate)}` : "No projected shortfall date",
                tone: worst ? worst.tone : "watch",
              },
            ]
          : next.forecastMetrics,
      scenarioProjections: projections,
      scenarioControls:
        scenarios.controls.length > 0
          ? scenarios.controls.slice(0, 3).map((control) => ({
              label: control.label,
              meta: `${formatScenarioControlValue(control.value, control.unit)} · ${control.source.message}`,
              icon: control.key.includes("supplier") ? BriefcaseBusiness : control.key.includes("spend") ? CircleDollarSign : UsersRound,
            }))
          : next.scenarioControls,
      scenarioComparison:
        scenarios.comparisonCards.length > 0
          ? scenarios.comparisonCards.map((card) => ({
              label: card.label,
              valueCents: card.minimumCashCents,
              tone: card.shortfallCents > 0 ? "risk" : card.changeVsBaselineCents > 0 ? "good" : "accent",
              risk: card.shortfallCents > 0 ? "Shortfall risk" : card.runwayDays === null ? "Watch" : `${card.runwayDays} day runway`,
            }))
          : next.scenarioComparison,
      recommendedPlan:
        scenarios.recommendedActionPlan.length > 0
          ? scenarios.recommendedActionPlan.slice(0, 5).map((item) => ({
              label: item.title,
              impact: formatCompactCurrency(item.expectedCashImpactCents, scenarios.company.baseCurrency),
              tone: item.expectedCashImpactCents >= 0 ? "good" : "watch",
            }))
          : next.recommendedPlan,
      sensitivityRows:
        scenarios.sensitivityRows.length > 0
          ? scenarios.sensitivityRows.slice(0, 6).map((row) => ({
              label: row.driver,
              value: clamp(Math.round((row.upsideCents + row.downsideCents) / 100000), -28, 28),
            }))
          : next.sensitivityRows,
    };
  }

  if (states.productActivityState.kind === "ready") {
    const activity = states.productActivityState.data;
    productProviders.push(
      mapAvailabilityProvider(activity.providers.fireworks, "AI reasoning"),
      mapAvailabilityProvider(activity.providers.langsmith, "Trace review"),
    );

    if (activity.timeline.length > 0) {
      next = {
        ...next,
        agentTimeline: selectDemoActivityItems(activity.timeline).map(mapProductActivity),
      };
    }
  }

  if (states.voiceReadinessState.kind === "ready") {
    productProviders.push(
      mapAvailabilityProvider(states.voiceReadinessState.data.providers.twilio, "Twilio voice"),
      mapAvailabilityProvider(states.voiceReadinessState.data.providers.elevenlabs, "ElevenLabs voice"),
    );
  }

  if (productProviders.length > 0) {
    next = {
      ...next,
      providerStatuses: mergeProviderViews([...productProviders, ...next.providerStatuses]),
    };
  }

  return {
    ...next,
    readinessSummary: summarizeReadiness(next.liveState, next.providerStatuses),
  };
}

function mapProductActionSummary(action: ProductActionSummary): ProductAction {
  const channel = action.draftPreview?.channel === "voice_script" ? "Phone" : channelFromActionType(action.actionType);

  return {
    id: action.externalId,
    title: action.title,
    customer: action.customer.name ?? "Cash action",
    detail: `${channel} · ${formatIdentifier(action.approval.state)} · ${action.updatedAt ? formatShortDate(action.updatedAt) : "Updated recently"}`,
    channel,
    currency: action.cashImpact.currency,
    priority: normalizePriority(action.priority),
    impactCents: action.cashImpact.expectedCents,
    approvalState: formatIdentifier(action.approval.state),
    rationale: action.whyThisAction,
    draftPreview:
      action.draftPreview?.body ??
      "Live action detail is loading. The generated draft or fallback preview appears in the selected action panel.",
    confidence: action.providerState.outboundOutcomeBackedByProvider
      ? "High"
      : action.draftPreview?.source === "fireworks"
        ? "Medium"
        : "Low",
    isNegative: action.cashImpact.expectedCents < 0,
    providerNote: action.providerState.outboundOutcomeBackedByProvider
      ? `Provider execution is ${action.providerState.latestExecutionState ?? "recorded"}.`
      : "No outbound provider execution is recorded for this action.",
  };
}

function mapProductCustomer(customer: ProductCustomerListItem): CustomerProfile {
  const riskScore = customer.riskScore ?? 45;
  const contactName = customer.primaryContact?.fullName?.split(" ")[0] ?? "Accounts";
  const recommendedChannel = formatIdentifier(customer.recommendedOutreach.channel);
  const topMemory = customer.topMemoryFact;
  const memoryCards: CustomerProfile["memoryCards"] = [
    topMemory
      ? {
          title: formatIdentifier(topMemory.factType),
          body: topMemory.content,
          tone: statusTone(topMemory.factType),
        }
      : {
          title: "Waiting for outcome",
          body: "Record a call, reply, or manual outcome to create the next customer memory fact.",
          tone: "watch" as StatusTone,
        },
    {
      title: "Preferred next channel",
      body: customer.recommendedOutreach.reason,
      tone: customer.recommendedOutreach.channel === "phone" ? "good" : "accent",
    },
    {
      title: "Approval evidence",
      body: customer.recommendedOutreach.approvalState
        ? `Recommended action approval is ${formatIdentifier(customer.recommendedOutreach.approvalState)}.`
        : "No approval record is linked yet.",
      tone: statusTone(customer.recommendedOutreach.approvalState ?? "pending"),
    },
  ];

  return {
    id: customer.externalId ?? customer.id,
    name: customer.name,
    segment: customer.segment ?? "Customer",
    status: customer.overdueCents > 0 ? "Overdue" : riskScore > 65 ? "Watch" : "Current",
    badge: `${formatIdentifier(customer.recommendedOutreach.priority)} priority`,
    outstandingCents: customer.overdueCents,
    exposureCents: customer.exposureCents,
    avgDaysLate: customer.averageDaysLate ?? 0,
    reliability: clamp(100 - riskScore, 5, 98),
    summary: topMemory?.content ?? customer.recommendedOutreach.reason,
    tags: [recommendedChannel, `${customer.openInvoiceCount} open invoices`, `${customer.overdueInvoiceCount} overdue`],
    contactName,
    invoiceLabel:
      customer.overdueInvoiceCount > 0
        ? `${customer.overdueInvoiceCount} overdue invoice${customer.overdueInvoiceCount === 1 ? "" : "s"}`
        : "the selected account balance",
    lastInteractionLabel: customer.lastInteractionAt ? formatShortDate(customer.lastInteractionAt) : "No interaction yet",
    memoryCards,
  };
}

function mapProductActivity(item: ProductActivityItem): ProductViewModel["agentTimeline"][number] {
  return {
    id: item.id,
    title: item.title,
    body: item.detail,
    time: formatActivityTimestamp(item.occurredAt),
    tone: statusTone(item.state ?? item.kind),
    icon: iconForActivity(item.kind),
  };
}

const demoActivityOrder = [
  "Finance pack imported",
  "Forecast recomputed",
  "Recommendation ranked",
  "Draft generated",
  "Human approval recorded",
  "Outbound call initiated",
  "Outcome memory saved",
  "Customer memory updated",
  "Agent workflow completed",
];

function selectDemoActivityItems(items: ProductActivityItem[]) {
  const selected: ProductActivityItem[] = [];
  const usedIds = new Set<string>();

  for (const title of demoActivityOrder) {
    const match = items.find((item) => item.title === title && !usedIds.has(item.id));

    if (match) {
      selected.push(match);
      usedIds.add(match.id);
    }
  }

  for (const item of items) {
    if (selected.length >= 10) {
      break;
    }

    if (!usedIds.has(item.id)) {
      selected.push(item);
      usedIds.add(item.id);
    }
  }

  return selected;
}

function buildProviderViews(runtimeState: Loadable<Cp3ForecastCockpitState>): ProviderView[] {
  if (runtimeState.kind !== "ready") {
    const message = runtimeState.kind === "loading" ? "Checking connection readiness." : "The live runtime connection is unavailable in this environment.";
    return [
      { name: "Aurora / S3", label: runtimeState.kind === "loading" ? "Checking" : "Unavailable", message, tone: runtimeState.kind === "loading" ? "watch" : "risk" },
      { name: "AI reasoning", label: "Unavailable", message: "Reasoning status is hidden until the live runtime aggregate loads.", tone: "watch" },
      { name: "Gmail", label: "Requires approval", message: "Email remains approval-gated and no send is shown without provider execution.", tone: "watch" },
      { name: "Voice", label: "Not connected", message: "Voice calling remains unavailable until Twilio or ElevenLabs readiness is returned.", tone: "watch" },
    ];
  }

  return runtimeState.data.providers.map((provider) => mapProvider(provider));
}

function mapProvider(provider: Cp3ProviderStatus): ProviderView {
  const connected = provider.status === "connected" || provider.status === "configured";
  const isGmail = provider.name.toLowerCase().includes("gmail");
  const tone: StatusTone = connected ? "good" : provider.status === "optional_unconfigured" || isGmail ? "watch" : "risk";

  return {
    name: provider.name,
    label: connected ? "Ready" : isGmail ? "Requires approval" : provider.status === "optional_unconfigured" ? "Optional" : "Unavailable",
    message: provider.message,
    tone,
  };
}

function mapAvailabilityProvider(provider: ProviderStatus, label?: string): ProviderView {
  const tone: StatusTone =
    provider.status === "available"
      ? "good"
      : provider.status === "disabled"
        ? "neutral"
        : provider.reason === "provider-error" || provider.reason === "invalid-config"
          ? "risk"
          : "watch";

  const name = label ?? formatIdentifier(provider.provider);
  const isGmail = name.toLowerCase().includes("gmail") || provider.provider.toLowerCase().includes("gmail");

  return {
    name,
    label: provider.status === "available" ? "Ready" : isGmail ? "Requires approval" : provider.status === "disabled" ? "Disabled" : "Needs setup",
    message: provider.message,
    tone: isGmail && provider.status !== "available" ? "watch" : tone,
  };
}

function mergeProviderViews(providers: ProviderView[]) {
  const merged = new Map<string, ProviderView>();

  for (const provider of providers) {
    if (!merged.has(provider.name)) {
      merged.set(provider.name, provider);
    }
  }

  return [...merged.values()];
}

function summarizeReadiness(liveState: ProductViewModel["liveState"], providers: ProviderView[]) {
  if (liveState === "loading") {
    return "Checking.";
  }

  if (liveState === "unavailable" || liveState === "error") {
    return "Needs connection.";
  }

  if (providers.some((provider) => provider.tone === "risk")) {
    return "Needs attention.";
  }

  if (providers.some((provider) => provider.tone === "watch")) {
    return "Partially ready.";
  }

  return "Always on.";
}

function channelFromActionType(actionType: string): ProductAction["channel"] {
  if (actionType.includes("call") || actionType.includes("voice")) {
    return "Phone";
  }

  if (actionType.includes("portal")) {
    return "Portal";
  }

  return "Email";
}

function normalizePriority(priority: string): ProductAction["priority"] {
  const value = priority.toLowerCase();

  if (value === "urgent" || value === "high" || value === "p0" || value === "p1") {
    return "High";
  }

  if (value === "medium" || value === "normal" || value === "p2") {
    return "Medium";
  }

  return "Watch";
}

function sourceTone(state: string): StatusTone {
  if (state === "ready") {
    return "good";
  }

  if (state === "partial") {
    return "watch";
  }

  return "risk";
}

function runwayTone(status: string): StatusTone {
  if (status === "safe") {
    return "good";
  }

  if (status === "critical") {
    return "risk";
  }

  if (status === "watch") {
    return "watch";
  }

  return "neutral";
}

function statusTone(status: string): StatusTone {
  const normalized = status.toLowerCase();

  if (["ready", "connected", "configured", "completed", "succeeded", "success", "ok", "approved"].includes(normalized)) {
    return "good";
  }

  if (["failed", "error", "blocked", "rejected", "cancelled", "unavailable"].includes(normalized)) {
    return "risk";
  }

  if (["queued", "running", "pending", "needs_approval", "partial"].includes(normalized)) {
    return "watch";
  }

  return "neutral";
}

function iconForAgent(key: string): ComponentType<{ size?: number; className?: string }> {
  const normalized = key.toLowerCase();

  if (normalized.includes("forecast")) {
    return LineChart;
  }

  if (normalized.includes("collection") || normalized.includes("customer")) {
    return UsersRound;
  }

  if (normalized.includes("supplier") || normalized.includes("obligation")) {
    return BriefcaseBusiness;
  }

  return ShieldCheck;
}

function iconForActivity(kind: ProductActivityItem["kind"]): ComponentType<{ size?: number; className?: string }> {
  if (kind === "agent_run") {
    return Sparkles;
  }

  if (kind === "checkpoint") {
    return ClipboardCheck;
  }

  if (kind === "provider_execution") {
    return ExternalLink;
  }

  if (kind === "audit") {
    return ShieldCheck;
  }

  if (kind === "memory") {
    return Sparkles;
  }

  return Activity;
}

function buildActions(data: CompanyCaseState | null, runtime: Cp3ForecastCockpitState | null, currency: string): ProductAction[] {
  const cp4Items = runtime?.cp4EmailApproval.items ?? [];
  const sourceActions = runtime?.actionPlan.recommendedActions ?? [];

  if (cp4Items.length > 0) {
    return cp4Items.map((item) => buildActionFromApproval(item, currency));
  }

  if (sourceActions.length > 0) {
    return sourceActions.slice(0, 4).map((item) => ({
      id: item.externalId,
      title: item.title,
      customer: item.customer.name ?? item.obligation.title ?? "Recommended action",
      detail: `${item.invoice.invoiceNumber ? `Invoice #${item.invoice.invoiceNumber}` : "Action"} · ${item.scheduledFor ? `Due ${formatShortDate(item.scheduledFor)}` : "Schedule pending"}`,
      channel: item.actionType.includes("call") ? "Phone" : item.actionType.includes("portal") ? "Portal" : "Email",
      currency,
      priority: item.priorityRank <= 1 ? "High" : item.priorityRank <= 3 ? "Medium" : "Watch",
      impactCents: item.expectedCashImpactCents,
      approvalState: item.approval.state,
      rationale: item.rationale ?? "The assistant ranked this action from forecast pressure, expected cash impact, and customer context.",
      draftPreview: "Draft or call preview will appear after the runtime persists generated content for this approval.",
      confidence: item.priorityRank <= 2 ? "High" : "Medium",
      isNegative: item.expectedCashImpactCents < 0,
      providerNote: item.execution.message,
    }));
  }

  if (data?.recommendedActions.length) {
    return data.recommendedActions.slice(0, 4).map((item) => ({
      id: item.externalId,
      title: item.title,
      customer: item.customerName,
      detail: `${item.invoiceExternalId ? "Invoice-linked action" : "Cash action"} · ${item.scheduledFor ? formatShortDate(item.scheduledFor) : "Schedule pending"}`,
      channel: item.actionType.includes("call") ? "Phone" : item.actionType.includes("portal") ? "Portal" : "Email",
      currency,
      priority: item.priority <= 1 ? "High" : item.priority <= 3 ? "Medium" : "Watch",
      impactCents: item.expectedRecoveryCents,
      approvalState: item.approvalRequired ? "Approval required" : "Ready",
      rationale: item.rationale,
      draftPreview: "Preview is not persisted yet. No outbound action has been sent.",
      confidence: item.priority <= 2 ? "High" : "Medium",
      providerNote: "No provider execution is linked to this recommendation yet.",
    }));
  }

  return defaultActions;
}

function buildActionFromApproval(item: Cp4EmailApprovalItem, currency: string): ProductAction {
  return {
    id: item.actionExternalId,
    title: item.title,
    customer: item.customer.name ?? "Unassigned customer",
    detail: `${item.invoice.invoiceNumber ? `Invoice #${item.invoice.invoiceNumber}` : "Invoice pending"} · ${item.approval.message}`,
    channel: item.actionType.includes("call") ? "Phone" : item.actionType.includes("portal") ? "Portal" : "Email",
    currency,
    priority: item.expectedCashImpactCents > 3000000 ? "High" : "Medium",
    impactCents: item.expectedCashImpactCents,
    approvalState: item.approval.state,
    rationale: `This action is waiting on ${item.approval.state}. Expected impact is ${formatCurrency(item.expectedCashImpactCents, currency)} and send eligibility is ${item.sendEligibility.reason}.`,
    draftPreview: item.draft?.bodyPreview ?? "No internal draft is persisted yet. Nothing has been sent.",
    confidence: item.sendEligibility.eligible ? "High" : "Medium",
    isNegative: item.expectedCashImpactCents < 0,
    providerNote: item.lastProviderExecution
      ? `Provider execution is ${item.lastProviderExecution.state}.`
      : "No provider execution is linked, so no sent outcome is shown.",
  };
}

function buildCustomerProfile(data: CompanyCaseState | null, totalOverdue: number): CustomerProfile {
  const highestInvoice = [...(data?.invoices ?? [])].sort((a, b) => b.outstandingCents - a.outstandingCents)[0];
  const customer = data?.customers.find((item) => item.externalId === highestInvoice?.customerExternalId) ?? data?.customers[0];
  const memory = data?.memoryFacts.find((fact) => fact.customerExternalId === customer?.externalId);

  return {
    id: customer?.externalId ?? "customer-pending",
    name: customer?.name ?? "Beta Retail",
    segment: customer?.segment ?? "Retail",
    status: highestInvoice?.status === "overdue" ? "Overdue" : data ? "Watch" : "Current",
    badge: "Conditional payer",
    outstandingCents: highestInvoice?.outstandingCents ?? Math.max(totalOverdue, 0),
    exposureCents: Math.max(highestInvoice?.amountCents ?? 0, totalOverdue),
    avgDaysLate: customer?.paymentTermsDays ? Math.max(8, customer.paymentTermsDays - 2) : 28,
    reliability: customer?.riskScore ? Math.max(35, 100 - customer.riskScore) : 62,
    summary:
      memory?.factText ??
      "Customer behavior memory will summarize payment patterns, preferred channel, and escalation evidence once live interactions are persisted.",
    tags: ["Responsive by phone", "Pays after escalation"],
    contactName: customer?.primaryContact?.fullName?.split(" ")[0] ?? "Sam",
    invoiceLabel: highestInvoice ? `invoice #${highestInvoice.invoiceNumber}` : "the selected invoice",
    lastInteractionLabel: "Pending",
    memoryCards: [
      {
        title: "Waiting for live memory",
        body: memory?.factText ?? "Customer memory appears after live data, calls, replies, or manual outcomes are persisted.",
        tone: memory ? "good" : "watch",
      },
      {
        title: "Preferred next channel",
        body: "RunwayOps selects outreach from available contact, receivable risk, and previous behavior.",
        tone: "accent",
      },
      {
        title: "Approval evidence",
        body: "Outbound execution remains approval-gated until a live action is approved.",
        tone: "good",
      },
    ],
  };
}

function buildCashflowBars(data: CompanyCaseState | null, runtime: Cp3ForecastCockpitState | null): ProductViewModel["cashflowBars"] {
  const forecastPoints = runtime?.forecast.points.length ? runtime.forecast.points : [];

  if (forecastPoints.length > 0) {
    return forecastPoints.slice(0, 6).map((point, index) => ({
      label: index === 0 ? "Today" : formatShortDate(point.pointDate),
      valueCents: index === 0 ? point.expectedCashCents : point.netCashflowCents,
      kind: index === 0 ? "net" : "movement",
    }));
  }

  if (data?.forecast?.points.length) {
    return data.forecast.points.slice(0, 6).map((point, index) => ({
      label: index === 0 ? "Today" : formatShortDate(point.pointDate),
      valueCents: index === 0 ? point.expectedCashCents : point.inflowCents - point.outflowCents,
      kind: index === 0 ? "net" : "movement",
    }));
  }

  return [
    { label: "Today", valueCents: 0, kind: "net" },
    { label: "10-16 May", valueCents: 0, kind: "movement" },
    { label: "17-23 May", valueCents: 0, kind: "movement" },
    { label: "24-30 May", valueCents: 0, kind: "movement" },
    { label: "31 May", valueCents: 0, kind: "movement" },
    { label: "7-13 Jun", valueCents: 0, kind: "movement" },
  ];
}

function buildApprovals(actions: ProductAction[], cp4Items: Cp4EmailApprovalItem[]): ProductViewModel["approvals"] {
  if (cp4Items.length > 0) {
    return cp4Items.slice(0, 2).map((item) => ({
      id: item.actionExternalId,
      title: `${formatChannel(item.actionType)} approval - ${item.customer.name ?? "Customer"}`,
      detail: item.draft?.subject ?? item.approval.message,
    }));
  }

  return actions.slice(0, 2).map((action) => ({
    id: action.id,
    title: `${action.channel} approval - ${action.customer}`,
    detail: action.approvalState,
  }));
}

function buildAgentTiles(runtime: Cp3ForecastCockpitState | null): ProductViewModel["agentTiles"] {
  const hasRuns = (runtime?.agent.runs.length ?? 0) > 0;

  return [
    { id: "forecast-agent", label: "Forecast Agent", status: hasRuns ? "On Track" : "Waiting", detail: hasRuns ? "Updated recently" : "No run recorded", tone: hasRuns ? "good" : "watch", icon: LineChart },
    { id: "collections-agent", label: "Collections Agent", status: hasRuns ? "On Track" : "Waiting", detail: "Replies and promises", tone: hasRuns ? "good" : "watch", icon: UsersRound },
    { id: "supplier-agent", label: "Supplier Agent", status: "At Risk", detail: "Payments due", tone: "watch", icon: BriefcaseBusiness },
    { id: "audit-agent", label: "Audit Agent", status: hasRuns ? "On Track" : "Waiting", detail: hasRuns ? "Trace metadata ready" : "No trace recorded", tone: hasRuns ? "good" : "neutral", icon: ShieldCheck },
  ];
}

function buildAgentTimeline(runtime: Cp3ForecastCockpitState | null, ingestionState: Loadable<IngestionStatusState>): ProductViewModel["agentTimeline"] {
  const sourceCount = ingestionState.kind === "ready" ? ingestionState.data.sourceFiles.total : 0;
  const runs = runtime?.agent.runs ?? [];
  const checkpoints = runtime?.agent.checkpoints ?? [];

  return [
    { id: "source-readiness", title: "Read new source data", body: sourceCount > 0 ? `${sourceCount} source files are available for this case.` : "Waiting for source evidence to be available.", time: "Now", tone: sourceCount > 0 ? "good" : "watch", icon: FileText },
    { id: "forecast-refresh", title: "Updated forecast", body: runtime?.forecast.run ? `${runtime.forecast.run.pointCount} projection points loaded.` : "No persisted forecast run is available yet.", time: runtime?.forecast.run?.createdAt ? formatShortDate(runtime.forecast.run.createdAt) : "Pending", tone: runtime?.forecast.run ? "good" : "watch", icon: LineChart },
    { id: "recommendation-drafts", title: "Drafted recommendations", body: runtime?.actionPlan.recommendedActions.length ? `${runtime.actionPlan.recommendedActions.length} recommended actions are ready for approval.` : "Recommendations will appear after the action plan is persisted.", time: "Pending", tone: runtime?.actionPlan.recommendedActions.length ? "good" : "watch", icon: ClipboardCheck },
    { id: "human-approval-gate", title: "Human approval gate", body: "Outbound provider actions require approval before execution.", time: "Always on", tone: "good", icon: ShieldCheck },
    { id: "outcome-learning", title: "Learned from outcome", body: checkpoints.length > 0 || runs.length > 0 ? "Agent checkpoints are recorded for review." : "Outcome learning waits for replies, payments, or call transcripts.", time: "Next", tone: checkpoints.length > 0 ? "good" : "neutral", icon: Sparkles },
  ];
}

function buildRiskNarrative(input: {
  companyName: string;
  currency: string;
  currentCashCents: number | null;
  forecastLowCents: number | null;
  obligationCents: number | null;
  obligationDate: string | null;
  action: ProductAction | undefined;
  liveState: ProductViewModel["liveState"];
}): ProductViewModel["riskNarrative"] {
  if (input.liveState !== "live" || input.currentCashCents === null) {
    return {
      title: "Connect live cashflow data to unlock the action plan.",
      body: "RunwayOps will keep provider actions gated until Aurora-backed cash, invoice, obligation, and customer state is available.",
      primaryAction: "Connect the live case data source",
      outcome: "No outbound email or call is shown as executed without persisted provider evidence.",
      tone: "watch",
    };
  }

  const lowPoint = input.forecastLowCents ?? input.currentCashCents;
  const obligation = input.obligationCents && input.obligationCents > 0 ? formatCurrency(input.obligationCents, input.currency) : "the next obligation";
  const obligationDate = input.obligationDate ? formatShortDate(input.obligationDate) : "the next due date";
  const action = input.action;
  const actionImpact = action ? formatCurrency(action.impactCents, action.currency ?? input.currency) : "the recommended recovery";
  const tone: StatusTone = lowPoint < 0 ? "risk" : action && action.priority === "High" ? "watch" : "good";

  return {
    title:
      lowPoint < 0
        ? `${input.companyName} is projected to dip below zero before ${obligationDate}.`
        : `${input.companyName} can protect runway by acting on the highest-impact receivable now.`,
    body: `Current cash is ${formatCurrency(input.currentCashCents, input.currency)} and the projected low point is ${formatCurrency(lowPoint, input.currency)} while ${obligation} is due around ${obligationDate}. The assistant is prioritising ${action?.customer ?? "the highest-impact customer"} because it has the clearest near-term cash impact.`,
    primaryAction: action ? action.title : "Review recommended collection action",
    outcome: action ? `${actionImpact} expected cash impact, approval required before any provider execution.` : "Action preview appears once the live recommendation is loaded.",
    tone,
  };
}

function getForecastLow(data: CompanyCaseState | null, runtime: Cp3ForecastCockpitState | null) {
  if (runtime?.forecast.run?.minimumProjectedCashCents !== null && runtime?.forecast.run?.minimumProjectedCashCents !== undefined) {
    return runtime.forecast.run.minimumProjectedCashCents;
  }

  if (data?.forecast?.points.length) {
    return Math.min(...data.forecast.points.map((point) => point.expectedCashCents));
  }

  return 0;
}

function scenarioTone(key: string, shortfallCents: number): StatusTone {
  if (shortfallCents > 0 || key === "conservative") {
    return "risk";
  }

  if (key === "optimistic") {
    return "good";
  }

  return "accent";
}

function formatScenarioControlValue(value: number | null, unit: "days" | "bps" | "cents") {
  if (value === null) {
    return "Live default";
  }

  if (unit === "days") {
    return `${value} days`;
  }

  if (unit === "bps") {
    return `${Math.round(value / 100)}%`;
  }

  return formatCurrency(value, "GBP");
}

function scriptToPreviewBody(script: ProductActionDetail["callScriptPreview"]) {
  return [
    script.opener,
    ...script.talkingPoints.map((point) => `- ${point}`),
    script.close,
  ].filter(Boolean).join("\n");
}

function toneText(tone: StatusTone) {
  return {
    good: "text-emerald-400",
    watch: "text-amber-400",
    risk: "text-red-400",
    neutral: "text-slate-100",
    accent: "text-[#8279ff]",
  }[tone];
}

function toneBorder(tone: StatusTone) {
  return {
    good: "border-emerald-400/35",
    watch: "border-amber-400/35",
    risk: "border-red-400/40",
    neutral: "border-white/[0.1]",
    accent: "border-[#6256ff]/55",
  }[tone];
}

function toneBg(tone: StatusTone) {
  return {
    good: "bg-emerald-400/10",
    watch: "bg-amber-400/10",
    risk: "bg-red-400/10",
    neutral: "bg-white/[0.035]",
    accent: "bg-[#6256ff]/12",
  }[tone];
}

function formatChannel(actionType: string) {
  if (actionType.includes("call")) {
    return "Call";
  }

  if (actionType.includes("portal")) {
    return "Portal";
  }

  return "Payment";
}

function formatIdentifier(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sumCents(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatCompactCurrency(cents: number, currency: string) {
  const sign = cents > 0 ? "+" : cents < 0 ? "-" : "";
  const amount = Math.abs(cents / 100);
  const symbol = currency === "GBP" ? "£" : "";
  return `${sign}${symbol}${Math.round(amount / 1000)}k`;
}

function formatShortDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
}

function formatActivityTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    hour12: false,
  }).format(date);
}

function formatProjectionTooltipDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (date.getUTCMonth() === 5 && date.getUTCDate() === 3) {
    date.setUTCMonth(6);
  }

  return formatShortDate(date.toISOString());
}

function formatRelativeTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Last updated: recently";
  }

  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));

  if (minutes < 60) {
    return `Last updated: ${minutes} min ago`;
  }

  return `Last updated: ${formatShortDate(value)}`;
}

function daysUntil(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}
