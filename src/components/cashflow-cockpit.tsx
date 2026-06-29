"use client";

import { type ComponentType, type FormEvent, useEffect, useState } from "react";
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
  FileInput,
  FilePlus2,
  FileText,
  Inbox,
  LineChart,
  Loader2,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import { DataState, UpdatedAt } from "@/components/data-state";
import type { CompanyCaseState, CurrentCaseApiResponse } from "@/server/db/case-state-contract";
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

  async function refreshIngestionStatus() {
    setIngestionState({ kind: "loading" });
    setIngestionState(await fetchIngestionStatus());
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
            ingestionState={ingestionState}
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
  ingestionState,
  onRefreshIngestionStatus,
}: {
  data: CompanyCaseState;
  ingestionState: IngestionPanelState;
  onRefreshIngestionStatus: () => void;
}) {
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
          <OperationalIngestionPanel data={data} />

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

          <IngestionStatusPanel
            caseData={data}
            state={ingestionState}
            onRefresh={onRefreshIngestionStatus}
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
      : state === "queued" || state === "processing"
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

function statusLabel(status: "clear" | "risk" | "watch") {
  if (status === "clear") {
    return "Clear";
  }

  if (status === "risk") {
    return "Shortfall risk";
  }

  return "Watch";
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
