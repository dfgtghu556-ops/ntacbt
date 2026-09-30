/**
 * TodayStrip — extracted from the dashboard route.
 *
 * Part of splitting `app.index.tsx`, which was a single 1,532-line file.
 * No behaviour change: this is a move, verified by the existing tests.
 */

import { AlertTriangle, CheckCircle2, Info, Play } from "lucide-react";
import type { TodayPlan } from "@/features/planner/today";
import { Link } from "@tanstack/react-router";

export function TodayStrip({ plan }: { plan: TodayPlan }) {
  const pending = plan.tasks.filter((t) => t.status !== "done");

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            {plan.isToday ? "Today" : `Next up · ${plan.dayKey}`}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {plan.note ||
              `${plan.tasks.length} task${plan.tasks.length === 1 ? "" : "s"} · ${
                plan.chaptersTouched
              } chapter${plan.chaptersTouched === 1 ? "" : "s"} · ${plan.doneMin}/${
                plan.plannedMin
              } min done`}
          </p>
        </div>
        <Link
          to={plan.primary.to}
          {...(plan.primary.search ? { search: plan.primary.search } : {})}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          <Play className="h-4 w-4" /> {plan.primary.label}
        </Link>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        <Info className="mr-1 inline h-3 w-3 align-[-2px]" />
        {plan.primary.reason}
      </p>

      {plan.tasks.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {plan.tasks.slice(0, 6).map((task) => (
            <li
              key={task.id}
              className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                task.isWeakTarget ? "border-primary/40 bg-accent/30" : ""
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  task.status === "done"
                    ? "bg-green-100 text-green-700"
                    : "border text-muted-foreground"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">
                  {task.subject} — {task.chapter}
                </span>
                {task.isWeakTarget ? (
                  <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Weak target
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {task.kind} · {task.estMin || 45} min
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {plan.tasks.length > 6 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          +{plan.tasks.length - 6} more today ·{" "}
          <Link to="/app/planner" className="text-primary underline">
            open planner
          </Link>
        </p>
      ) : null}

      {plan.weakAreas.length > 0 ? (
        <div className="mt-4 border-t pt-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> Weak areas to work on
          </h3>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {plan.weakAreas.map((w) => (
              <li
                key={`${w.subject}-${w.chapter}`}
                className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {w.subject} — {w.chapter}
                  </span>
                  <span className="block truncate text-muted-foreground">{w.reason}</span>
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    w.accuracy === null
                      ? "bg-muted text-muted-foreground"
                      : w.accuracy < 50
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {w.accuracy === null ? "not enough data" : `${w.accuracy}%`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {pending.length > 0
              ? "Ranked from your own attempts and finished lessons — the same evidence the mentor report uses."
              : "Ranked from your own attempts and finished lessons. Nothing here is estimated."}
          </p>
        </div>
      ) : null}
    </section>
  );
}
