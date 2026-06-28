import { AlertCircle, Clock3, DatabaseZap, Inbox, Loader2 } from "lucide-react";
import { clsx } from "clsx";

type DataStateVariant = "empty" | "error" | "loading" | "unavailable";

const variantStyles: Record<DataStateVariant, string> = {
  empty: "border-ink-100 bg-white text-ink-500",
  error: "border-red-200 bg-red-50 text-ledger-red",
  loading: "border-blue-200 bg-blue-50 text-ledger-blue",
  unavailable: "border-amber-200 bg-amber-50 text-ledger-amber"
};

const variantIcons = {
  empty: Inbox,
  error: AlertCircle,
  loading: Loader2,
  unavailable: DatabaseZap
};

type DataStateProps = {
  title: string;
  description: string;
  variant: DataStateVariant;
  action?: React.ReactNode;
};

export function DataState({ title, description, variant, action }: DataStateProps) {
  const Icon = variantIcons[variant];

  return (
    <section className={clsx("rounded-lg border p-5", variantStyles[variant])}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/70">
          <Icon aria-hidden="true" className={variant === "loading" ? "animate-spin" : undefined} size={19} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-500">{description}</p>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function UpdatedAt({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500">
      <Clock3 aria-hidden="true" size={14} />
      {label}
    </span>
  );
}
