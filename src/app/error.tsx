"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 text-ink-900">
      <section className="w-full max-w-xl rounded-lg border border-red-200 bg-white p-6 shadow-panel">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-red-50 text-ledger-red">
          <AlertTriangle aria-hidden="true" size={22} />
        </div>
        <h1 className="text-xl font-semibold">The cockpit could not load</h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          A runtime error interrupted the app shell. This is separate from the Aurora integration state and should be
          retried before checking provider credentials.
        </p>
        {error.digest ? <p className="mt-3 text-xs text-ink-500">Digest: {error.digest}</p> : null}
        <button
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-900 focus:ring-offset-2"
          onClick={reset}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={16} />
          Retry
        </button>
      </section>
    </main>
  );
}
