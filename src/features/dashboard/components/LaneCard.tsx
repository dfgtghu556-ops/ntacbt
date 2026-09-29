/**
 * LaneCard — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

export function LaneCard({
  icon,
  title,
  score,
  label,
  message,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  score: number;
  label: string;
  message: string;
  accent: string;
}) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${accent} p-4`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {icon} {title}
        </span>
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="text-3xl font-bold">{score}</div>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-blue-600"
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
