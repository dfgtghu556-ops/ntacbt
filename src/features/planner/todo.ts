/**
 * GOAL-BASED TO-DO ENGINE + AUTO RE-PLAN (F1, F3)
 *
 * `docs/PRODUCT-ROADMAP-AUDIT.md` ranks these as the two features that fix the
 * top quitting trigger:
 *
 *   F1 — "Goal-based To-Do engine instead of rigid timetable. Replace/augment
 *        the hour-by-hour planner with a daily priority to-do list. Each item =
 *        a goal with effort minutes, auto-sorted by weakness + weightage. The
 *        student checks off goals, not 'sat for X hours'."
 *
 *   F3 — "Auto re-plan on missed/overrun (guilt-free recovery). Missed a day →
 *        automatically slot missed tasks + rebalance; finished early → auto-pull
 *        the next task."
 *
 * Both live in the legacy monolith today (`aipToday`/`aipGenerate` and
 * `aipRebalance`/`aipRebalanceActual` in `public/jee-cbt.html`) and have no
 * React equivalent.
 *
 * ## Why this module does not rewrite the stored plan
 *
 * The scope decision carried into this rebuild is explicit: **do not change the
 * Eklavya planner schedule.** The stored planner is the legacy app's, this app
 * reads it through `DataStore`, and a recovery feature that silently rewrote
 * another product's data would be worse than no recovery at all.
 *
 * So the engine is a *derived, non-destructive* view. It reads the stored rows
 * and the student's own evidence, and answers three questions the rigid
 * timetable cannot:
 *
 *   1. What is worth doing today, in what order, and why (F1).
 *   2. What did I miss, and where did it go (F3).
 *   3. Am I done for today, or is there one more thing worth pulling forward
 *      because I finished early (F3).
 *
 * ## The honesty rules
 *
 *  - **Progress is counted in goals, never in hours.** "3 of 5 goals done" is
 *    something the student did; "2.5 hours sat" is something that happened to
 *    them, and it is the number that makes a short day feel like a failure.
 *  - **A missed task is carried, not lost and not duplicated.** It appears once,
 *    with the date it was meant for, so the student can see the slip without
 *    the list silently growing every day they skip.
 *  - **Nothing is re-planned without evidence.** The order changes because a
 *    chapter is measured weak or carries more weightage, never because a timer
 *    expired.
 *  - **Overrun is not punished.** Finishing a 45-minute task in 70 minutes is
 *    not a failure state; the engine only asks what is left, not whether the
 *    estimate was met.
 */

import type { PlannerTaskRow } from "../../lib/store";
import { localDayKey } from "../../lib/store";
import type { WeakTopic } from "../dashboard/types";

/** One item on today's to-do list. */
export interface TodoItem {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  kind: PlannerTaskRow["kind"];
  /** Effort minutes as planned. Never inflated to make a day look full. */
  estMin: number;
  /** Why this item is on the list, in the student's own terms. */
  reason: string;
  /** True when the student's own accuracy put it here. */
  isWeakTarget: boolean;
  /** 1 = do this first. */
  rank: number;
  /** The day the task was originally planned for, when it is not today. */
  carriedFrom: string | null;
  /** True when the row is a review the engine generated from a missed task. */
  isCarryOver: boolean;
  /** Marks in the board syllabus for this chapter, when published. */
  weightage: number | null;
  /** Mirrors the stored row, so a caller never has to re-read the plan. */
  status: PlannerTaskRow["status"];
}

export interface TodoProgress {
  /** Goals finished today. */
  done: number;
  /** Goals on today's list, carried ones included. */
  total: number;
  /** Goals still open. */
  remaining: number;
  /** `done / total`, or 0 when the list is empty. Never a percentage of hours. */
  fraction: number;
  /** Minutes of *planned* work still open. */
  remainingMin: number;
}

export interface TodoPlan {
  dayKey: string;
  /** True when `dayKey` is today rather than the nearest upcoming day. */
  isToday: boolean;
  items: TodoItem[];
  /** What to do next, or null when the list is empty. */
  nextUp: TodoItem | null;
  progress: TodoProgress;
  /** One line explaining the order. */
  summary: string;
  /** Tasks from earlier days that were carried into today. */
  carriedOver: TodoItem[];
  /**
   * True when today's list is finished and there is more pending work ahead.
   * This is the F3 "finished early" signal: the student is offered one more
   * thing rather than being left at a dead end.
   */
  finishedEarly: boolean;
  /** The one extra thing worth pulling forward when `finishedEarly`. */
  pullForward: TodoItem | null;
  /** Honest note for an empty or rest day. */
  note: string;
}

