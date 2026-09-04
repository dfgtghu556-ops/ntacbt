import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock, Flame, Play, RefreshCw, Sparkles } from "lucide-react";
import { DataStore, localDayKey, type PlannerTaskRow } from "@/lib/store";
import type { WeakTopic } from "@/features/dashboard/types";
import { computeReadiness } from "@/features/readiness/readiness";
import { adaptTasks, type AdaptedTask } from "@/features/planner/adapt";

export const Route = createFileRoute("/app/planner")({
  component: Planner,
});

function fmtDate(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function Planner() {
  const [allTasks, setAllTasks] = useState<PlannerTaskRow[]>([]);
  const [weak, setWeak] = useState<WeakTopic[]>([]);
  const [adapted, setAdapted] = useState(true);
  const [showAll, setShowAll] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const store = new DataStore();
    setWeak(computeReadiness(store).weakTopics);
    const planner = store.planner;
    const tasks = planner?.tasks ?? [];
    const sorted = [...tasks]
      .filter((t) => t && t.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    setAllTasks(sorted);
    setLoaded(true);
  }, []);

  const rows = useMemo(() => {
    if (showAll) return allTasks;
    // "Focus 3-Week Window" = today through 21 days ahead (3 weeks).
    const start = localDayKey(Date.now());
    const end = localDayKey(Date.now() + 21 * 24 * 3600 * 1000);
    return allTasks.filter((t) => t.date >= start && t.date <= end);
  }, [allTasks, showAll]);

  const plan = useMemo(() => adaptTasks(rows, weak, Date.now()), [rows, weak]);
  const displayRows = adapted ? plan.tasks : rows;

  const grouped = useMemo(() => {
    const map = new Map<string, PlannerTaskRow[]>();
    for (const r of displayRows) {
      const list = map.get(r.date) ?? [];
      list.push(r);
      map.set(r.date, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [displayRows]);

  const todayKeyNow = localDayKey();
  // A completed task is counted at its REAL watched minutes (actualMin) when
  // available, so a longer-than-planned video is never silently shown as the
  // shorter planned estimate. Pending tasks use the planned estMin.
  const minOf = (r: PlannerTaskRow) =>
    r.status === "done" && typeof r.actualMin === "number" ? r.actualMin : r.estMin || 0;
  const totalMin = displayRows.reduce((n, r) => n + minOf(r), 0);
  const doneMin = displayRows
    .filter((r) => r.status === "done")
    .reduce((n, r) => n + minOf(r), 0);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Adaptive Planner</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loaded
              ? `${displayRows.length} tasks in view · ${doneMin}/${totalMin} min planned`
              : "Reading your plan…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-xs font-medium"
          >
            <CalendarDays className="h-3.5 w-3.5" />{" "}
            {showAll ? "Focus 3-Week Window" : `Show All Plan (${allTasks.length} tasks)`}
          </button>
          <button
            onClick={() => setAdapted((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-xs font-medium"
          >
            <RefreshCw className="h-3.5 w-3.5" />{" "}
            {adapted ? "Show original order" : "Adapt for weaknesses"}
          </button>
        </div>
      </section>

      {loaded ? (
        <section className="rounded-xl border border-primary/30 bg-accent/40 p-3 text-sm">
          <div className="flex items-start gap-2">
            <Flame className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium">{adaptationSummaryFor(adapted, plan.summary)}</p>
              {weak.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Current weak topics:{" "}
                  {weak
                    .slice(0, 3)
                    .map((w) => `${w.subject} ${w.chapter}`)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {!loaded ? (
        <div className="h-40 animate-pulse rounded-xl border bg-muted/40" />
      ) : displayRows.length === 0 ? (
        <section className="rounded-xl border border-dashed p-8 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No plan yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the full platform's planner to build one, or start with a short diagnostic. The
            planner adapts to your available time, mastery and missed sessions.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <a
              href="/jee-cbt.html#planner"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              <Play className="h-4 w-4" /> Open planner
            </a>
            <Link
              to="/cbt"
              search={{ name: "Quick mixed diagnostic drill" }}
              className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm"
            >
              Start diagnostic
            </Link>
          </div>
        </section>
      ) : (
        <div className="space-y-3">
          {grouped.map(([date, list]) => {
            const isToday = date === todayKeyNow;
            const done = list.filter((r) => r.status === "done").length;
            const mins = list.reduce((n, r) => n + (r.estMin || 0), 0);
            return (
              <section key={date} className="rounded-xl border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    {isToday ? <Sparkles className="h-4 w-4 text-primary" /> : null}
                    {fmtDate(date)}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {done}/{list.length} done · {mins} min
                  </span>
                </div>
                <ul className="space-y-2">
                  {list.map((r) => {
                    const a = r as AdaptedTask;
                    return (
                      <li
                        key={r.id}
                        className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                          a.isWeakTarget ? "border-primary/40 bg-accent/30" : ""
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                            r.status === "done"
                              ? "bg-green-100 text-green-700"
                              : "border text-muted-foreground"
                          }`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate font-medium ${r.status === "done" ? "text-muted-foreground line-through" : ""}`}
                          >
                            {r.subject} — {r.chapter}
                            {a.isWeakTarget && adapted ? (
                              <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                                Weak target
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.kind} · {r.estMin || 45} min
                            {adapted && a.reason
                              ? ` · Why: ${a.reason}`
                              : r.why
                                ? ` · Why: ${r.why}`
                                : ""}
                          </p>
                          {adapted && a.rank > 1 ? (
                            <p className="text-[10px] text-muted-foreground">Ranked #{a.rank}</p>
                          ) : null}
                        </div>
                        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function adaptationSummaryFor(adapted: boolean, summary: string): string {
  return adapted
    ? summary
    : "Showing the planner's stored order. Turn on adaptation to move weak-topic work first.";
}
