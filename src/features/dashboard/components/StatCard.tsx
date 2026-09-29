/**
 * StatCard — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

import { Clock } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  bg,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub: string;
  accent: string;
  bg: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${bg} ${accent}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
