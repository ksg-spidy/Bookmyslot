/** Shared route-level loading skeleton (used by loading.tsx files). */
export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="Loading">
      <div className="h-7 w-48 rounded bg-card" />
      <div className="h-4 w-72 max-w-full rounded bg-card" />
      <div className="space-y-3 pt-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border border-edge bg-card" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