export interface TodoInput {
  rows: PlannerTaskRow[];
  /** The student's measured weak topics, when the readiness engine has any. */
  weak?: WeakTopic[];
  /** Board weightage per `subject::chapter`, when the syllabus publishes it. */
  weightage?: Map<string, number>;
  /** Defaults to now. */
  now?: number;
  /** How many days back a missed task may be carried before it is surfaced
   *  separately rather than silently re-listed. */
  carryWindowDays?: number;
  /**
   * Goals the student has ticked off in this app. Additive: it never edits the
   * stored plan, so a tick here and a tick in the classic app stay distinct.
   */
  doneOverlay?: Set<string>;
}

/**
 * Effective done-state for a row: the stored plan's own status, or this app's
 * overlay. A row the legacy engine marked done is done everywhere; a row the
 * student ticked here is done here. The two never overwrite each other.
 */
function isDone(row: PlannerTaskRow, overlay: Set<string> | undefined): boolean {
  return row.status === "done" || Boolean(overlay?.has(row.id));
}

/** Malformed input becomes an empty list rather than a crash. */
function rows(input: PlannerTaskRow[] | undefined | null): PlannerTaskRow[] {
  return Array.isArray(input) ? input.filter((r) => r && typeof r === "object" && r.id) : [];
}

function norm(s: string | undefined): string {
  return (s || "").trim().toLowerCase();
}

function weightFor(row: PlannerTaskRow, weightage: Map<string, number> | undefined): number | null {
  if (!weightage || weightage.size === 0) return null;
  const keys = [`${norm(row.subject)}::${norm(row.chapter)}`, `${norm(row.chapter)}`];
  for (const k of keys) {
    const v = weightage.get(k);
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

function matchesWeak(row: PlannerTaskRow, weak: WeakTopic[]): WeakTopic | null {
  const subj = norm(row.subject);
  const rowNames = new Set([norm(row.chapter), norm(row.topic)].filter(Boolean));
  for (const w of weak) {
    if (!w) continue;
    const ws = norm(w.subject);
    if (!ws || !subj || subj !== ws) continue;
    const wc = norm(w.chapter);
    const wt = norm(w.topic || "");
    if ((wc && rowNames.has(wc)) || (wt && rowNames.has(wt))) return w;
  }
  return null;
}

/** Days between two `YYYY-MM-DD` keys. */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / (24 * 3600 * 1000));
}

function reasonFor(
  row: PlannerTaskRow,
  weak: WeakTopic | null,
  carriedFrom: string | null,
  weightage: number | null,
): string {
  if (weak) {
    const acc =
      weak.accuracy === null ? "not enough attempts to score" : `${weak.accuracy}% accuracy`;
    return `Weak target — ${acc} across ${weak.attemptCount} attempt${
      weak.attemptCount === 1 ? "" : "s"
    }.`;
  }
  if (carriedFrom) {
    return `Carried over from ${carriedFrom}.`;
  }
  if (weightage !== null) {
    return `${weightage} marks in the syllabus.`;
  }
  return row.why || `Part of your ${row.subject || ""} plan.`;
}

/**
 * Build today's goal list.
 *
 * Non-destructive: nothing here writes to storage. The carried-over tasks are
 * *derived* from unfinished rows on earlier days — they are not copied into
 * today's plan, so the stored planner is unchanged and a student who reopens
 * the legacy app sees exactly what it wrote.
 */
