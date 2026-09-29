/**
 * Versioned curriculum registry — Board → Class → Subject → Unit → Chapter → Topic.
 *
 * **The point of the registry.** The rebuild plan asks for a map "versioned so
 * future syllabi drop in without code changes". That means a future CBSE 2027-28
 * map is a *new file plus one line here*, not an edit to every consumer. Every
 * reader goes through `curriculumFor`, which takes an explicit (board,
 * classLevel, academicYear) — so a Class XII read can never silently resolve a
 * Class XI map.
 *
 * A missing map returns `null`. It does NOT fall back to the nearest year: a
 * student on the 2027-28 syllabus must not be planned against 2026-27 chapters,
 * because that is the same class of cross-scope leak Phase F removed.
 */

import { isCompleteSource, type Source } from "@/features/academics/source";
import type { Subject } from "@/features/academics/types";
import {
  CBSE_CLASS_12_2026_27,
  assertClassLevelIsolation,
  chaptersOf,
  theoryMarks,
  unitOfChapter,
  type BoardId,
  type ClassLevel,
  type CurriculumChapter,
  type CurriculumMap,
  type CurriculumSubject,
  type CurriculumTopic,
  type CurriculumUnit,
} from "./cbse-class-12-2026-27";

export type {
  BoardId,
  ClassLevel,
  CurriculumChapter,
  CurriculumMap,
  CurriculumSubject,
  CurriculumTopic,
  CurriculumUnit,
};

/** The key every reader uses. Deliberately explicit — no implicit "current". */
export interface CurriculumKey {
  board: BoardId;
  classLevel: ClassLevel;
  academicYear: string;
}

/**
 * Every published map, newest academic year last so a later one wins on a
 * duplicate key rather than being silently shadowed.
 */
const MAPS: CurriculumMap[] = [CBSE_CLASS_12_2026_27];

/** Look up a map, or `null` when that syllabus is not published. */
export function curriculumFor(key: CurriculumKey): CurriculumMap | null {
  return (
    MAPS.find(
      (m) =>
        m.board === key.board &&
        m.classLevel === key.classLevel &&
        m.academicYear === key.academicYear,
    ) ?? null
  );
}

/** Every published map, for a UI that lists what is available. */
export function publishedCurricula(): CurriculumMap[] {
  return [...MAPS];
}

/** The provenance record for a syllabus, or null when the map is unpublished. */
export function curriculumSource(key: CurriculumKey): Source | null {
  const map = curriculumFor(key);
  if (!map || !isCompleteSource(map.source)) return null;
  return map.source;
}

/** True when a syllabus is published AND its provenance record is complete. */
export function isCurriculumPublished(key: CurriculumKey): boolean {
  const map = curriculumFor(key);
  if (!map) return false;
  return isCompleteSource(map.source) && assertClassLevelIsolation(map, key.classLevel);
}

/** Every chapter across every subject, in board order. */
export function allChapters(map: CurriculumMap): CurriculumChapter[] {
  return map.subjects.flatMap((s) => chaptersOf(map, s.subject));
}

/** The subject list a map actually covers. */
export function subjectsOf(map: CurriculumMap): Subject[] {
  return map.subjects.map((s) => s.subject);
}

export { CBSE_CLASS_12_2026_27, assertClassLevelIsolation, chaptersOf, theoryMarks, unitOfChapter };
