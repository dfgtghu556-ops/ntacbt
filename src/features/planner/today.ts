/**
 * TODAY'S PLAN (Phase 6 — dashboard information architecture)
 *
 * The rebuild plan asks the dashboard to be: greeting → today's focus + ONE
 * primary action → today's tasks → progress → 3–5 weak areas → continue learning
 * → optional deep analytics behind disclosure.
 *
 * This module is the pure logic for the two pieces the dashboard was missing:
 *
 *  1. **Today's tasks** — the student's own stored plan, filtered to today (or
 *     the nearest upcoming day when today is empty). A student landing on Home
 *     must see what they planned for today without navigating away.
 *  2. **3–5 weak areas** — the top priority chapters from the mastery store,
 *     which is the same evidence the mentor report uses, so Home and the report
 *     can never disagree.
 *
 * **It never invents a next action.** `primaryAction` is chosen from what the
 * evidence supports, and when there is not enough evidence it says so rather
 * than manufacturing a recommendation. A student with no attempts at all gets
 * "start a diagnostic", which is the only honest first move.
 */

import type { PlannerTaskRow } from "../../lib/store";
import type { ChapterMastery, MasteryState } from "../mastery/mastery";
import { MIN_SAMPLE, priorityChapters } from "../mastery/mastery";
import { localDayKey } from "../../lib/store";

/** A weak-area row, with the reason it is being shown. */
export interface WeakAreaRow {
  subject: string;
  chapter: string;
  state: MasteryState;
  /** Accuracy, or null when the sample is too thin to score. */
  accuracy: number | null;
  attempts: number;
  pyqAttempts: number;
  lessonsFinished: number;
  /** Why this chapter is on the list. */
  reason: string;
}

export interface TodayTask {
  id: string;
  subject: string;
  chapter: string;
  kind: string;
  estMin: number;
  status: string;
  /** True when the adaptive ranking flagged it as a weak target. */
  isWeakTarget: boolean;
}

/** The one thing the dashboard tells the student to do next. */
export interface PrimaryAction {
  /** Short label for the button. */
  label: string;
  /** Why this and not something else. */
  reason: string;
  /** Router path. */
  to: string;
  /** Optional search params for the target route. */
  search?: Record<string, string>;
}

export interface TodayPlan {
  /** The day key these tasks belong to. */
  dayKey: string;
  /** True when `dayKey` is today rather than the nearest upcoming day. */
  isToday: boolean;
  /** Human note when there is nothing for today. */
  note: string;
  tasks: TodayTask[];
  /** Chapters the plan reaches today. */
  chaptersTouched: number;
  plannedMin: number;
  doneMin: number;
  weakAreas: WeakAreaRow[];
  /** True when the weak areas are all evidence-backed rather than guessed. */
  hasEvidence: boolean;
  primary: PrimaryAction;
}

/** Minutes a task contributes: real watched time once done, else planned. */
function minutesOf(row: PlannerTaskRow): number {
  if (row.status === "done" && typeof row.actualMin === "number") return row.actualMin;
  return typeof row.estMin === "number" && row.estMin > 0 ? row.estMin : 0;
}

function reasonFor(m: ChapterMastery): string {
  if (m.attempts === 0) {
    if (m.lessonsStarted > 0) {
      return `${m.lessonsStarted} lesson${m.lessonsStarted === 1 ? "" : "s"} started, no questions attempted yet.`;
    }
    return "No evidence yet — no lessons and no questions.";
  }
  if (m.attempts < MIN_SAMPLE) {
    return `Only ${m.attempts} attempt${m.attempts === 1 ? "" : "s"} — not enough to score yet.`;
  }
  if (m.accuracy < 50) {
    return `${m.accuracy}% accuracy across ${m.attempts} attempts.`;
  }
  return `${m.accuracy}% accuracy across ${m.attempts} attempts — solid, but the lowest of your sampled chapters.`;
}

/**
 * Build today's view from the student's own data.
 *
 * `weakTargets` is the set of `subject::chapter` keys the adaptive planner
 * already flagged, so a task marked weak here matches the planner page.
 */
