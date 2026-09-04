/**
 * NTACBT Rank / College Predictor ("Mock → Reality").
 *
 * Turns a mock score (or the student's current average) into an HONEST,
 * explainable prediction: percentile → JEE rank → expected college tier
 * (IIT/NIT/IIIT/State), plus an exact "what to fix" list. This reuses the
 * SAME verified NTA marks→percentile anchors as the React analytics and the
 * legacy app, so a number shown here always matches the rest of the platform.
 *
 * It never lies and never promises a guaranteed seat — it reports the
 * evidence-based expectation and the one thing to improve, which is what turns
 * the "low mock = I'll fail" fear into a plan.
 */

import { ntaPercentile } from "../cbt/engine";

export interface PredictorInput {
  /** Total marks in a 300-mark full test (or an average you want to predict). */
  marks: number;
  /** Best possible in that test (default 300 for a full JEE Main paper). */
  maxMarks?: number;
  /** Optional exam target to adjust messaging (jeemain | jeeadv). */
  target?: string;
  /** Round-ish difficulty for the "what to fix" tone. */
  accuracy?: number;
  weakTopics?: Array<{ subject: string; chapter: string }>;
  /** Days until the actual exam (optional, for urgency framing). */
  daysToExam?: number;
}

export interface RankPrediction {
  marks: number;
  maxMarks: number;
  percentile: number;
  /** Approximate All-India Rank for JEE Main (based on published seat math). */
  rank: number;
  /** Expected college tier band. */
  tier: string;
  /** Honest one-line expectation — never a guaranteed-seat promise. */
  expectation: string;
  /** The single highest-leverage fix, derived from the evidence. */
  topFix: string;
  /** Proof: how this number was derived. */
  basis: string;
}

/**
 * Approximate AIR from JEE Main percentile. This is the widely-reported
 * "percentile → rank" curve for ~1.2–1.4M candidates (rank ≈ N × (100−p)/100).
 * It is an ESTIMATE, clearly labelled, never a pretend-precise figure.
 */
function rankFromPercentile(percentile: number, candidates = 14_00_000): number {
  const p = Math.max(0, Math.min(100, percentile));
  return Math.max(1, Math.round(candidates * (100 - p) / 100));
}

/** Expected college tier for a JEE Main percentile (evidence-based band). */
function tierFor(percentile: number, target?: string): string {
  if (target === "jeeadv") {
    return percentile >= 99.5
      ? "IIT (Advanced-clear zone) — you're regularly clearing the Advanced cut."
      : percentile >= 98.5
        ? "Strong NIT / IIIT / possible Advanced cut — keep pushing for a safe IIT band."
        : "Good NIT / IIIT band — target the top-IIIT marks with 30 more days of PYQs.";
  }
  if (percentile >= 99.9) return "Top IIT zone (CS/EE possible) — this is a top-1k band.";
  if (percentile >= 99.5) return "IIT zone (most branches) — consistently above the old IIT cut.";
  if (percentile >= 98.5) return "Old IIT / top NIT zone — NIT CSE, top IIITs are realistic.";
  if (percentile >= 96) return "Strong NIT / IIIT band — NIT CSE/ECE and top-IIIT branches.";
  if (percentile >= 92) return "Good NIT / state-government engineering — NIT branches, GFTIs.";
  if (percentile >= 85) return "Solid state / private tier-1 — NITs outside the top circle, IIIT state branches.";
  return "Foundation band — this is a strong target to lift; the plan below gets you up fast.";
}

function topFixFrom(accuracy: number, weakTopics: Array<{ subject: string; chapter: string }>): string {
  if (weakTopics.length > 0) {
    const w = weakTopics[0] as { subject: string; chapter: string };
    return `Your biggest mark-leak is ${w.subject} — ${w.chapter}. Do a 10-question PYQ drill there and add ~${Math.max(5, Math.round((100 - accuracy) / 6))} marks.`;
  }
  if (accuracy < 60) {
    return "Accuracy is the leak. Attempt fewer questions but verify every step — that converts skipped + wrong into real marks.";
  }
  return "You're accurate. The next marks come from speed and attempt-count — do timed sectionals and cut silly mistakes.";
}

export function predictRank(input: PredictorInput): RankPrediction {
  const maxMarks = input.maxMarks ?? 300;
  const marks = Math.max(0, Math.min(maxMarks, input.marks));
  const percentile = ntaPercentile(maxMarks === 300 ? marks : (marks / maxMarks) * 300);
  const rank = rankFromPercentile(percentile);

  // Honest, never-negative expectation framing.
  const expectation =
    percentile >= 99
      ? "This score sits in a very strong percentile. A top college is realistic if you hold consistency — you're in contention, not chasing."
      : percentile >= 95
        ? "This is a genuinely good score. A strong NIT/IIIT or an IIT on a great day is achievable with focused weak-topic work."
        : percentile >= 85
          ? "You're in a solid, climbable band. With one weak-subject fix and more attempt-accuracy, expect a meaningful jump this month."
          : "You're early in the climb — that's normal and completely fixable. The plan below lifts this score fast; don't read rank today as your ceiling.";

  const topFix = topFixFrom(input.accuracy ?? 0, input.weakTopics ?? []);
  const daysNote =
    typeof input.daysToExam === "number" && input.daysToExam >= 0
      ? `· ${input.daysToExam} days to the exam.`
      : "";

  return {
    marks,
    maxMarks,
    percentile,
    rank,
    tier: tierFor(percentile, input.target),
    expectation,
    topFix,
    basis: `Percentile computed from the verified NTA marks→percentile table. Rank ≈ AIR using ~14 lakh candidates (${marks}/${maxMarks} → ~${percentile}%ile → ~AIR ${rank}). ${daysNote} This is an estimate, not a guarantee.`,
  };
}

/** Convenience: predict from the student's actual attempts (best or average). */
export function predictFromStore(
  store: { totals: () => { marks: number; max: number; attempts: number } },
  weakTopics: Array<{ subject: string; chapter: string }>,
  target?: string,
): RankPrediction | null {
  const t = store.totals();
  if (!t.attempts || t.max === 0) return null;
  const marks = t.marks;
  const input: PredictorInput = {
    marks,
    maxMarks: t.max,
    accuracy: t.max ? Math.round((t.marks / t.max) * 100) : 0,
    weakTopics,
  };
  if (target) input.target = target;
  return predictRank(input);
}
