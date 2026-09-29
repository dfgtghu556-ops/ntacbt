/**
 * SYLLABUS MAP (A7)
 *
 * The research doc asks for "a visual map of topics with prerequisite links +
 * 'you're weak here, so this depends on that'", and suggests adding a
 * `prerequisites` field to the syllabus.
 *
 * **Why this module does not invent prerequisite edges.** A prerequisite is a
 * claim about how knowledge actually works, and getting it wrong is worse than
 * omitting it: a student told that chapter B *requires* chapter A will skip B
 * while believing they are not ready, and the dependency may not even be real.
 * The published CBSE syllabus does not state prerequisites, and inventing a
 * topic-level dependency graph would be fabricated data of exactly the kind the
 * rebuild plan forbids.
 *
 * **What is published, and what this maps.** The board publishes the unit order,
 * the chapter order inside each unit, the topic list, the class level, and the
 * per-unit marks. Those are real. So the map shows the board's own structure —
 * which is the ordering a student is examined in — coloured by the student's
 * **actual** chapter-level evidence.
 *
 * **Topics are listed, not coloured.** Mastery is measured per chapter, because
 * that is the granularity the question bank carries. Painting a topic green
 * because its chapter is green would be a claim the evidence does not support,
 * so a topic renders as a count instead.
 */

import { curriculumKeyForExam } from "../academics/curriculum-bridge";
import { isSubject } from "../academics/subject";
import type { Subject } from "../academics/types";
import {
  chaptersOf,
  curriculumFor,
  theoryMarks,
  type CurriculumKey,
  type CurriculumMap,
} from "../../data/curriculum";
import type { ChapterMastery } from "../mastery/mastery";
import { MIN_SAMPLE } from "../mastery/mastery";

export interface MapTopic {
  name: string;
}

export interface MapChapter {
  number: number;
  name: string;
  topics: MapTopic[];
  /** Null when the student has no evidence for this chapter at all. */
  state: string | null;
  /** Null when the sample is too thin to score — never 0. */
  accuracy: number | null;
  attempts: number;
  lessonsFinished: number;
  /** The mastery score, or null with no evidence. */
  score: number | null;
  reason: string;
  /** True when this chapter is a measured weakness. */
  isWeak: boolean;
}

export interface MapUnit {
  numeral: string;
  name: string;
  /** The board's published unit marks, or null when it publishes none. */
  marks: number | null;
  chapters: MapChapter[];
  /** Mean accuracy across chapters with a real sample, or null. */
  accuracy: number | null;
}

export interface MapSubject {
  subject: Subject;
  units: MapUnit[];
  /** Sum of unit marks, or null when any unit is unmarked. */
  theoryMarks: number | null;
}

export interface SyllabusMap {
  key: CurriculumKey | null;
  subjects: MapSubject[];
  note: string;
  totalChapters: number;
  /** Chapters with at least one attempt. */
  evidencedChapters: number;
  /** Chapters measured below the weak bar. */
  weakChapters: number;
  /** Chapters that reached the mastery bar. */
  masteredChapters: number;
  /** The next chapter in the board's own order after the weakest one. */
  nextInOrder: { subject: Subject; chapter: string } | null;
}

/** The mastery map is keyed `subject|chapter`. */
function masteryKey(subject: string, chapter: string): string {
  return `${subject}|${chapter}`;
}

/**
 * Build the syllabus map for a target, coloured by the student's evidence.
 *
 * Pure and synchronous. A target with no published map yields an empty map with
 * an honest note, never a structure borrowed from another syllabus.
 */
