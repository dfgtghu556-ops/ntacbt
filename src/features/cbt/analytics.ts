/**
 * Post-test analytics + Mistake Doctor.
 * Deterministic and evidence-based: time × accuracy classification,
 * subject/chapter/topic collapse, and (with qtags) mistake pattern detection.
 */

import type { CbtQuestion, CbtResult, CbtTest } from "./types";
import { isRight } from "./engine";

export type SpeedAccuracyClass =
  "fast-correct" | "slow-correct" | "fast-wrong" | "slow-wrong" | "wasted" | "lucky";

export interface QuestionInsight {
  questionId: string;
  subject: string;
  chapter?: string | undefined;
  topic?: string | undefined;
  answered: boolean;
  correct: boolean;
  time: number;
  idealTime: number;
  className: SpeedAccuracyClass;
  note: string;
}

/** Ideal time budget: total time / total questions (flat model, explainable). */
function idealTimeFor(test: CbtTest): number {
  return (test.durationSec || 10800) / Math.max(1, test.questions.length);
}

export function analyseQuestions(
  test: CbtTest,
  result: CbtResult,
  responses: Record<string, { ans: string | null; time: number }>,
): QuestionInsight[] {
  const ideal = idealTimeFor(test);
  const out: QuestionInsight[] = [];
  for (const q of test.questions) {
    const r = responses[q.id] || { ans: null, time: 0 };
    const time = Math.max(0, Number(r.time) || 0);
    const answered = r.ans != null && r.ans !== "";
    const correct = answered && isRight(q, r.ans);

    let className: SpeedAccuracyClass;
    let note: string;

    if (!answered) {
      if (time > ideal * 1.5) {
        className = "wasted";
        note =
          "Spent a long time and skipped — re-check the concept, then practice shorter decisions.";
      } else {
        className = "slow-correct"; // skipped; label handled by UI as "Skipped"
        note = "Skipped. Not answered — no marks lost, but review the topic before the next test.";
      }
    } else if (correct) {
      if (time <= ideal) {
        className = "fast-correct";
        note = "Fast and correct — target speed is on track.";
      } else {
        className = "slow-correct";
        note = "Correct but slow — the method works; tighten computation and formula recall.";
      }
    } else {
      if (time <= ideal * 0.5) {
        className = "lucky";
        note =
          "Very fast and wrong — likely a guess. On negative-marking MCQs, skipping is often better.";
      } else if (time <= ideal) {
        className = "fast-wrong";
        note = "Quick but wrong — check concept/formula; avoid rushing the last line.";
      } else {
        className = "slow-wrong";
        note = "Slow and wrong — the approach needs correction; this is the highest-leverage fix.";
      }
    }

    void result;
    out.push({
      questionId: q.id,
      subject: q.subject,
      chapter: q.chapter,
      topic: q.topic,
      answered,
      correct,
      time,
      idealTime: ideal,
      className,
      note,
    });
  }
  return out;
}

export interface TopicBreakdown {
  subject: string;
  chapter: string;
  topic: string;
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  time: number;
  accuracy: number;
}

export function topicBreakdown(test: CbtTest, insights: QuestionInsight[]): TopicBreakdown[] {
  const map = new Map<string, TopicBreakdown>();
  for (const q of test.questions) {
    const i = insights.find((x) => x.questionId === q.id);
    const key = `${q.subject}|${q.chapter || "—"}|${q.topic || "—"}`;
    const cur = map.get(key) || {
      subject: q.subject,
      chapter: q.chapter || "—",
      topic: q.topic || "—",
      total: 0,
      correct: 0,
      wrong: 0,
      skipped: 0,
      time: 0,
      accuracy: 0,
    };
    cur.total++;
    if (i?.correct) cur.correct++;
    else if (i?.answered) cur.wrong++;
    else cur.skipped++;
    cur.time += i?.time ?? 0;
    const attempted = cur.correct + cur.wrong;
    cur.accuracy = attempted ? Math.round((cur.correct / attempted) * 1000) / 10 : 0;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.accuracy - b.accuracy);
}

export interface MistakePattern {
  subject: string;
  tag: string;
  count: number;
  tests: number;
  label: string;
  fix: string;
  /** "qtag" = supplied/known, "heuristic" = derived from question text, never treated as verified. */
  source: "qtag" | "heuristic";
}

