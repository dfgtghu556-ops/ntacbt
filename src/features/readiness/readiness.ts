/**
 * NTACBT Readiness + Mission engine.
 *
 * Deterministic, evidence-based, explainable. It derives mission priorities
 * from the student's actual attempts (legacy store) and planner data. It
 * never promises a score; it reports what is going well, what is holding the
 * student back, and what to do next.
 */

import { DataStore, type AttemptSummary, type PlannerTaskRow } from "../../lib/store";
import type { MissionSummary, ReadinessSnapshot, TodayPlan, WeakTopic } from "../dashboard/types";

const MEANINGFUL_ACCURACY_THRESHOLD = 0.35;

function accuracyOf(attempts: AttemptSummary[]): number {
  let correct = 0;
  let attempted = 0;
  for (const a of attempts) {
    const all = a.result?.all;
    if (!all) continue;
    correct += all.correct || 0;
    attempted += all.correct || 0 + (all.wrong || 0);
  }
  return attempted ? Math.round((correct / attempted) * 1000) / 10 : 0;
}

function totalMarks(attempts: AttemptSummary[]): { marks: number; max: number } {
  let marks = 0;
  let max = 0;
  for (const a of attempts) {
    const all = a.result?.all;
    if (!all) continue;
    marks += all.marks || 0;
    max += all.max ?? (all.total || 0) * 4;
  }
  return { marks, max };
}

/** Simple deterministic grading mirroring NTA rules used by the legacy engine. */
function isCorrect(
  q: { answer: string; type: string; accept?: unknown },
  ans: string | null,
): boolean {
  if (ans == null || ans === "") return false;
  const a = parseFloat(String(ans).replace(/,/g, ""));
  if (!isFinite(a)) return false;
  const acc = q.accept as { kind?: string; lo?: number; hi?: number; vals?: number[] } | undefined;
  if (q.type === "mcq") return String(ans).toLowerCase() === String(q.answer || "").toLowerCase();
  if (acc?.kind === "all") return true;
  if (acc?.kind === "range" && typeof acc.lo === "number" && typeof acc.hi === "number")
    return a >= acc.lo - 1e-9 && a <= acc.hi + 1e-9;
  if (acc?.kind === "any" && Array.isArray(acc.vals))
    return acc.vals.some((v) => Math.abs(a - v) <= Math.max(0.01, Math.abs(v) * 0.001));
  const b = parseFloat(String(q.answer).replace(/,/g, ""));
  if (!isFinite(b)) return false;
  if (Number.isInteger(b)) return a === b;
  return Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.001);
}

function topicAttemptData(
  store: DataStore,
): Map<
  string,
  { attempted: number; correct: number; subject: string; chapter: string; topic: string }
> {
  const map = new Map<
    string,
    { attempted: number; correct: number; subject: string; chapter: string; topic: string }
  >();
  for (const test of store.tests) {
    const attempts = store.attempts.filter((a) => a.testId === test.id);
    if (!attempts.length) continue;
    for (const q of test.questions || []) {
      if (!q.subject || !q.chapter) continue;
      const attempted = attempts.filter((a) => {
        const r = a.responses?.[q.id];
        return r && r.ans !== null && r.ans !== "";
      });
      if (attempted.length < 1) continue;
      const correct = attempted.filter((a) => {
        const r = a.responses?.[q.id];
        return isCorrect(q, r?.ans ?? null);
      }).length;
      const key = `${q.subject}|${q.chapter}|${q.topic || "all"}`;
      const e = map.get(key) || {
        attempted: 0,
        correct: 0,
        subject: q.subject,
        chapter: q.chapter,
        topic: q.topic || "",
      };
      e.attempted += attempted.length;
      e.correct += correct;
      map.set(key, e);
    }
  }
  return map;
}

function weakTopics(store: DataStore): WeakTopic[] {
  const data = topicAttemptData(store);
  const out: WeakTopic[] = [];
  for (const [key, v] of data) {
    if (v.attempted < 2) continue;
    const acc = (v.correct / v.attempted) * 100;
    if (acc >= 50) continue;
    out.push({
      subject: v.subject,
      chapter: v.chapter,
      topic: v.topic,
      accuracy: Math.round(acc * 10) / 10,
      attemptCount: v.attempted,
      reason: `${v.correct}/${v.attempted} correct on ${v.chapter}.`,
    });
  }
  return out.sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
}

