/**
 * Chapter/topic mastery — the learning loop, in one store.
 *
 * **The gap this closes.** Mastery was tracked in three places that never
 * spoke to each other:
 *
 *   - `readiness.ts` derived per-chapter accuracy from CBT attempts alone,
 *   - `studytube/progress.ts` tracked mastery **per video** (keyed on
 *     `videoId`), so finishing an Electrostatics lecture never moved the
 *     Electrostatics chapter,
 *   - the mentor report showed video counts and chapter accuracy side by side
 *     but never in the same row.
 *
 * So "videos done" and "PYQs attempted" and "accuracy" for the *same chapter*
 * could not be answered, which is the one question the combined report exists
 * to answer.
 *
 * **The contract.** One pure function over three evidence feeds — test
 * attempts (CBT and PYQ papers are both `CbtTest`s), watched-lesson handshakes,
 * and the planner's completion state — producing one record per chapter with
 * its evidence attached. Nothing here invents a number: a chapter with no
 * evidence reports `state: "No evidence"` rather than a flattering default.
 *
 * This is **derived state**, recomputed from the stores rather than persisted,
 * so it can never drift from the attempts that produced it.
 */

/** A watched lesson, mapped onto the chapter it teaches. */
export interface LessonEvidence {
  /** The StudyTube video id, for traceability. */
  videoId: string;
  subject: string;
  chapter: string;
  topic?: string | undefined;
  /** True when the student marked the lecture finished. */
  finished: boolean;
  /** Active-recall self-score 0–5, when recorded. */
  recall: number | null;
  /** Targeted practice questions completed, when recorded. */
  practice: number | null;
  /** When the lesson was last touched. */
  updatedAt: number;
}

/** One attempted question, mapped onto the chapter it tests. */
export interface AttemptEvidence {
  subject: string;
  chapter: string;
  topic?: string | undefined;
  correct: boolean;
  /** True when the attempt came from a previous-year paper. */
  pyq: boolean;
  attemptedAt: number;
}

/** What the student actually knows about a chapter. Never a guess. */
export type MasteryState = "No evidence" | "Learning" | "Improving" | "Strong" | "Mastered";

export interface ChapterMastery {
  subject: string;
  chapter: string;
  /** Accuracy over every attempted question in the chapter, 0–100. */
  accuracy: number;
  /** Questions attempted across tests and PYQ papers. */
  attempts: number;
  correct: number;
  /** Attempts that came from previous-year papers. */
  pyqAttempts: number;
  /** Lectures the student marked finished. */
  lessonsFinished: number;
  /** Lessons touched at all (started or bookmarked as done). */
  lessonsStarted: number;
  /** Mean active-recall self-score across finished lessons, 0–5, or null. */
  recall: number | null;
  /** Total targeted practice questions completed after lessons. */
  practiceDone: number;
  /** Epoch ms of the most recent evidence, or 0 when there is none. */
  lastActivityAt: number;
  state: MasteryState;
  /**
   * 0–100, derived from accuracy and volume. `null` when there is no evidence,
   * because a chapter nobody has touched has no score — not a score of zero.
   */
  score: number | null;
  /** Why the state is what it is, in one line, for the UI. */
  reason: string;
  /** The single next action for this chapter. */
  nextAction: string;
}

/** Below this accuracy a chapter is a leak, not a strength. */
export const WEAK_ACCURACY = 50;
/** Below this many attempts an accuracy figure is noise. */
export const MIN_SAMPLE = 3;

function chapterKey(subject: string, chapter: string): string {
  return `${subject}|${chapter}`;
}

/** Accuracy over a sample, or `null` when the sample is too small to trust. */
function accuracyOrNull(correct: number, attempted: number): number | null {
  if (attempted < MIN_SAMPLE) return null;
  return Math.round((correct / attempted) * 1000) / 10;
}

/**
 * Mastery state from the evidence. Deliberately conservative: a chapter needs
 * BOTH question accuracy and finished lessons before it is called anything
 * better than "Learning", and a thin sample never reaches "Mastered".
 */
