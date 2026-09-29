/**
 * ProgressCard — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

export function ProgressCard({ title, value }: { title: string; value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value || 0));
  const off = c - (pct / 100) * c;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <div className="mt-1 text-2xl font-bold">{pct}%</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {pct >= 80 ? "Almost there" : pct >= 50 ? "Solid momentum" : "Small start counts"}
          </div>
        </div>
        <div className="relative h-16 w-16">
          <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
            <circle cx="32" cy="32" r={r} fill="none" className="stroke-muted" strokeWidth="7" />
            <circle
              cx="32"
              cy="32"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={off}
              className="text-primary transition-all duration-500"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
