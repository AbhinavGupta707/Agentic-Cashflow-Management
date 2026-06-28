import { DataState } from "@/components/data-state";

export default function Loading() {
  return (
    <main className="min-h-screen bg-ink-50 px-4 py-6 text-ink-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <DataState
          title="Loading cash position"
          description="Preparing the cockpit shell while Aurora-backed case state is requested."
          variant="loading"
        />
      </div>
    </main>
  );
}
