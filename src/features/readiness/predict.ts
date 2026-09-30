/**
 * NTACBT Rank / College Predictor ("Mock → Reality").
 *
 * Turns a mock score into a clearly-labelled **ESTIMATE**: percentile → rank →
 * college band, with the evidence behind every number and an explicit
 * "not enough data to estimate reliably" fallback.
 *
 * ## What is verified and what is not
 *
 * The **percentile** is computed from the NTA marks→percentile table
 * (`SOURCE_RECORDS.NTA_PERCENTILE`, verified). The **rank** is
 * `candidates × (100 − percentile) / 100` using a rounded public candidate
 * count (`SOURCE_RECORDS.JEE_CANDIDATE_COUNT`, **provisional**). The **college
 * band** is a coarse evidence-based band, not a seat prediction.
 *
 * So the percentile is the trustworthy number; the rank and the band are
 * labelled estimates derived from a provisional figure. `evidence` on the result
 * says exactly which is which, and the UI must show it.
 *
 * ## What this deliberately does NOT do
 *
 * - It never promises a seat, a college or a cut-off.
 * - It never converts a JEE *Main* percentile into an Advanced outcome — that is
 *   cross-exam inference and the two are different exams with different scales.
 * - It never promises a specific mark gain.
 * - It never produces a confident rank from a thin sample. One attempt at 5/300
 *   is noise, not a signal: `reliable` is false and the UI shows the fallback.
 */

import { ntaPercentile } from "../cbt/engine";
import { SOURCE_RECORDS, describeSource, isVerifiedStatus, type Source } from "../academics/source";

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
  /** How many attempts the average is drawn from. Drives reliability. */
  attempts?: number;
}

/** How much we trust the number, given the sample behind it. */
export type EstimateConfidence = "insufficient" | "low" | "medium" | "high";

export interface EstimateEvidence {
  /** The verified NTA table behind the percentile. */
  percentileSource: Source;
  /** The provisional candidate count behind the rank. */
  rankSource: Source;
  /** How many attempts the figure is drawn from. */
  attempts: number;
  /** True when the percentile itself is from a verified table. */
  percentileVerified: boolean;
  /** True when the rank's candidate count is only a rounded public figure. */
  rankIsProvisional: boolean;
}

export interface RankPrediction {
  marks: number;
  maxMarks: number;
  percentile: number;
  /** Approximate All-India Rank. An ESTIMATE — see `evidence.rankIsProvisional`. */
  rank: number;
  /** Coarse evidence-based college band. Not a seat prediction. */
  tier: string;
  /** Honest one-line framing. */
  expectation: string;
  /** The single highest-leverage fix, derived from the evidence. */
  topFix: string;
  /** Proof: how this number was derived, in one line. */
  basis: string;
  /**
   * False when the sample is too thin to say anything. When false the UI must
   * show `fallback` instead of the rank — never a confident number from noise.
   */
  reliable: boolean;
  /** How much to trust the figure. */
  confidence: EstimateConfidence;
  /** The sources behind each part of the number. */
  evidence: EstimateEvidence;
  /** Shown instead of the rank when `reliable` is false. */
  fallback: string;
}

/** Below this many attempts the figure is noise, not a signal. */
export const MIN_RELIABLE_ATTEMPTS = 2;

/** Below this fraction of the paper attempted there is nothing to rank. */
const MIN_COVERAGE = 0.15;

/**
 * Rounded public candidate count. Recorded as `provisional` on purpose: it is a
 * reported figure, not an NTA-published one, and the rank it produces inherits
 * that uncertainty.
 */
const JEE_CANDIDATES = 1_400_000;

/**
 * Approximate AIR from JEE Main percentile: rank ≈ N × (100 − p)/100.
 * An ESTIMATE. Never presented as precise.
 */
function rankFromPercentile(percentile: number, candidates = JEE_CANDIDATES): number {
  const p = Math.max(0, Math.min(100, percentile));
  return Math.max(1, Math.round((candidates * (100 - p)) / 100));
}

/** How many attempts before the figure stops being noise. */
function confidenceFor(attempts: number): EstimateConfidence {
  if (attempts < MIN_RELIABLE_ATTEMPTS) return "insufficient";
  if (attempts < 3) return "low";
  if (attempts < 6) return "medium";
  return "high";
}

/**
 * A coarse, evidence-based band. Deliberately about *bands*, never about named
 * colleges or seats: a percentile is not an admission outcome, and branch
 * cut-offs move every year.
 */
function bandFor(percentile: number, target?: string): string {
  if (target === "jeeadv") {
    // A JEE Main percentile cannot clear an Advanced cut. Say so instead of
    // inventing a cross-exam inference.
    return "Advanced needs its own qualifying data — a Main percentile does not map to an Advanced outcome. Take an Advanced-level mock to estimate this band.";
  }
  if (percentile >= 99.9) return "Top-percentile band (roughly the top 1 in 1,000 candidates).";
  if (percentile >= 99.5)
    return "Very high band (top ~0.5%) — the range where IIT branches open up.";
  if (percentile >= 98.5) return "High band (top ~1.5%) — competitive for NITs and top IIITs.";
  if (percentile >= 96) return "Strong band (top ~4%) — NIT and IIIT branches are in range.";
  if (percentile >= 92) return "Good band (top ~8%) — NIT, GFTI and strong state options.";
  if (percentile >= 85)
    return "Solid band (top ~15%) — state-government and tier-1 private options.";
  return "Foundation band — the climbable range. The plan below is where the gains are.";
}

