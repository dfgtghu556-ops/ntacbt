import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock, Play, Sparkles } from "lucide-react";
import { DataStore, localDayKey, type PlannerTaskRow } from "@/lib/store";

export const Route = createFileRoute("/app/planner")({
  component: Planner,
});

function fmtDate(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function Planner() {
  const [rows, setRows] = useState<PlannerTaskRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const store = new DataStore();
    const planner = store.planner;
    const tasks = planner?.tasks ?? [];
    const today = store.dayKey;
    const sorted = [...tasks]
      .filter((t) => t && t.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    // Show from a few days before today to 21 days ahead.
    const start = localDayKey(Date.now() - 3 * 24 * 3600 * 1000);
    const end = localDayKey(Date.now() + 24 * 24 * 3600 * 1000);
    const visible = sorted.filter((t) => t.date >= start && t.date <= end);
    setRows(visible);
    void today;
    setLoaded(true);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, PlannerTaskRow[]>();
    for (const r of rows) {
      const list = map.get(r.date) ?? [];
      list.push(r);
      map.set(r.date, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const todayKeyNow = localDayKey();
  const todayGroup = grouped.find(([key]) => key === todayKeyNow);
  const totalMin = rows.reduce((n, r) => n + (r.estMin || 0), 0);
  const doneMin = rows.filter((r) => r.status === "done").reduce((n, r) => n + (r.estMin || 0), 0);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Adaptive Planner</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loaded
            ? `${rows.length} tasks in view · ${doneMin}/${totalMin} min planned`
            : "Reading your plan…"}
        </p>
      </section>

      {!loaded ? (
        <div className="h-40 animate-pulse rounded-xl border bg-muted/40" />
      ) : rows.length === 0 ? (
        <section className="rounded-xl border border-dashed p-8 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No plan yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the full platform's planner to build one, or start with a chapter drill. The planner
            adapts to your available time, mastery and missed sessions.
          </p>
          <a
            href="/jee-cbt.html#planner"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Play className="h-4 w-4" /> Open planner
          </a>
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
                  {list.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
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
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.kind} · {r.estMin || 45} min{r.why ? ` · Why: ${r.why}` : ""}
                        </p>
                      </div>
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
