/**
 * SurvivalScoreRing — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

export function SurvivalScoreRing({ score, status }: { score: number; status: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score || 0));
  const off = c - (pct / 100) * c;
  const color = status === "on-track" ? "#16a34a" : status === "watch" ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" className="stroke-muted" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>
          {score}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          on track
        </span>
      </div>
    </div>
  );
}
