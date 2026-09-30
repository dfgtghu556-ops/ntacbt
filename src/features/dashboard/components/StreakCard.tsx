/**
 * StreakCard — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

import { Flame } from "lucide-react";
import { computeHumaneStreak, loadStreakStore } from "@/features/focus/streak";

export function StreakCard({
  humane,
  streak,
}: {
  humane: ReturnType<typeof computeHumaneStreak>;
  streak: number;
}) {
  const flameColor = humane.days > 0 ? "text-orange-500" : "text-muted-foreground";
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Consistency</span>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 ${flameColor}`}
        >
          <Flame className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold">{humane.days}d</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {humane.atRiskToday
          ? `Streak is at risk today — ${humane.microWin}`
          : humane.frozen
            ? "Streak protected (freeze) — no loss"
            : humane.nudge
              ? humane.nudge
              : `${humane.freezesLeft} freeze${humane.freezesLeft === 1 ? "" : "s"} available`}
      </div>
    </div>
  );
}
