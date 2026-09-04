/**
 * Mistake-Doctor bridge for the legacy store.
 *
 * `analyseQuestions` in analytics.ts is designed for the React CBT runtime.
 * This module derives the same `MistakePattern` directly from the versioned
 * legacy store (only submissions with real results), so the dashboard and
 * micro-drill surfaces can be mistake-aware without a running test session.
 */

import type { DataStore } from "../../lib/store";
import type { CbtQuestion } from "./types";
import type { MistakePattern } from "./analytics";
import { inferTag } from "./analytics";

/** Count wrong answers per (subject × tag) across all submitted tests and
 *  return the strongest cluster (≥3 wrong) as a MistakePattern. */
export function mistakeFromStore(store: DataStore): MistakePattern | null {
  const cell = new Map<string, { n: number; subject: string; tag: string; heuristic: boolean }>();
  // Count wrong answers per (subject × tag) across all submitted tests.
  for (const test of store.tests) {
    const attempts = store.attempts.filter((a) => a.testId === test.id && a.result);
    if (!attempts.length) continue;
    for (const a of attempts) {
      const responses = a.responses ?? {};
      for (const q of test.questions || []) {
        const r = responses[q.id];
        if (!r || r.ans === null || r.ans === "") continue;
        if (isCorrectLegacy(q, r.ans)) continue; // only wrong answers count
        // The legacy question shape has no verified tag, so we always derive a
        // conservative heuristic cluster (never treated as verified certainty).
        const tag = inferTag(q as unknown as CbtQuestion) ?? "concept";
        const key = `${q.subject}|${tag}`;
        const cur = cell.get(key) || { n: 0, subject: q.subject, tag, heuristic: true };
        cur.n++;
        cell.set(key, cur);
      }
    }
  }

  let best: { n: number; subject: string; tag: string; heuristic: boolean } | undefined;
  for (const v of cell.values()) if (!best || v.n > best.n) best = v;
  if (!best || best.n < 3) return null;

  const meta = TAG_META[best.tag] || { label: best.tag, fix: "Review the concept and re-test." };
  return {
    subject: best.subject,
    tag: best.tag,
    count: best.n,
    tests: 1,
    label: meta.label,
    fix: meta.fix,
    source: best.heuristic ? "heuristic" : "qtag",
  };
}

const TAG_META: Record<string, { label: string; fix: string }> = {
  concept: { label: "Concept gap", fix: "Revise theory first, then attempt — not the other way around." },
  formula: { label: "Formula recall", fix: "Build a formula sheet for the chapter and review 2 minutes daily." },
  calculation: { label: "Calculation slip", fix: "Write rough work in two columns; check the final line once more." },
  misread: { label: "Misread question", fix: "Read the stem once again before locking an answer." },
  silly: { label: "Silly mistake", fix: "Slow down 10% — accuracy pays more than raw speed." },
  guessed: { label: "Guessed", fix: "If 3+ options confuse you, skip — negative marking eats guesses." },
};

/** Mirror of the readiness/engine NTA grading so we don't create a circular
 *  dependency into the CBT engine. Verified against the same rules. */
function isCorrectLegacy(
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
