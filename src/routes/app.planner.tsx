import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  GraduationCap,
  Layers,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { DataStore, localDayKey, type PlannerTaskRow } from "@/lib/store";
import type { WeakTopic } from "@/features/dashboard/types";
import { computeReadiness } from "@/features/readiness/readiness";
import { adaptTasks, type AdaptedTask } from "@/features/planner/adapt";
import { buildTodoPlan, goalProgress, recoveryNote, type TodoItem } from "@/features/planner/todo";
import { loadDoneIds, toggleDoneId, clearDone } from "@/features/planner/todo-store";
import {
  syllabusCoverage,
  type ChapterState,
  type SyllabusCoverage,
} from "@/features/planner/coverage";

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
  const [target, setTarget] = useState("");
  const [adapted, setAdapted] = useState(true);
  const [showAll, setShowAll] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const store = new DataStore();
    setWeak(computeReadiness(store).weakTopics);
    setTarget(store.planner?.profile?.target || "");
    const planner = store.planner;
    const tasks = planner?.tasks ?? [];
    const sorted = [...tasks]
      .filter((t) => t && t.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    setAllTasks(sorted);
    setDoneIds(loadDoneIds());
    setLoaded(true);
  }, []);

  // Read-only lens over the stored plan, measured against the real published
  // syllabus map. This never edits the plan.
  const coverage = useMemo<SyllabusCoverage>(
    () => syllabusCoverage(allTasks, target),
    [allTasks, target],
  );

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
  const doneMin = displayRows.filter((r) => r.status === "done").reduce((n, r) => n + minOf(r), 0);

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

      {/* F1 — today's goals. The page still leads with the full plan below;
          this is the surface a student actually acts on, and it counts goals
          rather than minutes because "3 of 5 goals done" is something the
          student did and "2.5 hours sat" is something that happened to them. */}
      {loaded ? (
        <TodayGoals tasks={allTasks} weak={weak} doneIds={doneIds} onToggle={setDoneIds} />
      ) : null}

      {loaded ? (
        <section className="rounded-2xl border border-primary/30 bg-accent/40 p-3 text-sm">
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

      {/* Syllabus coverage sits above the task list: it is the "what am I
          missing" view, and a student should see the gap before the schedule. */}
      {loaded ? <CoveragePanel coverage={coverage} /> : null}

      {!loaded ? (
        <div className="h-40 animate-pulse rounded-xl border bg-muted/40" />
      ) : displayRows.length === 0 ? (
        <section className="rounded-2xl border border-dashed p-8 text-center">
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
            const mins = list.reduce((n, r) => n + minOf(r), 0);
            return (
              <section key={date} className="rounded-2xl border p-4">
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
                            {r.kind} · {minOf(r) || 45} min
                            {r.status === "done" &&
                            typeof r.actualMin === "number" &&
                            r.actualMin !== r.estMin
                              ? " (actual)"
                              : ""}
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

/* ------------------------------------------------------------------ *
 * Syllabus coverage panel
 *
 * A read-only view of the stored plan measured against the published
 * curriculum map. It never edits the plan — it only reports what the plan
 * covers and what it skips.
 *
 * The marks column is the one place a wrong number would actively mislead a
 * student, so a unit with no corroborated weightage renders "not published
 * here" rather than 0. Physics is entirely unmarked, because published
 * per-unit figures conflict and several sum to 133 for a 70-mark paper.
 * ------------------------------------------------------------------ */

function coverageTone(state: ChapterState): string {
  if (state === "done") return "bg-green-100 text-green-700 border-green-200";
  if (state === "in-progress") return "bg-amber-100 text-amber-700 border-amber-200";
  if (state === "planned") return "bg-accent text-foreground border-primary/30";
  return "bg-muted/50 text-muted-foreground border-dashed";
}

function coverageLabel(state: ChapterState): string {
  if (state === "done") return "Done";
  if (state === "in-progress") return "In progress";
  if (state === "planned") return "Planned";
  return "Not planned";
}

function MarksCell({ marks }: { marks: number | null }) {
  if (marks === null) {
    return (
      <span
        className="text-[11px] text-muted-foreground"
        title="The board does not publish a per-unit mark weight for this unit."
      >
        not published here
      </span>
    );
  }
  return <span className="text-[11px] tabular-nums text-muted-foreground">{marks} marks</span>;
}

function CoveragePanel({ coverage }: { coverage: SyllabusCoverage }) {
  const [open, setOpen] = useState(false);

  if (!coverage.key) {
    // No published map for this objective. Saying nothing is better than
    // showing a coverage figure computed against the wrong syllabus.
    return (
      <section className="rounded-2xl border border-dashed p-4 text-sm">
        <div className="flex items-start gap-2">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">Syllabus coverage</h2>
            <p className="mt-1 text-xs text-muted-foreground">{coverage.note}</p>
          </div>
        </div>
      </section>
    );
  }

  const pct =
    coverage.totalChapters > 0
      ? Math.round((coverage.coveredChapters / coverage.totalChapters) * 100)
      : 0;

  return (
    <section className="rounded-2xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">
              Syllabus coverage · CBSE Class {coverage.key.classLevel} {coverage.key.academicYear}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{coverage.note}</p>
          </div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-xs font-medium"
        >
          <Layers className="h-3.5 w-3.5" /> {open ? "Hide chapters" : "Show by chapter"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {coverage.coveredChapters}/{coverage.totalChapters} chapters · {pct}%
        </span>
        <span className="tabular-nums">
          {coverage.doneMin}/{coverage.plannedMin} min done
        </span>
        {coverage.unmatched.length ? (
          <span className="text-amber-700 dark:text-amber-400">
            {coverage.unmatched.length} plan row
            {coverage.unmatched.length === 1 ? "" : "s"} not on this syllabus
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="mt-4 space-y-4">
          {coverage.subjects.map((subject) => (
            <div key={subject.subject}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {subject.subject}
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {subject.coveredChapters}/{subject.totalChapters} chapters ·{" "}
                  {subject.theoryMarks === null
                    ? "no published unit weightage"
                    : `${subject.theoryMarks} theory marks`}
                </span>
              </div>
              <div className="mt-2 space-y-3">
                {subject.units.map((unit) => (
                  <div key={`${subject.subject}-${unit.numeral}`} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="text-xs font-medium">
                        Unit {unit.numeral} — {unit.name}
                      </h4>
                      <MarksCell marks={unit.marks} />
                    </div>
                    <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {unit.chapters.map((chapter) => (
                        <li
                          key={`${subject.subject}-${chapter.chapterNumber}`}
                          className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs ${coverageTone(
                            chapter.state,
                          )}`}
                        >
                          <span className="min-w-0 truncate">
                            <span className="tabular-nums text-muted-foreground">
                              {chapter.chapterNumber}.
                            </span>{" "}
                            {chapter.chapterName}
                          </span>
                          <span className="shrink-0 text-[10px] font-medium">
                            {coverageLabel(chapter.state)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
                      {unit.coveredChapters}/{unit.chapters.length} chapters planned ·{" "}
                      {unit.doneMin}/{unit.plannedMin} min done
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * TodayGoals — the F1 surface.
 *
 * Goal-based, not time-based. The headline number is goals done of goals on
 * today's list; the minutes are shown but never as the measure of the day.
 *
 * Three things this does that the timetable below cannot:
 *  - it carries a missed goal forward with the date it was meant for, so a slip
 *    is visible instead of silently re-appearing tomorrow;
 *  - when today is finished it offers exactly one more thing, rather than
 *    leaving the student at a dead end or pulling a whole future day forward;
 *  - every item states why it is where it is, from the student's own answers.
 *
 * The checkbox writes to this app's own overlay key, never to the stored plan.
 */
function TodayGoals({
  tasks,
  weak,
  doneIds,
  onToggle,
}: {
  tasks: PlannerTaskRow[];
  weak: WeakTopic[];
  doneIds: Set<string>;
  onToggle: (next: Set<string>) => void;
}) {
  const plan = useMemo(
    () => buildTodoPlan({ rows: tasks, weak, doneOverlay: doneIds, now: Date.now() }),
    [tasks, weak, doneIds],
  );
  const overall = useMemo(() => goalProgress(tasks, doneIds), [tasks, doneIds]);
  const recovery = recoveryNote(plan);

  const pct = Math.round(plan.progress.fraction * 100);

  return (
    <section className="rounded-2xl border bg-card p-4" aria-labelledby="today-goals-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="today-goals-heading" className="text-lg font-semibold">
            Today's goals
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {plan.items.length > 0
              ? `${plan.progress.done} of ${plan.progress.total} done · ${plan.progress.remainingMin} min of work left`
              : "Nothing scheduled for today."}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {overall.done} of {overall.total} goals in the whole plan
        </span>
      </div>

      {plan.items.length > 0 ? (
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Today's goal progress"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      {plan.note ? (
        <p className="mt-3 rounded-2xl border border-dashed p-3 text-sm text-muted-foreground">
          {plan.note}
        </p>
      ) : null}

      {recovery ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border bg-muted/40 p-3 text-sm">
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{recovery}</span>
        </p>
      ) : null}

      {plan.summary ? <p className="mt-3 text-sm text-muted-foreground">{plan.summary}</p> : null}

      {plan.items.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {plan.items.map((it) => (
            <GoalRow
              key={it.id}
              item={it}
              done={it.status === "done"}
              onToggle={() => onToggle(toggleDoneId(it.id, doneIds))}
            />
          ))}
        </ul>
      ) : null}

      {plan.finishedEarly && plan.pullForward ? (
        <div className="mt-3 rounded-2xl border bg-muted/40 p-3">
          <p className="text-sm font-medium">Today's goals are done.</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One more is waiting whenever you want it — {plan.pullForward.subject},{" "}
            {plan.pullForward.chapter} ({plan.pullForward.estMin} min). Stopping here is a complete
            day, not an unfinished one.
          </p>
        </div>
      ) : null}

      {doneIds.size > 0 ? (
        <button
          type="button"
          onClick={() => {
            clearDone();
            onToggle(new Set());
          }}
          className="mt-3 text-xs text-muted-foreground underline hover:text-foreground"
        >
          Clear {doneIds.size} checked goal{doneIds.size === 1 ? "" : "s"}
        </button>
      ) : null}
    </section>
  );
}

function GoalRow({
  item,
  done,
  onToggle,
}: {
  item: TodoItem;
  done: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={
        done
          ? "flex items-start gap-3 rounded-2xl border bg-muted/40 p-3 opacity-70"
          : "flex items-start gap-3 rounded-2xl border p-3"
      }
    >
      <input
        type="checkbox"
        checked={done}
        onChange={onToggle}
        aria-label={`Mark ${item.chapter} (${item.kind}) done`}
        className="mt-1 h-4 w-4 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {item.subject} · {item.chapter}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {item.kind}
          </span>
          {item.isCarryOver ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              carried from {item.carriedFrom}
            </span>
          ) : null}
          {item.isWeakTarget ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">
              weak target
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{item.estMin} min</span>
    </li>
  );
}