function stateFor(m: Omit<ChapterMastery, "state" | "score" | "reason" | "nextAction">): {
  state: MasteryState;
  reason: string;
} {
  const acc = m.accuracy;
  if (m.attempts === 0 && m.lessonsStarted === 0) {
    return { state: "No evidence", reason: "Nothing attempted or watched in this chapter yet." };
  }
  if (m.attempts === 0) {
    return {
      state: "Learning",
      reason: `${m.lessonsFinished} lecture${m.lessonsFinished === 1 ? "" : "s"} watched, no questions attempted yet.`,
    };
  }
  if (m.attempts < MIN_SAMPLE) {
    return {
      state: "Learning",
      reason: `Only ${m.attempts} question${m.attempts === 1 ? "" : "s"} attempted — too few to judge accuracy.`,
    };
  }
  if (acc < WEAK_ACCURACY) {
    return {
      state: "Learning",
      reason: `${m.correct}/${m.attempts} correct (${acc}%) — below the ${WEAK_ACCURACY}% line.`,
    };
  }
  if (acc >= 85 && m.lessonsFinished >= 2 && m.attempts >= 8) {
    return {
      state: "Mastered",
      reason: `${acc}% over ${m.attempts} questions with ${m.lessonsFinished} lectures done.`,
    };
  }
  if (acc >= 70) {
    return {
      state: "Strong",
      reason: `${acc}% over ${m.attempts} questions.`,
    };
  }
  return { state: "Improving", reason: `${acc}% over ${m.attempts} questions — climbing.` };
}

/** The one next action, chosen from the weakest signal. */
function nextActionFor(
  m: Omit<ChapterMastery, "state" | "score" | "reason" | "nextAction">,
): string {
  if (m.attempts === 0 && m.lessonsStarted === 0)
    return "Start here: one lecture, then a 5-question drill.";
  if (m.attempts === 0) return "Watch it — now attempt questions so accuracy is measured.";
  if (m.attempts < MIN_SAMPLE) return "Attempt more questions so the accuracy is meaningful.";
  if (m.accuracy < WEAK_ACCURACY) return "Re-teach from the lecture, then re-drill this chapter.";
  if (m.accuracy < 70) return "Drill the missed questions here until accuracy clears 70%.";
  if (m.pyqAttempts === 0) return "Strong now — sit a previous-year paper on this chapter.";
  return "Keep it warm with a short weekly PYQ set.";
}

/**
 * Build the mastery map. Pure: same inputs, same output, no storage, no clock
 * read (callers pass `now`). Ordering is deterministic so the UI is stable.
 */
export function buildMastery(input: {
  attempts: AttemptEvidence[];
  lessons: LessonEvidence[];
}): Map<string, ChapterMastery> {
  const rows = new Map<
    string,
    {
      subject: string;
      chapter: string;
      correct: number;
      attempts: number;
      pyqAttempts: number;
      lessonsFinished: number;
      lessonsStarted: number;
      recallSum: number;
      recallCount: number;
      practiceDone: number;
      lastActivityAt: number;
    }
  >();

  const rowFor = (subject: string, chapter: string) => {
    const key = chapterKey(subject, chapter);
    let row = rows.get(key);
    if (!row) {
      row = {
        subject,
        chapter,
        correct: 0,
        attempts: 0,
        pyqAttempts: 0,
        lessonsFinished: 0,
        lessonsStarted: 0,
        recallSum: 0,
        recallCount: 0,
        practiceDone: 0,
        lastActivityAt: 0,
      };
      rows.set(key, row);
    }
    return row;
  };

  for (const a of input.attempts) {
    if (!a.subject || !a.chapter) continue;
    const row = rowFor(a.subject, a.chapter);
    row.attempts += 1;
    if (a.correct) row.correct += 1;
    if (a.pyq) row.pyqAttempts += 1;
    if (a.attemptedAt > row.lastActivityAt) row.lastActivityAt = a.attemptedAt;
  }

  for (const l of input.lessons) {
    if (!l.subject || !l.chapter) continue;
    const row = rowFor(l.subject, l.chapter);
    row.lessonsStarted += 1;
    if (l.finished) row.lessonsFinished += 1;
    if (typeof l.recall === "number") {
      row.recallSum += l.recall;
      row.recallCount += 1;
    }
    if (typeof l.practice === "number") row.practiceDone += l.practice;
    if (l.updatedAt > row.lastActivityAt) row.lastActivityAt = l.updatedAt;
  }

  const out = new Map<string, ChapterMastery>();
  for (const [key, row] of rows) {
    const acc = accuracyOrNull(row.correct, row.attempts);
    const base = {
      subject: row.subject,
      chapter: row.chapter,
      // Reported accuracy is the raw ratio when there IS a sample; below the
      // minimum sample it still shows the ratio but the state says it is thin.
      accuracy: row.attempts ? Math.round((row.correct / row.attempts) * 1000) / 10 : 0,
      attempts: row.attempts,
      correct: row.correct,
      pyqAttempts: row.pyqAttempts,
      lessonsFinished: row.lessonsFinished,
      lessonsStarted: row.lessonsStarted,
      recall: row.recallCount ? Math.round((row.recallSum / row.recallCount) * 10) / 10 : null,
      practiceDone: row.practiceDone,
      lastActivityAt: row.lastActivityAt,
    };
    const { state, reason } = stateFor(base);
    const withState = { ...base, state };
    out.set(key, {
      ...withState,
      score: acc === null ? null : acc,
      reason,
      nextAction: nextActionFor(base),
    });
  }
  return out;
}