function todayPlan(store: DataStore): {
  planned: number;
  completed: number;
  tasks: MissionSummary[];
  done: number;
  total: number;
} {
  const tasks = store.todayTasks();
  let planned = 0;
  let completed = 0;
  let done = 0;
  const missions: MissionSummary[] = [];
  for (const t of tasks) {
    const min = t.estMin || 45;
    planned += min;
    if (t.status === "done") {
      done += 1;
      completed += min;
    }
    missions.push(toMission(t));
  }
  return { planned, completed, tasks: missions, done, total: tasks.length };
}

function toMission(t: PlannerTaskRow): MissionSummary {
  const profile = t.teacher || t.subject || "";
  const why =
    t.why || `Planned ${t.kind} for ${t.chapter} — part of your current ${t.subject} plan.`;
  return {
    title: `${t.subject} — ${t.chapter}`,
    subject: t.subject,
    chapter: t.chapter,
    minutes: t.estMin || 45,
    target: profile,
    why: why || "Scheduled from your adaptive plan.",
    kind: t.kind,
    taskId: t.id,
  };
}

function firstPendingMission(tasks: MissionSummary[]): MissionSummary | null {
  return tasks.find((t) => t.kind !== "test") || tasks[0] || null;
}

function trend(store: DataStore): Array<{ at: number; marks: number; accuracy: number }> {
  return store.attempts
    .filter((a) => typeof a.submittedAt === "number")
    .slice(-8)
    .map((a) => ({
      at: a.submittedAt as number,
      marks: a.result?.all?.marks ?? 0,
      accuracy: a.result?.all?.accuracy ?? 0,
    }));
}

function recentMessages(
  store: DataStore,
  weak: WeakTopic[],
  totals: ReturnType<DataStore["totals"]>,
) {
  const good: string[] = [];
  const holdingBack: string[] = [];
  const next: string[] = [];

  if (totals.attempts >= 3 && totals.accuracy >= 70) {
    good.push(`You're at ${totals.accuracy}% accuracy across ${totals.attempts} tests.`);
  } else if (totals.attempts >= 3) {
    good.push(`${totals.attempts} tests completed — a real evidence base exists.`);
  } else if (totals.attempts > 0) {
    good.push(`${totals.attempts} test submitted. More evidence = better advice.`);
  } else {
    good.push("No test evidence yet — start with a short PYQ drill or diagnostic.");
  }

  const firstWeak = weak[0] as WeakTopic | undefined;
  if (firstWeak) {
    holdingBack.push(`${firstWeak.subject} — ${firstWeak.chapter}: ${firstWeak.reason}`);
  }
  const plan = todayPlan(store);
  if (plan.done > 0 && plan.total > 0 && plan.completed < plan.planned * 0.7) {
    holdingBack.push(`Today's plan is only ${plan.completed} of ${plan.planned} min done.`);
  }

  if (weak[0]) {
    const w = weak[0];
    next.push(
      `Target ${w.chapter} — ${w.accuracy}% accuracy. Use the StudyTube weak-topic view and a 10-question PYQ drill.`,
    );
  }
  const m = firstPendingMission(plan.tasks);
  if (m) {
    next.push(`Next mission: ${m.title} (${m.minutes} min).`);
  } else {
    next.push("No pending task today — a short mock or mistake-notebook review is ideal.");
  }

  return { good: good.slice(0, 2), holdingBack: holdingBack.slice(0, 2), next: next.slice(0, 2) };
}

export function computeReadiness(store: DataStore): ReadinessSnapshot {
  const planner = store.planner;
  const totals = store.totals();
  const weak = weakTopics(store);
  const today = todayPlan(store);
  const messages = recentMessages(store, weak, totals);
  const trendData = trend(store);
  const target = planner?.profile?.target || (totals.attempts ? "jeemain" : "jeemain");

  return {
    examTarget: target,
    attempts: totals.attempts,
    totalQuestions: totals.totalQuestions,
    accuracy: totals.accuracy,
    marks: totals.marks,
    maxMarks: totals.max,
    syllabusCompletionPct: planner
      ? Math.round(
          (planner.tasks?.filter((t) => t.status === "done").length /
            Math.max(1, planner.tasks?.length || 1)) *
            100,
        )
      : 0,
    weakTopics: weak,
    recentTrend: trendData,
    messages,
    nextMission: firstPendingMission(today.tasks),
    today: {
      plannedMinutes: today.planned,
      completedMinutes: today.completed,
      tasks: today.tasks,
      doneTasks: today.done,
      totalTasks: today.total,
    },
  };
}

export type { TodayPlan };