export interface MistakeDoctorResult {
  pattern: MistakePattern | null;
  topClasses: { className: SpeedAccuracyClass; count: number }[];
}

const KEYWORD_TAGS: Array<[RegExp, string]> = [
  [/not |false|except|incorrect|wrong|which of the following is (not|false)/i, "misread"],
  [
    /find (the )?(value|number)|calculate|evaluate|compute|solve|value of|what is the value|∫|d\/dx|sin|cos|tan|log|√/i,
    "calculation",
  ],
  [/formula|theorem|law|equation|relation|property|principle/i, "formula"],
  [/guess|estimate|approximately|closest|nearest/i, "guessed"],
];

/** Conservative heuristic tag for papers that don't ship a verified qtag list.
 *  Purpose: give the Mistake Doctor *suggested* clusters, never verified certainty. */
export function inferTag(q: CbtQuestion): string | null {
  const hay = `${q.text} ${q.sol || ""}`;
  for (const [re, tag] of KEYWORD_TAGS) {
    if (re.test(hay)) return tag;
  }
  return null;
}

const TAG_META: Record<string, { label: string; fix: string }> = {
  concept: {
    label: "🧠 Concept gap",
    fix: "Revise theory first, then attempt — not the other way around.",
  },
  formula: {
    label: "📐 Formula bhool",
    fix: "Build a formula sheet for the chapter and review 2 minutes daily.",
  },
  calculation: {
    label: "🔢 Calculation slip",
    fix: "Write rough work in two columns; check the final line once more.",
  },
  misread: {
    label: "👀 Misread question",
    fix: "Read the stem once again before locking an answer.",
  },
  silly: {
    label: "🤦 Silly mistake",
    fix: "Slow down 10% — accuracy pays more than raw speed.",
  },
  guessed: {
    label: "🎲 Guessed",
    fix: "If 3+ options confuse you, skip — negative marking eats guesses.",
  },
};

/** Mistake doctor: strongest (subject × tag) cluster from this test, plus
 *  time×accuracy class histogram. Tolerant of missing tags. */
export function mistakeDoctor(
  insights: QuestionInsight[],
  items: Array<{ q: CbtQuestion }> = [],
): MistakeDoctorResult {
  const counts = new Map<SpeedAccuracyClass, number>();
  const cell = new Map<string, { n: number; subject: string; tag: string; heuristic: boolean }>();
  for (const i of insights) {
    const c = (counts.get(i.className) || 0) + 1;
    counts.set(i.className, c);
    if (i.answered && !i.correct) {
      const item = items.find((x) => x.q.id === i.questionId);
      const q = item?.q;
      let tag: string | null = q?.tag || null;
      let heuristic = false;
      if (!tag && q) {
        tag = inferTag(q);
        heuristic = tag !== null;
      }
      if (!tag) tag = "concept";
      const key = `${i.subject}|${tag}`;
      const cur = cell.get(key) || { n: 0, subject: i.subject, tag, heuristic };
      cur.n++;
      // If a verified tag exists for this cell, prefer it over a heuristic-only one.
      if (!q?.tag && !cur.heuristic) cur.heuristic = heuristic;
      cell.set(key, cur);
    }
  }

  let pattern: MistakePattern | null = null;
  let best: { n: number; subject: string; tag: string; heuristic: boolean } | undefined;
  for (const v of cell.values()) if (!best || v.n > best.n) best = v;
  if (best && best.n >= 3) {
    const meta = TAG_META[best.tag] || { label: best.tag, fix: "Review the concept and re-test." };
    pattern = {
      subject: best.subject,
      tag: best.tag,
      count: best.n,
      tests: 1,
      label: meta.label,
      fix: meta.fix,
      source: best.heuristic ? "heuristic" : "qtag",
    };
  }

  const topClasses = [...counts.entries()]
    .map(([className, count]) => ({ className, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { pattern, topClasses };
}

export function classLabel(className: SpeedAccuracyClass | string): string {
  const map: Record<string, string> = {
    "fast-correct": "Fast + Correct",
    "slow-correct": "Slow + Correct",
    "fast-wrong": "Fast + Wrong",
    "slow-wrong": "Slow + Wrong",
    wasted: "Wasted Time",
    lucky: "Lucky Guess",
  };
  return map[className] ?? className;
}

export type { CbtQuestion };