/**
 * The chapters worth acting on, weakest first.
 *
 * Four bands, in order of how much they need attention:
 *
 *   1. weak      — enough attempts to judge, and below the line
 *   2. thin      — 1–2 attempts: real evidence, not enough to judge. These used
 *                  to fall through every bucket and vanish from the report,
 *                  because `weak` needs >= MIN_SAMPLE and `untouched` needs 0.
 *   3. untouched — nothing attempted at all
 *   4. rest      — judged and above the line
 *
 * A chapter with no evidence is never ranked as "weak": nobody has tried it,
 * which is a different problem from trying and failing.
 */
export function priorityChapters(
  mastery: Map<string, ChapterMastery>,
  limit = 5,
): ChapterMastery[] {
  const all = [...mastery.values()];
  const weak = all
    .filter((m) => m.attempts >= MIN_SAMPLE && m.accuracy < WEAK_ACCURACY)
    .sort((a, b) => a.accuracy - b.accuracy || a.chapter.localeCompare(b.chapter));
  const thin = all
    .filter((m) => m.attempts > 0 && m.attempts < MIN_SAMPLE)
    .sort((a, b) => b.attempts - a.attempts || a.chapter.localeCompare(b.chapter));
  const untouched = all
    .filter((m) => m.attempts === 0)
    .sort((a, b) => b.lessonsStarted - a.lessonsStarted || a.chapter.localeCompare(b.chapter));
  const rest = all
    .filter((m) => m.attempts >= MIN_SAMPLE && m.accuracy >= WEAK_ACCURACY)
    .sort((a, b) => a.accuracy - b.accuracy || a.chapter.localeCompare(b.chapter));
  return [...weak, ...thin, ...untouched, ...rest].slice(0, limit);
}

/** The combined per-chapter row the report renders. */
export interface PreparationRow {
  subject: string;
  chapter: string;
  state: MasteryState;
  accuracy: number | null;
  attempts: number;
  pyqAttempts: number;
  lessonsFinished: number;
  score: number | null;
  reason: string;
  nextAction: string;
  lastActivityAt: number;
}

export function preparationRows(
  mastery: Map<string, ChapterMastery>,
  limit = 12,
): PreparationRow[] {
  return priorityChapters(mastery, limit).map((m) => ({
    subject: m.subject,
    chapter: m.chapter,
    state: m.state,
    accuracy: m.attempts >= MIN_SAMPLE ? m.accuracy : null,
    attempts: m.attempts,
    pyqAttempts: m.pyqAttempts,
    lessonsFinished: m.lessonsFinished,
    score: m.score,
    reason: m.reason,
    nextAction: m.nextAction,
    lastActivityAt: m.lastActivityAt,
  }));
}