/**
 * The one thing to fix. Deliberately gives a DIRECTION, never a promised mark
 * gain: "add ~12 marks" is a hard prediction this product has no basis for.
 */
function topFixFrom(
  accuracy: number,
  weakTopics: Array<{ subject: string; chapter: string }>,
): string {
  if (weakTopics.length > 0) {
    const w = weakTopics[0] as { subject: string; chapter: string };
    return `Your biggest mark-leak is ${w.subject} — ${w.chapter}. A 10-question PYQ drill there is the highest-leverage next step.`;
  }
  if (accuracy < 60) {
    return "Accuracy is the leak. Attempt fewer questions but verify every step — that converts skipped and wrong attempts into real marks.";
  }
  return "You're accurate. The next marks come from speed and attempt-count — do timed sectionals and cut silly mistakes.";
}

function expectationFor(percentile: number, reliable: boolean): string {
  if (!reliable) {
    return "Too little data to read anything into this score yet. Take another full paper and this panel will have something honest to say.";
  }
  if (percentile >= 99) {
    return "This score sits in a very strong percentile band. Holding that consistency is the whole job from here.";
  } else if (percentile >= 95) {
    return "This is a genuinely good score. Focused weak-topic work is what moves it further.";
  } else if (percentile >= 85) {
    return "You're in a solid, climbable band. One weak-subject fix usually moves this meaningfully.";
  }
  return "You're early in the climb — that's normal and completely fixable. Don't read today's band as your ceiling.";
}

export function predictRank(input: PredictorInput): RankPrediction {
  const maxMarks = input.maxMarks ?? 300;
  const marks = Math.max(0, Math.min(maxMarks, input.marks));
  const attempts = Math.max(0, Math.floor(input.attempts ?? 0));
  const percentile = ntaPercentile(maxMarks === 300 ? marks : (marks / maxMarks) * 300);
  const rank = rankFromPercentile(percentile);
  const confidence = confidenceFor(attempts);

  // Reliability needs BOTH a sample and coverage: one attempt at 5/300 tells us
  // nothing, and so does a 90/300 that only attempted a third of the paper.
  const coverage = maxMarks > 0 ? marks / maxMarks : 0;
  const reliable = attempts >= MIN_RELIABLE_ATTEMPTS && coverage >= MIN_COVERAGE;

  const daysNote =
    typeof input.daysToExam === "number" && input.daysToExam >= 0
      ? ` ${input.daysToExam} days to the exam.`
      : "";

  const basis = reliable
    ? `Percentile from the verified NTA marks→percentile table (${describeSource(
        SOURCE_RECORDS.NTA_PERCENTILE,
      )}). Rank ≈ AIR using ~${Math.round(JEE_CANDIDATES / 100_000)} lakh candidates — a rounded public figure, so the rank is an estimate, not a published value.${daysNote} Based on ${attempts} attempt${attempts === 1 ? "" : "s"}.`
    : `Percentile from the verified NTA marks→percentile table. Rank and band are withheld until there is enough data to estimate reliably (need at least ${MIN_RELIABLE_ATTEMPTS} attempts and a reasonable share of the paper attempted).${daysNote}`;

  const evidence: EstimateEvidence = {
    percentileSource: SOURCE_RECORDS.NTA_PERCENTILE,
    rankSource: SOURCE_RECORDS.JEE_CANDIDATE_COUNT,
    attempts,
    percentileVerified: isVerifiedStatus(SOURCE_RECORDS.NTA_PERCENTILE.verificationStatus),
    rankIsProvisional: !isVerifiedStatus(SOURCE_RECORDS.JEE_CANDIDATE_COUNT.verificationStatus),
  };

  return {
    marks,
    maxMarks,
    percentile,
    rank: reliable ? rank : 0,
    tier: reliable ? bandFor(percentile, input.target) : "",
    expectation: expectationFor(percentile, reliable),
    topFix: topFixFrom(input.accuracy ?? 0, input.weakTopics ?? []),
    basis,
    reliable,
    confidence,
    evidence,
    fallback: reliable
      ? ""
      : attempts < MIN_RELIABLE_ATTEMPTS
        ? `Not enough data to estimate reliably — this is based on ${attempts} attempt${attempts === 1 ? "" : "s"}. Take ${MIN_RELIABLE_ATTEMPTS - attempts} more full paper${MIN_RELIABLE_ATTEMPTS - attempts === 1 ? "" : "s"} and the estimate will appear here.`
        : "Not enough of this paper was attempted to estimate a rank reliably. Attempt more of the paper, then this panel will fill in.",
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
  const input: PredictorInput = {
    marks: t.marks,
    maxMarks: t.max,
    accuracy: t.max ? Math.round((t.marks / t.max) * 100) : 0,
    weakTopics,
    attempts: t.attempts,
  };
  if (target) input.target = target;
  return predictRank(input);
}
