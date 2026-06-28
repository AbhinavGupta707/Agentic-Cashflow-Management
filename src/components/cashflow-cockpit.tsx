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
  ShieldCheck
} from "lucide-react";
import { DataState, UpdatedAt } from "@/components/data-state";

const runwayMetrics = [
  {
    label: "Cash balance",
    value: "£184,200",
    delta: "+£12.4k vs last week",
    direction: "up"
  },
  {
    label: "Payroll runway",
    value: "18 days",
    delta: "5 days above guardrail",
    direction: "up"
  },
  {
    label: "Recoverable this week",
    value: "£71,480",
    delta: "from 9 overdue invoices",
    direction: "down"
  },
  {
    label: "Approval queue",
    value: "6 actions",
    delta: "human review required",
    direction: "neutral"
  }
];

const forecastRows = [
  { date: "08 May", inflow: "£24.0k", outflow: "£49.5k", balance: "£158.7k", status: "watch" },
  { date: "15 May", inflow: "£41.8k", outflow: "£31.2k", balance: "£169.3k", status: "clear" },
  { date: "22 May", inflow: "£18.6k", outflow: "£62.0k", balance: "£125.9k", status: "risk" },
  { date: "29 May", inflow: "£67.1k", outflow: "£28.4k", balance: "£164.6k", status: "clear" }
];

const actionQueue = [
  {
    customer: "Northstar Foods",
    action: "Send revised payment-plan email",
    impact: "£18,900",
    confidence: "High",
    state: "Needs approval"
  },
  {
    customer: "Bellwether Studios",
    action: "Escalate to finance owner",
    impact: "£11,240",
    confidence: "Medium",
    state: "Draft ready"
  },
  {
    customer: "Kite & Co",
    action: "Hold follow-up until promised date",
    impact: "£7,420",
    confidence: "High",
    state: "Policy check"
  }
];

const sources = [
  { label: "Invoices", count: "126", state: "Seed pending", icon: FileText },
  { label: "Payments", count: "42", state: "Seed pending", icon: CircleDollarSign },
  { label: "Email outcomes", count: "0", state: "Provider unavailable", icon: MailCheck },
  { label: "Approval ledger", count: "6", state: "Schema pending", icon: ClipboardCheck }
];

function StatusDot({ status }: { status: string }) {
  const className =
    status === "clear" ? "bg-ledger-green" : status === "risk" ? "bg-ledger-red" : "bg-ledger-amber";
  return <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${className}`} />;
}

export function CashflowCockpit() {
  return (
    <main className="min-h-screen bg-ink-50 text-ink-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-ink-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-white">
                <Banknote aria-hidden="true" size={21} />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-500">Marlow & Finch Ltd</p>
                <h1 className="text-2xl font-semibold tracking-normal text-ink-900 sm:text-3xl">
                  Cash management cockpit
                </h1>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <UpdatedAt label="Demo case state, awaiting Aurora read path" />
            <button
              className="inline-flex items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-ink-900 focus:ring-offset-2"
              type="button"
            >
              <ShieldCheck aria-hidden="true" size={16} />
              Review controls
            </button>
          </div>
        </header>

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
                    Static scaffold values show the intended density until Lane C connects Aurora case state.
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
                            {row.status === "clear" ? "Clear" : row.status === "risk" ? "Shortfall risk" : "Watch"}
                          </span>
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
                  <p className="mt-1 text-sm text-ink-500">Recommended collection moves stay blocked until approved.</p>
                </div>
                <CheckCircle2 aria-hidden="true" className="text-ledger-green" size={20} />
              </div>
              <div className="divide-y divide-ink-100">
                {actionQueue.map((item) => (
                  <article className="grid gap-3 py-4 md:grid-cols-[1fr_auto]" key={`${item.customer}-${item.action}`}>
                    <div>
                      <p className="font-medium text-ink-900">{item.customer}</p>
                      <p className="mt-1 text-sm leading-6 text-ink-500">{item.action}</p>
                    </div>
                    <div className="flex items-center gap-3 md:justify-end">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-ink-900">{item.impact}</p>
                        <p className="text-xs text-ink-500">{item.confidence} confidence</p>
                      </div>
                      <span className="rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
                        {item.state}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <DataState
              title="Aurora read path unavailable"
              description="The app shell is registered, but the Data API repository and route are owned by Lane C. Connect the cockpit to that route after integration."
              variant="unavailable"
            />

            <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
              <div className="flex items-center gap-2">
                <DatabaseZap aria-hidden="true" className="text-ledger-blue" size={18} />
                <h2 className="text-base font-semibold text-ink-900">Source readiness</h2>
              </div>
              <div className="mt-4 grid gap-3">
                {sources.map((source) => {
                  const Icon = source.icon;
                  return (
                    <article
                      className="flex items-center justify-between gap-3 rounded-md border border-ink-100 p-3"
                      key={source.label}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ink-50 text-ink-500">
                          <Icon aria-hidden="true" size={17} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-ink-900">{source.label}</p>
                          <p className="text-xs text-ink-500">{source.state}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-ink-700">{source.count}</span>
                    </article>
                  );
                })}
              </div>
            </section>

            <DataState
              title="No live events yet"
              description="Once migrations and seeds land, this panel should show idempotent event inbox activity from Aurora instead of static scaffold data."
              variant="empty"
            />

            <DataState
              title="Provider error state reserved"
              description="If Aurora or downstream provider calls fail after registration, surface bounded retry guidance here without exposing secrets."
              variant="error"
            />
          </aside>
        </section>
      </div>
    </main>
  );
}
