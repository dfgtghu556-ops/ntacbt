/**
 * LoadingCards — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

export function LoadingCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl border bg-muted/40" />
      ))}
    </div>
  );
}
