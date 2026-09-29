/**
 * TrustLine — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

export function TrustLine({ label, how }: { label: string; how: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3 text-sm">
      <div className="font-semibold">{label}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{how}</div>
    </div>
  );
}
