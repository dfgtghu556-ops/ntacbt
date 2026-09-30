/**
 * ACADEMIC ADAPTER → CURRICULUM MAP BRIDGE
 *
 * **Why this file exists.** `forScope({ exam: "CBSE_12", ... })` returns 116
 * records and *every one of them is a teacher/playlist catalog entry*. Their
 * `chapter` field holds marketing strings — "Organic Chemistry Maestro",
 * "Inorganic Chemistry Expert" — and their `topic` field holds playlist names.
 * So `chapterForTopic` for a CBSE scope had no syllabus to resolve against, and
 * the nearest-string fallback could match a *teacher's name*: asking for the
 * real chapter "Atoms" resolved to a video series. That is precisely the
 * wrong-mastery-row leak the function's own doc comment warns about.
 *
 * This bridge resolves CBSE scopes against the real published curriculum map
 * first. The map is the authority on what a chapter is; the legacy records stay
 * what they actually are, which is faculty metadata.
 *
 * No import cycle: this module reads `data/curriculum` (which reads
 * `academics/source` and `academics/types`) and `academics/types`, never
 * `academics/index`.
 */

import {
  curriculumFor,
  matchCurriculum,
  type CurriculumKey,
  type CurriculumMatch,
  type CurriculumMatchKind,
} from "../../data/curriculum";
import type { ExamId, Subject } from "./types";

/**
 * The curriculum key an academic scope resolves to, or `null` when that scope is
 * not a class-level syllabus. JEE scopes are examination objectives rather than
 * board syllabi, so they deliberately resolve to nothing here and keep using the
 * structured JEE syllabus records.
 */
export function curriculumKeyForExam(exam: ExamId, academicYear: string): CurriculumKey | null {
  if (exam === "CBSE_12") return { board: "CBSE", classLevel: 12, academicYear };
  if (exam === "CBSE_11") return { board: "CBSE", classLevel: 11, academicYear };
  return null;
}

/** True when a published curriculum map exists for this scope. */
export function hasCurriculumMap(exam: ExamId, academicYear: string): boolean {
  const key = curriculumKeyForExam(exam, academicYear);
  return key ? curriculumFor(key) !== null : false;
}

export interface CurriculumChapterResolution extends CurriculumMatch {
  /** The board's corroborated unit marks, or null when it publishes none. */
  unitMarks: number | null;
  /** Total theory marks for the subject, or null when any unit is unmarked. */
  subjectTheoryMarks: number | null;
  classLevel: number;
  academicYear: string;
}

/** Resolve a query to a chapter/topic/unit in the published map, or null. */
export function resolveCurriculumChapter(
  exam: ExamId,
  academicYear: string,
  subject: Subject,
  query: string,
): CurriculumChapterResolution | null {
  const key = curriculumKeyForExam(exam, academicYear);
  if (!key) return null;
  const map = curriculumFor(key);
  if (!map) return null;
  const match = matchCurriculum(map, subject, query);
  if (match.kind === "none") return null;
  const subjectRecord = map.subjects.find((s) => s.subject === subject);
  const unitMarks = match.unit ? match.unit.marks : null;
  const anyUnmarked = subjectRecord?.units.some((u) => u.marks === null) ?? false;
  return {
    ...match,
    unitMarks,
    // A subject total is only honest when EVERY unit carries a corroborated
    // mark. Physics is null, so Physics gets no total rather than a partial sum.
    subjectTheoryMarks: anyUnmarked
      ? null
      : (subjectRecord?.units.reduce((sum, u) => sum + (u.marks ?? 0), 0) ?? null),
    classLevel: key.classLevel,
    academicYear: key.academicYear,
  };
}

/**
 * The chapter name for a topic, resolved against the published map first.
 *
 * Returns `null` when the map does not know the query. That is the honest
 * answer: a lesson whose chapter cannot be resolved is missing evidence, which
 * the mastery store already renders as "No evidence" rather than 0%.
 */
export function curriculumChapterName(
  exam: ExamId,
  academicYear: string,
  subject: Subject,
  query: string,
): string | null {
  const resolution = resolveCurriculumChapter(exam, academicYear, subject, query);
  if (!resolution) return null;
  // A unit is not a chapter, so it has no chapter name to return.
  return resolution.chapter ? resolution.chapter.name : null;
}

export type { CurriculumMatch, CurriculumMatchKind, CurriculumKey };
