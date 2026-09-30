/**
 * Feeds the mastery store from the real stores on this device.
 *
 * Three evidence sources, one shape:
 *
 *   1. CBT attempts — including previous-year papers, which the Tests surface
 *      saves as a `CbtTest` with `pyq: true`, so a PYQ paper is already a test.
 *   2. StudyTube handshakes — watched lessons, mapped onto the chapter they
 *      teach. The handshake records subject/chapter/topic at write time so the
 *      mastery store never has to re-resolve a video id against the catalog.
 *   3. The planner — chapters with a done task but no question evidence, so a
 *      student who only studied still sees the chapter rather than nothing.
 *
 * Pure over the stores it is handed: no `localStorage` reads here, so this is
 * testable without a browser and safe to call from the mentor report.
 */

import type { DataStore } from "@/lib/store";
import type { HandshakeRecord, StudyTubeProgressStore } from "@/features/studytube/progress";
import {
  buildMastery,
  type AttemptEvidence,
  type ChapterMastery,
  type LessonEvidence,
} from "./mastery";

/** Mirrors the readiness engine's grading for the legacy attempt shape. */
function isRight(answer: unknown, given: unknown): boolean {
  if (given === null || given === undefined || given === "") return false;
  if (typeof answer === "number" && typeof given === "number") return answer === given;
  return String(answer).trim().toLowerCase() === String(given).trim().toLowerCase();
}

/**
 * Every attempted question, mapped to its chapter. A PYQ paper is a test with
 * `pyq: true`, so it is counted here rather than through a separate path —
 * one question bank, one accuracy.
 */
function collectAttempts(store: DataStore, now: number): AttemptEvidence[] {
  const out: AttemptEvidence[] = [];
  for (const test of store.tests) {
    const attempts = store.attempts.filter((a) => a.testId === test.id);
    if (!attempts.length) continue;
    for (const q of test.questions || []) {
      if (!q.subject || !q.chapter) continue;
      const answered = attempts.filter((a) => {
        const r = a.responses?.[q.id];
        return r && r.ans !== null && r.ans !== "";
      });
      if (!answered.length) continue;
      for (const a of answered) {
        const r = a.responses?.[q.id];
        out.push({
          subject: q.subject,
          chapter: q.chapter,
          topic: q.topic || "",
          correct: isRight(q.answer, r?.ans ?? null),
          pyq: test.pyq === true,
          // The attempt row carries its own timestamp when the store has one.
          attemptedAt: typeof a.submittedAt === "number" ? a.submittedAt : now,
        });
      }
    }
  }
  return out;
}

/**
 * Watched lessons mapped to chapters. A handshake written before the mastery
 * store existed carries no subject/chapter, so it is skipped rather than
 * guessed into a chapter — an unmapped lesson is missing evidence, not wrong
 * evidence.
 */
function collectLessons(studytube: StudyTubeProgressStore | undefined): LessonEvidence[] {
  if (!studytube) return [];
  const out: LessonEvidence[] = [];
  for (const h of Object.values(studytube.handshakes ?? {})) {
    // Read defensively: a handshake written before this field existed (or by an
    // older build) simply has no chapter, and must be skipped rather than
    // guessed into one.
    const rec = h as Partial<HandshakeRecord> | undefined;
    const videoId = typeof rec?.videoId === "string" ? rec.videoId : "";
    const subject = typeof rec?.subject === "string" ? rec.subject : "";
    const chapter = typeof rec?.chapter === "string" ? rec.chapter : "";
    if (!rec || !videoId || !subject || !chapter) continue;
    const watched = studytube.watched?.[videoId];
    out.push({
      videoId,
      subject,
      chapter,
      topic: typeof rec.topic === "string" ? rec.topic : "",
      finished: Boolean(watched?.finished) || rec.mastery === "Mastered",
      recall: typeof rec.recall === "number" ? rec.recall : null,
      practice: typeof rec.practice === "number" ? rec.practice : null,
      updatedAt: typeof rec.updatedAt === "number" ? rec.updatedAt : 0,
    });
  }
  return out;
}

/** Build the full mastery map for a student. */
export function masteryFromStores(
  store: DataStore,
  studytube: StudyTubeProgressStore | undefined,
  now: number = Date.now(),
): Map<string, ChapterMastery> {
  return buildMastery({
    attempts: collectAttempts(store, now),
    lessons: collectLessons(studytube),
  });
}

/** Totals for the report header. */
export interface MasterySummary {
  chaptersTouched: number;
  chaptersWithEvidence: number;
  questionsAttempted: number;
  pyqAttempts: number;
  lessonsFinished: number;
  /** Mean accuracy over chapters that have a real sample, or null. */
  accuracy: number | null;
  distribution: Record<string, number>;
}

export function summariseMastery(mastery: Map<string, ChapterMastery>): MasterySummary {
  const all = [...mastery.values()];
  const withSample = all.filter((m) => m.attempts >= 3);
  const distribution: Record<string, number> = {};
  for (const m of all) distribution[m.state] = (distribution[m.state] || 0) + 1;
  return {
    chaptersTouched: all.length,
    chaptersWithEvidence: all.filter((m) => m.attempts > 0).length,
    questionsAttempted: all.reduce((s, m) => s + m.attempts, 0),
    pyqAttempts: all.reduce((s, m) => s + m.pyqAttempts, 0),
    lessonsFinished: all.reduce((s, m) => s + m.lessonsFinished, 0),
    accuracy: withSample.length
      ? Math.round((withSample.reduce((s, m) => s + m.accuracy, 0) / withSample.length) * 10) / 10
      : null,
    distribution,
  };
}