export function buildTodayPlan(input: {
  tasks: PlannerTaskRow[];
  mastery: Map<string, ChapterMastery>;
  weakTargets?: Set<string>;
  now?: number;
}): TodayPlan {
  const now = input.now ?? Date.now();
  const today = localDayKey(now);
  const rows = (Array.isArray(input.tasks) ? input.tasks : []).filter((r) => r && r.date);

  const todays = rows.filter((r) => String(r.date) === today);
  // When today is empty, show the nearest upcoming day rather than nothing — a
  // student opening the app on a rest day still needs to know what is next.
  const upcoming = rows
    .filter((r) => String(r.date) > today && r.status !== "done")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const nextDay = upcoming[0] ? String(upcoming[0].date) : null;
  const chosen =
    todays.length > 0 ? todays : nextDay ? upcoming.filter((r) => String(r.date) === nextDay) : [];
  const isToday = todays.length > 0;
  const dayKey = isToday ? today : (nextDay ?? today);

  const weak = input.weakTargets ?? new Set<string>();
  const tasks: TodayTask[] = chosen.map((r) => ({
    id: String(r.id),
    subject: String(r.subject ?? ""),
    chapter: String(r.chapter ?? r.topic ?? ""),
    kind: String(r.kind ?? ""),
    estMin: typeof r.estMin === "number" ? r.estMin : 0,
    status: String(r.status ?? ""),
    isWeakTarget: weak.has(`${String(r.subject ?? "")}::${String(r.chapter ?? r.topic ?? "")}`),
  }));

  const chaptersTouched = new Set(tasks.map((t) => `${t.subject}::${t.chapter}`)).size;
  const plannedMin = chosen.reduce((n, r) => n + minutesOf(r), 0);
  const doneMin = chosen.filter((r) => r.status === "done").reduce((n, r) => n + minutesOf(r), 0);

  // The 3–5 weak areas come from the same ranking the mentor report uses, so
  // Home and the report can never disagree about what needs work.
  const weakAreas: WeakAreaRow[] = priorityChapters(input.mastery, 5).map((m) => ({
    subject: m.subject,
    chapter: m.chapter,
    state: m.state,
    accuracy: m.attempts >= MIN_SAMPLE ? m.accuracy : null,
    attempts: m.attempts,
    pyqAttempts: m.pyqAttempts,
    lessonsFinished: m.lessonsFinished,
    reason: reasonFor(m),
  }));

  const hasEvidence = weakAreas.some((w) => w.attempts > 0 || w.lessonsFinished > 0);

  return {
    dayKey,
    isToday,
    // The note explains the *situation*, so it must appear even when the
    // fallback day has tasks: "nothing today, here is your next day" is exactly
    // what a student on a rest day needs to read.
    note: noteFor({ isToday, dayKey, today }),
    tasks,
    chaptersTouched,
    plannedMin,
    doneMin,
    weakAreas,
    hasEvidence,
    primary: primaryActionFor({ tasks, weakAreas, hasEvidence }),
  };
}

function noteFor(input: { isToday: boolean; dayKey: string; today: string }): string {
  if (input.isToday) return "";
  if (input.dayKey && input.dayKey !== input.today) {
    return `Nothing scheduled for today. Your next planned day is ${input.dayKey}.`;
  }
  return "Nothing scheduled for today yet. Start with a short diagnostic so the plan has evidence to work from.";
}

/**
 * Pick the ONE primary action.
 *
 * Ordered by what the evidence actually supports. A finished task list gets a
 * different nudge than an empty one, and a student with no evidence at all gets
 * a diagnostic rather than a confident recommendation built on nothing.
 */
function primaryActionFor(input: {
  tasks: TodayTask[];
  weakAreas: WeakAreaRow[];
  hasEvidence: boolean;
}): PrimaryAction {
  const pending = input.tasks.filter((t) => t.status !== "done");

  if (!input.hasEvidence) {
    return {
      label: "Start a diagnostic",
      reason: "No attempt evidence yet, so a short drill is what makes every other number honest.",
      to: "/cbt",
      search: { name: "Quick mixed diagnostic drill" },
    };
  }

  if (pending.length > 0) {
    const weakFirst = pending.find((t) => t.isWeakTarget) ?? pending[0];
    if (!weakFirst) {
      return {
        label: "Open your plan",
        reason: "Today's tasks could not be read.",
        to: "/app/planner",
      };
    }
    return {
      label: `Work on ${weakFirst.chapter}`,
      reason: `${pending.length} task${pending.length === 1 ? "" : "s"} left today${
        weakFirst.isWeakTarget ? ", and this one is a flagged weak target" : ""
      }.`,
      to: "/app/studytube",
    };
  }

  if (input.tasks.length > 0) {
    return {
      label: "Review today's mistakes",
      reason:
        "Today's tasks are done — reviewing what went wrong is worth more than starting something new.",
      to: "/app/analytics",
    };
  }

  const top = input.weakAreas[0];
  if (top) {
    return {
      label: `Start ${top.chapter}`,
      reason:
        top.attempts >= MIN_SAMPLE
          ? `${top.accuracy}% accuracy across ${top.attempts} attempts — your lowest sampled chapter.`
          : `No question evidence for ${top.chapter} yet, so it is the first thing to test.`,
      to: "/app/studytube",
    };
  }

  return {
    label: "Open your plan",
    reason: "Nothing is scheduled and nothing is measured yet.",
    to: "/app/planner",
  };
}