export function buildSyllabusMap(
  target: string,
  mastery: Map<string, ChapterMastery>,
): SyllabusMap {
  // Only board/CBSE targets have a published class-level syllabus. A JEE
  // objective is not one, so it resolves to null and the map says so rather than
  // showing a structure the student is not examined on.
  const t = (target || "").toLowerCase();
  const resolvedKey =
    t === "cbse27" || t === "board12"
      ? curriculumKeyForExam("CBSE_12", "2026-27")
      : t === "board11"
        ? curriculumKeyForExam("CBSE_11", "2026-27")
        : null;

  if (!resolvedKey) {
    return {
      key: null,
      subjects: [],
      note: `No published syllabus map for the "${target || "unknown"}" objective, so the syllabus cannot be shown.`,
      totalChapters: 0,
      evidencedChapters: 0,
      weakChapters: 0,
      masteredChapters: 0,
      nextInOrder: null,
    };
  }

  const map: CurriculumMap | null = curriculumFor(resolvedKey);
  if (!map) {
    return {
      key: resolvedKey,
      subjects: [],
      note: `The CBSE Class ${resolvedKey.classLevel} ${resolvedKey.academicYear} syllabus map is not published here yet, so the syllabus cannot be shown.`,
      totalChapters: 0,
      evidencedChapters: 0,
      weakChapters: 0,
      masteredChapters: 0,
      nextInOrder: null,
    };
  }

  const subjects: MapSubject[] = [];
  let totalChapters = 0;
  let evidencedChapters = 0;
  let weakChapters = 0;
  let masteredChapters = 0;
  let weakest: { subject: Subject; chapter: string; accuracy: number } | null = null;

  for (const subjectRecord of map.subjects) {
    if (!isSubject(subjectRecord.subject)) continue;
    const units: MapUnit[] = [];
    for (const unit of subjectRecord.units) {
      const chapters: MapChapter[] = [];
      for (const chapter of unit.chapters) {
        totalChapters += 1;
        const m = mastery.get(masteryKey(subjectRecord.subject, chapter.name));
        const hasEvidence = !!m && m.attempts > 0;
        const accuracy = m && m.attempts >= MIN_SAMPLE ? m.accuracy : null;
        if (hasEvidence) evidencedChapters += 1;
        if (m?.state === "Mastered") masteredChapters += 1;
        const isWeak = accuracy !== null && accuracy < 50;
        if (isWeak) {
          weakChapters += 1;
          if (!weakest || (accuracy as number) < weakest.accuracy) {
            weakest = { subject: subjectRecord.subject, chapter: chapter.name, accuracy };
          }
        }
        chapters.push({
          number: chapter.number,
          name: chapter.name,
          // Listed, not coloured: mastery is chapter-granular, and painting a
          // topic from its chapter's evidence would be a claim the data cannot
          // support.
          topics: chapter.topics.map((t) => ({ name: t.name })),
          state: hasEvidence ? (m?.state ?? null) : null,
          accuracy,
          attempts: m?.attempts ?? 0,
          lessonsFinished: m?.lessonsFinished ?? 0,
          score: m?.score ?? null,
          reason: m?.reason ?? "No evidence yet — no lessons and no questions.",
          isWeak,
        });
      }
      const sampled = chapters.filter((c) => c.accuracy !== null);
      units.push({
        numeral: unit.numeral,
        name: unit.name,
        marks: unit.marks,
        chapters,
        accuracy:
          sampled.length === 0
            ? null
            : Math.round(sampled.reduce((n, c) => n + (c.accuracy ?? 0), 0) / sampled.length),
      });
    }
    subjects.push({
      subject: subjectRecord.subject,
      units,
      theoryMarks: theoryMarks(map, subjectRecord.subject),
    });
  }

  // "What comes next" is the board's own order, not an invented dependency: the
  // chapter immediately after the weakest one in the same unit, or the first
  // chapter of the next unit.
  let nextInOrder: SyllabusMap["nextInOrder"] = null;
  if (weakest) {
    const subject = subjects.find((s) => s.subject === weakest.subject);
    const flat = subject?.units.flatMap((u) => u.chapters) ?? [];
    const idx = flat.findIndex((c) => c.name === weakest.chapter);
    const next = idx >= 0 ? flat[idx + 1] : undefined;
    if (next) nextInOrder = { subject: weakest.subject, chapter: next.name };
  }

  const unmarked = subjects.filter((s) => s.theoryMarks === null).map((s) => s.subject);
  const note =
    `${evidencedChapters} of ${totalChapters} chapters have question evidence` +
    (weakChapters > 0 ? `, and ${weakChapters} sit below the 50% bar` : "") +
    ". Unit marks are the board's own published figures" +
    (unmarked.length > 0
      ? `, except ${unmarked.join(" and ")}, where the board does not publish a per-unit weightage here.`
      : ".");

  return {
    key: resolvedKey,
    subjects,
    note,
    totalChapters,
    evidencedChapters,
    weakChapters,
    masteredChapters,
    nextInOrder,
  };
}

/** Every chapter in the map, in board order, for a flat list view. */
export function mapChapters(map: SyllabusMap): Array<MapChapter & { subject: Subject }> {
  return map.subjects.flatMap((s) =>
    s.units.flatMap((u) => u.chapters.map((c) => ({ ...c, subject: s.subject }))),
  );
}

/** Chapters with no evidence at all — the honest "nothing measured" list. */
export function unevidencedChapters(map: SyllabusMap): Array<MapChapter & { subject: Subject }> {
  return mapChapters(map).filter((c) => c.attempts === 0);
}

/** Chapters in the board's own order, flattened, for the "what comes next" view. */
export function chapterOrder(map: SyllabusMap): Array<{ subject: Subject; chapter: string }> {
  return map.subjects.flatMap((s) =>
    chaptersOf(
      curriculumFor(map.key ?? { board: "CBSE", classLevel: 12, academicYear: "2026-27" })!,
      s.subject,
    ).map((c) => ({ subject: s.subject, chapter: c.name })),
  );
}
