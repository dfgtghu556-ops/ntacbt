/**
 * AwardsCard — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

import { BadgeCheck, Flame, Sparkles } from "lucide-react";
import { achievements, type AchievementSummary } from "@/features/focus/achievements";

export function AwardsCard({ awards }: { awards: AchievementSummary }) {
  const pct = Math.round((awards.level.xpIntoLevel / awards.level.levelSpan) * 100);
  // Show earned badges first, then the closest unearned ones with real progress.
  const shown = [
    ...awards.earned,
    ...awards.badges.filter((b) => !b.earned && b.progress > 0).slice(0, 3),
  ].slice(0, 8);

  return (
    <section className="rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Level {awards.level.level} ·{" "}
            {awards.level.title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {awards.xp.toLocaleString()} XP · {awards.level.toNext} to level{" "}
            {awards.level.level + 1}
          </p>
        </div>
        {awards.beatPersonalBest ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-300 bg-green-50 px-3 py-1 text-[11px] font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
            <Flame className="h-3.5 w-3.5" /> Beat your own best
          </span>
        ) : null}
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{awards.note}</p>

      {shown.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {shown.map((b) => (
            <li
              key={b.id}
              className={`rounded-md border px-3 py-2 text-xs ${
                b.earned ? "border-primary/40 bg-primary/5" : ""
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{b.label}</span>
                {b.earned ? (
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-green-600" />
                ) : (
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {Math.round(b.progress * 100)}%
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-muted-foreground">{b.description}</span>
              {!b.earned ? (
                <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary/60"
                    style={{ width: `${Math.round(b.progress * 100)}%` }}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-[11px] text-muted-foreground">
        XP is counted from your own focus sessions, attempts, lessons and mastered chapters — never
        from anything you did not do. No badge here can be lost.
      </p>
    </section>
  );
}
