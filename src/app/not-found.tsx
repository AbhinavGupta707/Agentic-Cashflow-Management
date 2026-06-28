import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 text-ink-900">
      <section className="w-full max-w-lg rounded-lg border border-ink-100 bg-white p-6 shadow-panel">
        <p className="text-sm font-medium text-ink-500">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Workspace route not found</h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          The checkpoint 1 scaffold currently exposes the main cockpit route only. API and detail routes will be added by
          their owning lanes.
        </p>
        <Link
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-900 focus:ring-offset-2"
          href="/"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Back to cockpit
        </Link>
      </section>
    </main>
  );
}
