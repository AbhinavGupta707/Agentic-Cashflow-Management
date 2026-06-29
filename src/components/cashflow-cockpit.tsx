"use client";

import { type ComponentType, type FormEvent, useEffect, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Cpu,
  DatabaseZap,
  FileInput,
  FilePlus2,
  FileText,
  GitBranch,
  History,
  Inbox,
  LineChart,
  LockKeyhole,
  Loader2,
  Mail,
  MailCheck,
  MailWarning,
  RadioTower,
  RefreshCw,
  Send,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";

import { DataState, UpdatedAt } from "@/components/data-state";
import type { CompanyCaseState, CurrentCaseApiResponse } from "@/server/db/case-state-contract";
import type {
  Cp3ForecastCockpitApiResponse,
  Cp3ForecastCockpitState,
  Cp3ForecastPoint,
  Cp3ProviderStatus,
  Cp4EmailApprovalItem,
} from "@/server/db/cp3-forecast-cockpit-contract";
import type { IngestionStatusApiResponse, IngestionStatusState } from "@/server/db/ingestion-status-contract";

type CockpitState =
  | { kind: "loading" }
  | { kind: "unavailable"; message: string; missingEnv: string[] }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: CompanyCaseState };

type IngestionPanelState =
  | { kind: "loading" }
  | { kind: "unavailable"; message: string; missingEnv: string[] }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: IngestionStatusState };

type Cp3PanelState =
  | { kind: "loading" }
  | { kind: "unavailable"; message: string; missingEnv: string[] }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: Cp3ForecastCockpitState };

type UploadPanelState =
  | { kind: "idle"; message: string }
  | { kind: "uploading"; message: string }
  | { kind: "success"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

const SOURCE_KIND_OPTIONS = [
  { value: "invoice_csv", label: "Invoice CSV" },
  { value: "invoice_pdf", label: "Invoice PDF" },
  { value: "customer_csv", label: "Customer CSV" },
  { value: "obligation_csv", label: "Obligation CSV" },
  { value: "bank_csv", label: "Bank CSV" },
  { value: "manual_upload", label: "Manual upload" },
] as const;

const IMPORT_KIND_OPTIONS = [
  { value: "invoices", label: "Invoices" },
  { value: "customers", label: "Customers" },
  { value: "obligations", label: "Obligations" },
  { value: "payments", label: "Payments" },
  { value: "mixed", label: "Mixed" },
] as const;

const MANUAL_RECORD_OPTIONS = ["invoice", "customer", "obligation", "payment"] as const;

export function CashflowCockpit() {
  const [state, setState] = useState<CockpitState>({ kind: "loading" });
  const [ingestionState, setIngestionState] = useState<IngestionPanelState>({ kind: "loading" });
  const [cp3State, setCp3State] = useState<Cp3PanelState>({ kind: "loading" });

  useEffect(() => {
    let active = true;

    async function loadCurrentCase() {
      try {
        const response = await fetch("/api/current-case", {
          cache: "no-store",
        });
        const payload = (await response.json()) as CurrentCaseApiResponse;

        if (!active) {
          return;
        }

        if (payload.status === "ok") {
          setState({ kind: "ready", data: payload.data });
          return;
        }

        if (payload.status === "unavailable") {
          setState({
            kind: "unavailable",
            message: payload.message,
            missingEnv: payload.missingEnv,
          });
          return;
        }

        setState({
          kind: "error",
          message: payload.message,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Unable to load current case state.",
        });
      }
    }

    void loadCurrentCase();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      const nextState = await fetchIngestionStatus();

      if (active) {
        setIngestionState(nextState);
      }
    }

    void loadStatus();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadCp3State() {
      const nextState = await fetchCp3ForecastCockpit();

      if (active) {
        setCp3State(nextState);
      }
    }

    void loadCp3State();

    return () => {
      active = false;
    };
  }, []);

  async function refreshIngestionStatus() {
    setIngestionState({ kind: "loading" });
    setIngestionState(await fetchIngestionStatus());
  }

  async function refreshCp3State() {
    setCp3State({ kind: "loading" });
    setCp3State(await fetchCp3ForecastCockpit());
  }

  return (
    <main className="min-h-screen bg-ink-50 text-ink-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-ink-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-white">
              <Banknote aria-hidden="true" size={21} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-500">
                {state.kind === "ready" ? state.data.company.name : "Agentic Cashflow Management"}
              </p>
              <h1 className="text-2xl font-semibold tracking-normal text-ink-900 sm:text-3xl">
                Cash management cockpit
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <UpdatedAt
              label={
                state.kind === "ready"
                  ? "Aurora demo case loaded from the live repository path"
                  : state.kind === "loading"
                    ? "Loading Aurora case state"
                    : "Aurora case state unavailable"
              }
            />
            <button
              className="inline-flex items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-ink-900 focus:ring-offset-2"
              type="button"
            >
              <ShieldCheck aria-hidden="true" size={16} />
              Review controls
            </button>
          </div>
        </header>

        {state.kind === "loading" ? <LoadingShell /> : null}
        {state.kind === "unavailable" ? <UnavailableShell state={state} /> : null}
        {state.kind === "error" ? <ErrorShell state={state} /> : null}
        {state.kind === "ready" ? (
          <ReadyShell
            data={state.data}
            cp3State={cp3State}
            ingestionState={ingestionState}
            onRefreshCp3State={refreshCp3State}
            onRefreshIngestionStatus={refreshIngestionStatus}
          />
        ) : null}
      </div>
    </main>
  );
}

function LoadingShell() {
  return (
    <section className="grid flex-1 gap-5 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)]">
      <DataState
        title="Loading live case state"
        description="The cockpit is waiting for the Aurora-backed repository path to return the seeded demo case."
        variant="loading"
      />
      <DataState
        title="Provider surfaces stay gated"
        description="Email, voice, and live reasoning remain unavailable until later checkpoints add those providers."
        variant="unavailable"
      />
    </section>
  );
}

