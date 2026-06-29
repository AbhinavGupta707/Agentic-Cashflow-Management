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
  Clock3,
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

type Loadable<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "unavailable"; message: string; missingEnv?: string[] }
  | { kind: "error"; message: string };

type ScreenKey = "overview" | "cases" | "actions" | "customers" | "forecasts" | "activity" | "settings";

type StatusTone = "good" | "watch" | "risk" | "neutral" | "accent";

type ProductAction = {
  id: string;
  title: string;
  customer: string;
  detail: string;
  channel: "Email" | "Phone" | "Portal";
  priority: "High" | "Medium" | "Watch";
  impactCents: number;
  approvalState: string;
  rationale: string;
  draftPreview: string;
  confidence: "High" | "Medium" | "Low";
  isNegative?: boolean;
  providerNote: string;
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
};

type ScenarioToggleKey = "customerAPays" | "partialPayment" | "supplierDeferral";

const navItems: Array<{ key: ScreenKey; label: string; icon: ComponentType<{ size?: number; className?: string }> }> = [
  { key: "overview", label: "Overview", icon: Home },
  { key: "cases", label: "Cases", icon: FileText },
  { key: "actions", label: "Actions", icon: CheckCircle2 },
  { key: "customers", label: "Customers", icon: UsersRound },
  { key: "forecasts", label: "Forecasts", icon: BarChart3 },
  { key: "activity", label: "Agent Activity", icon: Activity },
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
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [scenarioToggles, setScenarioToggles] = useState<Record<ScenarioToggleKey, boolean>>({
    customerAPays: true,
    partialPayment: true,
    supplierDeferral: true,
  });

  useEffect(() => {
    let active = true;

    async function loadAll() {
      const [caseResult, ingestionResult, runtimeResult] = await Promise.all([
        fetchCurrentCase(),
        fetchIngestionStatus(),
        fetchForecastCockpit(),
      ]);

      if (!active) {
        return;
      }

      setCaseState(caseResult);
      setIngestionState(ingestionResult);
      setRuntimeState(runtimeResult);
    }

    void loadAll();

    return () => {
      active = false;
    };
  }, []);

  const viewModel = useMemo(() => {
    return buildProductViewModel(caseState, runtimeState, ingestionState);
  }, [caseState, runtimeState, ingestionState]);

  const selectedAction = viewModel.actions.find((action) => action.id === selectedActionId) ?? viewModel.actions[0];

  useEffect(() => {
    if (!selectedActionId && viewModel.actions.length > 0) {
      setSelectedActionId(viewModel.actions[0].id);
    }
  }, [selectedActionId, viewModel.actions]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050914] text-slate-100">
      <div className="flex min-h-screen">
        <Sidebar activeScreen={activeScreen} onScreenChange={setActiveScreen} readiness={viewModel.readinessSummary} />
        <section className="min-w-0 flex-1 border-l border-white/[0.07] bg-[radial-gradient(circle_at_30%_0%,rgba(78,70,255,0.12),transparent_36%),linear-gradient(180deg,#070c15_0%,#060a12_45%,#04070d_100%)]">
          <TopCaseBar
            companyName={viewModel.companyName}
            caseName={viewModel.caseName}
            generatedAt={viewModel.generatedAt}
            liveState={viewModel.liveState}
          />
          <MobileNav activeScreen={activeScreen} onScreenChange={setActiveScreen} />
          <div className="mx-auto w-full max-w-[1240px] px-5 py-5 lg:px-7">
            {activeScreen === "overview" ? (
              <OverviewScreen model={viewModel} onOpenActions={() => setActiveScreen("actions")} />
            ) : null}
            {activeScreen === "cases" ? <CasesScreen model={viewModel} /> : null}
            {activeScreen === "actions" ? (
              <ActionsScreen
                actions={viewModel.actions}
                selectedAction={selectedAction}
                onSelectAction={setSelectedActionId}
              />
            ) : null}
            {activeScreen === "customers" ? <CustomerScreen customer={viewModel.customer} /> : null}
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
    <nav className="flex gap-2 overflow-x-auto border-b border-white/[0.07] bg-[#070c15]/90 px-5 py-3 md:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = activeScreen === item.key;

        return (
          <button
            className={clsx(
              "flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium",
              active
                ? "border-[#6256ff]/70 bg-[#121b45] text-white"
                : "border-white/[0.08] bg-white/[0.025] text-slate-400",
            )}
            key={item.key}
            onClick={() => onScreenChange(item.key)}
            type="button"
          >
            <Icon aria-hidden="true" size={16} />
            {item.label}
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
    <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#070c15]/92 px-5 py-4 backdrop-blur-xl lg:px-7">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <button
            className="flex h-12 min-w-0 flex-1 items-center justify-between rounded-md border border-white/[0.12] bg-white/[0.035] px-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:min-w-[270px] sm:flex-none"
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

        <div className="flex items-center justify-between gap-4 text-sm text-slate-400 sm:justify-end">
          <span className="hidden sm:inline">{generatedAt}</span>
          <button className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-white/[0.05] hover:text-white" type="button">
            <RefreshCw aria-hidden="true" size={17} />
          </button>
          <div className="h-8 w-px bg-white/[0.08]" />
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
  model,
  onOpenActions,
}: {
  model: ProductViewModel;
  onOpenActions: () => void;
}) {
  return (
    <div className="space-y-5">
      <KpiStrip metrics={model.overviewMetrics} />

      {model.alertMessage ? <LiveDataBanner state={model.liveState} message={model.alertMessage} /> : null}

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
              <AgentTile key={tile.label} tile={tile} />
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
  selectedAction,
  onSelectAction,
}: {
  actions: ProductAction[];
  selectedAction: ProductAction;
  onSelectAction: (id: string) => void;
}) {
  const totalImpact = actions.reduce((sum, action) => sum + action.impactCents, 0);

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
          { label: "Est. Cash Impact", value: formatCurrency(totalImpact, "GBP"), helper: "Subject to approval", tone: "good" },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.95fr)_minmax(0,1.12fr)]">
        <Panel>
          <PanelHeader title="Pending Approvals" meta={String(actions.length)} />
          <div className="mt-5 space-y-3">
            {actions.map((action) => (
              <PendingApprovalCard
                action={action}
                active={action.id === selectedAction.id}
                key={action.id}
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
                <TonePill tone={selectedAction.priority === "High" ? "risk" : "watch"}>{selectedAction.priority} priority</TonePill>
                <h2 className="mt-5 text-2xl font-semibold tracking-normal text-slate-100">{selectedAction.customer}</h2>
                <p className="mt-2 text-sm text-slate-400">{selectedAction.detail}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase text-slate-500">Est. cash impact</p>
                <p className={clsx("mt-2 text-2xl font-semibold", selectedAction.isNegative ? "text-red-400" : "text-emerald-400")}>
                  {formatCurrency(selectedAction.impactCents, "GBP")}
                </p>
              </div>
            </div>

            <div className="mt-8 flex gap-8 border-b border-white/[0.08] text-sm">
              <button className="border-b-2 border-[#7368ff] pb-3 font-medium text-[#8c84ff]" type="button">Why this action?</button>
              <button className="pb-3 text-slate-500" type="button">History</button>
            </div>

            <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_245px]">
              <div>
                <h3 className="text-sm font-medium text-slate-100">Action explanation</h3>
                <p className="mt-3 max-w-[610px] text-sm leading-6 text-slate-400">{selectedAction.rationale}</p>
                <h3 className="mt-8 text-sm font-medium text-slate-100">
                  {selectedAction.channel === "Phone" ? "Call script preview" : "Draft email preview"}
                </h3>
                <pre className="mt-3 whitespace-pre-wrap rounded-md border border-white/[0.08] bg-[#0a101a] p-5 font-mono text-xs leading-6 text-slate-300">
                  {selectedAction.draftPreview}
                </pre>
              </div>
              <div className="rounded-md border border-white/[0.08] bg-white/[0.035] p-5">
                <p className="text-sm font-medium text-slate-100">Payment behavior</p>
                <ul className="mt-4 space-y-3 text-sm text-slate-400">
                  <li>Average days to pay: 41 days</li>
                  <li>On-time payment rate: 64%</li>
                  <li>Last contact: 18 days ago</li>
                </ul>
              </div>
            </div>
          </Panel>

          <Panel>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <ShieldCheck aria-hidden="true" className="text-emerald-400" size={24} />
                  <h3 className="text-lg font-semibold text-slate-100">Compliance & Guardrails</h3>
                </div>
                <div className="mt-5 space-y-3 text-sm text-slate-400">
                  <Guardrail label="Human approval required before any outbound message or call." />
                  <Guardrail label="No provider ID is shown until a real provider execution exists." />
                  <Guardrail label={selectedAction.providerNote} />
                </div>
              </div>
              <TonePill tone="good">Human approval required</TonePill>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function CustomerScreen({ customer }: { customer: CustomerProfile }) {
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
          { label: "Outstanding Invoices", value: formatCurrency(customer.outstandingCents, "GBP"), helper: "3 invoices", tone: "risk" },
          { label: "Total Exposure", value: formatCurrency(customer.exposureCents, "GBP"), helper: "Incl. future due", tone: "neutral" },
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
                ["Phone call", `Spoke with ${customer.contactName}. Confirmed they received the invoice and are waiting on PO approval.`, "May 9, 2:17 PM", Phone, "good"],
                ["Promise to pay", "Promised payment by May 16. PO expected today. Payment will be made Friday.", "May 9, 2:18 PM", Clock3, "watch"],
                ["Payment received", "Payment received against an earlier invoice.", "Apr 30, 10:03 AM", CircleDollarSign, "accent"],
                ["Email received", "Requested updated invoice with PO reference.", "Apr 28, 11:32 AM", Mail, "neutral"],
              ].map(([title, body, time, Icon, tone]) => (
                <TimelineRow body={String(body)} icon={Icon as ComponentType<{ size?: number; className?: string }>} key={String(title)} time={String(time)} title={String(title)} tone={tone as StatusTone} />
              ))}
            </div>
            <button className="mx-auto mt-5 block text-sm font-medium text-[#8279ff]" type="button">View all interactions</button>
          </Panel>

          <Panel>
            <PanelHeader title="What we've learned (Customer memory)" />
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                ["Responds best by phone", "Phone outreach gets a response within 2 hours on average.", "good"],
                ["Delays if PO is missing", "Payments delayed when PO is not provided.", "watch"],
                ["Reliable after escalation", "Once escalated to manager, payments usually follow.", "good"],
              ].map(([title, body, tone]) => (
                <MemoryCard body={body} key={title} title={title} tone={tone as StatusTone} />
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
                <pre className="mt-4 whitespace-pre-wrap rounded-md border border-white/[0.08] bg-[#0a101a] p-4 font-mono text-xs leading-6 text-slate-300">{`Hi ${customer.contactName}, it's James from Marlow & Finch.\nI'm calling about ${customer.invoiceLabel} for ${formatCurrency(customer.outstandingCents, "GBP")}.\nI understand the PO was expected today. Is everything in place so we can process payment this week?`}</pre>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Supporting evidence" right={<span className="text-sm text-[#8279ff]">View all</span>} />
            <div className="mt-5 space-y-3">
              {[
                ["Invoice #INV-1044", "£18,600 · Due May 12, 2025", "PDF", FileText],
                ["Call transcript - May 9", `With ${customer.contactName}`, "Transcript", Activity],
                ["Email reply - Apr 28", "Re: Invoice #INV-1017", "EML", Mail],
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
  const scenarioShift = activeCount * 7600;

  return (
    <div className="space-y-5">
      <ScreenTitle
        title="Scenario Planner"
        description="Model different scenarios and see the impact on your cash runway."
        controls={<LiveDataMark />}
      />
      <KpiStrip
        metrics={[
          model.overviewMetrics[0],
          model.overviewMetrics[2],
          { label: "Best-Case Runway", value: "46 days", helper: "to 29 Jun 2025", tone: "good" },
          { label: "Worst-Case Runway", value: "18 days", helper: "to 1 Jun 2025", tone: "risk" },
        ]}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <Panel>
          <PanelHeader
            title="Cash Projection"
            meta="90 Days"
            right={
              <div className="flex gap-5 text-xs text-slate-400">
                <LegendDot color="bg-[#7066ff]" label="Baseline" />
                <LegendDot color="bg-emerald-400" label="Optimistic" />
                <LegendDot color="bg-amber-400" label="Conservative" />
              </div>
            }
          />
          <ProjectionChart shift={scenarioShift} />
        </Panel>

        <Panel>
          <PanelHeader title="Scenario Controls" />
          <p className="mt-2 text-sm text-slate-400">Adjust key assumptions to model outcomes.</p>
          <div className="mt-6 space-y-3">
            <ScenarioToggle
              active={toggles.customerAPays}
              icon={UsersRound}
              label="Customer A pays Friday"
              meta="Invoice #INV-1021 · £34,250"
              onClick={() => onToggle("customerAPays")}
            />
            <ScenarioToggle
              active={toggles.partialPayment}
              icon={UsersRound}
              label="Customer B partial payment"
              meta="50% of £18,600 on 20 May"
              onClick={() => onToggle("partialPayment")}
            />
            <ScenarioToggle
              active={toggles.supplierDeferral}
              icon={BriefcaseBusiness}
              label="Supplier deferred 5 days"
              meta="All payables pushed out by 5 days"
              onClick={() => onToggle("supplierDeferral")}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.75fr)_minmax(330px,0.8fr)]">
        <Panel>
          <PanelHeader title="Scenario Comparison" />
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <ScenarioCard label="Baseline" value={84000 + scenarioShift} tone="accent" risk="Medium risk" />
            <ScenarioCard label="Optimistic" value={312000 + scenarioShift} tone="good" risk="Low risk" />
            <ScenarioCard label="Conservative" value={-42000 + scenarioShift} tone="risk" risk="High risk" />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Recommended Action Plan" />
          <p className="mt-2 text-sm text-slate-400">Focus on these high-impact actions.</p>
          <div className="mt-5 space-y-4">
            {[
              ["Secure Customer A payment", "+7 days", "good"],
              ["Confirm supplier deferral", "+6 days", "good"],
              ["Activate payroll financing", "+25 days", "watch"],
            ].map(([label, impact, tone], index) => (
              <PlanRow index={index + 1} impact={impact} key={label} label={label} tone={tone as StatusTone} />
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
            {[
              ["Payroll financing", 25],
              ["Customer A pays Friday", 7],
              ["Supplier deferred 5 days", 6],
              ["Customer B 50% payment", -8],
              ["Delay Customer A by 7d", -14],
              ["Lose Customer B payment", -18],
            ].map(([label, value]) => (
              <SensitivityRow key={String(label)} label={String(label)} value={Number(value)} />
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
              <TimelineRow body={step.body} icon={step.icon} key={step.title} time={step.time} title={step.title} tone={step.tone} />
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
    <section className="grid rounded-lg border border-white/[0.09] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => (
        <div className={clsx("min-h-[118px] p-7", index > 0 && "border-t border-white/[0.08] md:border-l md:border-t-0") } key={metric.label}>
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
    <section className={clsx("rounded-lg border border-white/[0.09] bg-white/[0.035] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_20px_60px_rgba(0,0,0,0.12)]", className)}>
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
    <div className="flex items-start gap-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] p-4 text-sm text-amber-100">
      {isLoading ? <Loader2 aria-hidden="true" className="mt-0.5 animate-spin text-amber-300" size={18} /> : <CircleAlert aria-hidden="true" className="mt-0.5 text-amber-300" size={18} />}
      <p className="leading-6">{message}</p>
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

function ProjectionChart({ shift }: { shift: number }) {
  const baseline = [560, 440, 430, 385, 360, 322, 260, 178, 112, 84].map((value) => value + shift / 1000);
  const optimistic = [555, 486, 448, 450, 470, 482, 452, 470, 420, 380].map((value) => value + shift / 900);
  const conservative = [548, 432, 338, 288, 244, 210, 118, 42, -48, -96].map((value) => value + shift / 1200);

  return (
    <div className="mt-7 h-[340px]">
      <svg className="h-full w-full" role="img" viewBox="0 0 720 340">
        <rect fill="rgba(239,68,68,0.12)" height="72" width="620" x="58" y="218" />
        {[58, 145, 232, 319, 406, 493, 580, 667].map((x) => (
          <line key={x} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 4" x1={x} x2={x} y1="32" y2="292" />
        ))}
        {[56, 110, 164, 218, 272].map((y) => (
          <line key={y} stroke="rgba(255,255,255,0.07)" x1="58" x2="678" y1={y} y2={y} />
        ))}
        <Polyline values={optimistic} color="#4ade80" dashed />
        <Polyline values={baseline} color="#7368ff" />
        <Polyline values={conservative} color="#f59e0b" dashed />
        {[0, 2, 4, 6, 8].map((index) => {
          const x = 58 + index * 68.8;
          const y = projectY(baseline[index]);
          return <circle cx={x} cy={y} fill="#0b1020" key={index} r="5" stroke="#8177ff" strokeWidth="3" />;
        })}
        <foreignObject height="116" width="185" x="488" y="46">
          <div className="rounded-md border border-white/[0.1] bg-[#0d1420]/95 p-4 text-xs text-slate-300">
            <p className="text-sm text-white">30 Jun 2025</p>
            <p className="mt-3 text-emerald-400">Optimistic £312,000</p>
            <p className="mt-2 text-[#8279ff]">Baseline £84,000</p>
            <p className="mt-2 text-red-400">Conservative -£42,000</p>
          </div>
        </foreignObject>
        <text fill="#94a3b8" fontSize="12" x="4" y="40">£800k</text>
        <text fill="#94a3b8" fontSize="12" x="4" y="94">£600k</text>
        <text fill="#94a3b8" fontSize="12" x="4" y="148">£400k</text>
        <text fill="#94a3b8" fontSize="12" x="4" y="202">£200k</text>
        <text fill="#94a3b8" fontSize="12" x="25" y="257">£0</text>
        <text fill="#94a3b8" fontSize="12" x="5" y="310">-£200k</text>
      </svg>
    </div>
  );
}

function Polyline({ values, color, dashed }: { values: number[]; color: string; dashed?: boolean }) {
  const points = values.map((value, index) => `${58 + index * 68.8},${projectY(value)}`).join(" ");
  return <polyline fill="none" points={points} stroke={color} strokeDasharray={dashed ? "7 7" : undefined} strokeLinecap="round" strokeWidth="2.5" />;
}

function projectY(value: number) {
  return 218 - (value / 800) * 190;
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
        <p className={clsx("text-sm font-semibold", action.isNegative ? "text-red-400" : "text-emerald-400")}>{formatCurrency(action.impactCents, "GBP")}</p>
        <p className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-400"><ChannelIcon aria-hidden="true" size={15} />{action.channel}</p>
      </div>
    </article>
  );
}

function PendingApprovalCard({
  action,
  active,
  onSelect,
}: {
  action: ProductAction;
  active: boolean;
  onSelect: () => void;
}) {
  const tone = action.priority === "High" ? "risk" : "watch";

  return (
    <button
      className={clsx(
        "w-full rounded-lg border p-4 text-left transition",
        active ? toneBorder(tone) : "border-white/[0.08]",
        active ? "bg-white/[0.055]" : "bg-white/[0.025] hover:bg-white/[0.045]",
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start gap-4">
        <TonePill tone={tone}>{action.priority}</TonePill>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-white">{action.customer}</p>
          <p className="mt-1 text-sm text-slate-400">{action.detail}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-white/[0.08] pt-4">
        <MetricBlock label="Cash impact" value={formatCurrency(action.impactCents, "GBP")} tone={action.isNegative ? "risk" : "good"} />
        <MetricBlock label="Channel" value={action.channel} />
        <MetricBlock label="Confidence" value={action.confidence} tone={action.confidence === "High" ? "good" : "watch"} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <button className="h-9 rounded-md bg-[#4e43ff] text-sm font-semibold text-white disabled:opacity-55" disabled type="button">Approve</button>
        <button className="h-9 rounded-md border border-white/[0.1] text-sm font-medium text-[#b3adff]" type="button">Edit</button>
        <button className="h-9 rounded-md border border-white/[0.1] text-sm font-medium text-[#b3adff]" type="button">Reject</button>
      </div>
    </button>
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

function ScenarioCard({ label, value, tone, risk }: { label: string; value: number; tone: StatusTone; risk: string }) {
  return (
    <div className={clsx("rounded-md border p-4", toneBorder(tone), "bg-white/[0.025]")}>
      <p className="text-sm font-medium text-white">{label}</p>
      <p className={clsx("mt-5 text-2xl font-semibold", toneText(tone))}>{formatCurrency(value * 100, "GBP")}</p>
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

type ProductViewModel = {
  companyName: string;
  caseName: string;
  currency: string;
  generatedAt: string;
  liveState: "live" | "loading" | "unavailable" | "error";
  alertMessage: string | null;
  readinessSummary: string;
  overviewMetrics: Array<{ label: string; value: string; helper: string; tone: StatusTone }>;
  cashflowBars: Array<{ label: string; valueCents: number; kind: "net" | "movement" }>;
  actions: ProductAction[];
  approvals: Array<{ id: string; title: string; detail: string }>;
  agentTiles: Array<{ label: string; status: string; detail: string; tone: StatusTone; icon: ComponentType<{ size?: number; className?: string }> }>;
  providerStatuses: ProviderView[];
  customer: CustomerProfile;
  agentTimeline: Array<{ title: string; body: string; time: string; tone: StatusTone; icon: ComponentType<{ size?: number; className?: string }> }>;
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
  return {
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
    cashflowBars: buildCashflowBars(data, runtime),
    actions,
    approvals: buildApprovals(actions, runtime?.cp4EmailApproval.items ?? []),
    agentTiles: buildAgentTiles(runtime),
    providerStatuses,
    customer,
    agentTimeline: buildAgentTimeline(runtime, ingestionState),
    evidenceCount:
      ingestionState.kind === "ready"
        ? String(ingestionState.data.sourceFiles.total + ingestionState.data.imports.rows.total + ingestionState.data.events.recent.length)
        : data
          ? String(data.invoices.length + data.obligations.length + data.memoryFacts.length)
          : "Pending",
  };
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
    { label: "Forecast Agent", status: hasRuns ? "On Track" : "Waiting", detail: hasRuns ? "Updated recently" : "No run recorded", tone: hasRuns ? "good" : "watch", icon: LineChart },
    { label: "Collections Agent", status: hasRuns ? "On Track" : "Waiting", detail: "Replies and promises", tone: hasRuns ? "good" : "watch", icon: UsersRound },
    { label: "Supplier Agent", status: "At Risk", detail: "Payments due", tone: "watch", icon: BriefcaseBusiness },
    { label: "Audit Agent", status: hasRuns ? "On Track" : "Waiting", detail: hasRuns ? "Trace metadata ready" : "No trace recorded", tone: hasRuns ? "good" : "neutral", icon: ShieldCheck },
  ];
}

function buildProviderViews(runtimeState: Loadable<Cp3ForecastCockpitState>): ProviderView[] {
  if (runtimeState.kind !== "ready") {
    const message = runtimeState.kind === "loading" ? "Checking connection readiness." : "The live runtime connection is unavailable in this environment.";
    return [
      { name: "Aurora / S3", label: runtimeState.kind === "loading" ? "Checking" : "Unavailable", message, tone: runtimeState.kind === "loading" ? "watch" : "risk" },
      { name: "AI reasoning", label: "Unavailable", message: "Reasoning status is hidden until the live runtime aggregate loads.", tone: "watch" },
      { name: "Email", label: "Not connected", message: "Email remains approval-gated and no send is shown without provider execution.", tone: "watch" },
      { name: "Voice", label: "Not connected", message: "Voice calling remains unavailable until Twilio or ElevenLabs readiness is returned.", tone: "watch" },
    ];
  }

  return runtimeState.data.providers.map((provider) => mapProvider(provider));
}

function mapProvider(provider: Cp3ProviderStatus): ProviderView {
  const connected = provider.status === "connected" || provider.status === "configured";
  const tone: StatusTone = connected ? "good" : provider.status === "optional_unconfigured" ? "watch" : "risk";

  return {
    name: provider.name,
    label: connected ? "Ready" : provider.status === "optional_unconfigured" ? "Optional" : "Unavailable",
    message: provider.message,
    tone,
  };
}

function buildAgentTimeline(runtime: Cp3ForecastCockpitState | null, ingestionState: Loadable<IngestionStatusState>): ProductViewModel["agentTimeline"] {
  const sourceCount = ingestionState.kind === "ready" ? ingestionState.data.sourceFiles.total : 0;
  const runs = runtime?.agent.runs ?? [];
  const checkpoints = runtime?.agent.checkpoints ?? [];

  return [
    { title: "Read new source data", body: sourceCount > 0 ? `${sourceCount} source files are available for this case.` : "Waiting for source evidence to be available.", time: "Now", tone: sourceCount > 0 ? "good" : "watch", icon: FileText },
    { title: "Updated forecast", body: runtime?.forecast.run ? `${runtime.forecast.run.pointCount} projection points loaded.` : "No persisted forecast run is available yet.", time: runtime?.forecast.run?.createdAt ? formatShortDate(runtime.forecast.run.createdAt) : "Pending", tone: runtime?.forecast.run ? "good" : "watch", icon: LineChart },
    { title: "Drafted recommendations", body: runtime?.actionPlan.recommendedActions.length ? `${runtime.actionPlan.recommendedActions.length} recommended actions are ready for approval.` : "Recommendations will appear after the action plan is persisted.", time: "Pending", tone: runtime?.actionPlan.recommendedActions.length ? "good" : "watch", icon: ClipboardCheck },
    { title: "Human approval gate", body: "Outbound provider actions require approval before execution.", time: "Always on", tone: "good", icon: ShieldCheck },
    { title: "Learned from outcome", body: checkpoints.length > 0 || runs.length > 0 ? "Agent checkpoints are recorded for review." : "Outcome learning waits for replies, payments, or call transcripts.", time: "Next", tone: checkpoints.length > 0 ? "good" : "neutral", icon: Sparkles },
  ];
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