export function buildTodoPlan(input: TodoInput): TodoPlan {
  const now = input.now ?? Date.now();
  const today = localDayKey(now);
  const all = rows(input.rows);
  const weak = Array.isArray(input.weak) ? input.weak : [];
  const carryWindow = input.carryWindowDays ?? 7;

  const overlay = input.doneOverlay;
  const todays = all.filter((r) => String(r.date) === today);
  const pending = all.filter((r) => !isDone(r, overlay));

  // F3, first half: a missed task is carried forward, once, with its date
  // attached. Only tasks inside the carry window are re-listed — older ones
  // stay visible on the planner page instead of quietly piling onto today.
  const carryWindowStart = localDayKey(now - carryWindow * 24 * 3600 * 1000);
  const carriedRows = pending.filter((r) => {
    const d = String(r.date);
    return d < today && d >= carryWindowStart;
  });

  const buildItem = (row: PlannerTaskRow, carried: boolean): TodoItem => {
    const w = matchesWeak(row, weak);
    const carriedFrom = carried ? String(row.date) : null;
    const weightage = weightFor(row, input.weightage);
    return {
      id: row.id,
      subject: row.subject,
      chapter: row.chapter,
      topic: row.topic,
      kind: row.kind,
      estMin: Number.isFinite(row.estMin) && row.estMin > 0 ? row.estMin : 45,
      reason: reasonFor(row, w, carriedFrom, weightage),
      isWeakTarget: Boolean(w),
      rank: 0,
      carriedFrom,
      isCarryOver: carried,
      weightage,
      status: isDone(row, overlay) ? "done" : "pending",
    };
  };

  const items: TodoItem[] = [
    ...todays.map((r) => buildItem(r, false)),
    ...carriedRows.map((r) => buildItem(r, true)),
  ];

  // F1: a lexicographic sort, because the precedence is not a trade-off. Done
  // work always sinks; today's own work always precedes carried work; within a
  // band, weakness beats weightage beats length. A magic-number score cannot
  // say "never" — a +500 carry penalty still loses to a -1000 weakness bonus,
  // which is exactly backwards.
  items.sort((a, b) => {
    // 1. Completed goals always last — a finished task must not sit at the top
    //    wearing a "Weak target" badge above real pending work.
    const ad = a.status === "done" ? 1 : 0;
    const bd = b.status === "done" ? 1 : 0;
    if (ad !== bd) return ad - bd;
    // 2. Slipping yesterday is not a reason to abandon today.
    const ac = a.isCarryOver ? 1 : 0;
    const bc = b.isCarryOver ? 1 : 0;
    if (ac !== bc) return ac - bc;
    // 3. Evidence first.
    const aw = a.isWeakTarget ? 0 : 1;
    const bw = b.isWeakTarget ? 0 : 1;
    if (aw !== bw) return aw - bw;
    // 4. Then the board's own marks.
    const am = a.weightage ?? -1;
    const bm = b.weightage ?? -1;
    if (am !== bm) return bm - am;
    // 5. Then shortest first, so a short goal is never buried.
    if (a.estMin !== b.estMin) return a.estMin - b.estMin;
    return a.id.localeCompare(b.id);
  });
  items.forEach((it, i) => {
    it.rank = i + 1;
  });

  const open = items.filter((it) => it.status !== "done");
  const doneToday = items.filter((it) => it.status === "done").length;
  const progress: TodoProgress = {
    done: doneToday,
    total: items.length,
    remaining: open.length,
    fraction: items.length > 0 ? doneToday / items.length : 0,
    remainingMin: open.reduce((sum, it) => sum + it.estMin, 0),
  };

  // F3, second half: when today is finished, offer the next pending task ahead
  // of its scheduled day rather than leaving the student at a dead end. Only
  // one is offered — pulling a whole future day forward is how a good day
  // turns into an overrun.
  const finishedEarly = items.length > 0 && open.length === 0;
  const upcoming = pending
    .filter((r) => String(r.date) > today)
    .sort(
      (a, b) => String(a.date).localeCompare(String(b.date)) || (a.estMin || 45) - (b.estMin || 45),
    );
  const pullRow = finishedEarly ? (upcoming[0] ?? null) : null;
  const pullForward = pullRow ? { ...buildItem(pullRow, false), rank: 1 } : null;

  const note = items.length
    ? ""
    : todays.length === 0
      ? "Nothing is scheduled for today. That is a rest day, not a failure — the plan resumes tomorrow."
      : "Everything planned for today is done.";

  const summary = items.length
    ? open.length
      ? `${open.length} goal${open.length === 1 ? "" : "s"} left, ordered by what your own answers say needs the next rep.`
      : "Today's goals are done. Anything more is a bonus, not a debt."
    : "";

  return {
    dayKey: today,
    isToday: true,
    items,
    nextUp: open[0] ?? null,
    progress,
    summary,
    carriedOver: items.filter((it) => it.isCarryOver),
    finishedEarly,
    pullForward,
    note,
  };
}

/**
 * Goal-based progress across the whole plan, not just today. The dashboard's
 * "am I on track" number counts goals, so a student who did three small goals
 * sees more progress than one who sat for two hours and finished nothing.
 */
export function goalProgress(
  plan: PlannerTaskRow[],
  doneOverlay?: Set<string>,
): {
  done: number;
  total: number;
  fraction: number;
} {
  const all = rows(plan);
  const done = all.filter((r) => isDone(r, doneOverlay)).length;
  return {
    done,
    total: all.length,
    fraction: all.length > 0 ? done / all.length : 0,
  };
}

/**
 * The honest one-liner for how a missed day was handled. F3 is "guilt-free
 * recovery", and the recovery is only guilt-free if the student can see what
 * happened to the work they did not do.
 */
export function recoveryNote(plan: TodoPlan): string | null {
  if (plan.carriedOver.length === 0) return null;
  const n = plan.carriedOver.length;
  const from = plan.carriedOver.map((c) => c.carriedFrom).filter(Boolean) as string[];
  const oldest = from.sort()[0];
  return `${n} unfinished goal${n === 1 ? "" : "s"} carried forward from ${oldest ?? "an earlier day"}. Nothing was dropped, and nothing was duplicated.`;
}