function UnavailableShell({
  state,
}: {
  state: Extract<CockpitState, { kind: "unavailable" }>;
}) {
  return (
    <section className="grid flex-1 gap-5 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)]">
      <div className="space-y-5">
        <DataState
          title="Aurora read path unavailable"
          description={state.message}
          variant="unavailable"
          action={
            <p className="text-xs font-medium text-ink-600">
              Missing env: {state.missingEnv.join(", ")}
            </p>
          }
        />
        <DataState
          title="No static fixture fallback"
          description="Checkpoint 1 does not pretend the repository is live when Aurora configuration is absent. Add the required env values, then run migration, seed, and smoke."
          variant="empty"
        />
      </div>
      <aside className="space-y-5">
        <ReadinessPanel
          cards={[
            { label: "Aurora schema", count: "Pending", state: "Run db:migrate", icon: DatabaseZap },
            { label: "Demo seed", count: "Pending", state: "Run db:seed", icon: FileText },
            { label: "Smoke test", count: "Pending", state: "Run smoke", icon: ClipboardCheck },
            { label: "Providers", count: "0", state: "Checkpoint 1 not configured", icon: MailCheck },
          ]}
        />
      </aside>
    </section>
  );
}

function ErrorShell({
  state,
}: {
  state: Extract<CockpitState, { kind: "error" }>;
}) {
  return (
    <section className="grid flex-1 gap-5 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)]">
      <DataState
        title="Current case state failed to load"
        description={state.message}
        variant="error"
      />
      <DataState
        title="Repository needs attention"
        description="The app shell is up, but the Aurora-backed repository call failed. Re-run smoke to separate configuration problems from runtime defects."
        variant="empty"
      />
    </section>
  );
}

function ReadyShell({
  data,
  cp3State,
  ingestionState,
  onRefreshCp3State,
  onRefreshIngestionStatus,
}: {
  data: CompanyCaseState;
  cp3State: Cp3PanelState;
  ingestionState: IngestionPanelState;
  onRefreshCp3State: () => void;
  onRefreshIngestionStatus: () => void;
}) {
  const overdueInvoices = data.invoices.filter((invoice) => invoice.status === "overdue");
  const approvalQueue = data.recommendedActions.filter((action) => action.approvalRequired);
  const openObligations = data.obligations.filter((obligation) => obligation.status !== "paid");

  const runwayMetrics = [
    {
      label: "Cash balance",
      value: formatCurrency(data.company.cashBalanceCents, data.company.baseCurrency),
      delta: `${data.customers.length} customers in the demo case`,
      direction: "up",
    },
    {
      label: "Overdue receivables",
      value: formatCurrency(sumCents(overdueInvoices.map((invoice) => invoice.outstandingCents)), data.company.baseCurrency),
      delta: `${overdueInvoices.length} invoices currently overdue`,
      direction: overdueInvoices.length > 0 ? "down" : "up",
    },
    {
      label: "Upcoming obligations",
      value: formatCurrency(sumCents(openObligations.map((obligation) => obligation.amountCents)), data.company.baseCurrency),
      delta: `${openObligations.length} obligations not yet paid`,
      direction: "neutral",
    },
    {
      label: "Approval queue",
      value: `${approvalQueue.length} actions`,
      delta: `${data.memoryFacts.length} seeded memory facts loaded`,
      direction: approvalQueue.length > 0 ? "neutral" : "up",
    },
  ] as const;

  const sourceCards = [
    {
      label: "Invoices",
      count: String(data.invoices.length),
      state: `${overdueInvoices.length} overdue`,
      icon: FileText,
    },
    {
      label: "Customers",
      count: String(data.customers.length),
      state: `${data.customers.filter((customer) => customer.primaryContact).length} with primary contacts`,
      icon: CircleDollarSign,
    },
    {
      label: "Memory facts",
      count: String(data.memoryFacts.length),
      state: "Aurora-backed demo memory",
      icon: DatabaseZap,
    },
    {
      label: "Approval ledger",
      count: String(approvalQueue.length),
      state: "Human approval required",
      icon: ClipboardCheck,
    },
  ];

  return (
    <>
      <section className="grid gap-4 py-5 sm:grid-cols-2 xl:grid-cols-4">
        {runwayMetrics.map((metric) => (
          <article className="rounded-lg border border-ink-100 bg-white p-4 shadow-sm" key={metric.label}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-ink-500">{metric.label}</p>
              {metric.direction === "up" ? (
                <ArrowUpRight aria-hidden="true" className="text-ledger-green" size={17} />
              ) : metric.direction === "down" ? (
                <ArrowDownRight aria-hidden="true" className="text-ledger-red" size={17} />
              ) : (
                <CalendarClock aria-hidden="true" className="text-ledger-amber" size={17} />
              )}
            </div>
            <p className="mt-3 text-2xl font-semibold text-ink-900">{metric.value}</p>
            <p className="mt-1 text-sm text-ink-500">{metric.delta}</p>
          </article>
        ))}
      </section>

      <section className="grid flex-1 gap-5 pb-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)]">
        <div className="space-y-5">
          <OperationalIngestionPanel data={data} />

          <Cp3ForecastPanel
            currency={data.company.baseCurrency}
            legacyForecast={data.forecast}
            onRefresh={onRefreshCp3State}
            state={cp3State}
          />

          <Cp3ActionQueuePanel
            currency={data.company.baseCurrency}
            legacyActions={data.recommendedActions}
            state={cp3State}
          />

          <Cp4EmailApprovalPanel
            currency={data.company.baseCurrency}
            state={cp3State}
          />
        </div>

        <aside className="space-y-5">
          <DataState
            title="Aurora read path connected"
            description={`Loaded ${data.invoices.length} invoices, ${data.obligations.length} obligations, and ${data.memoryFacts.length} memory facts for ${data.caseId}.`}
            variant="empty"
          />

          <IngestionStatusPanel
            caseData={data}
            state={ingestionState}
            onRefresh={onRefreshIngestionStatus}
          />

          <ReadinessPanel cards={sourceCards} />

          <Cp3AgentStatusPanel state={cp3State} />

          <Cp3ProviderStatusPanel state={cp3State} />
        </aside>
      </section>
    </>
  );
}

