"use client";

import { type ComponentType, useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  DatabaseZap,
  FileText,
  LineChart,
  MailCheck,
  ShieldCheck,
} from "lucide-react";

import { DataState, UpdatedAt } from "@/components/data-state";
import type { CompanyCaseState, CurrentCaseApiResponse } from "@/server/db/case-state-contract";

type CockpitState =
  | { kind: "loading" }
  | { kind: "unavailable"; message: string; missingEnv: string[] }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: CompanyCaseState };

export function CashflowCockpit() {
  const [state, setState] = useState<CockpitState>({ kind: "loading" });

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
        {state.kind === "ready" ? <ReadyShell data={state.data} /> : null}
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

function ReadyShell({ data }: { data: CompanyCaseState }) {
  const overdueInvoices = data.invoices.filter((invoice) => invoice.status === "overdue");
  const approvalQueue = data.recommendedActions.filter((action) => action.approvalRequired);
  const openObligations = data.obligations.filter((obligation) => obligation.status !== "paid");
  const forecastRows = (data.forecast?.points ?? []).map((point) => ({
    date: formatShortDate(point.pointDate),
    inflow: formatCurrency(point.inflowCents, data.company.baseCurrency),
    outflow: formatCurrency(point.outflowCents, data.company.baseCurrency),
    balance: formatCurrency(point.expectedCashCents, data.company.baseCurrency),
    status: forecastStatus(point.expectedCashCents, data.forecast?.minimumCashCents ?? 0),
    note: point.notes,
  }));

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
          <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
            <div className="flex flex-col gap-3 border-b border-ink-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-ledger-blue">
                  <LineChart aria-hidden="true" size={18} />
                  <h2 className="text-base font-semibold text-ink-900">Four-week cash forecast</h2>
                </div>
                <p className="mt-1 text-sm leading-6 text-ink-500">
                  Live forecast points are read from Aurora through the current-case repository path.
                </p>
              </div>
              <button
                className="inline-flex items-center justify-center gap-1 rounded-md bg-ink-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-900 focus:ring-offset-2"
                type="button"
              >
                Forecast detail
                <ChevronRight aria-hidden="true" size={16} />
              </button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-ink-500">
                    <th className="border-b border-ink-100 py-3 font-semibold">Week</th>
                    <th className="border-b border-ink-100 py-3 font-semibold">Expected in</th>
                    <th className="border-b border-ink-100 py-3 font-semibold">Committed out</th>
                    <th className="border-b border-ink-100 py-3 font-semibold">Projected balance</th>
                    <th className="border-b border-ink-100 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastRows.map((row) => (
                    <tr className="text-ink-700" key={row.date}>
                      <td className="border-b border-ink-100 py-3 font-medium text-ink-900">{row.date}</td>
                      <td className="border-b border-ink-100 py-3">{row.inflow}</td>
                      <td className="border-b border-ink-100 py-3">{row.outflow}</td>
                      <td className="border-b border-ink-100 py-3 font-medium">{row.balance}</td>
                      <td className="border-b border-ink-100 py-3">
                        <span className="inline-flex items-center gap-2">
                          <StatusDot status={row.status} />
                          {statusLabel(row.status)}
                        </span>
                        {row.note ? <p className="mt-1 text-xs text-ink-500">{row.note}</p> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-ink-900">Approval-gated action queue</h2>
                <p className="mt-1 text-sm text-ink-500">
                  Aurora-backed recommendations stay blocked until approved.
                </p>
              </div>
              <CheckCircle2 aria-hidden="true" className="text-ledger-green" size={20} />
            </div>
            <div className="divide-y divide-ink-100">
              {data.recommendedActions.map((item) => (
                <article className="grid gap-3 py-4 md:grid-cols-[1fr_auto]" key={item.externalId}>
                  <div>
                    <p className="font-medium text-ink-900">{item.customerName}</p>
                    <p className="mt-1 text-sm leading-6 text-ink-500">{item.title}</p>
                    <p className="mt-1 text-xs text-ink-500">{item.rationale}</p>
                  </div>
                  <div className="flex items-center gap-3 md:justify-end">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink-900">
                        {formatCurrency(item.expectedRecoveryCents, data.company.baseCurrency)}
                      </p>
                      <p className="text-xs text-ink-500">Priority {item.priority}</p>
                    </div>
                    <span className="rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
                      {item.approvalRequired ? "Needs approval" : item.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <DataState
            title="Aurora read path connected"
            description={`Loaded ${data.invoices.length} invoices, ${data.obligations.length} obligations, and ${data.memoryFacts.length} memory facts for ${data.caseId}.`}
            variant="empty"
          />

          <ReadinessPanel cards={sourceCards} />

          <DataState
            title="Provider execution remains unavailable"
            description="Checkpoint 1 stops at the Aurora-backed cockpit shell. Gmail, voice, and live reasoning providers stay honestly disabled until later checkpoints."
            variant="unavailable"
          />
        </aside>
      </section>
    </>
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

function statusLabel(status: "clear" | "risk" | "watch") {
  if (status === "clear") {
    return "Clear";
  }

  if (status === "risk") {
    return "Shortfall risk";
  }

  return "Watch";
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
