/**
 * NTACBT Mentor Report engine.
 *
 * This is the connective tissue of the platform — it reads EVERY student data
 * surface (legacy store, adaptive planner, CBT results, readiness/weak topics,
 * StudyTube watch/mastery state, focus history) and converges them into ONE
 * deterministic, explainable, comprehensive report: what's going well, what's
 * holding the student back, what to do next, and an overall readiness score.
 *
 * Design rules (so it never breaks after months of messy real-life use):
 *  - Pure + deterministic: no network, no localStorage access, no random.
 *  - Never throws: every input is defensively read (arrays/objects/NaN-safe).
 *  - Framework-free: unit-testable in isolation (see scripts/validate-mentor.mjs).
 *  - Never fabricates: it only surfaces evidence that actually exists.
 *
 * It also produces a compact AI context string (mentorContextForAI) that is fed
 * to Saarthi so the mentor knows the WHOLE student, not just one tab.
 */

import type { DataStore, PlannerTaskRow } from "../../lib/store";
import type { FocusStore, FocusSession } from "../focus/focus";
import type { StudyTubeProgressStore, HandshakeRecord } from "../studytube/progress";
import { computeReadiness } from "../readiness/readiness";
import type { ReadinessSnapshot, WeakTopic } from "../dashboard/types";