function Cp3ForecastPanel({
  state,
  currency,
  legacyForecast,
  onRefresh,
}: {
  state: Cp3PanelState;
  currency: string;
  legacyForecast: CompanyCaseState["forecast"];
  onRefresh: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <DataState
        title="Loading CP3 forecast state"
        description="The cockpit is reading forecast runs, points, shortfalls, and drivers from the CP3 route contract."
        variant="loading"
      />
    );
  }

  if (state.kind === "unavailable") {
    return (
      <DataState
        title="CP3 forecast route unavailable"
        description={state.message}
        variant="unavailable"
        action={
          <p className="text-xs font-medium text-ink-600">
            Missing env: {state.missingEnv.join(", ")}
          </p>
        }
      />
    );
  }

  if (state.kind === "error") {
    return (
      <DataState
        title="CP3 forecast route failed"
        description={state.message}
        variant="error"
      />
    );
  }

  const forecast = state.data.forecast;

  if (forecast.state === "unavailable" || !forecast.run) {
    return (
      <DataState
        title="CP3 forecast not generated"
        description={`${forecast.message} Current-case baseline has ${legacyForecast?.points.length ?? 0} forecast points, but this panel waits for the CP3 route contract.`}
        variant="unavailable"
      />
    );
  }

  const run = forecast.run;
  const shortfallLabel =
    forecast.shortfallPoints.length > 0
      ? `${forecast.shortfallPoints.length} shortfall points`
      : "No shortfall points";

  return (
    <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 border-b border-ink-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-ledger-blue">
            <LineChart aria-hidden="true" size={18} />
            <h2 className="text-base font-semibold text-ink-900">CP3 forecast run</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-ink-500">
            {run.externalId} · {formatDateRange(run.horizonStartDate, run.horizonEndDate)} · {run.modelVersion}
          </p>
        </div>
        <button
          aria-label="Refresh CP3 forecast state"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-600 transition hover:border-ink-300 hover:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-ink-900 focus:ring-offset-2"
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} />
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <MetricTile label="State" value={capitalize(run.state)} tone={run.state === "completed" ? "clear" : "watch"} />
        <MetricTile
          label="Minimum cash"
          value={formatCurrency(run.minimumCashCents, currency)}
          tone={run.minimumCashCents < 0 ? "risk" : "neutral"}
        />
        <MetricTile
          label="Projected low"
          value={run.minimumProjectedCashCents === null ? "No points" : formatCurrency(run.minimumProjectedCashCents, currency)}
          tone={(run.minimumProjectedCashCents ?? 0) <= run.minimumCashCents ? "risk" : "neutral"}
        />
        <MetricTile
          label="Shortfall"
          value={formatCurrency(run.totalShortfallCents, currency)}
          tone={run.totalShortfallCents > 0 ? "risk" : "clear"}
        />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-ink-500">
              <th className="border-b border-ink-100 py-3 font-semibold">Date</th>
              <th className="border-b border-ink-100 py-3 font-semibold">Expected in</th>
              <th className="border-b border-ink-100 py-3 font-semibold">Committed out</th>
              <th className="border-b border-ink-100 py-3 font-semibold">Projected cash</th>
              <th className="border-b border-ink-100 py-3 font-semibold">Shortfall</th>
              <th className="border-b border-ink-100 py-3 font-semibold">Drivers</th>
            </tr>
          </thead>
          <tbody>
            {forecast.points.map((point) => (
              <tr className="text-ink-700" key={point.pointDate}>
                <td className="border-b border-ink-100 py-3 font-medium text-ink-900">
                  {formatShortDate(point.pointDate)}
                </td>
                <td className="border-b border-ink-100 py-3">{formatCurrency(point.inflowCents, currency)}</td>
                <td className="border-b border-ink-100 py-3">{formatCurrency(point.outflowCents, currency)}</td>
                <td className="border-b border-ink-100 py-3 font-medium">
                  <span className="inline-flex items-center gap-2">
                    <StatusDot status={forecastStatus(point.expectedCashCents, run.minimumCashCents)} />
                    {formatCurrency(point.expectedCashCents, currency)}
                  </span>
                </td>
                <td className="border-b border-ink-100 py-3">
                  {point.shortfallCents > 0 ? formatCurrency(point.shortfallCents, currency) : "None"}
                </td>
                <td className="border-b border-ink-100 py-3">
                  <DriverCell point={point} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.45fr)]">
        <div className="rounded-md border border-ink-100 bg-ink-50 p-3">
          <p className="text-sm font-semibold text-ink-900">Forecast drivers</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {forecast.drivers.length > 0 ? (
              forecast.drivers.map((driver) => (
                <span
                  className="rounded-md border border-ink-100 bg-white px-2.5 py-1 text-xs text-ink-600"
                  key={`${driver.label}-${driver.detail ?? ""}-${driver.amountCents ?? ""}`}
                >
                  <span className="font-semibold text-ink-900">{driver.label}</span>
                  {driver.amountCents === null ? null : ` · ${formatCurrency(driver.amountCents, currency)}`}
                </span>
              ))
            ) : (
              <span className="text-sm text-ink-500">No structured driver metadata is stored yet.</span>
            )}
          </div>
        </div>
        <div className="rounded-md border border-ink-100 bg-ink-50 p-3">
          <p className="text-sm font-semibold text-ink-900">{shortfallLabel}</p>
          <p className="mt-2 text-xs leading-5 text-ink-500">
            CP3 flags shortfalls from persisted shortfall metrics or balances below the run minimum cash threshold.
          </p>
        </div>
      </div>
    </section>
  );
}

