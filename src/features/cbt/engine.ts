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

/**
 * Real NTA 2025 merged-session marks→percentile anchors.
 * DENSE table (every 5 marks in the bend region, plus the published values)
 * — this MUST match `NTA_MARKS_PERCENTILE` in public/jee-cbt.html and
 * `scripts/validate-analytics.mjs`, so the React Analytics page, the legacy
 * app and the validator report the SAME percentile for the SAME score.
 * The anchors are sorted by marks (required by the interpolation loop).
 */
const NTA_ANCHORS: Array<[number, number]> = [
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