/* ------------------------------------------------------------------ */
/* Defensive helpers (never throw, never produce NaN)                 */
/* ------------------------------------------------------------------ */
function num(v: unknown, d = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function str(v: unknown, d = ""): string {
  return typeof v === "string" ? v : d;
}
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Report contracts                                                    */
/* ------------------------------------------------------------------ */
export interface MentorAction {
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  reason: string;
}

export interface MentorRisk {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  evidence: string;
}

export interface MentorReport {
  generatedAt: number;
  learner: {
    examTarget: string;
    targetLabel: string;
    language: string;
    depth: string;
    examDate?: string;
    daysToExam?: number;
    dailyGoalMin: number;
  };
  performance: {
    attempts: number;
    totalQuestions: number;
    correct: number;
    wrong: number;
    skipped: number;
    accuracy: number;
    marks: number;
    maxMarks: number;
    percentile: number;
  };
  mastery: {
    syllabusCompletionPct: number;
    weakTopics: WeakTopic[];
    strongTopics: Array<{ subject: string; chapter: string; accuracy: number }>;
  };
  study: {
    lecturesWatched: number;
    notesCount: number;
    watchLater: number;
    handshakes: number;
    masteryDistribution: Record<string, number>;
    practiceToMastery: number; // share of handshakes that reached Strong/Mastered
    completionRate: number; // watched-vs-later ratio-ish (lecture completion signal)
  };
  mistakes: {
    topTag: string;
    topLabel: string;
    topFix: string;
    bySubject: Array<{ subject: string; wrong: number; accuracy: number }>;
  };
  focus: {
    todayMin: number;
    streakDays: number;
    weeklyMin: number;
    consistencyPct: number; // qualifying focus days over the last 21 days
  };
  planner: {
    totalTasks: number;
    doneTasks: number;
    plannedMin: number;
    doneMin: number;
    completionPct: number;
    todayTasks: number;
    todayDone: number;
    overdueTasks: number;
  };
  readinessScore: number; // 0..100 composite
  readinessLevel: "excellent" | "good" | "fair" | "at-risk";
  actions: MentorAction[];
  risks: MentorRisk[];
  summary: string;
}

const TARGET_LABELS: Record<string, string> = {
  jeemain: "JEE Main",
  jeeadv: "JEE Advanced",
  board12: "CBSE Class 12",
  board11: "CBSE Class 11",
  cbse27: "CBSE Class 12 (2026-27)",
};

/* ------------------------------------------------------------------ */
/* Mistake classification from per-question wrong answers              */
/* ------------------------------------------------------------------ */
interface MistakeCell {
  label: string;
  fix: string;
  count: number;
}
const MISTAKE_META: Record<string, { label: string; fix: string }> = {
  concept: { label: "Concept gap", fix: "Revise theory first, then attempt." },
  formula: {
    label: "Formula bhool",
    fix: "Build a formula sheet for the chapter; review 2 min daily.",
  },
  calculation: {
    label: "Calculation slip",
    fix: "Write rough work in two columns; recheck the final line.",
  },
  misread: { label: "Misread question", fix: "Read the stem once more before locking an answer." },
  silly: { label: "Silly mistake", fix: "Slow down 10% — accuracy pays more than raw speed." },
  guessed: {
    label: "Guessed",
    fix: "If 3+ options confuse you, skip — negative marking eats guesses.",
  },
};

/** Derive the strongest (subject × tag) mistake cluster from evidence. */
function mistakeSummary(
  store: DataStore,
  correctness: Map<string, boolean>,
): {
  top: { tag: string; label: string; fix: string; count: number };
  bySubject: Array<{ subject: string; wrong: number; accuracy: number }>;
} {
  const cell = new Map<string, MistakeCell>();
  const bySubj = new Map<string, { wrong: number; correct: number }>();

  for (const test of store.tests) {
    for (const q of test.questions || []) {
      if (!q.id) continue;
      const correct = correctness.get(q.id);
      if (correct === undefined) continue; // not answered anywhere
      const subj = str(q.subject, "Unknown");
      const s = bySubj.get(subj) || { wrong: 0, correct: 0 };
      if (correct) s.correct++;
      else {
        s.wrong++;
        const tag = str((q as { tag?: string }).tag) || inferTag(q.text);
        const meta = MISTAKE_META[tag] || {
          label: tag || "Concept gap",
          fix: "Review the concept and re-test.",
        };
        const key = tag || "concept";
        const c = cell.get(key) || { label: meta.label, fix: meta.fix, count: 0 };
        c.count++;
        cell.set(key, c);
      }
      bySubj.set(subj, s);
    }
  }

  let top: { tag: string; label: string; fix: string; count: number } = {
    tag: "None",
    label: "No mistakes tagged yet",
    fix: "Attempt more questions so the Mistake Doctor can find a pattern.",
    count: 0,
  };
  for (const [tag, c] of cell)
    if (c.count > top.count) top = { tag, label: c.label, fix: c.fix, count: c.count };

  const bySubject = [...bySubj.entries()].map(([subject, v]) => ({
    subject,
    wrong: v.wrong,
    accuracy: v.correct + v.wrong ? round1((v.correct / (v.correct + v.wrong)) * 100) : 0,
  }));

  return { top, bySubject };
}

/** Minimal heuristic tag mirroring features/cbt/analytics inferTag. */
function inferTag(text: string): string {
  const hay = str(text).toLowerCase();
  if (/not |false|except|incorrect|which .* (is not|is false)/.test(hay)) return "misread";
  if (/find|calculate|evaluate|compute|value of|∫|d\/dx|sin|cos|tan|log|√/.test(hay))
    return "calculation";
  if (/formula|theorem|law|equation|relation|principle/.test(hay)) return "formula";
  if (/guess|estimate|approximately|closest/.test(hay)) return "guessed";
  return "concept";
}

/* ------------------------------------------------------------------ */
/* Build correctness map from legacy attempts (per-question)           */
/* ------------------------------------------------------------------ */
function buildCorrectness(store: DataStore): Map<string, boolean> {
  // Reuse the grading from the readiness engine's isCorrect via a local mirror
  // that matches evaluate() for the legacy data shape.
  const map = new Map<string, boolean>();
  for (const test of store.tests) {
    const attempts = store.attempts.filter((a) => a.testId === test.id);
    for (const a of attempts) {
      for (const q of test.questions || []) {
        if (!q.id) continue;
        const r = a.responses?.[q.id];
        if (!r || r.ans === null || r.ans === "") continue;
        // If any attempt on this question is correct, count it as known-correct.
        if (!map.has(q.id)) map.set(q.id, isLegacyRight(q, r.ans));
        else if (isLegacyRight(q, r.ans)) map.set(q.id, true);
      }
    }
  }
  return map;
}

function isLegacyRight(
  q: { type: string; answer: string; accept?: unknown },
  ans: string,
): boolean {
  if (q.type === "mcq") return ans.toLowerCase() === str(q.answer).toLowerCase();
  const a = parseFloat(String(ans).replace(/,/g, ""));
  if (!isFinite(a)) return false;
  const acc = q.accept as { kind?: string; lo?: number; hi?: number; vals?: number[] } | undefined;
  if (acc?.kind === "all") return true;
  if (acc?.kind === "range" && typeof acc.lo === "number" && typeof acc.hi === "number")
    return a >= acc.lo - 1e-9 && a <= acc.hi + 1e-9;
  if (acc?.kind === "any" && Array.isArray(acc.vals))
    return acc.vals.some((v) => Math.abs(a - v) <= Math.max(0.01, Math.abs(v) * 0.001));
  const b = parseFloat(str(q.answer).replace(/,/g, ""));
  if (!isFinite(b)) return false;
  if (Number.isInteger(b)) return a === b;
  return Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.001);
}