function Cp3ActionQueuePanel({
  state,
  currency,
  legacyActions,
}: {
  state: Cp3PanelState;
  currency: string;
  legacyActions: CompanyCaseState["recommendedActions"];
}) {
  if (state.kind === "loading") {
    return (
      <DataState
        title="Loading CP3 action plan"
        description="The cockpit is reading action plans, recommendations, approval state, and provider log counts."
        variant="loading"
      />
    );
  }

  if (state.kind === "unavailable") {
    return (
      <DataState
        title="CP3 action route unavailable"
        description={state.message}
        variant="unavailable"
      />
    );
  }

  if (state.kind === "error") {
    return (
      <DataState
        title="CP3 action route failed"
        description={state.message}
        variant="error"
      />
    );
  }

  const actionState = state.data.actionPlan;

  if (actionState.state === "unavailable") {
    return (
      <DataState
        title="CP3 action plan not generated"
        description={`${actionState.message} Current-case baseline has ${legacyActions.length} recommendations, but no CP3 action plan is exposed here yet.`}
        variant="unavailable"
      />
    );
  }

  return (
    <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <div className="flex items-center gap-2 text-ledger-blue">
            <CheckCircle2 aria-hidden="true" size={18} />
            <h2 className="text-base font-semibold text-ink-900">Approval-gated action queue</h2>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {actionState.plan?.name ?? "Recommended actions"} · {actionState.message}
          </p>
        </div>
        <span className="rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
          {actionState.totals.needsApprovalCount} need approval
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MetricTile label="Actions" value={String(actionState.totals.actionCount)} tone="neutral" />
        <MetricTile
          label="Expected impact"
          value={formatCurrency(actionState.totals.expectedImpactCents, currency)}
          tone="clear"
        />
        <MetricTile
          label="Plan state"
          value={capitalize(actionState.plan?.state ?? "ready_for_review")}
          tone="watch"
        />
      </div>

      <div className="mt-4 divide-y divide-ink-100">
        {actionState.recommendedActions.map((item) => (
          <article className="grid gap-3 py-4 md:grid-cols-[1fr_auto]" key={item.externalId}>
            <div>
              <p className="font-medium text-ink-900">
                {item.customer.name ?? item.obligation.title ?? "Unassigned action"}
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-500">{item.title}</p>
              {item.rationale ? <p className="mt-1 text-xs leading-5 text-ink-500">{item.rationale}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-md bg-ink-50 px-2 py-1 text-ink-600">
                  {formatActionType(item.actionType)}
                </span>
                <span className="rounded-md bg-ink-50 px-2 py-1 text-ink-600">
                  {item.approval.message}
                </span>
                <span className="rounded-md bg-ink-50 px-2 py-1 text-ink-600">
                  {item.execution.message}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 md:justify-end">
              <div className="text-right">
                <p className="text-sm font-semibold text-ink-900">
                  {formatCurrency(item.expectedCashImpactCents, currency)}
                </p>
                <p className="text-xs text-ink-500">
                  {capitalize(item.priority)} · {item.scheduledFor ? formatShortDate(item.scheduledFor) : "unscheduled"}
                </p>
              </div>
              <StatusPill label={capitalize(item.approval.state)} state={item.approval.state} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Cp4EmailApprovalPanel({
  state,
  currency,
}: {
  state: Cp3PanelState;
  currency: string;
}) {
  if (state.kind === "loading") {
    return (
      <DataState
        title="Loading CP4 email approval state"
        description="The cockpit is reading email draft, approval, provider, and communication state from the read-only aggregate."
        variant="loading"
      />
    );
  }

  if (state.kind === "unavailable") {
    return (
      <DataState
        title="CP4 email approval route unavailable"
        description={state.message}
        variant="unavailable"
      />
    );
  }

  if (state.kind === "error") {
    return (
      <DataState
        title="CP4 email approval state failed"
        description={state.message}
        variant="error"
      />
    );
  }

  const emailState = state.data.cp4EmailApproval;

  if (emailState.state === "unavailable") {
    return (
      <DataState
        title="CP4 email approval not ready"
        description={`${emailState.message} Gmail provider state: ${emailState.provider.message}`}
        variant="unavailable"
      />
    );
  }

  return (
    <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 border-b border-ink-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-ledger-blue">
            <MailCheck aria-hidden="true" size={18} />
            <h2 className="text-base font-semibold text-ink-900">CP4 email approval</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-ink-500">
            {emailState.message}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${providerStatusClass(emailState.provider.status)}`}>
            Gmail {providerStatusLabel(emailState.provider.status)}
          </span>
          <span className="rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
            Sends require approval + provider execution
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <MetricTile label="Email actions" value={String(emailState.totals.actionCount)} tone="neutral" />
        <MetricTile label="Drafts" value={String(emailState.totals.draftCount)} tone={emailState.totals.draftCount > 0 ? "clear" : "watch"} />
        <MetricTile label="Approved" value={String(emailState.totals.approvedCount)} tone={emailState.totals.approvedCount > 0 ? "clear" : "watch"} />
        <MetricTile label="Send eligible" value={String(emailState.totals.sendEligibleCount)} tone={emailState.totals.sendEligibleCount > 0 ? "clear" : "risk"} />
        <MetricTile label="Provider logs" value={String(emailState.totals.providerExecutionCount)} tone="neutral" />
      </div>

      <div className="mt-4 rounded-md border border-ink-100 bg-ink-50 p-3">
        <div className="flex items-start gap-2">
          <LockKeyhole aria-hidden="true" className="mt-0.5 shrink-0 text-ink-500" size={16} />
          <p className="text-xs leading-5 text-ink-600">
            {emailState.provider.message} No OAuth tokens, hidden env values, provider payloads, or raw uploaded bytes are exposed here.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {emailState.items.map((item) => (
          <EmailApprovalCard
            currency={currency}
            item={item}
            key={item.actionExternalId}
          />
        ))}
      </div>
    </section>
  );
}

function EmailApprovalCard({
  item,
  currency,
}: {
  item: Cp4EmailApprovalItem;
  currency: string;
}) {
  const sendDisabled = !item.sendEligibility.eligible;

  return (
    <article className="rounded-lg border border-ink-100">
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(300px,0.75fr)]">
        <div className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-900">{item.customer.name ?? "Unassigned customer"}</p>
              <p className="mt-1 break-words text-sm leading-6 text-ink-600">{item.title}</p>
            </div>
            <StatusPill label={capitalize(item.approval.state)} state={item.approval.state} />
          </div>

          <div className="mt-3 grid gap-2 text-xs text-ink-600 sm:grid-cols-2">
            <LinkageRow label="Action" value={formatActionType(item.actionType)} />
            <LinkageRow label="Expected cash" value={formatCurrency(item.expectedCashImpactCents, currency)} />
            <LinkageRow label="Contact" value={formatContactValue(item)} />
            <LinkageRow label="Invoice" value={item.invoice.invoiceNumber ?? "No invoice link"} />
          </div>

          <p className="mt-3 text-xs leading-5 text-ink-500">
            {item.approval.message}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-xs font-medium text-ink-400 disabled:cursor-not-allowed"
              disabled
              type="button"
            >
              <CheckCircle2 aria-hidden="true" size={15} />
              Approve draft
            </button>
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-xs font-medium text-ink-400 disabled:cursor-not-allowed"
              disabled
              type="button"
            >
              <XCircle aria-hidden="true" size={15} />
              Reject draft
            </button>
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-ink-900 px-3 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:bg-ink-300"
              disabled={sendDisabled}
              type="button"
            >
              {sendDisabled ? <LockKeyhole aria-hidden="true" size={15} /> : <Send aria-hidden="true" size={15} />}
              {sendDisabled ? "Send gated" : "Attempt Gmail send"}
            </button>
          </div>

          <p className="mt-2 text-xs leading-5 text-ink-500">
            Approval/rejection write routes are owned by the CP4 runtime lane. Send controls only become active when the action is approved and Gmail execution is explicitly enabled.
          </p>
        </div>

        <div className="min-w-0 rounded-md border border-ink-100 bg-ink-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {item.draft ? (
                <Mail aria-hidden="true" className="shrink-0 text-ledger-blue" size={16} />
              ) : (
                <MailWarning aria-hidden="true" className="shrink-0 text-ledger-amber" size={16} />
              )}
              <p className="truncate text-sm font-semibold text-ink-900">
                {item.draft?.subject ?? "No internal draft persisted"}
              </p>
            </div>
            <span className="shrink-0 rounded-md border border-ink-100 bg-white px-2 py-1 text-xs text-ink-600">
              {capitalize(item.draft?.state ?? "missing")}
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-ink-600">
            {item.draft?.bodyPreview || "Draft preview will appear here after the CP4 runtime lane persists an internal email draft. Nothing is sent from this read-only cockpit view."}
          </p>
          <div className="mt-3 grid gap-2 text-xs text-ink-600">
            <LinkageRow label="Draft key" value={item.draft?.idempotencyKey ?? "Not available"} />
            <LinkageRow label="Generated by" value={item.draft?.generatedByAgentRunId ? "Agent run linked" : "No agent link"} />
            <LinkageRow label="Eligibility" value={item.sendEligibility.eligible ? "Ready for provider route" : item.sendEligibility.reason} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-ink-100 bg-white px-4 py-3 lg:grid-cols-2">
        <CommunicationHistory item={item} />
        <SendBlockers item={item} />
      </div>
    </article>
  );
}

function CommunicationHistory({ item }: { item: Cp4EmailApprovalItem }) {
  return (
    <div className="min-w-0 rounded-md border border-ink-100 p-3">
      <div className="flex items-center gap-2">
        <History aria-hidden="true" className="text-ink-500" size={16} />
        <p className="text-sm font-semibold text-ink-900">Communication history</p>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-ink-600">
        {item.lastMessage ? (
          <>
            <LinkageRow label="Last message" value={`${capitalize(item.lastMessage.direction)} · ${capitalize(item.lastMessage.state)}`} />
            <LinkageRow label="Provider" value={item.lastMessage.provider ?? "Not recorded"} />
            <LinkageRow label="Message ID" value={item.lastMessage.providerMessageId ?? "Not recorded"} />
            <LinkageRow label="Updated" value={formatOptionalDateTime(item.lastMessage.updatedAt)} />
          </>
        ) : (
          <p>No outbound or inbound communication row is linked yet.</p>
        )}
      </div>
    </div>
  );
}

function SendBlockers({ item }: { item: Cp4EmailApprovalItem }) {
  return (
    <div className="min-w-0 rounded-md border border-ink-100 p-3">
      <div className="flex items-center gap-2">
        <LockKeyhole aria-hidden="true" className="text-ink-500" size={16} />
        <p className="text-sm font-semibold text-ink-900">Send attempt state</p>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-ink-600">
        {item.lastProviderExecution ? (
          <>
            <LinkageRow label="Last provider log" value={`${item.lastProviderExecution.provider} · ${item.lastProviderExecution.operation}`} />
            <LinkageRow label="Execution state" value={capitalize(item.lastProviderExecution.state)} />
            <LinkageRow label="Provider ID" value={item.lastProviderExecution.providerExecutionId ?? "Not recorded"} />
            <LinkageRow label="Attempts" value={String(item.lastProviderExecution.attempts)} />
          </>
        ) : (
          <p>No Gmail provider execution row is linked yet.</p>
        )}
        {item.sendEligibility.blockers.length > 0 ? (
          <ul className="mt-1 grid gap-1 text-ledger-amber">
            {item.sendEligibility.blockers.map((blocker) => (
              <li className="break-words" key={blocker}>
                {blocker}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ledger-green">No send blockers are reported by the read model.</p>
        )}
        {item.lastProviderExecution?.lastError ? (
          <p className="break-words text-ledger-red">{item.lastProviderExecution.lastError}</p>
        ) : null}
      </div>
    </div>
  );
}

function Cp3AgentStatusPanel({ state }: { state: Cp3PanelState }) {
  if (state.kind === "loading") {
    return (
      <DataState
        title="Loading agent run state"
        description="The cockpit is checking for persisted CP3 forecast and recommendation agent runs."
        variant="loading"
      />
    );
  }

  if (state.kind === "unavailable") {
    return (
      <DataState
        title="Agent run state unavailable"
        description={state.message}
        variant="unavailable"
      />
    );
  }

  if (state.kind === "error") {
    return (
      <DataState
        title="Agent run state failed"
        description={state.message}
        variant="error"
      />
    );
  }

  const agent = state.data.agent;

  if (agent.state === "unavailable") {
    return (
      <DataState
        title="Agent graph not persisted"
        description={agent.message}
        variant="unavailable"
      />
    );
  }

  return (
    <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <Bot aria-hidden="true" className="text-ledger-blue" size={18} />
        <h2 className="text-base font-semibold text-ink-900">Agent run status</h2>
      </div>
      <div className="mt-4 space-y-3">
        {agent.runs.map((run) => (
          <article className="rounded-md border border-ink-100 p-3" key={run.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink-900">{run.graphName}</p>
                <p className="mt-1 text-xs text-ink-500">
                  {capitalize(run.runKind)} · {formatDateTime(run.createdAt)}
                </p>
              </div>
              <StatusPill label={capitalize(run.state)} state={run.state} />
            </div>
            {run.errorMessage ? <p className="mt-2 text-xs text-ledger-red">{run.errorMessage}</p> : null}
            <p className="mt-2 text-xs text-ink-500">
              {run.traceAvailable ? "Trace metadata recorded" : "No trace metadata recorded"}
            </p>
          </article>
        ))}
      </div>
      <div className="mt-4 rounded-md border border-ink-100 bg-ink-50 p-3">
        <div className="flex items-center gap-2">
          <GitBranch aria-hidden="true" className="text-ink-500" size={16} />
          <p className="text-sm font-semibold text-ink-900">Checkpoints</p>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-ink-600">
          {agent.checkpoints.length > 0 ? (
            agent.checkpoints.map((checkpoint) => (
              <LinkageRow
                key={checkpoint.checkpointKey}
                label={checkpoint.label}
                value={checkpoint.stage ?? formatDateTime(checkpoint.createdAt)}
              />
            ))
          ) : (
            <p>No checkpoint rows are linked to the latest run.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Cp3ProviderStatusPanel({ state }: { state: Cp3PanelState }) {
  if (state.kind === "loading") {
    return (
      <DataState
        title="Loading provider status"
        description="The cockpit is reading CP3 provider posture without exposing hidden environment values."
        variant="loading"
      />
    );
  }

  if (state.kind === "unavailable") {
    return (
      <DataState
        title="Provider status unavailable"
        description={state.message}
        variant="unavailable"
      />
    );
  }

  if (state.kind === "error") {
    return (
      <DataState
        title="Provider status failed"
        description={state.message}
        variant="error"
      />
    );
  }

  return (
    <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <RadioTower aria-hidden="true" className="text-ledger-blue" size={18} />
        <h2 className="text-base font-semibold text-ink-900">Provider posture</h2>
      </div>
      <div className="mt-4 grid gap-3">
        {state.data.providers.map((provider) => (
          <ProviderStatusRow key={provider.key} provider={provider} />
        ))}
      </div>
    </section>
  );
}

function ProviderStatusRow({ provider }: { provider: Cp3ProviderStatus }) {
  return (
    <article className="rounded-md border border-ink-100 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {provider.key === "aurora" ? (
              <DatabaseZap aria-hidden="true" className="text-ink-500" size={16} />
            ) : provider.key === "fireworks" || provider.key === "langsmith" ? (
              <Cpu aria-hidden="true" className="text-ink-500" size={16} />
            ) : (
              <Activity aria-hidden="true" className="text-ink-500" size={16} />
            )}
            <p className="truncate text-sm font-medium text-ink-900">{provider.name}</p>
          </div>
          <p className="mt-1 text-xs text-ink-500">{provider.capability}</p>
        </div>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${providerStatusClass(provider.status)}`}>
          {providerStatusLabel(provider.status)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink-500">{provider.message}</p>
      {provider.lastExecution ? (
        <p className="mt-2 text-xs text-ink-500">
          Last log: {provider.lastExecution.operation} · {provider.lastExecution.state} · {formatDateTime(provider.lastExecution.updatedAt)}
        </p>
      ) : null}
    </article>
  );
}

async function fetchIngestionStatus(): Promise<IngestionPanelState> {
  try {
    const response = await fetch("/api/ingestion-status", {
      cache: "no-store",
    });
    const payload = (await response.json()) as IngestionStatusApiResponse;

    if (payload.status === "ok") {
      return { kind: "ready", data: payload.data };
    }

    if (payload.status === "unavailable") {
      return {
        kind: "unavailable",
        message: payload.message,
        missingEnv: payload.missingEnv,
      };
    }

    return {
      kind: "error",
      message: payload.message,
    };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Unable to load ingestion status.",
    };
  }
}

async function fetchCp3ForecastCockpit(): Promise<Cp3PanelState> {
  try {
    const response = await fetch("/api/cp3/forecast-cockpit", {
      cache: "no-store",
    });
    const payload = (await response.json()) as Cp3ForecastCockpitApiResponse;

    if (payload.status === "ok") {
      return { kind: "ready", data: payload.data };
    }

    if (payload.status === "unavailable") {
      return {
        kind: "unavailable",
        message: payload.message,
        missingEnv: payload.missingEnv,
      };
    }

    return {
      kind: "error",
      message: payload.message,
    };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Unable to load CP3 forecast cockpit state.",
    };
  }
}

function OperationalIngestionPanel({ data }: { data: CompanyCaseState }) {
  const [sourceKind, setSourceKind] = useState<(typeof SOURCE_KIND_OPTIONS)[number]["value"]>("invoice_csv");
  const [importKind, setImportKind] = useState<(typeof IMPORT_KIND_OPTIONS)[number]["value"]>("invoices");
  const [file, setFile] = useState<File | null>(null);
  const [manualRecordKind, setManualRecordKind] = useState<(typeof MANUAL_RECORD_OPTIONS)[number]>("invoice");
  const [uploadState, setUploadState] = useState<UploadPanelState>({
    kind: "idle",
    message: "Select a source file to enqueue it through the upload lane.",
  });

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setUploadState({ kind: "error", message: "Choose a file before starting an upload." });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sourceKind", sourceKind);
    formData.append("importKind", importKind);
    formData.append("companyExternalId", data.company.externalId);
    formData.append("caseId", data.caseId);

    setUploadState({ kind: "uploading", message: `Uploading ${file.name} to the ingestion route.` });

    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (response.status === 404 || response.status === 405) {
        setUploadState({
          kind: "unavailable",
          message: "POST /api/uploads is not registered in this worktree yet. The control is ready for the upload/S3 lane contract.",
        });
        return;
      }

      const payload = (await readJsonSafely(response)) as { message?: string; status?: string } | null;

      if (!response.ok) {
        setUploadState({
          kind: response.status === 501 ? "unavailable" : "error",
          message: payload?.message ?? `Upload route returned HTTP ${response.status}.`,
        });
        return;
      }

      setUploadState({
        kind: "success",
        message: payload?.message ?? "Upload accepted. Refresh ingestion status after the upload lane writes source/import rows.",
      });
    } catch (error) {
      setUploadState({
        kind: "error",
        message: error instanceof Error ? error.message : "Upload request failed.",
      });
    }
  }

  return (
    <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 border-b border-ink-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-ledger-blue">
            <UploadCloud aria-hidden="true" size={18} />
            <h2 className="text-base font-semibold text-ink-900">Ingestion controls</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-ink-500">
            Upload source evidence into the current Aurora case, or stage manual records when that endpoint is registered.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
          {data.company.externalId}
        </span>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
        <form className="space-y-4" onSubmit={submitUpload}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-ink-700">
              Source kind
              <select
                className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
                onChange={(event) => setSourceKind(event.target.value as typeof sourceKind)}
                value={sourceKind}
              >
                {SOURCE_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-700">
              Import kind
              <select
                className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
                onChange={(event) => setImportKind(event.target.value as typeof importKind)}
                value={importKind}
              >
                {IMPORT_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium text-ink-700">
            Source file
            <span className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-300 bg-ink-50 px-4 py-5 text-center transition hover:border-ink-500">
              <FileInput aria-hidden="true" className="text-ink-500" size={22} />
              <span className="text-sm font-semibold text-ink-900">
                {file ? file.name : "Choose CSV, PDF, or export file"}
              </span>
              <span className="text-xs text-ink-500">
                {file ? formatBytes(file.size) : "File is sent as multipart FormData.file"}
              </span>
              <input
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </span>
          </label>

          <div className="grid gap-3 rounded-md border border-ink-100 bg-ink-50 p-3 text-xs text-ink-600 sm:grid-cols-2">
            <p>
              <span className="font-semibold text-ink-900">Case</span>
              <br />
              {data.caseId}
            </p>
            <p>
              <span className="font-semibold text-ink-900">Normalized targets</span>
              <br />
              {data.invoices.length} invoices, {data.customers.length} customers, {data.obligations.length} obligations
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <UploadFeedback state={uploadState} />
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink-900 px-4 text-sm font-medium text-white transition hover:bg-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-ink-300"
              disabled={uploadState.kind === "uploading"}
              type="submit"
            >
              {uploadState.kind === "uploading" ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={16} />
              ) : (
                <UploadCloud aria-hidden="true" size={16} />
              )}
              Start upload
            </button>
          </div>
        </form>

        <div className="rounded-lg border border-ink-100 bg-ink-50 p-4">
          <div className="flex items-center gap-2">
            <FilePlus2 aria-hidden="true" className="text-ledger-blue" size={18} />
            <h3 className="text-sm font-semibold text-ink-900">Manual entry</h3>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {MANUAL_RECORD_OPTIONS.map((option) => (
              <button
                className={`rounded-md border px-3 py-2 text-sm font-medium capitalize transition ${
                  manualRecordKind === option
                    ? "border-ink-900 bg-white text-ink-900"
                    : "border-ink-100 bg-white/70 text-ink-500 hover:border-ink-200"
                }`}
                key={option}
                onClick={() => setManualRecordKind(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            <input
              className="h-10 rounded-md border border-ink-100 bg-white px-3 text-sm text-ink-500"
              disabled
              placeholder={`${capitalize(manualRecordKind)} reference`}
            />
            <input
              className="h-10 rounded-md border border-ink-100 bg-white px-3 text-sm text-ink-500"
              disabled
              placeholder={manualRecordKind === "payment" ? "Amount and received date" : "Amount, owner, or due date"}
            />
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-sm font-medium text-ink-400"
              disabled
              type="button"
            >
              <FilePlus2 aria-hidden="true" size={16} />
              Manual route unavailable
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-ink-500">
            POST /api/manual-records is not active in this checkpoint branch, so manual invoice, customer, obligation, and payment writes are gated.
          </p>
        </div>
      </div>
    </section>
  );
}

function UploadFeedback({ state }: { state: UploadPanelState }) {
  const color =
    state.kind === "success"
      ? "text-ledger-green"
      : state.kind === "error"
        ? "text-ledger-red"
        : state.kind === "unavailable"
          ? "text-ledger-amber"
          : "text-ink-500";

  return (
    <p className={`min-h-10 max-w-xl text-sm leading-5 ${color}`}>
      {state.message}
    </p>
  );
}

function IngestionStatusPanel({
  caseData,
  state,
  onRefresh,
}: {
  caseData: CompanyCaseState;
  state: IngestionPanelState;
  onRefresh: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <DataState
        title="Loading ingestion status"
        description="The cockpit is reading source, import, and event states from Aurora."
        variant="loading"
      />
    );
  }

  if (state.kind === "unavailable") {
    return (
      <DataState
        title="Ingestion status unavailable"
        description={state.message}
        variant="unavailable"
        action={
          <p className="text-xs font-medium text-ink-600">
            Missing env: {state.missingEnv.join(", ")}
          </p>
        }
      />
    );
  }

  if (state.kind === "error") {
    return (
      <DataState
        title="Ingestion status failed"
        description={state.message}
        variant="error"
      />
    );
  }

  const data = state.data;
  const blockedEvents = data.events.counts.failed + data.events.counts.deadLetter;

  return (
    <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Inbox aria-hidden="true" className="text-ledger-blue" size={18} />
          <h2 className="text-base font-semibold text-ink-900">Import and event status</h2>
        </div>
        <button
          aria-label="Refresh ingestion status"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-600 transition hover:border-ink-300 hover:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-ink-900 focus:ring-offset-2"
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatusCountCard label="Sources" value={data.sourceFiles.total} tone="neutral" />
        <StatusCountCard label="Queued" value={data.imports.counts.queued + data.events.counts.queued} tone="watch" />
        <StatusCountCard label="Processing" value={data.imports.counts.processing + data.events.counts.processing} tone="neutral" />
        <StatusCountCard label="Blocked" value={data.imports.counts.failed + blockedEvents} tone="risk" />
      </div>

      <div className="mt-4 rounded-md border border-ink-100 p-3">
        <h3 className="text-sm font-semibold text-ink-900">Source to case linkage</h3>
        <div className="mt-3 grid gap-2 text-xs text-ink-600">
          <LinkageRow label="Uploaded sources" value={`${data.sourceFiles.total} files`} />
          <LinkageRow
            label="Import batches"
            value={`${data.imports.counts.completed} completed, ${data.imports.counts.queued} queued`}
          />
          <LinkageRow
            label="Normalized records"
            value={`${caseData.invoices.length} invoices, ${caseData.customers.length} customers, ${caseData.obligations.length} obligations`}
          />
          <LinkageRow
            label="Event inbox"
            value={`${data.events.counts.queued} queued, ${data.events.counts.completed} processed`}
          />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <h3 className="text-sm font-semibold text-ink-900">Recent imports</h3>
        {data.imports.recent.length > 0 ? (
          data.imports.recent.map((batch) => (
            <article className="rounded-md border border-ink-100 p-3" key={batch.externalId ?? batch.createdAt}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {batch.sourceFilename ?? batch.externalId ?? "Import batch"}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {capitalize(batch.importKind)} import from {batch.sourceKind ? formatSourceKind(batch.sourceKind) : "unlinked source"}
                  </p>
                </div>
                <StatusPill label={formatImportState(batch.state)} state={batch.state} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-ink-600">
                <MetricChip label="Rows" value={String(batch.rowsTotal)} />
                <MetricChip label="Applied" value={String(batch.rowsSucceeded)} />
                <MetricChip label="Failed" value={String(batch.rowsFailed)} />
              </div>
              {batch.errorMessage ? <p className="mt-2 text-xs text-ledger-red">{batch.errorMessage}</p> : null}
            </article>
          ))
        ) : (
          <p className="rounded-md border border-ink-100 bg-ink-50 p-3 text-sm text-ink-500">
            No import batches are linked to this company yet.
          </p>
        )}
      </div>
    </section>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "clear" | "risk" | "watch";
}) {
  const toneClass =
    tone === "clear"
      ? "text-ledger-green"
      : tone === "risk"
        ? "text-ledger-red"
        : tone === "watch"
          ? "text-ledger-amber"
          : "text-ink-900";

  return (
    <article className="rounded-md border border-ink-100 bg-ink-50 p-3">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
    </article>
  );
}

function DriverCell({ point }: { point: Cp3ForecastPoint }) {
  if (point.drivers.length === 0 && !point.notes) {
    return <span className="text-ink-500">No driver metadata</span>;
  }

  return (
    <div className="max-w-[260px]">
      {point.notes ? <p className="text-xs leading-5 text-ink-600">{point.notes}</p> : null}
      {point.drivers.length > 0 ? (
        <p className="mt-1 text-xs text-ink-500">
          {point.drivers.slice(0, 2).map((driver) => driver.label).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function StatusCountCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "risk" | "watch";
}) {
  const toneClass =
    tone === "risk" ? "text-ledger-red" : tone === "watch" ? "text-ledger-amber" : "text-ink-900";

  return (
    <article className="rounded-md border border-ink-100 bg-ink-50 p-3">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </article>
  );
}

function LinkageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="text-right font-medium text-ink-900">{value}</span>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md bg-ink-50 px-2 py-1">
      <span className="font-semibold text-ink-900">{value}</span> {label}
    </span>
  );
}

function StatusPill({ label, state }: { label: string; state: string }) {
  const tone =
    state === "failed" || state === "dead_letter"
      ? "border-red-200 bg-red-50 text-ledger-red"
      : state === "queued" ||
          state === "processing" ||
          state === "pending" ||
          state === "proposed" ||
          state === "needs_approval" ||
          state === "ready_for_review" ||
          state === "waiting_for_approval"
        ? "border-amber-200 bg-amber-50 text-ledger-amber"
        : "border-green-200 bg-green-50 text-ledger-green";

  return (
    <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

function ReadinessPanel({
  cards,
}: {
  cards: Array<{ label: string; count: string; state: string; icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }> }>;
}) {
  return (
    <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-2">
        <DatabaseZap aria-hidden="true" className="text-ledger-blue" size={18} />
        <h2 className="text-base font-semibold text-ink-900">Source readiness</h2>
      </div>
      <div className="mt-4 grid gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              className="flex items-center justify-between gap-3 rounded-md border border-ink-100 p-3"
              key={card.label}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ink-50 text-ink-500">
                  <Icon aria-hidden={true} size={17} />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-900">{card.label}</p>
                  <p className="text-xs text-ink-500">{card.state}</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-ink-700">{card.count}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StatusDot({ status }: { status: "clear" | "risk" | "watch" }) {
  const className =
    status === "clear" ? "bg-ledger-green" : status === "risk" ? "bg-ledger-red" : "bg-ledger-amber";
  return <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${className}`} />;
}

function forecastStatus(expectedCashCents: number, minimumCashCents: number): "clear" | "risk" | "watch" {
  if (expectedCashCents <= minimumCashCents) {
    return "risk";
  }

  if (expectedCashCents <= minimumCashCents * 1.15) {
    return "watch";
  }

  return "clear";
}

async function readJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function formatSourceKind(value: string) {
  return value
    .split("_")
    .map((part) => part.toUpperCase() === "CSV" || part.toUpperCase() === "PDF" ? part.toUpperCase() : capitalize(part))
    .join(" ");
}

function formatImportState(value: string) {
  if (value === "completed_with_errors") {
    return "Completed with errors";
  }

  if (value === "dead_letter") {
    return "Dead letter";
  }

  return capitalize(value);
}

function formatActionType(value: string) {
  if (value === "send_reminder") {
    return "Send reminder";
  }

  if (value === "collect_invoice") {
    return "Collect invoice";
  }

  if (value === "call_customer") {
    return "Call customer";
  }

  return capitalize(value);
}

function formatContactValue(item: Cp4EmailApprovalItem) {
  if (item.contact.email && item.contact.fullName) {
    return `${item.contact.fullName} · ${item.contact.email}`;
  }

  return item.contact.email ?? item.contact.fullName ?? "No contact email";
}

function providerStatusLabel(status: Cp3ProviderStatus["status"]) {
  if (status === "connected") {
    return "Connected";
  }

  if (status === "configured") {
    return "Configured";
  }

  if (status === "optional_unconfigured") {
    return "Optional";
  }

  return "Unavailable";
}

function providerStatusClass(status: Cp3ProviderStatus["status"]) {
  if (status === "connected" || status === "configured") {
    return "border-green-200 bg-green-50 text-ledger-green";
  }

  if (status === "optional_unconfigured") {
    return "border-amber-200 bg-amber-50 text-ledger-amber";
  }

  return "border-red-200 bg-red-50 text-ledger-red";
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

function formatShortDate(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatDateRange(start: string, end: string) {
  return `${formatShortDate(start)} to ${formatShortDate(end)}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatOptionalDateTime(value: string | null) {
  return value ? formatDateTime(value) : "Not recorded";
}
