/**
 * Deterministic CBT grading + NTA percentile + analytics.
 * No network. Mirrors the verified legacy rules.
 */

import {
  MARK_CORRECT,
  MARK_WRONG,
  type CbtQuestion,
  type CbtResult,
  type CbtTest,
  type Subject,
  type SubjectResult,
} from "./types";

export const SUBJECTS: Subject[] = ["Physics", "Chemistry", "Mathematics"];

/** Exact NTA-style grading. `negMarking=false` disables MCQs penalty (practice/drill). */
export function isRight(q: CbtQuestion, ans: string | null | undefined): boolean {
  if (ans == null || ans === "") return false;
  if (q.type === "mcq") return String(ans).toLowerCase() === String(q.answer || "").toLowerCase();
  const a = parseFloat(String(ans).replace(/,/g, ""));
  if (!isFinite(a)) return false;
  const acc = q.accept as { kind?: string; lo?: number; hi?: number; vals?: number[] } | undefined;
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

function emptySubj(): SubjectResult {
  return {
    correct: 0,
    wrong: 0,
    skipped: 0,
    marks: 0,
    total: 0,
    time: 0,
    accuracy: 0,
    max: 0,
  };
}

export function evaluate(
  test: CbtTest,
  responses: Record<string, { ans: string | null; time: number }>,
  negMarking = true,
): CbtResult {
  const per: Record<Subject, SubjectResult> = {
    Physics: emptySubj(),
    Chemistry: emptySubj(),
    Mathematics: emptySubj(),
  };
  const all = {
    correct: 0,
    wrong: 0,
    skipped: 0,
    marks: 0,
    neg: 0,
    time: 0,
    total: test.questions.length,
    max: test.questions.length * MARK_CORRECT,
    accuracy: 0,
    percentage: 0,
  };

  for (const q of test.questions) {
    const p = (per[q.subject] = per[q.subject] || emptySubj());
    const r = responses[q.id] || { ans: null, time: 0 };
    const t = Math.max(0, Number(r.time) || 0);
    p.total++;
    p.time += t;
    all.time += t;

    if (r.ans == null || r.ans === "") {
      p.skipped++;
      all.skipped++;
      continue;
    }
    if (isRight(q, r.ans)) {
      p.correct++;
      all.correct++;
      p.marks += MARK_CORRECT;
      all.marks += MARK_CORRECT;
    } else {
      // NTA 2026: numerical/integer questions carry NO negative marking.
      const penalty = q.type === "integer" ? 0 : negMarking ? MARK_WRONG : 0;
      p.wrong++;
      all.wrong++;
      p.marks += penalty;
      all.marks += penalty;
      all.neg += Math.abs(penalty);
    }
  }

  const attempted = all.correct + all.wrong;
  all.accuracy = attempted ? round1((all.correct / attempted) * 100) : 0;
  all.percentage = all.total ? round1((all.marks / all.max) * 100) : 0;

  for (const s of SUBJECTS) {
    const p = per[s];
    const att = p.correct + p.wrong;
    p.accuracy = att ? round1((p.correct / att) * 100) : 0;
    p.max = p.total * MARK_CORRECT;
  }
  return { per, all };
}

/** Real NTA 2025 merged-session marks→percentile anchors. */
const NTA_ANCHORS: Array<[number, number]> = [
  [0, 0.84],
  [5, 4.5],
  [10, 9.7],
  [15, 20.6],
  [20, 37.69],
  [30, 56.57],
  [40, 71.3],
  [50, 80.98],
  [60, 86.91],
  [70, 90.41],
  [80, 93.0],
  [90, 95.0],
  [100, 96.0],
  [120, 97.5],
  [140, 98.67],
  [160, 99.03],
  [180, 99.46],
  [200, 99.71],
  [220, 99.852],
  [240, 99.935],
  [260, 99.977],
  [280, 99.994],
  [300, 99.99999],
];

export function ntaPercentile(marks: number): number {
  const m = Math.max(0, Math.min(300, marks));
  for (let i = 1; i < NTA_ANCHORS.length; i++) {
    const hi = NTA_ANCHORS[i];
    const lo = NTA_ANCHORS[i - 1];
    if (hi && lo && m <= hi[0]) {
      const p = lo[1] + (hi[1] - lo[1]) * ((m - lo[0]) / (hi[0] - lo[0] || 1));
      return round(m >= 240 ? p : p, m >= 240 ? 4 : 2);
    }
  }
  return 99.99999;
}

function round(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export { MARK_CORRECT, MARK_WRONG };