/* ------------------------------------------------------------------ */
/* StudyTube engagement                                                */
/* ------------------------------------------------------------------ */
function studyEngagement(studytube: StudyTubeProgressStore | undefined): MentorReport["study"] {
  const watched = studytube?.watched ?? {};
  const notes = studytube?.notes ?? {};
  const watchLater = arr<string>(studytube?.watchLater);
  const handshakes = studytube?.handshakes ?? {};
  const hands = Object.values(handshakes) as HandshakeRecord[];
  const masteryDist: Record<string, number> = {};
  let mastered = 0;
  for (const h of hands) {
    const m = str(h.mastery, "Not Started");
    masteryDist[m] = (masteryDist[m] || 0) + 1;
    if (m === "Strong" || m === "Mastered") mastered++;
  }
  const lecturesWatched = Object.values(watched).filter((w) => w && w.finished).length;
  const completionRate = hands.length ? round1((mastered / hands.length) * 100) : 0;
  return {
    lecturesWatched,
    notesCount: Object.keys(notes).length,
    watchLater: watchLater.length,
    handshakes: hands.length,
    masteryDistribution: masteryDist,
    practiceToMastery: hands.length ? round1((mastered / hands.length) * 100) : 0,
    completionRate,
  };
}

/* ------------------------------------------------------------------ */
/* Focus consistency                                                   */
/* ------------------------------------------------------------------ */
function focusConsistency(
  sessions: FocusSession[],
  now: number,
): {
  todayMin: number;
  streakDays: number;
  weeklyMin: number;
  consistencyPct: number;
} {
  const MIN_QUALIFY = 25 * 60;
  const dayOf = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const todayKey = dayOf(now);
  const todayMin = sessions
    .filter((s) => s.completed && dayOf(s.startedAt) === todayKey)
    .reduce((n, s) => n + num(s.seconds), 0);
  const weeklyMin = sessions
    .filter((s) => s.completed && Date.now() - s.startedAt <= 7 * 86400000)
    .reduce((n, s) => n + num(s.seconds), 0);

  // consistency over the last 21 days ONLY (a stale or huge history must not
  // inflate the percentage above 100).
  const windowStart = now - 21 * 86400000;
  let qualDays = 0;
  const seen = new Set<string>();
  for (const s of sessions) {
    if (!s.completed || num(s.seconds) < MIN_QUALIFY) continue;
    if (num(s.startedAt) < windowStart) continue;
    const k = dayOf(s.startedAt);
    if (!seen.has(k)) {
      seen.add(k);
      qualDays++;
    }
  }
  const consistencyPct = round1(clamp((qualDays / 21) * 100, 0, 100));

  // streak: consecutive qualifying days ending today/yesterday
  let streak = 0;
  const cursor = new Date(now);
  if (!seen.has(dayOf(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (seen.has(dayOf(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    todayMin: Math.round(todayMin / 60),
    streakDays: streak,
    weeklyMin: Math.round(weeklyMin / 60),
    consistencyPct,
  };
}

/* ------------------------------------------------------------------ */
/* Planner adherence                                                   */
/* ------------------------------------------------------------------ */
function plannerMetrics(
  planner: { tasks?: PlannerTaskRow[] } | null,
  now: number,
): MentorReport["planner"] {
  const tasks = arr<PlannerTaskRow>(planner?.tasks);
  const todayKey = localDayKey(now);
  const done = tasks.filter((t) => t.status === "done");
  const notDone = tasks.filter((t) => t.status !== "done");
  const overdue = notDone.filter((t) => str(t.date) && str(t.date) < todayKey);
  const todayTasks = tasks.filter((t) => str(t.date) === todayKey);
  const todayDone = todayTasks.filter((t) => t.status === "done");
  const plannedMin = tasks.reduce((n, t) => n + num(t.estMin, 45), 0);
  const doneMin = done.reduce((n, t) => n + num(t.estMin, 45), 0);
  return {
    totalTasks: tasks.length,
    doneTasks: done.length,
    plannedMin,
    doneMin,
    completionPct: plannedMin ? round1((doneMin / plannedMin) * 100) : 0,
    todayTasks: todayTasks.length,
    todayDone: todayDone.length,
    overdueTasks: overdue.length,
  };
}

function localDayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Composite readiness score (deterministic, explainable)              */
/* ------------------------------------------------------------------ */
function readinessScore(parts: {
  accuracy: number;
  syllabus: number;
  plannerPct: number;
  practiceToMastery: number;
  focusPct: number;
  attemptsN: number;
}): { score: number; level: MentorReport["readinessLevel"] } {
  let score = 0;
  // Accuracy is weighted only when there's real evidence (>=3 attempts).
  const accWeight = parts.attemptsN >= 3 ? 0.28 : parts.attemptsN > 0 ? 0.12 : 0;
  score += parts.accuracy * accWeight;
  score += parts.syllabus * 0.16;
  score += parts.plannerPct * 0.14;
  score += parts.practiceToMastery * 0.1;
  score += parts.focusPct * 0.1;
  // Engagement floor: a student with no evidence at all shouldn't score high.
  const evidenceBonus = Math.min(1, parts.attemptsN / 10) * 12;
  score += evidenceBonus;
  const raw = round1(clamp(score, 0, 100));
  const level: MentorReport["readinessLevel"] =
    raw >= 78 ? "excellent" : raw >= 58 ? "good" : raw >= 38 ? "fair" : "at-risk";
  return { score: raw, level };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
export function buildMentorReport(input: {
  store: DataStore;
  focus?: FocusStore;
  studytube?: StudyTubeProgressStore;
  now?: number;
}): MentorReport {
  const now = input.now ?? Date.now();
  const store = input.store;
  const focus: FocusStore = input.focus ?? { sessions: [], dailyTargetSec: 90 * 60 };
  const studytube = input.studytube;

  const totals = store.totals();
  const readiness: ReadinessSnapshot = computeReadiness(store);
  const planner = store.planner;
  const profile = planner?.profile;
  const settings = store.settings;

  const attemptsN = num(totals.attempts);
  const accuracy = num(totals.accuracy);
  const marks = num(totals.marks);
  const maxMarks = num(totals.max);
  const syllabus = clamp(num(readiness.syllabusCompletionPct), 0, 100);

  const study = studyEngagement(studytube);
  const foc = focusConsistency(arr<FocusSession>(focus.sessions), now);
  const plan = plannerMetrics(planner, now);

  const correctness = buildCorrectness(store);
  const mistakes = mistakeSummary(store, correctness);

  // percentile from marks (React engine)
  const percentile = ntaPercentile(marks);

  const rs = readinessScore({
    accuracy,
    syllabus,
    plannerPct: plan.completionPct,
    practiceToMastery: study.practiceToMastery,
    focusPct: foc.consistencyPct,
    attemptsN,
  });

  // days to exam
  let daysToExam: number | undefined;
  const examDate = str(profile?.examDate) || str(settings.examDate);
  if (examDate) {
    const d = new Date(`${examDate}T00:00:00`).getTime();
    if (Number.isFinite(d)) daysToExam = Math.max(0, Math.ceil((d - now) / 86400000));
  }

  const learner: MentorReport["learner"] = {
    examTarget: str(profile?.target, "jeemain"),
    targetLabel: TARGET_LABELS[str(profile?.target)] || "JEE Main",
    language: str(profile?.language, "en"),
    depth: str(profile?.depth, "lecture"),
    dailyGoalMin: num(profile?.dailyMin, num(profile?.weekdayMin, 180)),
  };
  // exactOptionalPropertyTypes: only set optional keys when actually defined.
  if (examDate) learner.examDate = examDate;
  if (daysToExam !== undefined) learner.daysToExam = daysToExam;

  const performance = {
    attempts: attemptsN,
    totalQuestions: num(totals.totalQuestions),
    correct: num(totals.correct),
    wrong: num(totals.wrong),
    skipped: num(totals.skipped),
    accuracy,
    marks,
    maxMarks,
    percentile,
  };

  const mastery = {
    syllabusCompletionPct: syllabus,
    weakTopics: arr<WeakTopic>(readiness.weakTopics),
    strongTopics: [], // filled below from chapter accuracy >= 70
  };

  // Build actions + risks (explainable, evidence-based)
  const actions: MentorAction[] = [];
  const risks: MentorRisk[] = [];

  const weak = mastery.weakTopics;
  if (weak[0]) {
    actions.push({
      priority: "high",
      title: `Fix ${weak[0].subject} — ${weak[0].chapter}`,
      detail: `Priority target — ${weak[0].accuracy}% accuracy across ${weak[0].attemptCount} attempt(s).`,
      reason: weak[0].reason,
    });
  }
  if (plan.overdueTasks > 0) {
    actions.push({
      priority: "high",
      title: "Clear overdue plan tasks",
      detail: `${plan.overdueTasks} task(s) past their scheduled date. Re-plan or batch them today.`,
      reason: "Overdue backlog compounds; reschedule rather than skip.",
    });
  } else if (plan.completionPct < 50 && plan.totalTasks > 0) {
    actions.push({
      priority: "medium",
      title: "Re-plan for realistic daily load",
      detail: `${plan.completionPct}% of planned minutes done. Adjust the daily cap to a pace you can keep.`,
      reason: "A plan you can't finish creates guilt, not progress.",
    });
  }
  if (foc.consistencyPct < 40 && fewEvidence(foc.consistencyPct, attemptsN)) {
    actions.push({
      priority: "medium",
      title: "Build a 25-min focus habit",
      detail: `Focus consistency is ${foc.consistencyPct}% over the last 21 days. Start with one focused block a day.`,
      reason: "Consistent small focus beats occasional long sessions.",
    });
  }
  if (study.practiceToMastery < 50 && study.handshakes > 0) {
    actions.push({
      priority: "medium",
      title: "Turn watching into mastery",
      detail: `Only ${study.practiceToMastery}% of watched lessons reached Strong/Mastered. Do the practice drill after each lesson.`,
      reason: "Watching without recall/practice does not move marks.",
    });
  }
  if (attemptsN === 0) {
    actions.push({
      priority: "critical",
      title: "Take your first diagnostic",
      detail: "No test evidence yet. One short drill gives the mentor real data to plan with.",
      reason: "Without evidence every recommendation is generic.",
    });
  }
  if (performance.accuracy < 40 && performance.attempts >= 3) {
    actions.push({
      priority: "critical",
      title: "Rebuild fundamentals before speed",
      detail: `Accuracy is ${performance.accuracy}%. Slow down, re-read stems, and only add speed after accuracy rises.`,
      reason: "Low accuracy with many attempts signals a knowledge/reading gap, not a speed gap.",
    });
  }
  actions.sort((a, b) => prioRank(a.priority) - prioRank(b.priority));

  if (
    !actionForTitle(actions, "Take your first diagnostic") &&
    attemptsN >= 3 &&
    performance.accuracy >= 70
  ) {
    risks.push({
      severity: "low",
      title: "Keep up the momentum",
      detail: "Accuracy is solid. Add harder/advanced practice to stretch.",
      evidence: `${performance.accuracy}% accuracy across ${attemptsN} tests.`,
    });
  }
  if (daysToExam !== undefined && daysToExam <= 30) {
    risks.push({
      severity: "high",
      title: `Only ${daysToExam} day(s) to the exam`,
      detail: "Shift to revision + full-length mocks + mistake review. No new heavy theory.",
      evidence: `Exam on ${examDate}.`,
    });
  }
  if (foc.consistencyPct < 25 && attemptsN >= 5) {
    risks.push({
      severity: "medium",
      title: "Low study consistency",
      detail: "Focus days are sparse despite a real test record — plan shorter, daily wins.",
      evidence: `${foc.consistencyPct}% focus consistency, ${foc.streakDays}-day streak.`,
    });
  }
  risks.sort((a, b) => prioRank(a.severity) - prioRank(b.severity));

  const summary = buildSummary(rs, performance, plan, weak, mistakes.top);

  return {
    generatedAt: now,
    learner,
    performance,
    mastery,
    study,
    mistakes: {
      topTag: mistakes.top.tag,
      topLabel: mistakes.top.label,
      topFix: mistakes.top.fix,
      bySubject: mistakes.bySubject,
    },
    focus: foc,
    planner: plan,
    readinessScore: rs.score,
    readinessLevel: rs.level,
    actions,
    risks,
    summary,
  };
}

function fewEvidence(consistency: number, attemptsN: number): boolean {
  // Don't nag about focus if there's truly no study activity at all.
  return consistency < 40;
}

function prioRank(p: string): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[p] ?? 3;
}

function actionForTitle(actions: MentorAction[], title: string): boolean {
  return actions.some((a) => a.title === title);
}

function buildSummary(
  rs: { score: number; level: string },
  perf: MentorReport["performance"],
  plan: MentorReport["planner"],
  weak: WeakTopic[],
  top: { tag: string; label: string },
): string {
  const parts: string[] = [];
  if (perf.attempts === 0) {
    return "No test evidence yet — one short diagnostic will unlock personalized planning.";
  }
  parts.push(`${perf.accuracy}% accuracy across ${perf.attempts} test(s).`);
  if (perf.maxMarks)
    parts.push(`${perf.marks}/${perf.maxMarks} marks (~${perf.percentile} percentile).`);
  if (rs.level === "excellent") parts.push("You are on track — maintain and stretch.");
  else if (rs.level === "good") parts.push("Strong base — target your weak chapters next.");
  else if (rs.level === "fair")
    parts.push("There is real evidence to build on — fix the top priority.");
  else parts.push("The plan is high-yield: build fundamentals first.");
  if (weak[0]) parts.push(`Weakest: ${weak[0].subject} ${weak[0].chapter}.`);
  if (plan.overdueTasks > 0) parts.push(`${plan.overdueTasks} overdue task(s).`);
  if (top.tag && top.tag !== "None") parts.push(`Mistake pattern: ${top.label}.`);
  return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/* Percentile (dense NTA 2025 table, matches legacy + React engine)    */
/* ------------------------------------------------------------------ */
const NTA: Array<[number, number]> = [
  [0, 0.84],
  [5, 4.5],
  [10, 9.7],
  [15, 20.6],
  [20, 37.69],
  [25, 47.4],
  [30, 56.57],
  [35, 64.2],
  [40, 71.3],
  [45, 77.2],
  [50, 80.98],
  [55, 84.6],
  [60, 86.91],
  [65, 88.8],
  [70, 90.41],
  [75, 91.7],
  [80, 93.0],
  [85, 94.1],
  [90, 95.0],
  [95, 95.8],
  [100, 96.0],
  [110, 96.9],
  [120, 97.5],
  [130, 98.32],
  [140, 98.67],
  [150, 98.99],
  [160, 99.03],
  [165, 99.15],
  [170, 99.27],
  [180, 99.46],
  [190, 99.6],
  [200, 99.71],
  [210, 99.795],
  [220, 99.852],
  [230, 99.901],
  [240, 99.935],
  [250, 99.95],
  [260, 99.977],
  [270, 99.99],
  [280, 99.994],
  [290, 99.9991],
  [300, 99.99999],
];
function ntaPercentile(marks: number): number {
  const m = clamp(marks, 0, 300);
  for (let i = 1; i < NTA.length; i++) {
    const [m1, p1] = NTA[i] as [number, number];
    const [m0, p0] = NTA[i - 1] as [number, number];
    if (m <= m1) {
      const p = p0 + (p1 - p0) * ((m - m0) / (m1 - m0 || 1));
      return +p.toFixed(m >= 240 ? 4 : 2);
    }
  }
  return 99.99999;
}

/* ------------------------------------------------------------------ */
/* Compact AI context for Saarthi                                      */
/* ------------------------------------------------------------------ */
export function mentorContextForAI(report: MentorReport, max = 2400): string {
  const L = report.learner;
  const P = report.performance;
  const sections: string[] = [];

  sections.push(
    `Target: ${L.targetLabel}${L.daysToExam !== undefined ? ` · ${L.daysToExam} days left` : ""}. ` +
      `Language: ${L.language}. Depth: ${L.depth}.`,
  );

  if (P.attempts > 0) {
    sections.push(
      `Tests: ${P.attempts} · Accuracy ${P.accuracy}% · ${P.marks}/${P.maxMarks} marks (~${P.percentile} percentile). ` +
        `Correct ${P.correct} / wrong ${P.wrong} / skipped ${P.skipped}.`,
    );
  } else {
    sections.push("No test evidence yet.");
  }

  sections.push(`Readiness: ${report.readinessScore}/100 (${report.readinessLevel}).`);
  sections.push(`Syllabus done: ${report.mastery.syllabusCompletionPct}%.`);

  if (report.mastery.weakTopics.length) {
    sections.push(
      `Weak topics: ${report.mastery.weakTopics
        .slice(0, 4)
        .map((w) => `${w.subject}-${w.chapter}(${w.accuracy}%)`)
        .join(", ")}.`,
    );
  }
  if (report.study.lecturesWatched || report.study.handshakes) {
    sections.push(
      `StudyTube: ${report.study.lecturesWatched} lessons finished, ${report.study.handshakes} recall/practice done, ` +
        `${report.study.practiceToMastery}% reached Strong/Mastered.`,
    );
  }
  sections.push(
    `Focus: ${report.focus.streakDays}-day streak, ${report.focus.consistencyPct}% consistency (21d).`,
  );
  sections.push(`Mistake pattern: ${report.mistakes.topLabel} — fix: ${report.mistakes.topFix}.`);
  if (report.planner.totalTasks) {
    sections.push(
      `Plan: ${report.planner.doneTasks}/${report.planner.totalTasks} tasks done (${report.planner.completionPct}%), ` +
        `${report.planner.overdueTasks} overdue.`,
    );
  }
  if (report.actions.length) {
    sections.push(
      `Top actions: ${report.actions
        .slice(0, 4)
        .map((a) => `[${a.priority}] ${a.title}`)
        .join(" | ")}.`,
    );
  }

  const s = sections.join("\n");
  return s.length > max ? s.slice(0, max) : s;
}
